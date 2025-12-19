
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
          text: `Analyser dette bildet av en kandidatbesvarelse. 
          
          VIGTIG: 
          1. Sjekk om bildet er et oppslag med to sider. 
          2. Finn "Kandidatnummer" og "Sidenummer".
          3. Transkriber teksten nøyaktig, inkludert matematiske formler og symboler.
          
          Svar i JSON.`
        }
      ],
    },
    config: {
      systemInstruction: "Du er en ekspert på å tolke håndskrevne eksamensbesvarelser. Du er nøyaktig med kandidatnummer og sidenummer. Svar ALLTID i JSON-format.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            candidateId: { type: Type.STRING },
            pageNumber: { type: Type.NUMBER },
            text: { type: Type.STRING }
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
  
  const parts: any[] = taskFiles
    .filter(f => f.base64Data) // Only include images/PDFs with actual data
    .map(f => ({
      inlineData: {
        mimeType: f.mimeType,
        data: f.base64Data
      }
    }));

  const textContext = taskFiles.filter(f => !f.base64Data).map(f => f.transcription).join("\n\n");

  parts.push({
    text: `Her er selve prøven/oppgaveteksten (bilder/PDF og tekst). 
    Tekstlig innhold fra filer: ${textContext}
    Lærerens tilleggsbeskrivelse: "${taskDescription}"
    
    Merk: Hvis teksten fra Word-filer virker mangelfull (f.eks. mangler ligninger), bruk konteksten fra bildene eller logisk slutning for å forstå hva oppgaven spør om.
    
    Eksempler på kandidatsvar for nivå-kalibrering:
    ${samples.join("\n---\n")}

    Lag en rettferdig og profesjonell vurderingsrubrikk basert på dette.`
  });

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: { parts },
    config: {
      systemInstruction: "Lag en detaljert vurderingsrubrikk i JSON-format. Vær spesifikk på poengkrav.",
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
  const fullText = candidate.pages.map(p => p.transcription).join("\n\n--- SIDE ---\n\n");
  
  const prompt = `KONTEKST (Oppgaven): ${taskContext}\n\nKANDIDAT: ${candidate.id}\nTEKST:\n${fullText}\n\nRUBRIKK:\n${JSON.stringify(rubric)}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: {
      systemInstruction: "Vurder kandidaten nøyaktig basert på oppgave og rubrikk. Vær observant på matematiske utregninger. Svar i JSON.",
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
