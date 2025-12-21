
import { GoogleGenAI, Type } from "@google/genai";
import { Page, Candidate, Rubric } from "../types";

class RateLimiter {
  private queue: Promise<any> = Promise.resolve();
  private lastRequestTime: number = 0;
  private readonly MIN_DELAY = 4000; // Økt til 4 sekunder for å være mer konservativ mot 429

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    this.queue = this.queue.then(async () => {
      const now = Date.now();
      const timeSinceLast = now - this.lastRequestTime;
      if (timeSinceLast < this.MIN_DELAY) {
        await new Promise(resolve => setTimeout(resolve, this.MIN_DELAY - timeSinceLast));
      }
      
      this.lastRequestTime = Date.now();

      let attempt = 0;
      const maxRetries = 5;
      let currentBackoff = 8000; // Starter på 8 sekunder ved feil

      while (attempt < maxRetries) {
        try {
          return await fn();
        } catch (error: any) {
          attempt++;
          const errorMsg = error?.message || JSON.stringify(error);
          const isQuota = errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("Quota");

          if (isQuota && attempt < maxRetries) {
            console.warn(`[API] Kvote nådd (Forsøk ${attempt}/${maxRetries}). Venter ${currentBackoff/1000}s før nytt forsøk...`);
            await new Promise(resolve => setTimeout(resolve, currentBackoff));
            currentBackoff *= 2.5; 
          } else {
            console.error("[API] Kritisk feil:", errorMsg);
            throw error;
          }
        }
      }
      throw new Error("Klarte ikke å fullføre forespørselen etter 5 forsøk pga. kvotebegrensninger.");
    });

    return this.queue;
  }
}

const limiter = new RateLimiter();

export const transcribeAndAnalyzeImage = async (page: Page): Promise<any[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  return limiter.schedule(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: page.mimeType, data: page.base64Data } },
          { text: `Les elevbesvarelsen nøye. 
          1. Finn Kandidatnr og Sidenr. 
          2. Transkriber alt innhold. 
          3. Identifiser spesifikke oppgaver og deloppgaver (f.eks. Oppgave '1', Deloppgave 'a'). 
          Bruk LaTeX ($...$) for all matematikk. 
          Svar i JSON-format med en liste over transkriberte deler per oppgave.` }
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              candidateId: { type: Type.STRING },
              pageNumber: { type: Type.NUMBER },
              tasks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    taskNum: { type: Type.STRING },
                    subTask: { type: Type.STRING },
                    text: { type: Type.STRING }
                  },
                  required: ["taskNum", "text"]
                }
              },
              fullText: { type: Type.STRING }
            },
            required: ["candidateId", "pageNumber", "tasks", "fullText"]
          }
        }
      }
    });
    return JSON.parse(response.text || "[]");
  });
};

export const generateRubricFromTaskAndSamples = async (taskFiles: Page[], taskDescription: string, samples: string[]): Promise<Rubric> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  return limiter.schedule(async () => {
    const parts: any[] = taskFiles.filter(f => f.base64Data).map(f => ({ 
      inlineData: { mimeType: f.mimeType, data: f.base64Data } 
    }));
    
    if (parts.length === 0) {
      throw new Error("Ingen filer å analysere for rettemanual.");
    }

    const promptText = `Lag en profesjonell og detaljert rettemanual basert på de vedlagte dokumentene (oppgave/fasit). 
    
    KRAV:
    - Sett standard poengsum til 2 poeng per deloppgave hvis ikke annet er spesifisert i fasit.
    - Analyser de vedlagte ELEV-EKSEMPLENE for å identifisere vanlige feilkilder, misoppfatninger eller slurvefeil.
    - Legg disse inn i "commonErrors" for hver kriterie.
    - Inkluder temaer, beskrivelser og løsningsforslag med LaTeX ($...$).
    
    KONTEKST: ${taskDescription || "Vurdering av prøve/eksamen"}
    ELEVARBEID (SAMPLES): 
    ${samples.join("\n---\n")}
    
    Svar med et JSON-objekt som følger skjemaet nøyaktig.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [...parts, { text: promptText }] },
      config: {
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
                  suggestedSolution: { type: Type.STRING },
                  tema: { type: Type.STRING },
                  maxPoints: { type: Type.NUMBER },
                  commonErrors: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        error: { type: Type.STRING },
                        deduction: { type: Type.NUMBER },
                        frequency_observation: { type: Type.STRING }
                      },
                      required: ["error", "deduction"]
                    }
                  }
                },
                required: ["name", "description", "suggestedSolution", "maxPoints", "tema", "commonErrors"]
              }
            }
          },
          required: ["title", "totalMaxPoints", "criteria"]
        }
      }
    });

    const text = response.text || "{}";
    try {
      const parsed = JSON.parse(text);
      return { 
        title: parsed.title || "Rettemanual", 
        totalMaxPoints: parsed.totalMaxPoints || 0, 
        criteria: parsed.criteria || [] 
      };
    } catch (e) {
      console.error("Feil ved parsing av manual-JSON:", text);
      throw e;
    }
  });
};

export const evaluateCandidate = async (candidate: Candidate, rubric: Rubric, taskContext: string): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  return limiter.schedule(async () => {
    let contentToEvaluate = "";
    if (candidate.structuredAnswers) {
      Object.entries(candidate.structuredAnswers.tasks).forEach(([taskNum, taskContent]) => {
        contentToEvaluate += `\nOPPGAVE ${taskNum}:\n`;
        Object.entries(taskContent.subtasks).forEach(([sub, text]) => {
          contentToEvaluate += `${sub ? `Deloppgave ${sub}: ` : ''}${text}\n`;
        });
      });
    } else {
      contentToEvaluate = candidate.pages.map(p => `SIDE ${p.pageNumber}: ${p.transcription}`).join("\n\n");
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Vurder denne elevbesvarelsen mot rettemanualen. Gi konstruktiv tilbakemelding og sett poeng per oppgave/kriterium. Bruk LaTeX ($...$) for matematikk.\n\nBESVARELSE:\n${contentToEvaluate}\n\nMANUAL:\n${JSON.stringify(rubric)}`,
      config: {
        thinkingConfig: { thinkingBudget: 8192 },
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
          required: ["grade", "feedback", "score", "vekstpunkter", "taskBreakdown"]
        }
      }
    });
    return JSON.parse(response.text || "{}");
  });
};
