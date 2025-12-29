
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
          { text: "STRENGE REGLER FOR BILDEANALYSE (v4.5.2):\n1. INGEN BESKJÆRING: Du har ikke lov til å be om cropping eller returnere koordinater. Vi viser alltid 100% av arealet.\n2. DETERMINISTISK A3-SPLIT: Hvis bildet er i LANDSKAP (bredere enn høyt), SKAL du anta at det er et A3-oppslag og returnere TO JSON-objekter (ett for LEFT og ett for RIGHT). Bruk 'A3_SPREAD'.\n3. IDENTIFIKASJON: Prioriter boksene 'Kandidatnr' og 'sidenummer' øverst. De skal styre metadata.\n4. MATEMATIKK: Bruk vertikal oppstilling i aligned-miljøer med dobbel bakslash \\\\." }
        ],
      },
      config: { 
        systemInstruction: "Du er en OCR-motor for eksamensark. Din eneste oppgave er å identifisere sidetype og transkribere tekst. Hvis bildet er landskap, skal du behandle det som to sider (LEFT/RIGHT). Bruk ren JSON.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              layoutType: { type: Type.STRING, description: "Enten 'A3_SPREAD' (for landskap/to sider) eller 'A4_SINGLE'." },
              sideInSpread: { type: Type.STRING, description: "'LEFT' eller 'RIGHT' hvis A3_SPREAD." },
              candidateId: { type: Type.STRING },
              part: { type: Type.STRING },
              pageNumber: { type: Type.INTEGER },
              fullText: { type: Type.STRING },
              rotation: { type: Type.INTEGER },
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
          { text: `Generer rettemanual basert på vedlagte oppgaveark. 
          
          VIKTIGE REGLER FOR VISUELL STRUKTUR (v4.5.2):
          1. MATEMATIKK: Alle utregninger over flere trinn SKAL bruke display-math: \\[ \\begin{aligned} ... \\end{aligned} \\]. 
             Bruk dobbel bakslash \\\\ for å tvinge linjeskift mellom hvert trinn.
          2. RETTEVEILEDNING: Bruk punktlister (*) eller tydelige linjeskift. Ikke skriv tekstvegger.
          3. POENG: Maks 2.0 poeng per deloppgave.
          
          ELEV-DATA TIL ANALYSE:
          ${studentSamples || 'Ingen elevdata tilgjengelig.'}` }
        ] 
      },
      config: { 
        systemInstruction: "Ekspert på matematikkvurdering. Du lager pedagogiske og strengt vertikalt oppstilte løsningsforslag. Bruk LaTeX aligned-miljøer. Returner ren JSON.",
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
      contents: `Vurder besvarelsen mot rettemanualen. Svar KUN JSON. 
      BRUK VERTIKALE UTREGNINGER i feedback ved hjelp av \\[ \\begin{aligned} ... \\end{aligned} \\].`,
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
      contents: { parts: [{ text: `Analyser kandidater og sider. Finn ut om 'Ukjent' sider egentlig tilhører en kandidat. Prosjektdata: ${JSON.stringify(project.candidates.map(c => ({ id: c.id, pages: c.pages.map(p => ({ nr: p.pageNumber, tasks: p.identifiedTasks })) })))}` }] },
      config: { 
        systemInstruction: "Ekspert på data-rehabilitering. Slå sammen kandidater som logisk hører sammen.",
        responseMimeType: "application/json" 
      }
    });
    return JSON.parse(cleanJson(response.text));
  });
};
