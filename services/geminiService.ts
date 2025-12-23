
import { GoogleGenAI, Type } from "@google/genai";
import { Page, Candidate, Rubric } from "../types";
import { getFromGlobalCache, saveToGlobalCache } from "./storageService";

const cleanJson = (text: string | undefined): string => {
  if (!text) return "[]";
  return text.replace(/```json/g, "").replace(/```/g, "").trim();
};

/**
 * Robust retry-mekanisme med exponential backoff for å håndtere 500-feil og nettverksbrudd.
 */
async function retry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const isNetworkError = error?.message?.includes('fetch') || error?.message?.includes('Network');
    const isServerError = error?.status === 500 || error?.message?.includes('Internal error');
    
    if ((isNetworkError || isServerError) && retries > 0) {
      console.warn(`API-feil oppsto. Prøver på nytt om ${delay}ms... (${retries} forsøk igjen)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

class RateLimiter {
  private queue: Promise<any> = Promise.resolve();
  private lastRequestTime: number = 0;
  private readonly MIN_DELAY = 1000; 

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    this.queue = this.queue.then(async () => {
      const now = Date.now();
      const timeSinceLast = now - this.lastRequestTime;
      if (timeSinceLast < this.MIN_DELAY) {
        await new Promise(resolve => setTimeout(resolve, this.MIN_DELAY - timeSinceLast));
      }
      this.lastRequestTime = Date.now();
      return retry(fn);
    });
    return this.queue;
  }
}

const limiter = new RateLimiter();

export const analyzeTextContent = async (text: string): Promise<any> => {
  return limiter.schedule(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `Analyser følgende uthentede tekst fra en elevbesvarelse (inkludert eventuelle headere/footere).
    DIN OPPGAVE:
    1. Identifiser Kandidatnummer (Candidate ID). Se spesielt etter tall inne i merkelapper som [HEADER/FOOTER: ...].
    2. Identifiser hvilken del av prøven dette er (Part, f.eks "Del 1" eller "Del 2").
    3. Finn sidetall hvis oppgitt.
    
    TEKST:
    ${text}
    
    Returner JSON: { "candidateId": "streng", "part": "streng", "pageNumber": tall, "fullText": "original tekst" }`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            candidateId: { type: Type.STRING },
            part: { type: Type.STRING },
            pageNumber: { type: Type.NUMBER },
            fullText: { type: Type.STRING }
          },
          required: ["candidateId", "part", "pageNumber", "fullText"]
        }
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
    1. Identifiser Kandidatnummer og Sidenummer (se ofte øverst til høyre eller i headere).
    2. Transkriber ALL tekst ordrett. Bevar norske bokstaver (æ, ø, å).
    3. MATEMATIKK-REGLER: IKKE bruk LaTeX-delimitere som $. Bruk ren tekst-notasjon som x^2, lim x->0.
    4. Returner JSON med candidateId, part, pageNumber, og fullText.`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { mimeType: page.mimeType, data: page.base64Data } },
            { text: systemInstruction }
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                candidateId: { type: Type.STRING },
                part: { type: Type.STRING },
                pageNumber: { type: Type.NUMBER },
                fullText: { type: Type.STRING }
              },
              required: ["candidateId", "part", "pageNumber", "fullText"]
            }
          }
        }
      });
      const results = JSON.parse(cleanJson(response.text));
      await saveToGlobalCache(page.contentHash, results);
      return results;
    } catch (error) {
      console.error("OCR feilet etter forsøk:", error);
      throw error;
    }
  });
};

export const generateRubricFromTaskAndSamples = async (taskFiles: Page[], taskDescription: string, samples: string[]): Promise<Rubric> => {
  return limiter.schedule(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const parts: any[] = taskFiles.map(f => ({ 
      inlineData: { mimeType: f.mimeType, data: f.base64Data } 
    }));
    const promptText = `Lag en profesjonell rettemanual basert på oppgavearkene og elev-eksemplene.
    ${samples.join("\n---\n")}
    Returner JSON med title, totalMaxPoints og criteria-liste.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [...parts, { text: promptText }] },
      config: {
        responseMimeType: "application/json"
      }
    });
    return JSON.parse(cleanJson(response.text)) as Rubric;
  });
};

export const evaluateCandidate = async (candidate: Candidate, rubric: Rubric, taskContext: string): Promise<NonNullable<Candidate['evaluation']>> => {
  return limiter.schedule(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    let contentToEvaluate = candidate.pages
        .sort((a,b) => (a.part||"").localeCompare(b.part||"") || (a.pageNumber||0)-(b.pageNumber||0))
        .map(p => `[${p.part || 'Ukjent Del'}] SIDE ${p.pageNumber}: ${p.transcription}`).join("\n\n");

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Vurder besvarelsen mot manualen: ${JSON.stringify(rubric)}\n\nBESVARELSE:\n${contentToEvaluate}`,
      config: {
        thinkingConfig: { thinkingBudget: 12000 },
        responseMimeType: "application/json"
      }
    });
    return JSON.parse(cleanJson(response.text)) as NonNullable<Candidate['evaluation']>;
  });
};
