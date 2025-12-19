
import { GoogleGenAI, Type } from "@google/genai";
import { Page, Candidate, Rubric } from "../types";

class RateLimiter {
  private lastRequestTime: number = 0;
  private queue: Promise<any> = Promise.resolve();

  // Balanserte ventetider for raskere flyt
  private static DELAY_FLASH = 2000; // 2 sekunder mellom Flash-kall
  private static DELAY_PRO = 8000;   // 8 sekunder mellom Pro-kall

  async schedule<T>(modelType: 'flash' | 'pro', fn: () => Promise<T>): Promise<T> {
    const delay = modelType === 'flash' ? RateLimiter.DELAY_FLASH : RateLimiter.DELAY_PRO;

    this.queue = this.queue.then(async () => {
      const now = Date.now();
      const timeSinceLast = now - this.lastRequestTime;
      
      if (timeSinceLast < delay) {
        const waitTime = delay - timeSinceLast;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      let attempt = 0;
      const maxRetries = 3;
      let currentBackoff = 15000; 

      while (attempt < maxRetries) {
        try {
          const result = await fn();
          this.lastRequestTime = Date.now();
          return result;
        } catch (error: any) {
          attempt++;
          const errorMsg = error?.message || JSON.stringify(error);
          const isRateLimit = errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("Quota exceeded");

          if (isRateLimit && attempt < maxRetries) {
            console.warn(`[RateLimiter] Kvote nådd. Forsøk ${attempt}/${maxRetries}. Venter ${currentBackoff}ms...`);
            await new Promise(resolve => setTimeout(resolve, currentBackoff));
            currentBackoff *= 2;
          } else {
            throw error;
          }
        }
      }
    });

    return this.queue;
  }
}

const limiter = new RateLimiter();

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
  
  return limiter.schedule('flash', async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: page.mimeType, data: page.base64Data } },
          { text: `Analyser bildet. Finn Kandidatnr og Sidenr. Transkriber alt. Bruk LaTeX ($...$) for matematikk. Svar i JSON.` }
        ],
      },
      config: {
        systemInstruction: "Du er en ekspert på å lese håndskrevne elevbesvarelser. Svar ALLTID og KUN i gyldig JSON-format.",
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
    const parsed = JSON.parse(response.text || "[]");
    return Array.isArray(parsed) ? parsed : [];
  });
};

export const generateRubricFromTaskAndSamples = async (taskFiles: Page[], taskDescription: string, samples: string[]): Promise<Rubric> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  return limiter.schedule('pro', async () => {
    const parts: any[] = taskFiles.filter(f => f.base64Data).map(f => ({ inlineData: { mimeType: f.mimeType, data: f.base64Data } }));
    const textContext = taskFiles.filter(f => !f.base64Data).map(f => f.transcription).join("\n\n");
    const promptText = `Lag en detaljert rettemanual basert på oppgavene og eksempler på elevsvar. Bruk LaTeX ($...$) for all matematikk.\n\nKONTEKST:\n${textContext}\n${taskDescription}\n\nEKSEMPLER PÅ ELEVSVAR:\n${samples.join("\n")}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: { parts: [...parts, { text: promptText }] },
      config: {
        thinkingConfig: { thinkingBudget: 16384 },
        systemInstruction: "Du er en sensor. Lag en rettemanual i JSON-format. Bruk LaTeX for matematikk.",
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
                  commonMistakes: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { mistake: { type: Type.STRING }, deduction: { type: Type.NUMBER }, explanation: { type: Type.STRING } } } }
                },
                required: ["name", "description", "suggestedSolution", "maxPoints", "tema"]
              }
            }
          }
        }
      }
    });
    const parsed = JSON.parse(response.text || "{}");
    return {
      title: parsed.title || "Rettemanual",
      totalMaxPoints: parsed.totalMaxPoints || 0,
      criteria: parsed.criteria || []
    };
  });
};

export const evaluateCandidate = async (candidate: Candidate, rubric: Rubric, taskContext: string): Promise<Candidate['evaluation']> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  return limiter.schedule('pro', async () => {
    const fullText = candidate.pages.map(p => `SIDE ${p.pageNumber}: ${p.transcription}`).join("\n\n");
    const prompt = `Vurder besvarelsen til kandidat ${candidate.id} opp mot rettemanualen.\n\nBESVARELSE:\n${fullText}\n\nRETTEMANUAL (JSON):\n${JSON.stringify(rubric)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 16384 },
        systemInstruction: `Vurder besvarelsen rettferdig. Bruk LaTeX ($...$) for matematikk. Svar kun JSON.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            grade: { type: Type.STRING },
            feedback: { type: Type.STRING },
            score: { type: Type.NUMBER },
            vekstpunkter: { type: Type.ARRAY, items: { type: Type.STRING } },
            taskBreakdown: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { taskName: { type: Type.STRING }, score: { type: Type.NUMBER }, max: { type: Type.NUMBER }, tema: { type: Type.STRING }, comment: { type: Type.STRING } } } }
          }
        }
      }
    });
    const parsed = JSON.parse(response.text || "{}");
    return {
      grade: parsed.grade || "U",
      feedback: parsed.feedback || "Ingen tilbakemelding.",
      score: parsed.score || 0,
      vekstpunkter: parsed.vekstpunkter || [],
      taskBreakdown: parsed.taskBreakdown || []
    };
  });
};
