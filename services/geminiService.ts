
import { GoogleGenAI, Type } from "@google/genai";
import { Page, Candidate, Rubric } from "../types";
import { getFromGlobalCache, saveToGlobalCache } from "./storageService";

/**
 * Renser tekst fra Gemini for å trekke ut kun gyldig JSON.
 * Håndterer spesielt LaTeX-backslasher som ofte knekker JSON-parsing.
 */
const cleanJson = (text: string | undefined): string => {
  if (!text) return "{}";
  let cleaned = text.trim();
  
  // Fjern markdown-blokker hvis de finnes
  const markdownMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (markdownMatch && markdownMatch[1]) cleaned = markdownMatch[1].trim();
  
  // Finn grensene for JSON-objektet
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  let start = -1;
  if (firstBrace !== -1 && firstBracket !== -1) start = Math.min(firstBrace, firstBracket);
  else start = firstBrace !== -1 ? firstBrace : firstBracket;

  const lastBrace = cleaned.lastIndexOf('}');
  const lastBracket = cleaned.lastIndexOf(']');
  const end = Math.max(lastBrace, lastBracket);

  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.substring(start, end + 1);
  }

  // FIKS: Erstatt ulovlige kontrolltegn og eskapingsfeil
  // Dette fjerner linjeskift inne i strenger og fikser enkle backslash-feil
  cleaned = cleaned
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") // Fjern kontrolltegn
    .replace(/\\(?!"|\\|\/|b|f|n|r|t|u)/g, "\\\\"); // Dobbel-eskaper backslasher som ikke er gyldige JSON-eskapes (typisk LaTeX)

  return cleaned;
};

async function retry<T>(fn: () => Promise<T>, retries = 5, delay = 5000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, delay + Math.random() * 2000));
      return retry(fn, retries - 1, delay * 1.5);
    }
    throw error;
  }
}

class RateLimiter {
  private activeCount = 0;
  private queue: (() => void)[] = [];
  private readonly MAX_CONCURRENCY = 2; 
  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    if (this.activeCount >= this.MAX_CONCURRENCY) {
      await new Promise<void>(resolve => this.queue.push(resolve));
    }
    this.activeCount++;
    try {
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
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analyser tekst: ${text}. Returner JSON.`,
      config: { 
        systemInstruction: "Svar kun med JSON. Husk å dobbel-eskape alle backslasher i LaTeX.",
        responseMimeType: "application/json"
      }
    });
    return JSON.parse(cleanJson(response.text));
  });
};

export const transcribeAndAnalyzeImage = async (page: Page): Promise<any> => {
  const cachedData = await getFromGlobalCache(page.contentHash);
  if (cachedData) return cachedData;

  return limiter.schedule(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [{ inlineData: { mimeType: page.mimeType, data: page.base64Data } }],
      },
      config: { 
        systemInstruction: "OCR-ekspert. Identifiser KandidatId, Del, Side. Bruk LaTeX ($...$) for matte. Svar KUN JSON. Dobbel-eskape backslasher.",
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
    const parts: any[] = (taskFiles || []).map(f => f.base64Data ? { inlineData: { mimeType: f.mimeType, data: f.base64Data } } : { text: f.transcription });
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [...parts, { text: "Lag en rettemanual. Bruk LaTeX." }] },
      config: { 
        systemInstruction: "Generer rettemanual JSON. Dobbel-eskape alle LaTeX backslasher (\\\\frac).",
        responseMimeType: "application/json"
      }
    });
    
    const rubric = JSON.parse(cleanJson(response.text)) as Rubric;
    rubric.criteria = (rubric.criteria || []).map(c => ({
        ...c,
        name: c.name || "Oppgave",
        description: c.description || "Ingen beskrivelse",
        suggestedSolution: c.suggestedSolution || "Løsningsforslag ikke tilgjengelig",
        tema: c.tema || "Uspesifisert"
    }));
    rubric.totalMaxPoints = rubric.criteria.reduce((acc, c) => acc + (c.maxPoints || 0), 0);
    return rubric;
  });
};

export const evaluateCandidate = async (candidate: Candidate, rubric: Rubric, taskContext: string): Promise<NonNullable<Candidate['evaluation']>> => {
  return limiter.schedule(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    let content = (candidate.pages || []).map(p => `[${p.part}] SIDE ${p.pageNumber}: ${p.transcription}`).join("\n\n");

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Vurder: ${content}\n\nManual: ${JSON.stringify(rubric)}`,
      config: { 
        systemInstruction: "Sensor-modus. Svar kun JSON. Dobbel-eskape backslasher i LaTeX.",
        thinkingConfig: { thinkingBudget: 12000 }, 
        responseMimeType: "application/json"
      }
    });
    return JSON.parse(cleanJson(response.text)) as any;
  });
};
