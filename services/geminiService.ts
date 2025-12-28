
import { GoogleGenAI, Type } from "@google/genai";
import { Page, Candidate, Rubric } from "../types";
import { getFromGlobalCache, saveToGlobalCache } from "./storageService";

const cleanJson = (text: string | undefined): string => {
  if (!text) return "[]";
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

async function retry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries > 0 && (error?.status === 429 || error?.message?.includes('429'))) {
      await new Promise(resolve => setTimeout(resolve, delay * 2));
      return retry(fn, retries - 1, delay * 2);
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

export const transcribeAndAnalyzeImage = async (page: Page): Promise<any[]> => {
  const cachedData = await getFromGlobalCache(page.contentHash);
  if (cachedData) return Array.isArray(cachedData) ? cachedData : [cachedData];

  return limiter.schedule(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: page.mimeType, data: page.base64Data } }, 
          { text: "Analyser bildet. Finn HELE A4-siden i bildet. Identifiser KandidatID, PageNumber og FullText. KRITISK: Inkluder ALLTID tabeller med kandidatnummer og sidetall i box_2d-utsnittet. Ikke klipp bort headeren. Bruk ALLTID LaTeX-delimitere ($...$ for inline og $$...$$ for blokker). Detekter rotasjon (0, 90, 180, 270) slik at teksten er rett." }
        ],
      },
      config: { 
        systemInstruction: "OCR-analytiker. Svar KUN JSON. Du er ekspert på å finne kandidatnummer i tabeller øverst på siden.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              candidateId: { type: Type.STRING },
              part: { type: Type.STRING },
              pageNumber: { type: Type.INTEGER },
              fullText: { type: Type.STRING },
              rotation: { type: Type.INTEGER },
              box_2d: { type: Type.ARRAY, items: { type: Type.INTEGER } }
            },
            required: ["fullText", "candidateId", "box_2d"]
          }
        }
      }
    });
    
    const results = JSON.parse(cleanJson(response.text));
    await saveToGlobalCache(page.contentHash, results);
    return results;
  });
};

export const analyzeTextContent = async (text: string): Promise<any> => {
  return limiter.schedule(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [{ text: `Analyser metadata for denne digitale besvarelsen. Finn kandidatnummer og eventuelt sidetall hvis det finnes. Tekst:\n${text.substring(0, 5000)}` }],
      },
      config: { 
        systemInstruction: "Dokumentanalytiker for digitale dokumenter. Svar KUN JSON.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            candidateId: { type: Type.STRING },
            fullText: { type: Type.STRING },
            pageNumber: { type: Type.INTEGER }
          },
          required: ["candidateId", "fullText"]
        }
      }
    });
    return JSON.parse(cleanJson(response.text));
  });
};

export const generateRubricFromTaskAndSamples = async (taskFiles: Page[]): Promise<Rubric> => {
  return limiter.schedule(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const parts: any[] = taskFiles.map(f => ({ inlineData: { mimeType: f.mimeType, data: f.base64Data } }));
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: { 
        parts: [
          ...parts, 
          { text: "LES NØYE: Lag en fullstendig rettemanual basert på disse oppgavearkene. Det er KRITISK at du skiller mellom 'Del 1' og 'Del 2' (hvis begge finnes). Finn hver eneste deloppgave (f.eks. 1a, 1b, 2a, 2b osv.). Inkluder alle detaljer fra fasit/løsningsforslag. Sett ALLTID standard maks poeng til 2.0 for hver deloppgave. For hver deloppgave, beskriv nøyaktig hva som kreves for full poengsum, og list vanlige feil med poengtrekk. Bruk konsekvent $...$ for ALL matematikk." }
        ] 
      },
      config: { 
        systemInstruction: "Du er en nøyaktig sensor. Skill alltid mellom 'Del 1' og 'Del 2' i feltet 'part'. Dekomponer til minste deloppgave. Standard poengsum per deloppgave: 2.0. All matematikk SKAL være i LaTeX ($...$).",
        thinkingConfig: { thinkingBudget: 16000 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            criteria: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  part: { type: Type.STRING, description: "Nøyaktig 'Del 1' eller 'Del 2'" },
                  description: { type: Type.STRING },
                  suggestedSolution: { type: Type.STRING },
                  commonErrors: { type: Type.STRING },
                  maxPoints: { type: Type.NUMBER },
                  tema: { type: Type.STRING }
                },
                required: ["name", "part", "description", "suggestedSolution", "maxPoints"]
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

export const evaluateCandidate = async (candidate: Candidate, rubric: Rubric): Promise<any> => {
  return limiter.schedule(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const content = candidate.pages.map(p => `SIDE ${p.pageNumber}: ${p.transcription}`).join("\n\n");

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Vurder besvarelsen:\n\n${content}\n\nMot manualen:\n${JSON.stringify(rubric)}`,
      config: { 
        systemInstruction: "Sensor-modus. Gi tilbakemelding der du pakker all matematikk i $...$. Svar KUN JSON.",
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
    return JSON.parse(cleanJson(response.text));
  });
};
