
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
      model: 'gemini-3-pro-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: page.mimeType, data: page.base64Data } }, 
          { text: "Analyser bildet grundig. Prioriter å finne tabellen merket 'Kandidatnr' og 'sidenummer'. Identifiser: 1. KandidatID (skrevet i ruten). 2. Sidetall. 3. Full tekst (LaTeX). 4. Liste over ALLE oppgaver (f.eks. ['1A', '1B']). 5. Del ('Del 1' eller 'Del 2'). 6. Rotasjon (0, 90, 180, 270) slik at teksten blir lesbar. Svar KUN JSON." }
        ],
      },
      config: { 
        systemInstruction: `Du er en ekspert på OCR av eksamensbesvarelser.
        VIKTIGSTE PRIORITET: Finn den trykte tabellen med 'Kandidatnr' og 'sidenummer'. Selv om IDen er utydelig, prøv å tolke den.
        ROTASJON: Hvis bildet er opp-ned, sett 'rotation' til 180. Hvis det er sidelengs, sett 90 eller 270. Målet er at teksten skal stå rett vei.
        OPPGAVELOGIKK: Inkluder sekvensielle oppgaver (hvis 1a er funnet, tolkes 'b' som 1b).
        Svar KUN JSON i formatet [{ candidateId, pageNumber, part, fullText, rotation, identifiedTasks, box_2d }].`,
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
              identifiedTasks: { type: Type.ARRAY, items: { type: Type.STRING } },
              box_2d: { type: Type.ARRAY, items: { type: Type.INTEGER } }
            },
            required: ["fullText", "candidateId", "box_2d", "part", "identifiedTasks", "rotation"]
          }
        }
      }
    });
    
    const results = JSON.parse(cleanJson(response.text));
    await saveToGlobalCache(page.contentHash, results);
    return results;
  });
};

export const reconcileProjectData = async (project: Project): Promise<any> => {
  return limiter.schedule(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const summary = project.candidates.map(c => ({
      id: c.id,
      name: c.name,
      tasks: Array.from(new Set(c.pages.flatMap(p => p.identifiedTasks || []))),
      parts: Array.from(new Set(c.pages.map(p => p.part)))
    }));

    const rubricContext = project.rubric ? `RETTEMANUAL: ${project.rubric.criteria.map(c => c.name).join(", ")}` : "";

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: {
        parts: [{ 
          text: `Rydd i eksamensdata. Noen IDer er feillest (f.eks 712 vs 112). 
          DATA: ${JSON.stringify(summary)}
          ${rubricContext}
          Svar JSON med merges og corrections.` 
        }],
      },
      config: { 
        responseMimeType: "application/json"
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
          { text: "Lag en fullstendig rettemanual. Maks 2.0 poeng per deloppgave. Bruk LaTeX." }
        ] 
      },
      config: { 
        systemInstruction: "Ekspert på matematikkvurdering. Svar KUN JSON. Bruk LaTeX \\( ... \\) eller \\[ ... \\]. Maks poeng 2.0.",
        thinkingConfig: { thinkingBudget: 16000 },
        responseMimeType: "application/json"
      }
    });
    
    const rubric = JSON.parse(cleanJson(response.text)) as Rubric;
    rubric.totalMaxPoints = (rubric.criteria || []).reduce((acc, c) => acc + (c.maxPoints || 0), 0);
    return rubric;
  });
};

export const analyzeTextContent = async (text: string): Promise<any> => {
  return limiter.schedule(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [{ text: `Analyser metadata. Finn kandidatnummer, del og oppgaver:\n${text.substring(0, 5000)}` }],
      },
      config: { 
        responseMimeType: "application/json"
      }
    });
    return JSON.parse(cleanJson(response.text));
  });
};

export const evaluateCandidate = async (candidate: Candidate, rubric: Rubric): Promise<any> => {
  return limiter.schedule(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const content = candidate.pages.map(p => `SIDE ${p.pageNumber}: ${p.transcription}`).join("\n\n");

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Vurder besvarelsen mot manualen. Bruk LaTeX.\n\nBesvarelse:\n${content}\n\nManual:\n${JSON.stringify(rubric)}`,
      config: { 
        systemInstruction: "Sensor. Svar KUN JSON. Bruk LaTeX.",
        thinkingConfig: { thinkingBudget: 16000 }, 
        responseMimeType: "application/json"
      }
    });
    return JSON.parse(cleanJson(response.text));
  });
};
