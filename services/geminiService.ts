
import { GoogleGenAI, Type } from "@google/genai";
import { Page, Candidate, Rubric } from "../types";

class RateLimiter {
  private queue: Promise<any> = Promise.resolve();
  private lastRequestTime: number = 0;
  private readonly MIN_DELAY = 3000;

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    this.queue = this.queue.then(async () => {
      const now = Date.now();
      const timeSinceLast = now - this.lastRequestTime;
      if (timeSinceLast < this.MIN_DELAY) {
        await new Promise(resolve => setTimeout(resolve, this.MIN_DELAY - timeSinceLast));
      }
      this.lastRequestTime = Date.now();

      let attempt = 0;
      const maxRetries = 3;
      while (attempt < maxRetries) {
        try {
          return await fn();
        } catch (error: any) {
          attempt++;
          if ((error?.message?.includes("429") || error?.message?.includes("Quota")) && attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
          } else throw error;
        }
      }
      throw new Error("API Limit reached");
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
          { text: `Analyse denne elevbesvarelsen. 
          VIKTIG: Identifiser om dette er 'Del 1' eller 'Del 2' (eller lignende). 
          Finn Kandidatnr og Sidenr. 
          Transkriber innholdet og koble det til oppgaver (f.eks. Oppgave '1a'). 
          Bruk LaTeX ($...$) for matematikk.
          Returner JSON.` }
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
              part: { type: Type.STRING, description: "F.eks 'Del 1' eller 'Del 2'" },
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
            required: ["candidateId", "part", "pageNumber", "tasks", "fullText"]
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
    const parts: any[] = taskFiles.map(f => ({ 
      inlineData: { mimeType: f.mimeType, data: f.base64Data } 
    }));
    
    const promptText = `Lag en detaljert rettemanual. 
    Prøven kan ha flere deler (Del 1, Del 2). Identifiser disse tydelig.
    Bruk LaTeX ($...$) for alle formler.
    Inkluder 'commonErrors' basert på disse eksemplene fra elevene:
    ${samples.join("\n---\n")}`;

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
                  part: { type: Type.STRING, description: "F.eks 'Del 1'" },
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
                        deduction: { type: Type.NUMBER }
                      },
                      required: ["error", "deduction"]
                    }
                  }
                },
                required: ["name", "part", "description", "suggestedSolution", "maxPoints", "tema", "commonErrors"]
              }
            }
          },
          required: ["title", "totalMaxPoints", "criteria"]
        }
      }
    });
    return JSON.parse(response.text || "{}");
  });
};

export const evaluateCandidate = async (candidate: Candidate, rubric: Rubric, taskContext: string): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  return limiter.schedule(async () => {
    let contentToEvaluate = "";
    if (candidate.structuredAnswers) {
      Object.entries(candidate.structuredAnswers.parts).forEach(([partName, tasks]) => {
        contentToEvaluate += `\n--- ${partName.toUpperCase()} ---\n`;
        Object.entries(tasks).forEach(([taskNum, taskContent]) => {
          contentToEvaluate += `OPPGAVE ${taskNum}:\n`;
          Object.entries(taskContent.subtasks).forEach(([sub, text]) => {
            contentToEvaluate += `${sub ? `(${sub}) ` : ''}${text}\n`;
          });
        });
      });
    } else {
      contentToEvaluate = candidate.pages
        .sort((a,b) => (a.part||"").localeCompare(b.part||"") || (a.pageNumber||0)-(b.pageNumber||0))
        .map(p => `[${p.part || 'Ukjent Del'}] SIDE ${p.pageNumber}: ${p.transcription}`).join("\n\n");
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Vurder besvarelsen mot manualen. Vær obs på at Del 1 og Del 2 kan ha samme oppgavenummer.
      BESVARELSE:\n${contentToEvaluate}\n\nMANUAL:\n${JSON.stringify(rubric)}`,
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
                  part: { type: Type.STRING },
                  score: { type: Type.NUMBER },
                  max: { type: Type.NUMBER },
                  tema: { type: Type.STRING },
                  comment: { type: Type.STRING }
                },
                required: ["taskName", "part", "score", "max", "tema", "comment"]
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
