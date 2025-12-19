
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { Page, Candidate, Rubric } from "../types";

export interface TranscribedPart {
  candidateId: string;
  pageNumber: number;
  text: string;
}

export const transcribeAndAnalyzeImage = async (page: Page): Promise<TranscribedPart[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: page.mimeType,
            data: page.base64Data,
          },
        },
        {
          text: `Analyser dette bildet av en elevbesvarelse. 
          
          VIGTIG: 
          1. Sjekk om bildet er et oppslag med to sider (f.eks. A3 skannet som to A4-sider side-om-side). 
          2. Finn "Kandidatnummer" og "Sidenummer" som ofte står i bokser øverst på arket.
          3. Transkriber teksten nøyaktig.
          
          Returner resultatet som en liste med objekter. Hvis det er to sider i bildet, returner to objekter (venstre side først, så høyre). Hvis det bare er én side, returner ett objekt.`
        }
      ],
    },
    config: {
      systemInstruction: "Du er en ekspert på å tolke håndskrevne eksamensbesvarelser. Du er nøyaktig med kandidatnummer og sidenummer for å sikre riktig sortering. Svar ALLTID i JSON-format.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            candidateId: { type: Type.STRING, description: "Kandidatnummer funnet på siden" },
            pageNumber: { type: Type.NUMBER, description: "Sidenummer funnet på siden" },
            text: { type: Type.STRING, description: "Den fullstendige transkriberte teksten fra denne siden" }
          },
          required: ["candidateId", "pageNumber", "text"]
        }
      }
    }
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Kunne ikke parse JSON fra Gemini", e);
    return [];
  }
};

export const generateRubricFromTaskAndSamples = async (taskFiles: Page[], taskDescription: string, samples: string[]): Promise<Rubric> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const parts: any[] = taskFiles.map(f => ({
    inlineData: {
      mimeType: f.mimeType,
      data: f.base64Data
    }
  }));

  parts.push({
    text: `Her er selve prøven/oppgaveteksten. 
    Lærerens tilleggsbeskrivelse: "${taskDescription}"
    
    Eksempler på elevsvar for å kalibrere nivået:
    ${samples.join("\n---\n")}

    Lag en rettferdig og profesjonell vurderingsrubrikk basert på dette.`
  });

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: { parts },
    config: {
      systemInstruction: "Lag en detaljert vurderingsrubrikk i JSON-format. Vær spesifikk på hva som kreves for full poengpott på hvert kriterium.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          totalMaxPoints: { type: Type.NUMBER },
          criteria: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING },
                maxPoints: { type: Type.NUMBER }
              }
            }
          }
        }
      }
    }
  });

  return JSON.parse(response.text || "{}");
};

export const evaluateCandidate = async (candidate: Candidate, rubric: Rubric, taskContext: string): Promise<Candidate['evaluation']> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const sortedPages = [...candidate.pages].sort((a, b) => (a.pageNumber || 0) - (b.pageNumber || 0));
  const fullText = sortedPages.map(p => p.transcription).join("\n\n--- NESTE SIDE ---\n\n");
  
  const prompt = `KONTEKST (Prøven): ${taskContext}\n\nELEV: ${candidate.id}\nTEKST:\n${fullText}\n\nRUBRIKK:\n${JSON.stringify(rubric)}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: {
      systemInstruction: "Vurder eleven basert på både oppgaveteksten og rubrikken. Gi konstruktiv tilbakemelding. Svar i JSON.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          grade: { type: Type.STRING },
          feedback: { type: Type.STRING },
          score: { type: Type.NUMBER }
        }
      }
    }
  });

  return JSON.parse(response.text || "{}");
};
