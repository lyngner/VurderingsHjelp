
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
          { text: "Analyser bildet. Finn alle elevsider i bildet. Hvis bildet inneholder to sider ved siden av hverandre (f.eks. A3-skann), returner to objekter med box_2d koordinater for hver side. Finn KandidatID, Part (Del 1 eller 2), PageNumber og FullText for hver side." }
        ],
      },
      config: { 
        systemInstruction: "OCR- og segmenteringsekspert. Din oppgave er å finne sider i skannede dokumenter. Hvis bildet inneholder to sider ved siden av hverandre, returner TO objekter i listen. Finn KandidatID, Part, PageNumber, FullText og box_2d for hver side. Svar KUN JSON som en liste av objekter.",
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
              box_2d: { 
                type: Type.ARRAY, 
                items: { type: Type.INTEGER },
                description: "[ymin, xmin, ymax, xmax] normalisert til 1000"
              }
            },
            required: ["fullText", "candidateId"]
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
        parts: [
          { text: `Analyser følgende tekst fra et elevdokument og finn kandidat-ID, navn eller referansenummer. Dette står ofte øverst i dokumentet eller i en 'topptekst' (header).\n\nVIKTIG: Prioriter de første 10 linjene med tekst.\n\nTEKST:\n${text.substring(0, 5000)}` }
        ],
      },
      config: { 
        systemInstruction: "Dokumentanalytiker. Din oppgave er å identifisere hvem som har skrevet dokumentet. Se etter 'Kandidatnr', 'Navn', 'Elev-ID', 'Navn:' eller bare tallrekker som ligner på kandidatnumre, spesielt i starten av dokumentet. Svar KUN JSON.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            candidateId: { type: Type.STRING, description: "Kandidatnummer eller ID. Bruk 'Ukjent' hvis ikke funnet." },
            name: { type: Type.STRING, description: "Fullt navn hvis det finnes i teksten." },
            part: { type: Type.STRING },
            pageNumber: { type: Type.INTEGER },
            fullText: { type: Type.STRING }
          },
          required: ["candidateId", "fullText"]
        }
      }
    });
    
    const res = JSON.parse(cleanJson(response.text));
    return { ...res, fullText: text };
  });
};

export const generateRubricFromTaskAndSamples = async (taskFiles: Page[]): Promise<Rubric> => {
  return limiter.schedule(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const parts: any[] = taskFiles.map(f => ({ inlineData: { mimeType: f.mimeType, data: f.base64Data } }));
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [...parts, { text: "Lag en detaljert rettemanual basert på disse oppgavearkene. Separer oppgaver i 'Del 1' (uten hjelpemidler) og 'Del 2' (med hjelpemidler) hvis aktuelt." }] },
      config: { 
        systemInstruction: "Du skal lage en profesjonell rettemanual. Finn alle oppgaver, deres poengsum (standard 2 poeng hvis ikke oppgitt) og lag et løsningsforslag med LaTeX ($...$). Separer oppgavene i Del 1 og Del 2. Svar KUN JSON.",
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
                  name: { type: Type.STRING, description: "F.eks. 1a, 1b, 2a..." },
                  part: { type: Type.STRING, description: "F.eks. Del 1 eller Del 2" },
                  description: { type: Type.STRING },
                  suggestedSolution: { type: Type.STRING },
                  commonErrors: { type: Type.STRING },
                  maxPoints: { type: Type.INTEGER },
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
    const content = candidate.pages.map(p => `SIDE ${p.pageNumber} (${p.part || "Ukjent del"}): ${p.transcription}`).join("\n\n");

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Vurder besvarelsen:\n\n${content}\n\nMot manualen:\n${JSON.stringify(rubric)}`,
      config: { 
        systemInstruction: "Sensor-modus. Gi karakter og detaljert poengsum per oppgave. Bruk rettemanualens beskrivelser av vanlige feil for å trekke poeng korrekt. Svar KUN JSON.",
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
