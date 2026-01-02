
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
    ? rubric.criteria.map(c => `- OPPGAVE [${c.taskNumber}${c.subTask || ''}]: ${c.description} (Løsning: ${c.suggestedSolution.substring(0, 100)}...)`).join("\n") 
    : "Ingen fasit lastet opp.";

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: {
      parts: [{ inlineData: { mimeType: page.mimeType, data: page.base64Data || "" } }],
    },
    config: { 
      systemInstruction: `EKSPERT PÅ ELEVBESVARELSER v5.2.0:
BRUK DENNE FASITEN SOM KART:
${rubricContext}

STRENGE REGLER FOR OPPGAVENAVN:
- taskNumber skal kun være tallet (f.eks. "1")
- subTask skal kun være bokstaven (f.eks. "a")
- ALDRI inkluder teksten "Oppgave" eller "Del" i disse feltene.

MATEMATIKK:
- Bruk LaTeX aligned for alle utregninger over ett ledd.`,
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
    contents: { parts: [...parts, { text: "Generer strukturert rettemanual i JSON. Sørg for at taskNumber er rent (f.eks '1') og subTask er rent (f.eks 'a')." }] },
    config: { 
      systemInstruction: `RETTEMANUAL-EKSPERT v5.2.0:
1. DEL oppgaver i Del 1 og Del 2.
2. BRUK LaTeX aligned for alle løsningsforslag.
3. taskNumber SKAL KUN være tallet.
4. subTask SKAL KUN være bokstaven.
5. MAKS 2.0 poeng per deloppgave.`,
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
    ? rubric.criteria.map(c => `- OPPGAVE [${c.taskNumber}${c.subTask || ''}]: ${c.description}`).join("\n") 
    : "Ingen fasit lastet opp.";
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: { parts: [{ text: `DOKUMENT:\n\n${text}` }] },
    config: { 
      systemInstruction: `DIGITAL ANALYSE v5.2.0:
BRUK fasiten for å mappe oppgaver:
${rubricContext}

Sørg for rene taskNumber (1, 2, 3) og subTask (a, b, c).`,
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
    contents: { parts: [{ text: `Vurder besvarelsen:\n${JSON.stringify(rubric)}\n\nELEV:\n${content}` }] },
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
    contents: { parts: [{ text: `Rydd i IDer for PROSJEKT: ${JSON.stringify(project.candidates.map(c => ({ id: c.id, pages: c.pages.length })))}` }] },
    config: { 
      thinkingConfig: { thinkingBudget: 8000 },
      responseMimeType: "application/json" 
    }
  });
  return JSON.parse(cleanJson(response.text));
};
