
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
  
  // Send hele konteksten fra fasiten slik at KI kan gjette smartere
  const rubricContext = rubric 
    ? rubric.criteria.map(c => `- [${c.taskNumber}${c.subTask || ''}]: ${c.description.substring(0, 100)}`).join("\n") 
    : "Ingen fasit lastet opp ennå.";

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: {
      parts: [
        { inlineData: { mimeType: page.mimeType, data: page.base64Data } }
      ],
    },
    config: { 
      systemInstruction: `DOKUMENTANALYSE v5.0.0 - CONTEXT-AWARE MAPPING:
DU ER EN EKSPERT PÅ Å TOLKE SKANNEDE ELEVBESVARELSER.

GYLDIG RETTEMANUAL (WHITELIST):
${rubricContext}

STRENGE REGLER FOR KATEGORISERING:
1. KUN oppgaver som finnes i whitelisten over er tillatt i 'identifiedTasks'.
2. EVIDENCE-BASED MAPPING: Se på hva eleven faktisk har skrevet. Hvis eleven skriver "Oppgave 1" og innholdet ligner på beskrivelsen for [1A] i fasiten, kategoriser som [1A].
3. FORBUD MOT STØY: Punktlister (i, ii, iii) eller (1, 2, 3) inne i en tekst er IKKE egne oppgaver. De skal kun transkriberes i 'fullText'.
4. Hvis du er usikker eller oppgaven mangler i fasiten, sett "UKJENT". ALDRI finn på nye oppgavenummer som f.eks. "1I" eller "1III".

MATEMATIKK: Bruk LaTeX aligned.`,
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

export const analyzeTextContent = async (text: string, rubric?: Rubric | null): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const rubricContext = rubric 
    ? rubric.criteria.map(c => `- [${c.taskNumber}${c.subTask || ''}]: ${c.description.substring(0, 100)}`).join("\n") 
    : "Ingen fasit lastet opp ennå.";
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: { parts: [{ text: `DOKUMENT SOM SKAL ANALYSERES:\n\n${text.substring(0, 10000)}` }] },
    config: { 
      systemInstruction: `DIGITAL ANALYSE v5.0.0 - CONTEXT-AWARE MAPPING:

GYLDIG RETTEMANUAL (WHITELIST):
${rubricContext}

STRENGE REGLER:
- Du har KUN lov til å identifisere oppgaver som finnes i listen over.
- Bruk teksten i besvarelsen til å gjette hvilken oppgave det er. Hvis teksten handler om det samme som beskrivelsen i fasiten, velg den oppgaven.
- ROMERTALL (i, ii, iii) er punkttegn, ALDRI egne oppgaver.
- Hvis usikker, sett "UKJENT".

HEURISTIKK: Word-filer er nesten alltid "Del 2".

MATEMATIKK: Bruk LaTeX aligned.`,
      thinkingConfig: { thinkingBudget: 16000 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          candidateId: { type: Type.STRING, description: "Kun siffer fra kandidatnummeret." },
          part: { type: Type.STRING, enum: ["Del 2", "Del 1"], description: "Default til 'Del 2' for Word-filer." },
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

export const generateRubricFromTaskAndSamples = async (taskFiles: Page[]): Promise<Rubric> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts = taskFiles.map(f => {
    if (f.mimeType === 'text/plain') return { text: `TEKST FRA OPPGAVEFIL (${f.fileName}):\n${f.transcription}` };
    return { inlineData: { mimeType: f.mimeType, data: f.base64Data } };
  });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: { parts: [...parts, { text: "Generer en strukturert rettemanual. Bruk LaTeX aligned for utregninger." }] },
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
                maxPoints: { type: Type.NUMBER }
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

export const evaluateCandidate = async (candidate: Candidate, rubric: Rubric): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const content = candidate.pages.map(p => `SIDE ${p.pageNumber}:\n${p.transcription}`).join("\n\n---\n\n");
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Vurder besvarelsen mot manualen:\n${JSON.stringify(rubric)}\n\nELEV:\n${content}`,
    config: { thinkingBudget: 24000 }, responseMimeType: "application/json" }
  });
  return JSON.parse(cleanJson(response.text));
};

export const reconcileProjectData = async (project: Project): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Rydd i kandidat-IDer. PROSJEKT: ${JSON.stringify(project.candidates.map(c => ({ id: c.id, pages: c.pages.length })))}`,
    config: { thinkingBudget: 8000 }, responseMimeType: "application/json" }
  });
  return JSON.parse(cleanJson(response.text));
};
