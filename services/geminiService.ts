import { GoogleGenAI, Type } from "@google/genai";
import { Page, Candidate, Rubric, Project } from "../types";
import { getFromGlobalCache, saveToGlobalCache } from "./storageService";

const cleanJson = (text: string | undefined): string => {
  if (!text) return "[]";
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/```$/, "").trim();
  }
  const start = Math.min(cleaned.indexOf('{') === -1 ? 9999 : cleaned.indexOf('{'), cleaned.indexOf('[') === -1 ? 9999 : cleaned.indexOf('['));
  const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
  if (start !== 9999 && end !== -1) return cleaned.substring(start, end + 1);
  return cleaned;
};

export const transcribeAndAnalyzeImage = async (page: Page, rubric?: Rubric | null): Promise<any[]> => {
  const cached = await getFromGlobalCache(page.contentHash);
  if (cached) return Array.isArray(cached) ? cached : [cached];

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const rubricContext = rubric 
    ? rubric.criteria.map(c => `- GYLDIG OPPGAVE [${c.taskNumber}${c.subTask || ''}]: ${c.description}`).join("\n") 
    : "Ingen fasit lastet opp.";

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: {
      parts: [{ inlineData: { mimeType: page.mimeType, data: page.base64Data || "" } }],
    },
    config: { 
      systemInstruction: `EKSPERT PÅ ELEVBESVARELSER v5.3.5 "The Final Geometric Lock":

GEOMETRISK LOV (REGRESSION_GUARD):
1. IDENTIFISERING: Se etter om bildet inneholder to (2) separate felter/sider med tekst (typisk et brettet A3-ark). Hvis du ser to sider, SKAL du behandle bildet som 'A3_SPREAD'.
2. ROTASJON: Identifiser rotasjonen (0, 90, 180, 270) som trengs for å få teksten loddrett og lesbar. Dette er kritisk for at splittingen skal treffe margen.
3. TVUNGEN DOBBEL-RETUR: For alle 'A3_SPREAD' SKAL du returnere nøyaktig TO (2) objekter i JSON-listen: Ett for 'LEFT' og ett for 'RIGHT'.
4. FYSIKK: Hvis bildet er bredere enn det er høyt etter rotasjon, er det automatisk et A3_SPREAD.

OPPGAVE-REGLER:
- taskNumber: Kun siffer. subTask: Kun bokstav.
- BRUK KUN oppgaver fra denne listen (Hard Whitelist):
${rubricContext}

MATEMATIKK-REGLER:
- Bruk LaTeX aligned for alle utregninger over ett ledd. 
- Aligner likhetstegn vertikalt med &.`,
      thinkingConfig: { thinkingBudget: 16000 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            layoutType: { type: Type.STRING, enum: ["A4_SINGLE", "A3_SPREAD"] },
            sideInSpread: { type: Type.STRING, enum: ["LEFT", "RIGHT"] },
            candidateId: { type: Type.STRING },
            part: { type: Type.STRING, enum: ["Del 1", "Del 2"] },
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
          required: ["layoutType", "fullText", "identifiedTasks", "rotation"]
        }
      }
    }
  });
  
  const results = JSON.parse(cleanJson(response.text));
  await saveToGlobalCache(page.contentHash, results);
  return results;
};

export const generateRubricFromTaskAndSamples = async (taskFiles: Page[]): Promise<Rubric> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts = taskFiles.map(f => {
    if (f.mimeType === 'text/plain') return { text: `OPPGAVEFIL (${f.fileName}):\n${f.transcription}` };
    return { inlineData: { mimeType: f.mimeType, data: f.base64Data || "" } };
  });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: { parts: [...parts, { text: "Generer strukturert rettemanual i JSON. Sørg for at taskNumber er rent siffer og subTask er ren bokstav." }] },
    config: { 
      systemInstruction: `RETTEMANUAL-EKSPERT v5.3.5:
1. DEL oppgaver i Del 1 og Del 2.
2. BRUK LaTeX aligned for alle løsningsforslag.
3. taskNumber: KUN siffer. subTask: KUN bokstav.
4. MAKS 2.0 poeng per deloppgave.`,
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
                taskNumber: { type: Type.STRING },
                subTask: { type: Type.STRING },
                part: { type: Type.STRING },
                description: { type: Type.STRING },
                suggestedSolution: { type: Type.STRING },
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
  rubric.totalMaxPoints = rubric.criteria.reduce((acc, c) => acc + (c.maxPoints || 0), 0);
  return rubric;
};

export const analyzeTextContent = async (text: string, rubric?: Rubric | null): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const rubricContext = rubric 
    ? rubric.criteria.map(c => `- GYLDIG OPPGAVE [${c.taskNumber}${c.subTask || ''}]`).join("\n") 
    : "Ingen fasit lastet opp.";
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: { parts: [{ text: `DOKUMENT:\n\n${text}` }] },
    config: { 
      systemInstruction: `DIGITAL ANALYSE v5.3.5:
Bruk fasiten for å mappe oppgaver:
${rubricContext}

Sørg for rene taskNumber (1, 2, 3) og subTask (a, b, c). Sett Del 2 som default for digitale filer.`,
      thinkingConfig: { thinkingBudget: 16000 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          candidateId: { type: Type.STRING },
          part: { type: Type.STRING, enum: ["Del 2", "Del 1"] },
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
        },
        required: ["candidateId", "part", "fullText", "identifiedTasks"]
      }
    }
  });
  return JSON.parse(cleanJson(response.text));
};

export const evaluateCandidate = async (candidate: Candidate, rubric: Rubric): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const content = candidate.pages.map(p => `SIDE ${p.pageNumber}:\n${p.transcription}`).join("\n\n---\n\n");
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: { parts: [{ text: `Vurder besvarelsen mot fasit. Bruk LaTeX aligned.\n\nFASIT:\n${JSON.stringify(rubric)}\n\nELEV:\n${content}` }] },
    config: { 
      thinkingConfig: { thinkingBudget: 24000 },
      responseMimeType: "application/json" 
    }
  });
  return JSON.parse(cleanJson(response.text));
};

export const reconcileProjectData = async (project: Project): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: { parts: [{ text: `Finn duplikate kandidater og rydd i metadata for PROSJEKT: ${JSON.stringify(project.candidates.map(c => ({ id: c.id, pages: c.pages.length })))}` }] },
    config: { 
      thinkingConfig: { thinkingBudget: 8000 },
      responseMimeType: "application/json" 
    }
  });
  return JSON.parse(cleanJson(response.text));
};