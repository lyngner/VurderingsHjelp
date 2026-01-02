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
      systemInstruction: `EKSPERT PÅ ELEVBESVARELSER v5.5.9 "Silent Laborer":

DU ER EN STUM ARBEIDER. DU SKAL KUN LEVERE RÅDATA. 

1. FORBUD MOT FORKLARINGER: 
   - IKKE bruk setninger som "Teksten refererer til...", "Dette indikerer...", "Her ser vi...".
   - IKKE fortell læreren hva som mangler eller hva du tror.
   - HVIS et bilde mangler, men er referert til, skriv KUN: [MANGLER VISUELT BEVIS]

2. CAS-REKONSTRUKSJON:
   - Integrer alle CAS-utklipp DIREKTE i 'fullText' ved bruk av tagen: [AI-TOLKNING AV FIGUR: <data>]
   - FORMAT: Kun rå terminal-stil:
     $1: f(x):=...
     -> ...
   - ALDRI forklar hva CAS-bildet viser i naturlig språk.

3. ORIENTERING & LAYOUT:
   - Sjekk først orientering (180 grader).

4. WHITELIST:
${rubricContext}`,
      thinkingConfig: { thinkingBudget: 24000 },
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
            visualEvidence: { type: Type.STRING },
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
    ? rubric.criteria.map(c => `- GYLDIG OPPGAVE [${c.taskNumber}${c.subTask || ''}]`).join("\n") 
    : "Ingen fasit lastet opp.";
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: { parts: [{ text: `DOKUMENT:\n\n${text}` }] },
    config: { 
      systemInstruction: `DIGITAL ANALYSE v5.5.9 "Silent Hunter":
1. NULL PRATSOMHET: Fjern alle forklarende setninger om dokumentets innhold.
2. CAS-INTEGRERING: Flytt blokker som ser ut som digital bevisføring inn i taggen [AI-TOLKNING AV FIGUR: ...] nøyaktig der de står.
3. KUN RÅDATA: Lever kun transkripsjon og teknisk rekonstruksjon.
4. WHITELIST:
${rubricContext}`,
      thinkingConfig: { thinkingBudget: 16000 },
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
    if (f.mimeType === 'text/plain') return { text: `OPPGAVEFIL (${f.fileName}):\n${f.transcription}` };
    return { inlineData: { mimeType: f.mimeType, data: f.base64Data || "" } };
  });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: { parts: [...parts, { text: "Generer rettemanual. Fyll ut 'commonErrors' med pedagogisk veiledning for typiske feil." }] },
    config: { 
      systemInstruction: `RETTEMANUAL-EKSPERT v5.5.5:
1. VANLIGE FEIL: Analyser oppgavens natur og fyll ut 'commonErrors' med konkrete eksempler på misforståelser eller slurvefeil.
2. MATEMATIKK: Bruk LaTeX aligned.`,
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
};

export const evaluateCandidate = async (candidate: Candidate, rubric: Rubric): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const content = candidate.pages.map(p => `SIDE ${p.pageNumber}:\nINNHOLD:\n${p.transcription}\n\nSEPARATE BEVIS (hvis noen):\n${p.visualEvidence || 'Ingen'}`).join("\n\n---\n\n");
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: { parts: [{ text: `Vurder besvarelsen mot fasit. Innholdet inneholder både tekst og integrerte visuelle bevis (markerte med tagger).\n\nFASIT:\n${JSON.stringify(rubric)}\n\nELEV:\n${content}` }] },
    config: { 
      systemInstruction: `PEDAGOGISK SENSOR v5.5.8:
1. KILDE: Baser vurderingen KUN på det transkriberte innholdet. Se spesielt etter tagger markerte som 'AI-TOLKNING AV FIGUR' for teknisk bevisføring.
2. KOMMENTARPLIKT: Alle deloppgaver som ikke får FULL SCORE skal ha en begrunnelse.
3. VEKSTPUNKTER: Lag 2-3 punkter.`,
      thinkingConfig: { thinkingBudget: 24000 },
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
                taskNumber: { type: Type.STRING },
                subTask: { type: Type.STRING },
                score: { type: Type.NUMBER },
                max: { type: Type.NUMBER },
                comment: { type: Type.STRING },
                tema: { type: Type.STRING }
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
};

export const reconcileProjectData = async (project: Project): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: { parts: [{ text: `Finn duplikate kandidater for PROSJEKT: ${JSON.stringify(project.candidates.map(c => ({ id: c.id, pages: c.pages.length })))}` }] },
    config: { 
      thinkingConfig: { thinkingBudget: 8000 },
      responseMimeType: "application/json" 
    }
  });
  return JSON.parse(cleanJson(response.text));
};