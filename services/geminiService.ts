
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { Page, Candidate, Rubric } from "../types";

export interface TranscribedPart {
  candidateId: string;
  pageNumber: number;
  text: string;
  tasks?: string[];
  drawings?: string[];
  illegible?: string[];
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
          1. Finn "Kandidatnummer" og "Sidenummer".
          2. Transkriber teksten nøyaktig. Bruk LaTeX ($...$) for all matematikk du finner i elevens håndskrift.
          3. IDENTIFISER hvilke oppgaver som besvares på denne siden (f.eks. "1a", "2").
          4. TEGNINGER: Hvis du ser en tegning/illustrasjon, beskriv den kort.
          5. ULESBARHET: Identifiser områder som er uleselige.
          
          Svar i JSON.`
        }
      ],
    },
    config: {
      systemInstruction: "Du er en ekspert på å tolke eksamensbesvarelser. Vær ærlig om uleselig tekst. Beskrivelser av tegninger skal starte med 'AI-tolkning:'. Svar ALLTID i JSON-format.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            candidateId: { type: Type.STRING },
            pageNumber: { type: Type.NUMBER },
            text: { type: Type.STRING },
            tasks: { type: Type.ARRAY, items: { type: Type.STRING } },
            drawings: { type: Type.ARRAY, items: { type: Type.STRING } },
            illegible: { type: Type.ARRAY, items: { type: Type.STRING } }
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
  const parts: any[] = taskFiles.filter(f => f.base64Data).map(f => ({ inlineData: { mimeType: f.mimeType, data: f.base64Data } }));
  const textContext = taskFiles.filter(f => !f.base64Data).map(f => f.transcription).join("\n\n");

  const promptText = `Lag en komplett rettemanual hvor hver deloppgave har sitt eget løsningsforslag og vurderingskriterier.

VIGTIG: Bruk LaTeX ($...$) for ALL matematikk i både løsningsforslag og kriterier.

OPPGAVEBESKRIVELSE/KONTEKST:
${textContext}
LÆRERS BESKRIVELSE: 
${taskDescription}

EKSEMPLER FRA BESVARELSER:
${samples.join("\n---\n")}

KRAV TIL RETTEMANUALEN:
1. Del opp i kriterier per deloppgave (f.eks. 1a, 1b).
2. Hvert kriterium SKAL inneholde et 'suggestedSolution' spesifikt for den deloppgaven.
3. Bruk LaTeX for formler.
4. Spesifiser hva som gir full uttelling og vanlige feil.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: { parts: [...parts, { text: promptText }] },
    config: {
      thinkingConfig: { thinkingBudget: 16384 },
      systemInstruction: "Lag en detaljert rettemanual i JSON-format. Hvert objekt i 'criteria' må ha 'suggestedSolution' med LaTeX.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          totalMaxPoints: { type: Type.NUMBER },
          overview: { type: Type.STRING },
          criteria: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING, description: "Vurderingskriterier (hva gir poeng)" },
                suggestedSolution: { type: Type.STRING, description: "Løsningsforslag med LaTeX for denne oppgaven" },
                tema: { type: Type.STRING },
                maxPoints: { type: Type.NUMBER },
                commonMistakes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: { 
                      mistake: { type: Type.STRING }, 
                      deduction: { type: Type.NUMBER }, 
                      explanation: { type: Type.STRING } 
                    },
                    required: ["mistake", "deduction", "explanation"]
                  }
                }
              },
              required: ["name", "description", "suggestedSolution", "maxPoints", "tema"]
            }
          }
        },
        required: ["title", "totalMaxPoints", "criteria"]
      }
    }
  });

  try {
    return JSON.parse(response.text || "{}");
  } catch (e) {
    return { title: "Feil", totalMaxPoints: 0, criteria: [] };
  }
};

export const evaluateCandidate = async (candidate: Candidate, rubric: Rubric, taskContext: string): Promise<Candidate['evaluation']> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const fullText = candidate.pages.map(p => {
    let meta = "";
    if (p.drawings?.length) meta += `\n[TEGNINGER: ${p.drawings.join(", ")}]`;
    if (p.illegibleSegments?.length) meta += `\n[ULESBARE OMRÅDER: ${p.illegibleSegments.join(", ")}]`;
    return `SIDE ${p.pageNumber}: ${p.transcription}${meta}`;
  }).join("\n\n---\n\n");
  
  const prompt = `KANDIDAT: ${candidate.id}\nOPPGAVER IDENTIFISERT: ${candidate.pages.flatMap(p => p.identifiedTasks || []).join(", ")}\n\nTEKST OG METADATA:\n${fullText}\n\nRUBRIKK OG LØSNING:\n${JSON.stringify(rubric)}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: {
      thinkingConfig: { thinkingBudget: 16384 },
      systemInstruction: `Vurder kandidaten nøyaktig mot rettemanualen. Bruk LaTeX ($...$) i feedbacken der det er naturlig.
      Svar i JSON.`,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          grade: { type: Type.STRING },
          feedback: { type: Type.STRING },
          score: { type: Type.NUMBER },
          vekstpunkter: { type: Type.ARRAY, items: { type: Type.STRING } },
          taskBreakdown: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: { 
                taskName: { type: Type.STRING }, 
                score: { type: Type.NUMBER }, 
                max: { type: Type.NUMBER }, 
                tema: { type: Type.STRING }, 
                comment: { type: Type.STRING } 
              },
              required: ["taskName", "score", "max", "tema", "comment"]
            }
          }
        },
        required: ["grade", "feedback", "score", "vekstpunkter"]
      }
    }
  });

  try {
    return JSON.parse(response.text || "{}");
  } catch (e) {
    return { grade: "-", feedback: "Feil", score: 0, vekstpunkter: [] };
  }
};
