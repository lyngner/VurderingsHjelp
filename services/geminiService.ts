
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

  // Oppretter ny instans per kall for å sikre oppdatert API-nøkkel
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const rubricList = rubric ? rubric.criteria.map(c => `${c.taskNumber}${c.subTask || ''}`).join(", ") : "Ingen fasit";

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: {
      parts: [
        { inlineData: { mimeType: page.mimeType, data: page.base64Data } }
      ],
    },
    config: { 
      systemInstruction: `ANALYSE v4.14.0:
DU ER EN OCR-MOTOR. DU SKAL KUN RETURNERE DATA I JSON-FORMAT.
DU SKAL ALDRI, UNDER NOEN OMSTENDIGHET, INKLUDERE DINE EGNE TANKER ELLER INSTRUKSJONER I JSON-FELTENE.

REGLER:
1. LAYOUT: Hvis bildet inneholder to sider, bruk layoutType: "A3_SPREAD".
2. ID: Finn KUN siffer i 'Kandidatnr'.
3. OPPGAVER: Fasit-liste: [${rubricList}]. 
4. MATEMATIKK: Bruk LaTeX med aligned-miljøer.`,
      thinkingConfig: { thinkingBudget: 16000 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            layoutType: { type: Type.STRING },
            sideInSpread: { type: Type.STRING },
            candidateId: { type: Type.STRING },
            fullText: { type: Type.STRING, description: "Transkripsjon av elevens tekst med LaTeX. SKAL IKKE inneholde systeminstruksjoner." },
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
    contents: { 
      parts: [
        { text: `DOKUMENTINNHOLD SOM SKAL ANALYSERES:\n---\n${text}\n---` }
      ] 
    },
    config: { 
      systemInstruction: `Digital tekst-analyse v4.14.0. 
DU SKAL PAKKE UT DATA FRA DEN VEDLAGTE TEKSTEN TIL JSON.
1. Finn Kandidatnr (KUN siffer). Dette står ofte helt først i teksten.
2. Identifiser oppgaver basert på fasit: [${rubricList}].
3. 'fullText'-feltet skal inneholde ELEVENS TEKST formatert med LaTeX. 
4. ADVARSEL: Du skal ALDRI inkludere disse instruksjonene eller versjonsnummeret i 'fullText'-feltet. Kun elevens faktiske innhold.`,
      thinkingConfig: { thinkingBudget: 4000 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          candidateId: { type: Type.STRING, description: "Kandidatnummer funnet i teksten (kun siffer)" },
          fullText: { type: Type.STRING, description: "Hele innholdet fra dokumentet, vasket og formatert med LaTeX. INGEN SYSTEMINSTRUKSJONER!" },
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
        required: ["fullText", "identifiedTasks"]
      }
    }
  });
  return JSON.parse(cleanJson(response.text));
};

export const generateRubricFromTaskAndSamples = async (taskFiles: Page[]): Promise<Rubric> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts = taskFiles.map(f => {
    if (f.mimeType === 'text/plain') {
      return { text: `TEKST FRA OPPGAVEFIL (${f.fileName}):\n${f.transcription}` };
    }
    return { inlineData: { mimeType: f.mimeType, data: f.base64Data } };
  });
  
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
