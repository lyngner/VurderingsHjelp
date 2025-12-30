
import { GoogleGenAI, Type } from "@google/genai";
import { Page, Candidate, Rubric, Project } from "../types";
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
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
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
      model: 'gemini-3-pro-preview',
      contents: {
        parts: [{ text: `Analyser denne teksten fra en elevbesvarelse. BRUK LaTeX for all matematikk:\n\n${text}` }],
      },
      config: { 
        systemInstruction: "Ekspert på matematikk. Returner JSON. Inkluder ALDRI resonnering eller forklaringer i JSON-feltene. Bruk LaTeX.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            candidateId: { type: Type.STRING },
            part: { type: Type.STRING },
            pageNumber: { type: Type.INTEGER },
            fullText: { type: Type.STRING },
            identifiedTasks: { 
              type: Type.ARRAY, 
              items: { 
                type: Type.OBJECT, 
                properties: {
                  taskNumber: { type: Type.STRING },
                  subTask: { type: Type.STRING }
                }
              } 
            }
          }
        }
      }
    });
    return JSON.parse(cleanJson(response.text));
  });
};

export const transcribeAndAnalyzeImage = async (page: Page): Promise<any[]> => {
  const cachedData = await getFromGlobalCache(page.contentHash);
  if (cachedData) return Array.isArray(cachedData) ? cachedData : [cachedData];

  return limiter.schedule(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: page.mimeType, data: page.base64Data } }, 
          { text: "STRENGE REGLER (v4.6.4):\n1. PORTRETT-STANDARD: Finn nødvendig rotasjon (0, 90, 180, 270) for å få teksten 'opp' og kandidattabellen øverst.\n2. A3 SPREAD: Hvis bildet inneholder TO sider ved siden av hverandre, returner TO objekter (LEFT og RIGHT). Dette er KRITISK for landskapsbilder som er A3.\n3. ID: Hent tall fra 'Kandidatnr' og 'sidenummer' boksene.\n4. MATEMATIKK: Bruk vertikal aligned-miljøer for alle utregninger." }
        ],
      },
      config: { 
        systemInstruction: "Du er en OCR-motor spesialisert på A4/A3 eksamensark. Din viktigste jobb er å identifisere om bildet er en enkeltside eller et oppslag med to sider (A3_SPREAD), og sørge for at alt roteres til portrett-orientering.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              layoutType: { type: Type.STRING, description: "A3_SPREAD hvis to sider, A4_SINGLE hvis én side." },
              sideInSpread: { type: Type.STRING, description: "LEFT eller RIGHT." },
              candidateId: { type: Type.STRING },
              part: { type: Type.STRING },
              pageNumber: { type: Type.INTEGER },
              fullText: { type: Type.STRING },
              rotation: { type: Type.INTEGER, description: "Nødvendig rotasjon for å få bildet oppreist." },
              identifiedTasks: { 
                type: Type.ARRAY, 
                items: { 
                  type: Type.OBJECT, 
                  properties: {
                    taskNumber: { type: Type.STRING },
                    subTask: { type: Type.STRING }
                  }
                } 
              }
            },
            required: ["layoutType", "fullText"]
          }
        }
      }
    });
    
    const results = JSON.parse(cleanJson(response.text));
    await saveToGlobalCache(page.contentHash, results);
    return results;
  });
};

export const generateRubricFromTaskAndSamples = async (taskFiles: Page[], studentSamples?: string): Promise<Rubric> => {
  return limiter.schedule(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const parts: any[] = taskFiles.map(f => ({ inlineData: { mimeType: f.mimeType, data: f.base64Data } }));
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: { 
        parts: [
          ...parts, 
          { text: `Generer rettemanual basert på vedlagte oppgaveark. BRUK VERTIKAL MATEMATIKK med aligned-miljøer.` }
        ] 
      },
      config: { 
        systemInstruction: "Ekspert på matematikkvurdering. Bruk LaTeX aligned-miljøer for alle utregninger. Returner ren JSON.",
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
                  taskNumber: { type: Type.STRING },
                  subTask: { type: Type.STRING },
                  part: { type: Type.STRING },
                  description: { type: Type.STRING },
                  suggestedSolution: { type: Type.STRING },
                  commonErrors: { type: Type.STRING },
                  maxPoints: { type: Type.NUMBER },
                  tema: { type: Type.STRING }
                },
                required: ["taskNumber", "subTask", "part", "description", "suggestedSolution", "maxPoints"]
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
      contents: `Vurder besvarelsen mot rettemanualen. BRUK VERTIKALE UTREGNINGER.`,
      config: { 
        systemInstruction: "Sensor. Svar KUN JSON. Bruk LaTeX med vertikale aligned-miljøer.",
        thinkingConfig: { thinkingBudget: 16000 }, 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            grade: { type: Type.STRING },
            feedback: { type: Type.STRING },
            score: { type: Type.NUMBER },
            vekstpunkter: { type: Type.ARRAY, items: { type: Type.STRING } },
            taskBreakdown: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  taskName: { type: Type.STRING },
                  taskNumber: { type: Type.STRING },
                  subTask: { type: Type.STRING },
                  score: { type: Type.NUMBER },
                  max: { type: Type.NUMBER },
                  comment: { type: Type.STRING },
                  tema: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });
    return JSON.parse(cleanJson(response.text));
  });
};

export const reconcileProjectData = async (project: Project): Promise<any> => {
  return limiter.schedule(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: { parts: [{ text: `Analyser kandidater og sider. Slå sammen Kandidat 101, 102 etc hvis de logisk hører sammen.` }] },
      config: { 
        systemInstruction: "Ekspert på data-rehabilitering. Slå sammen kandidater som logisk hører sammen.",
        responseMimeType: "application/json" 
      }
    });
    return JSON.parse(cleanJson(response.text));
  });
};
