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
  const rubricList = rubric ? rubric.criteria.map(c => `${c.taskNumber}${c.subTask || ''}`).join(", ") : "Ingen fasit";

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: {
      parts: [
        { inlineData: { mimeType: page.mimeType, data: page.base64Data } }, 
        { text: `ANALYSE v4.9.0 (ULTRA-STRENG):
DU ER EN OCR-MOTOR. DU SKAL KUN RETURNERE DATA I JSON-FORMAT.
DU SKAL ALDRI, UNDER NOEN OMSTENDIGHET, INKLUDERE DINE EGNE TANKER, EVALUERINGER ELLER 'ESTIMATER' (f.eks. "4B (EST.)") I JSON-FELTENE.

REGLER:
1. LAYOUT: Hvis bildet er bredere enn det er høyt og inneholder to sider, SKAL du returnere TO objekter (LEFT og RIGHT) med layoutType: "A3_SPREAD". Dette er obligatorisk for bilde-oppslag!
2. ROTASJON: Finn rotasjon (0, 90, 180, 270) slik at teksten er loddrett og lesbar.
3. ID: Finn KUN siffer i 'Kandidatnr'. Ikke skriv "Kandidat 101", bare "101".
4. OPPGAVER: Fasit-liste: [${rubricList}]. 
   - taskNumber SKAL KUN være et tall (f.eks. "1").
   - subTask SKAL KUN være en bokstav (f.eks. "a").
   - Hvis du er usikker, bruk "UKJENT". ALDRI skriv forklaringer i disse feltene!
5. MATEMATIKK: Bruk LaTeX med aligned-miljøer for stegvise utregninger.` }
      ],
    },
    config: { 
      thinkingConfig: { thinkingBudget: 16000 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            layoutType: { type: Type.STRING, description: "KUN 'A4_SINGLE' eller 'A3_SPREAD'" },
            sideInSpread: { type: Type.STRING, description: "KUN 'LEFT' eller 'RIGHT' hvis A3_SPREAD" },
            candidateId: { type: Type.STRING, description: "KUN siffer (f.eks. '104')" },
            fullText: { type: Type.STRING, description: "Fullstendig transkripsjon med LaTeX" },
            rotation: { type: Type.INTEGER },
            identifiedTasks: { 
              type: Type.ARRAY, 
              items: { 
                type: Type.OBJECT, 
                properties: { 
                  taskNumber: { type: Type.STRING, description: "KUN tallet, f.eks. '4'" }, 
                  subTask: { type: Type.STRING, description: "KUN bokstaven, f.eks. 'b'" } 
                }
              } 
            }
          },
          required: ["layoutType", "fullText", "identifiedTasks"]
        }
      }
    }
  });
  
  const results = JSON.parse(cleanJson(response.text));
  await saveToGlobalCache(page.contentHash, results);
  return results;
};

export const analyzeTextContent = async (text: string, rubric?: Rubric | null): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const rubricList = rubric ? rubric.criteria.map(c => `${c.taskNumber}${c.subTask || ''}`).join(", ") : "Ingen fasit";
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: { parts: [{ text: `Digital tekst-analyse v4.9.0. Identifiser Kandidatnr (KUN siffer) og oppgaver.
Fasit-oppgaver: [${rubricList}].
Mapper 'i.', 'ii.', 'a)', 'b)' til riktige suboppgaver. ALDRI inkluder resonnering i JSON-felt.` }] },
    config: { 
      thinkingConfig: { thinkingBudget: 4000 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          candidateId: { type: Type.STRING },
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
};

export const generateRubricFromTaskAndSamples = async (taskFiles: Page[]): Promise<Rubric> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts = taskFiles.map(f => ({ inlineData: { mimeType: f.mimeType, data: f.base64Data } }));
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: { parts: [...parts, { text: "Generer en strukturert rettemanual basert på oppgavearkene. Bruk LaTeX for alle utregninger. Hver deloppgave skal ha maks 2 poeng." }] },
    config: { 
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
  
  // Sikkerhetssjekk for criteria-array
  if (rubric && rubric.criteria && Array.isArray(rubric.criteria)) {
    rubric.totalMaxPoints = rubric.criteria.reduce((acc, c) => acc + (c.maxPoints || 0), 0);
  } else {
    rubric.totalMaxPoints = 0;
    rubric.criteria = [];
  }
  
  return rubric;
};

export const evaluateCandidate = async (candidate: Candidate, rubric: Rubric): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const content = candidate.pages.map(p => `SIDE ${p.pageNumber}:\n${p.transcription}`).join("\n\n---\n\n");
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Vurder besvarelsen mot manualen:\n${JSON.stringify(rubric)}\n\nELEV:\n${content}`,
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
    contents: `Rydd i kandidat-IDer og oppgaver. Slå sammen duplikater.\nPROSJEKT: ${JSON.stringify(project.candidates.map(c => ({ id: c.id, pages: c.pages.length })))}`,
    config: { 
      thinkingConfig: { thinkingBudget: 8000 },
      responseMimeType: "application/json" 
    }
  });
  return JSON.parse(cleanJson(response.text));
};