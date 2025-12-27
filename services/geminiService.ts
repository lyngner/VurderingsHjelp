
import { GoogleGenAI, Type } from "@google/genai";
import { Page, Candidate, Rubric } from "../types";
import { getFromGlobalCache, saveToGlobalCache } from "./storageService";

/**
 * Renser tekst fra Gemini for å trekke ut kun gyldig JSON.
 */
const cleanJson = (text: string | undefined): string => {
  if (!text) return "[]";
  let cleaned = text.trim();
  cleaned = cleaned.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
  
  const markdownMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (markdownMatch && markdownMatch[1]) cleaned = markdownMatch[1].trim();
  
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  let start = -1;
  if (firstBrace !== -1 && firstBracket !== -1) start = Math.min(firstBrace, firstBracket);
  else start = firstBrace !== -1 ? firstBrace : firstBracket;

  const lastBrace = cleaned.lastIndexOf('}');
  const lastBracket = cleaned.lastIndexOf(']');
  const end = Math.max(lastBrace, lastBracket);

  if (start !== -1 && end !== -1 && end > start) {
    return cleaned.substring(start, end + 1);
  }
  return cleaned;
};

/**
 * Aggressiv retry-mekanisme med fokus på nettverksfeil og tidsavbrudd.
 */
async function retry<T>(fn: () => Promise<T>, retries = 5, delay = 5000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const errorMsg = error?.message?.toLowerCase() || "";
    const isQuota = error?.status === 429 || errorMsg.includes('429') || errorMsg.includes('quota');
    const isDeadline = errorMsg.includes('deadline') || 
                       errorMsg.includes('code 6') || 
                       errorMsg.includes('xhr error') || 
                       errorMsg.includes('failed to fetch') ||
                       errorMsg.includes('network error');
    const isServerError = error?.status === 500 || errorMsg.includes('internal error');
    
    if ((isQuota || isDeadline || isServerError) && retries > 0) {
      const jitter = Math.random() * 2000;
      const finalDelay = delay + jitter;
      
      console.warn(`API-utfordring (${errorMsg}). Forsøk igjen om ${Math.round(finalDelay / 1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, finalDelay));
      return retry(fn, retries - 1, delay * 1.5);
    }
    throw error;
  }
}

class RateLimiter {
  private activeCount = 0;
  private queue: (() => void)[] = [];
  private readonly MAX_CONCURRENCY = 2; // Økt for bedre flyt
  private readonly MIN_DELAY = 1500; // Redusert litt for raskere batching

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    if (this.activeCount >= this.MAX_CONCURRENCY) {
      await new Promise<void>(resolve => this.queue.push(resolve));
    }

    this.activeCount++;
    try {
      await new Promise(resolve => setTimeout(resolve, this.MIN_DELAY));
      return await retry(fn);
    } finally {
      this.activeCount--;
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        if (next) next();
      }
    }
  }
}

const limiter = new RateLimiter();

export const analyzeTextContent = async (text: string): Promise<any> => {
  return limiter.schedule(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `Analyser følgende tekst fra en elevbesvarelse. Identifiser KandidatId, Del (1/2), Side og sidetall.
    Returner JSON: { "candidateId": "streng", "part": "streng", "pageNumber": tall, "fullText": "original tekst" }
    
    TEKST:
    ${text}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { 
        systemInstruction: "Du er en assistent som analyserer elevbesvarelser.",
        responseMimeType: "application/json" 
      }
    });
    return JSON.parse(cleanJson(response.text));
  });
};

export const transcribeAndAnalyzeImage = async (page: Page): Promise<any[]> => {
  const cachedData = await getFromGlobalCache(page.contentHash);
  if (cachedData) return cachedData;

  return limiter.schedule(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const systemInstruction = `Du er en ekspert på OCR av håndskrevne elevbesvarelser i matematikk.
    DIN OPPGAVE:
    1. Identifiser KandidatId, Del (1/2) og Sidenummer.
    2. Transkriber ALL tekst ordrett. Bruk LaTeX ($...$) for matte.
    3. Returner JSON: { "candidateId": "...", "part": "...", "pageNumber": ..., "fullText": "..." }`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: page.mimeType, data: page.base64Data } }
        ],
      },
      config: { 
        systemInstruction: systemInstruction,
        responseMimeType: "application/json" 
      }
    });
    const results = JSON.parse(cleanJson(response.text));
    await saveToGlobalCache(page.contentHash, results);
    return results;
  });
};

export const generateRubricFromTaskAndSamples = async (taskFiles: Page[], taskDescription: string, samples: string[]): Promise<Rubric> => {
  return limiter.schedule(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const parts: any[] = (taskFiles || []).map(f => {
      if (f.base64Data) return { inlineData: { mimeType: f.mimeType, data: f.base64Data } };
      return { text: `Tekst fra dokument: ${f.transcription}` };
    });
    
    const promptText = `Lag en profesjonell rettemanual delt inn i "Del 1" og "Del 2". 
    Bruk LaTeX for alle formler. Standard 2 poeng per oppgave.
    Returner JSON i Rubric-formatet.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [...parts, { text: promptText }, ...(samples || []).map(s => ({ text: s }))] },
      config: { 
        systemInstruction: "Du er en lærer som lager en rettemanual basert på oppgaveark.",
        responseMimeType: "application/json" 
      }
    });
    const rubric = JSON.parse(cleanJson(response.text)) as Rubric;
    rubric.criteria = (rubric.criteria || []).map(c => ({ ...c, maxPoints: c.maxPoints || 2 }));
    rubric.totalMaxPoints = (rubric.criteria || []).reduce((acc, c) => acc + c.maxPoints, 0);
    return rubric;
  });
};

export const evaluateCandidate = async (candidate: Candidate, rubric: Rubric, taskContext: string): Promise<NonNullable<Candidate['evaluation']>> => {
  return limiter.schedule(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    let content = (candidate.pages || [])
        .sort((a,b) => (a.part||"").localeCompare(b.part||"") || (a.pageNumber||0)-(b.pageNumber||0))
        .map(p => `[${p.part || 'Ukjent'}] SIDE ${p.pageNumber}: ${p.transcription}`).join("\n\n");

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Vurder besvarelsen mot denne manualen. Gi spesifikke poeng per oppgave.
      MANUAL: ${JSON.stringify(rubric)}
      BESVARELSE:
      ${content}`,
      config: { 
        systemInstruction: "Du er en sensor som vurderer matematikkbesvarelser nøyaktig etter en rettemanual.",
        thinkingConfig: { thinkingBudget: 12000 }, 
        responseMimeType: "application/json" 
      }
    });
    return JSON.parse(cleanJson(response.text)) as NonNullable<Candidate['evaluation']>;
  });
};
