
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
          { text: "Analyser bildet. Identifiser KandidatID, PageNumber og FullText. Bruk ALLTID LaTeX-delimitere for matematikk: \\( ... \\) for inline og \\[ ... \\] for blokker. Dette er ekstremt viktig for korrekt visning." }
        ],
      },
      config: { 
        systemInstruction: "OCR-analytiker. Svar KUN JSON. Pakk ALL matematikk i LaTeX-delimitere \\( ... \\) eller \\[ ... \\].",
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
        parts: [{ text: `Analyser metadata for denne digitale besvarelsen. Finn kandidatnummer. Pakk matematikk i \\( ... \\). Tekst:\n${text.substring(0, 5000)}` }],
      },
      config: { 
        systemInstruction: "Dokumentanalytiker. Svar KUN JSON. Bruk LaTeX \\( ... \\).",
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
          { text: "Lag en fullstendig rettemanual. Inkluder alle detaljer fra fasit. Pakk ALL matematikk (formler, variabler, brøker) i LaTeX-delimitere: \\( ... \\) for inline matte og \\[ ... \\] for store formler på egen linje. Ikke bruk $ alene hvis du kan unngå det." }
        ] 
      },
      config: { 
        systemInstruction: "Ekspert på matematikkvurdering. Svar KUN JSON. Det er livsviktig at all matematikk er pakket i \\( ... \\) eller \\[ ... \\].",
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
                  part: { type: Type.STRING },
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
      contents: `Vurder besvarelsen mot manualen. Bruk LaTeX \\( ... \\) for all matte i begrunnelsen.\n\nBesvarelse:\n${content}\n\nManual:\n${JSON.stringify(rubric)}`,
      config: { 
        systemInstruction: "Sensor. Svar KUN JSON. Pakk all matte i \\( ... \\).",
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
