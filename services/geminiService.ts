import { GoogleGenAI, Type } from "@google/genai";
import { Page, Candidate, Rubric, Project, RubricCriterion } from "../types";
import { getFromGlobalCache, saveToGlobalCache } from "./storageService";

/**
 * MODELL-STRATEGI v5.8.5 (Hybrid Precision):
 * - gemini-3-flash-preview: OCR, Transkripsjon, Rydding. (Ubegrenset RPD på Paid)
 * - gemini-3-pro-preview: FASIT-GENERERING & SLUTTVURDERING. (Kritiske vurderings-steg)
 */
const OCR_MODEL = 'gemini-3-flash-preview';
const REASONING_MODEL = 'gemini-3-pro-preview';

const LATEX_MANDATE = `
BRUK LaTeX-DELIMITERE \\( ... \\) FOR ALL MATEMATIKK, FORMLER OG BEREGNINGER. 
UTEN DISSE VIL IKKE SYSTEMET KUNNE RENDRE MATEMATIKKEN.
EKSEMPEL: \\( \\ln(x^2) \\) i stedet for ln(x^2).
UTREGNINGER OVER FLERE TRINN SKAL BRUKE \\( \\begin{aligned} ... \\end{aligned} \\).`;

const SPLIT_MANDATE = `
REGEL A3: DERSOM BILDET INNEHOLDER TO SPALTER ELLER TO SIDER (A3-OPPSLAG), 
SKAL DU RETURNERE NØYAKTIG TO (2) OBJEKTER I LISTEN: ET FOR "LEFT" OG ET FOR "RIGHT".
DETTE GJELDER OGSÅ OM DEN ENE SIDEN ER TOM.`;

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

const handleApiError = (e: any) => {
  const msg = e?.message || String(e);
  if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
    console.error("DIAGNOSE: Kvote-feil detektert. Sjekk AI Studio Plan Management.");
  }
  if (msg.includes("Requested entity was not found")) {
    console.error("Kritisk feil: API-nøkkelen ugyldig.");
    if ((window as any).aistudio?.openSelectKey) {
      (window as any).aistudio.openSelectKey();
    }
  }
  throw e;
};

export const transcribeAndAnalyzeImage = async (page: Page, rubric?: Rubric | null): Promise<any[]> => {
  const cached = await getFromGlobalCache(page.contentHash);
  if (cached && (page as any).forceRescan !== true) return Array.isArray(cached) ? cached : [cached];

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const rubricContext = rubric 
    ? rubric.criteria.map(c => `- GYLDIG OPPGAVE [${c.taskNumber}${c.subTask || ''}]: ${c.description}`).join("\n") 
    : "Ingen fasit lastet opp.";

  try {
    const response = await ai.models.generateContent({
      model: OCR_MODEL,
      contents: {
        parts: [{ inlineData: { mimeType: page.mimeType, data: page.base64Data || "" } }],
      },
      config: { 
        systemInstruction: `EKSPERT PÅ ELEVBESVARELSER v5.8.5:
DU ER EN STUM MASKINSKRIVER. REKONSTRUER DATA NØYAKTIG.

1. NULL PRATSOMHET.
${LATEX_MANDATE}
${SPLIT_MANDATE}

KVALITETSKRAV:
- All matematikk i 'fullText' og 'visualEvidence' SKAL ha \\( ... \\).
- Visuelle bevis (grafer, CAS) skal rekonstrueres bokstavelig, linje for linje.
- Bruk 'visualEvidence' feltet for teknisk rekonstruksjon.

WHITELIST:
${rubricContext}`,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              layoutType: { type: Type.STRING, enum: ["A4_SINGLE", "A3_SPREAD"] },
              sideInSpread: { type: Type.STRING, enum: ["LEFT", "RIGHT"] },
              candidateId: { type: Type.STRING },
              pageNumber: { type: Type.INTEGER },
              part: { type: Type.STRING, enum: ["Del 1", "Del 2"] },
              fullText: { type: Type.STRING },
              visualEvidence: { type: Type.STRING },
              rotation: { type: Type.INTEGER },
              identifiedTasks: { 
                type: Type.ARRAY, 
                items: { 
                  type: Type.OBJECT, 
                  properties: { taskNumber: { type: Type.STRING }, subTask: { type: Type.STRING } }
                } 
              }
            },
            required: ["layoutType", "fullText", "identifiedTasks", "rotation", "pageNumber"]
          }
        }
      }
    });
    const results = JSON.parse(cleanJson(response.text));
    if (!(page as any).forceRescan) await saveToGlobalCache(page.contentHash, results);
    return results;
  } catch (e) { return handleApiError(e); }
};

export const regenerateSingleCriterion = async (criterion: RubricCriterion): Promise<Partial<RubricCriterion>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: REASONING_MODEL,
      contents: { parts: [{ text: `Regenerer løsning for: ${criterion.description}` }] },
      config: { 
        systemInstruction: `EKSPERT PÅ RETTEMANUALER v5.8.5: 
NULL PRATSOMHET.
${LATEX_MANDATE}`,
        thinkingConfig: { thinkingBudget: 16000 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { suggestedSolution: { type: Type.STRING }, commonErrors: { type: Type.STRING } },
          required: ["suggestedSolution", "commonErrors"]
        }
      }
    });
    return JSON.parse(cleanJson(response.text));
  } catch (e) { return handleApiError(e); }
};

export const analyzeTextContent = async (text: string, rubric?: Rubric | null): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: OCR_MODEL,
      contents: { parts: [{ text: `DOKUMENT:\n\n${text}` }] },
      config: { 
        systemInstruction: `DIGITAL ANALYSE v5.8.5: 
STUM REKONSTRUKSJON.
${LATEX_MANDATE}`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            candidateId: { type: Type.STRING },
            part: { type: Type.STRING, enum: ["Del 2", "Del 1"] },
            fullText: { type: Type.STRING },
            visualEvidence: { type: Type.STRING },
            identifiedTasks: { 
              type: Type.ARRAY, 
              items: { type: Type.OBJECT, properties: { taskNumber: { type: Type.STRING }, subTask: { type: Type.STRING } } } 
            }
          },
          required: ["candidateId", "part", "fullText", "identifiedTasks"]
        }
      }
    });
    return JSON.parse(cleanJson(response.text));
  } catch (e) { return handleApiError(e); }
};

export const generateRubricFromTaskAndSamples = async (taskFiles: Page[]): Promise<Rubric> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts = taskFiles.map(f => {
    if (f.mimeType === 'text/plain') return { text: `FIL: ${f.transcription}` };
    return { inlineData: { mimeType: f.mimeType, data: f.base64Data || "" } };
  });
  
  try {
    const response = await ai.models.generateContent({
      model: REASONING_MODEL,
      contents: { parts: [...parts, { text: "Generer rettemanual. 2.0 poeng per oppgave." }] },
      config: { 
        systemInstruction: `RETTEMANUAL-EKSPERT v5.8.5: 
NULL PRATSOMHET.
${LATEX_MANDATE}`,
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
                required: ["taskNumber", "subTask", "part", "description", "suggestedSolution", "maxPoints", "commonErrors"]
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
  } catch (e) { return handleApiError(e); }
};

export const evaluateCandidate = async (candidate: Candidate, rubric: Rubric): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const content = candidate.pages.map(p => `SIDE ${p.pageNumber}:\n${p.transcription}`).join("\n\n");
  
  try {
    const response = await ai.models.generateContent({
      model: REASONING_MODEL,
      contents: { parts: [{ text: `Vurder besvarelsen mot fasit.\n\nFASIT:\n${JSON.stringify(rubric)}\n\nELEV:\n${content}` }] },
      config: { 
        systemInstruction: `PEDAGOGISK SENSOR v5.8.5: 
STUM VURDERING.
${LATEX_MANDATE}`,
        thinkingConfig: { thinkingBudget: 32000 },
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
                  taskNumber: { type: Type.STRING },
                  subTask: { type: Type.STRING },
                  score: { type: Type.NUMBER },
                  max: { type: Type.NUMBER },
                  comment: { type: Type.STRING }
                },
                required: ["taskNumber", "subTask", "score", "max", "comment"]
              }
            }
          },
          required: ["grade", "score", "feedback", "vekstpunkter", "taskBreakdown"]
        }
      }
    });
    return JSON.parse(cleanJson(response.text));
  } catch (e) { return handleApiError(e); }
};

export const reconcileProjectData = async (project: Project): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: OCR_MODEL,
      contents: { parts: [{ text: `Rydd prosjekt: ${JSON.stringify(project.candidates.map(c => ({ id: c.id, p: c.pages.length })))}` }] },
      config: { responseMimeType: "application/json" }
    });
    return JSON.parse(cleanJson(response.text));
  } catch (e) { return handleApiError(e); }
};