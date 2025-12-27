
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Page, Candidate, Rubric } from "../types";
import { getFromGlobalCache, saveToGlobalCache } from "./storageService";

const cleanJson = (text: string | undefined): string => {
  if (!text) return "{}";
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/```$/, "").trim();
  }
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  const start = (firstBrace !== -1 && firstBracket !== -1) ? Math.min(firstBrace, firstBracket) : (firstBrace !== -1 ? firstBrace : firstBracket);
  const lastBrace = cleaned.lastIndexOf('}');
  const lastBracket = cleaned.lastIndexOf(']');
  const end = Math.max(lastBrace, lastBracket);
  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.substring(start, end + 1);
  }
  return cleaned;
};

async function retry<T>(fn: () => Promise<T>, retries = 4, delay = 3000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const isRateLimit = error?.message?.includes('429') || error?.status === 429;
    const waitTime = isRateLimit ? delay * 2 : delay;
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return retry(fn, retries - 1, waitTime * 1.5);
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
      await new Promise(resolve => setTimeout(resolve, 300));
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
      contents: `Analyser tekst og trekk ut kandidatinformasjon: ${text}`,
      config: { 
        systemInstruction: "Returner KUN gyldig JSON. Bruk LaTeX ($...$) for matematiske formler.",
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
        parts: [
          { inlineData: { mimeType: page.mimeType, data: page.base64Data } }, 
          { text: "Transkriber alt innhold på denne siden nøyaktig. Identifiser også kandidatnummer, del (f.eks. 'Del 1') og sidetall hvis det er synlig." }
        ],
      },
      config: { 
        systemInstruction: "Du er en ekspert på OCR og eksamensretting. Din oppgave er å trekke ut data fra skannede elevbesvarelser. Finn kandidatnummer/ID (ofte øverst), hvilken del av prøven det er, og sidetallet. Deretter skal du transkribere ALL håndskreven og trykket tekst på siden nøyaktig. Bruk LaTeX ($...$) for matematiske formler. Hvis du ikke finner KandidatID, bruk filnavnet eller returner 'Ukjent'.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            candidateId: { type: Type.STRING, description: "Kandidatnummer eller ID funnet på siden." },
            part: { type: Type.STRING, description: "Del av prøven (f.eks. 'Del 1' eller 'Del 2')." },
            pageNumber: { type: Type.INTEGER, description: "Sidetallet i besvarelsen." },
            fullText: { type: Type.STRING, description: "Fullstendig og nøyaktig transkripsjon av alt innhold på siden." }
          },
          required: ["fullText", "candidateId"]
        }
      }
    });
    
    const text = response.text;
    if (!text) throw new Error("API returnerte tom tekst");
    
    const results = JSON.parse(cleanJson(text));
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
      contents: { parts: [...parts, { text: "Lag en detaljert rettemanual basert på disse oppgavene. Inkluder løsningsforslag med LaTeX." }] },
      config: { 
        systemInstruction: "Generer en strukturert rettemanual i JSON-format. Manualen må inneholde en liste over kriterier/oppgaver med beskrivelse, fasit/løsningsforslag og maksimal poengsum.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "Tittel på prøven/vurderingen." },
            criteria: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "Oppgavenummer eller navn (f.eks '1a')." },
                  description: { type: Type.STRING, description: "Hva oppgaven går ut på." },
                  suggestedSolution: { type: Type.STRING, description: "Fullstendig løsningsforslag/fasit i LaTeX." },
                  maxPoints: { type: Type.INTEGER, description: "Maksimalt antall poeng for oppgaven." },
                  tema: { type: Type.STRING, description: "Faglig tema for oppgaven." }
                },
                required: ["name", "description", "suggestedSolution", "maxPoints"]
              }
            }
          },
          required: ["title", "criteria"]
        }
      }
    });
    
    const rubric = JSON.parse(cleanJson(response.text)) as Rubric;
    rubric.totalMaxPoints = (rubric.criteria || []).reduce((acc, c) => acc + (c.maxPoints || 0), 0);
    return rubric;
  });
};

export const evaluateCandidate = async (candidate: Candidate, rubric: Rubric, taskContext: string): Promise<NonNullable<Candidate['evaluation']>> => {
  return limiter.schedule(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    let content = (candidate.pages || []).map(p => `[${p.part}] SIDE ${p.pageNumber}: ${p.transcription}`).join("\n\n");

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Vurder denne besvarelsen:\n\n${content}\n\nBruk denne rettemanualen:\n${JSON.stringify(rubric)}`,
      config: { 
        systemInstruction: "Du er en rettferdig sensor. Vurder besvarelsen mot kriteriene og gi konstruktiv tilbakemelding. Svar KUN JSON.",
        thinkingConfig: { thinkingBudget: 16000 }, 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            grade: { type: Type.STRING },
            score: { type: Type.NUMBER },
            feedback: { type: Type.STRING },
            vekstpunkter: { type: Type.ARRAY, items: { type: Type.STRING } },
            taskBreakdown: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  taskName: { type: Type.STRING },
                  score: { type: Type.NUMBER },
                  max: { type: Type.NUMBER },
                  comment: { type: Type.STRING }
                },
                required: ["taskName", "score", "max", "comment"]
              }
            }
          },
          required: ["grade", "score", "feedback", "taskBreakdown"]
        }
      }
    });
    return JSON.parse(cleanJson(response.text)) as any;
  });
};
