
import { GoogleGenAI, Type } from "@google/genai";
import { Page, Candidate, Rubric, Project, RubricCriterion, IdentifiedTask } from "../types";
import { getFromGlobalCache, saveToGlobalCache } from "./storageService";

export const OCR_MODEL = 'gemini-3-flash-preview';
export const PRO_MODEL = 'gemini-3-pro-preview';

// v8.2.11: Updated LaTeX Mandate with stricter Line Break rules
const LATEX_MANDATE = `
VIKTIG FOR MATHJAX:
1. DELIMITERE: Alt matematisk SKAL pakkes inn i \\( ... \\).
2. EKSPONENTER: Bruk ALLTID krøllparenteser for eksponenter. Skriv e^{2x}, ALDRI e^2x.
3. ALIGNMENT: Bruk \\begin{aligned} ... \\end{aligned} og '& =' for å aligne likhetstegn.
4. LINE BREAKS: Bruk dobbel backslash (\\\\) for ny linje i aligned. ALDRI bruk enkelt backslash (\\) som linjeskift.
5. TEKST I MATEMATIKK: Bruk \\text{...} for ord inne i formler.

VIKTIG OM KODE (Python/CAS):
- ALDRI bruk \\begin{verbatim} eller \\begin{lstlisting}.
- For å vise kode, bruk Markdown kodeblokker:
  \`\`\`python
  def f(x):
      return x**2
  \`\`\`
`;

// v8.0.42: Visual Content Separation (Transcription vs Description)
const VISUAL_MANDATE = `
VISUELT BEVIS (TO MODUSER):

SPRÅK: NORSK BOKMÅL. All beskrivelse og tolkning SKAL være på norsk. Ingen engelsk.

MODUS 1: TEKST-BASERT (CAS / PYTHON / PROGRAMMERING / GEO-GEBRA VINDUER)
- SKAL TRANSKRIBERES SLAVISK (Verbatim / Tegn-for-tegn).
- Format: "Linje 1: [Input] -> [Output]".
- Legg dette i 'visualEvidence' feltet.

MODUS 2: GRAFISK (HÅNDTEGNET FIGUR / GRAF / GEOMETRI)
- Beskriv figuren nøyaktig på NORSK.
- Legg dette i 'visualEvidence' feltet.

VIKTIG: I 'fullText' (brødteksten) skal du lime inn hele innholdet fra 'visualEvidence' inni taggen [BILDEVEDLEGG: <Innhold her>] der bildet hører hjemme logisk.
`;

const RUBRIC_LOGIC_GUARD = `
PEDAGOGISK EKSPERT v8.2.11 (STRUKTUR & FORMAT):

1. LØSNINGSFORSLAG (STRENGT VERTIKALT):
   - Bruk MANGE linjeskift. Hvert matematisk steg SKAL være på en ny linje.
   - Bruk \\begin{aligned} ... \\end{aligned} for vertikal struktur.
   - Hvis oppgaven inneholder programmering, bruk Markdown-kodeblokker (\`\`\`), IKKE LaTeX verbatim.

2. RETTEVEILEDNING (POENGTREKK & MATEMATIKK):
   - Hver linje i 'commonErrors' MÅ starte med poengtrekk i klammer: [-0.5 p].
   - Bruk LaTeX for matematiske uttrykk.

3. POENG-STANDARD (ABSOLUTT REGEL):
   - Standard maks poeng per deloppgave er 2.0.
   - Unntak KUN hvis oppgaveteksten eksplisitt sier noe annet.

4. HIERARKI-LÅS (INGEN NIVÅ 3):
   - Kun Oppgave (Tall) og Deloppgave (Bokstav).
   - Slå sammen i/ii/iii underpunkter.

${LATEX_MANDATE}
`;

// v8.3.1: New helper to enforce line breaks in commonErrors
const formatCommonErrors = (text: string | undefined): string => {
  if (!text) return "";
  // Ensure newline before every score bracket [-X.X p], unless it's at the start
  let clean = text.replace(/\[\s*(-?[\d.,]+)\s*p\s*\]/gi, "[$1 p]"); // Normalize spaces
  clean = clean.replace(/([^\n])\s*(\[-[\d.,]+\s*p\])/g, "$1\n$2");
  return clean;
};

const cleanJson = (text: string | undefined): string => {
  if (!text) return "[]";
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/```$/, "").trim();
  }
  const start = Math.min(cleaned.indexOf('{') === -1 ? 9999 : cleaned.indexOf('{'), cleaned.indexOf('[') === -1 ? 9999 : cleaned.indexOf('['));
  const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
  if (start !== 9999 && end !== -1) {
      cleaned = cleaned.substring(start, end + 1);
  }

  // v8.0.38: Repair common LaTeX escaping issues
  cleaned = cleaned.replace(/(^|[^\\])\\(begin|beta|binom|bar|bf)/g, '$1\\\\$2');
  cleaned = cleaned.replace(/(^|[^\\])\\(text|times|theta|tau|tan)/g, '$1\\\\$2');
  cleaned = cleaned.replace(/(^|[^\\])\\(frac|forall)/g, '$1\\\\$2');
  cleaned = cleaned.replace(/(^|[^\\])\\(right|rho)/g, '$1\\\\$2');
  cleaned = cleaned.replace(/(^|[^\\])\\(end)/g, '$1\\\\$2');

  return cleaned;
};

export const sanitizeTaskId = (str: string): string => {
  if (!str) return "";
  return String(str).replace(/[^a-zA-Z0-9]/g, '').trim();
};

export const cleanTaskPair = (num: string, sub: string): { taskNumber: string, subTask: string } => {
    let rawNum = String(num || "").replace(/^(?:oppgave|opg\.?|task|problem|spørsmål|question|deloppgave|part)\s*/i, "");
    let rawSub = String(sub || "");

    const stripPartInfo = (s: string) => s.replace(/(?:del|part)\s*\d+/gi, "").trim();
    rawNum = stripPartInfo(rawNum);
    rawSub = stripPartInfo(rawSub);
    
    let cleanNum = sanitizeTaskId(rawNum);
    let cleanSub = sanitizeTaskId(rawSub);
    
    cleanNum = cleanNum.replace(/^(\d)\1+$/, '$1'); 
    cleanSub = cleanSub.replace(/^([a-zA-Z])\1+$/, '$1');

    if (cleanSub.length > cleanNum.length && cleanSub.startsWith(cleanNum)) {
        const potentialSub = cleanSub.substring(cleanNum.length);
        if (potentialSub.match(/^[a-zA-Z]+$/)) {
            cleanSub = potentialSub;
        }
    }

    if (cleanSub.length > 0 && cleanNum.toLowerCase().endsWith(cleanSub.toLowerCase())) {
         const potentialNum = cleanNum.substring(0, cleanNum.length - cleanSub.length);
         if (potentialNum.length > 0) {
             cleanNum = potentialNum;
         }
    }
    
    if (!cleanSub && /[0-9]+[a-zA-Z]+$/.test(cleanNum)) {
        const match = cleanNum.match(/^([0-9]+)([a-zA-Z]+)$/);
        if (match) {
            cleanNum = match[1];
            cleanSub = match[2];
        }
    }

    return { taskNumber: cleanNum, subTask: cleanSub };
};

const handleApiError = (e: any) => {
  const msg = e?.message || String(e);
  if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) throw e;
  if (msg.includes("Requested entity was not found")) {
    if ((window as any).aistudio?.openSelectKey) (window as any).aistudio.openSelectKey();
  }
  if (e.name === 'AbortError' || msg.includes('Aborted')) throw e;
  throw e;
};

const withRetry = async <T>(fn: () => Promise<T>, retries = 3, delay = 1000, timeoutMs = 300000, signal?: AbortSignal): Promise<T> => {
  try {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const timeoutPromise = new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`Request timed out (${timeoutMs/1000}s)`)), timeoutMs);
      if (signal) signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); });
    });
    const result = await Promise.race([fn(), timeoutPromise]);
    return result as T;
  } catch (e: any) {
    if (e.name === 'AbortError' || e.message === 'Aborted') throw e;
    const msg = e?.message || String(e);
    const isRetryable = msg.includes("503") || msg.includes("504") || msg.includes("timeout") || msg.includes("overloaded") || msg.includes("fetch failed");
    if ((retries > 0) && isRetryable) {
      await new Promise(res => setTimeout(res, delay));
      return withRetry(fn, retries - 1, delay * 2, timeoutMs, signal);
    }
    throw e;
  }
};

const filterTasksAgainstRubric = (tasks: any[], rubric?: Rubric | null): IdentifiedTask[] => {
  const cleanTasks = (tasks || []).map((t: any) => cleanTaskPair(t.taskNumber || '', t.subTask || ''))
    .filter(t => t.taskNumber.length > 0 || t.subTask.length > 0); 
  
  if (!rubric || !rubric.criteria || rubric.criteria.length === 0) return cleanTasks;
  
  const validSet = new Set(rubric.criteria.map(c => `${sanitizeTaskId(c.taskNumber)}${sanitizeTaskId(c.subTask)}`.toUpperCase()));
  
  return cleanTasks.map((t: any) => {
    const num = t.taskNumber;
    const sub = t.subTask;
    const label = `${num}${sub}`.toUpperCase();
    
    if (validSet.has(label)) return t;
    if (sub && validSet.has(num.toUpperCase())) return { taskNumber: num, subTask: '' };

    if (/^(\d)\1+$/.test(num)) {
       const singleDigit = num.charAt(0); 
       const deStutteredLabel = `${singleDigit}${sub}`.toUpperCase(); 
       if (validSet.has(deStutteredLabel)) {
           return { taskNumber: singleDigit, subTask: sub };
       }
    }
    return null;
  }).filter((t: any) => t !== null) as IdentifiedTask[];
};

export const transcribeAndAnalyzeImage = async (
    page: Page, 
    rubric?: Rubric | null, 
    signal?: AbortSignal,
    modelOverride?: string
): Promise<any[]> => {
  const cached = await getFromGlobalCache(page.contentHash);
  if (cached && (page as any).forceRescan !== true) return Array.isArray(cached) ? cached : [cached];
  
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const validTasks = rubric ? rubric.criteria.map(c => `${c.taskNumber}${c.subTask || ''}`).join(", ") : "Ingen begrensning.";
  
  let rubricContext = "";
  if (rubric && rubric.criteria.length > 0) {
      const taskSummary = rubric.criteria.slice(0, 15).map(c => 
          `Oppgave ${c.taskNumber}${c.subTask}: ${c.description ? c.description.substring(0, 50) + "..." : "Ukjent tema"}`
      ).join("; ");
      rubricContext = `KONTEKST FRA RETTEMANUAL (Til orientering, IKKE kopiering): Prøven inneholder følgende oppgaver: [${taskSummary}]. Bruk dette for å forstå hvilken oppgave du ser på, men transkriber KUN det eleven har skrevet.`;
  }

  const activeModel = modelOverride || OCR_MODEL;
  const initialBudget = modelOverride ? 4096 : 0;

  const performOCR = async (budget: number) => {
      return await withRetry(async () => {
        const response = await ai.models.generateContent({
          model: activeModel,
          contents: { parts: [{ inlineData: { mimeType: page.mimeType, data: page.base64Data || "" } }] },
          config: { 
            temperature: 0.0, 
            thinkingConfig: { thinkingBudget: budget }, 
            systemInstruction: `TEGN-FOR-TEGN AVSKRIFT v8.2.0: Transkriber teksten nøyaktig slik den står. Ingen repetisjon. SPRÅK: NORSK (Bokmål). ${LATEX_MANDATE} ${VISUAL_MANDATE} 
            GYLDIGE OPPGAVER: [${validTasks}].
            ${rubricContext}`,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  candidateId: { type: Type.STRING },
                  pageNumber: { type: Type.INTEGER },
                  part: { type: Type.STRING, enum: ["Del 1", "Del 2"] },
                  fullText: { type: Type.STRING },
                  visualEvidence: { type: Type.STRING },
                  identifiedTasks: { 
                    type: Type.ARRAY, 
                    items: { type: Type.OBJECT, properties: { taskNumber: { type: Type.STRING }, subTask: { type: Type.STRING } } } 
                  }
                },
                required: ["fullText", "identifiedTasks", "pageNumber", "part"]
              }
            }
          }
        });
        return JSON.parse(cleanJson(response.text));
      }, 2, 1000, 300000, signal);
  };
  try {
    let results;
    try { 
        results = await performOCR(initialBudget); 
    } catch (e) { 
        if (initialBudget === 0) {
            console.log("Fast OCR failed, retrying with thinking...");
            results = await performOCR(4096); 
        } else {
            throw e;
        }
    }
    const enrichedResults = results.map((r: any) => ({
        ...r,
        identifiedTasks: filterTasksAgainstRubric(r.identifiedTasks, rubric),
        rotation: 0, layoutType: 'A4_SINGLE'
    }));
    if (!(page as any).forceRescan) await saveToGlobalCache(page.contentHash, enrichedResults);
    return enrichedResults;
  } catch (e) { return handleApiError(e); }
};

// Phase 1: Scan for Task Structure
const scanForTaskStructure = async (parts: any[], model: string): Promise<any[]> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    return await withRetry(async () => {
        const response = await ai.models.generateContent({
            model: model,
            contents: { parts: [...parts, { text: "LIST ALL TASKS. Strict structure scan only. Differentiate Del 1 and Del 2." }] },
            config: {
                systemInstruction: "You are a scanner. List every math task found in the documents. Only return the structure (number, subtask, part). NO content, NO solutions yet. EXTREME CONSTRAINT: Do not create sub-subtasks (like i, ii). Only TaskNumber and SubTaskLetter.",
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            taskNumber: { type: Type.STRING },
                            subTask: { type: Type.STRING },
                            part: { type: Type.STRING, enum: ["Del 1", "Del 2"] }
                        },
                        required: ["taskNumber", "part"]
                    }
                }
            }
        });
        return JSON.parse(cleanJson(response.text));
    }, 2, 1000, 60000);
};

// Phase 2: Generate Content for Single Task (v8.2.7: Strict Verbatim Copy & 3-Step Process)
const generateCriterionForTask = async (task: any, parts: any[], model: string): Promise<RubricCriterion> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const taskLabel = `${task.taskNumber}${task.subTask || ''} (${task.part})`;
    
    return await withRetry(async () => {
        const response = await ai.models.generateContent({
            model: model,
            contents: { parts: [...parts, { text: `GENERATE CRITERION FOR: ${taskLabel}` }] },
            config: {
                // Flash needs thinking budget to do math correctly even for single task
                thinkingConfig: { thinkingBudget: 4096 }, 
                systemInstruction: `You are a strict math teacher creating a grading guide for ONE specific task: ${taskLabel}.
                
                ${RUBRIC_LOGIC_GUARD}
                
                EXECUTE THESE 3 PHASES STRICTLY IN ORDER:

                PHASE 1: VERBATIM TASK COPY (For 'description')
                - You must READ the exact text for ${taskLabel} from the image.
                - CRITICAL: Remove the task numbering/lettering from the start of the text.
                - CRITICAL: If the task text contains math (e.g. "Calculate f(x)"), you MUST format it as LaTeX: "Calculate \\(f(x)\\)".

                PHASE 2: PERFECT SOLUTION (For 'suggestedSolution')
                - Create a perfect, vertical step-by-step LaTeX solution.
                - Use \\text{...} for words inside math.
                - If the solution requires Code (Python), use a Markdown Code Block (\`\`\`python ... \`\`\`). DO NOT use \\begin{verbatim}.

                PHASE 3: GRADING GUIDE (For 'commonErrors')
                - Based on your solution, define specific point deductions.
                - Format MUST be: "[-0.5 p] Description of error...".
                
                CONTEXT:
                - If ${task.part} == "Del 1": No digital aids. Require exact algebra/arithmetic.
                - If ${task.part} == "Del 2": Digital aids allowed. Focus on method, interpretation, and validity.
                `,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        description: { type: Type.STRING },
                        suggestedSolution: { type: Type.STRING },
                        commonErrors: { type: Type.STRING },
                        maxPoints: { type: Type.NUMBER }
                    },
                    required: ["description", "suggestedSolution", "commonErrors", "maxPoints"]
                }
            }
        });
        const res = JSON.parse(cleanJson(response.text));
        // v8.3.1: Enforce line breaks in commonErrors
        if (res.commonErrors) res.commonErrors = formatCommonErrors(res.commonErrors);
        
        return {
            ...task,
            ...res,
            maxPoints: Math.min(4.0, res.maxPoints || 2.0), // Allow up to 4.0 if AI insists, but cap it there. Standard is 2.0.
            tema: "" // Will be filled in Phase 3
        };
    }, 2, 1000, 60000);
};

// Phase 3: Assign Themes AND Generate Title
const assignThemesToRubric = async (criteria: RubricCriterion[], model: string): Promise<{ criteria: RubricCriterion[], title: string }> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const criteriaSummary = criteria.map(c => 
        `ID: ${c.taskNumber}${c.subTask} (${c.part}). Desc: ${c.description}`
    ).join("\n");

    return await withRetry(async () => {
        const response = await ai.models.generateContent({
            model: model,
            contents: { parts: [{ text: `ASSIGN THEMES AND GENERATE TITLE:\n${criteriaSummary}` }] },
            config: {
                systemInstruction: `Analyze the exam tasks.
                1. Assign a pedagogical theme to each task.
                   - CRITICAL: You MUST select between 5 and 8 DISTINCT themes (e.g. Algebra, Funksjoner, Sannsynlighet, Geometri, Vektorer, Modellering).
                   - If you find fewer than 5 themes, you MUST split broad themes (e.g. split 'Algebra' into 'Likninger' and 'Faktorisering').
                   - Avoid too narrow themes (e.g. "Question 1a theme"), but ensure you have enough distinct categories for a Radar Chart.
                2. Generate a SHORT, descriptive title for the entire exam based on the themes.
                   - Format: "Prøve: [Tema1] & [Tema2]" or "Heldagsprøve R1".
                   - Max 5 words.`,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        examTitle: { type: Type.STRING },
                        criteriaWithThemes: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    taskNumber: { type: Type.STRING },
                                    subTask: { type: Type.STRING },
                                    part: { type: Type.STRING },
                                    tema: { type: Type.STRING }
                                },
                                required: ["taskNumber", "part", "tema"]
                            }
                        }
                    },
                    required: ["examTitle", "criteriaWithThemes"]
                }
            }
        });
        
        const result = JSON.parse(cleanJson(response.text));
        
        // Merge themes back
        const enrichedCriteria = criteria.map(c => {
            const match = result.criteriaWithThemes?.find((t: any) => 
                String(t.taskNumber) === String(c.taskNumber) && 
                String(t.subTask||"") === String(c.subTask||"") && 
                t.part === c.part
            );
            return { ...c, tema: match ? match.tema : "Generelt" };
        });

        return { criteria: enrichedCriteria, title: result.examTitle || "Matematikk Vurdering" };

    }, 2, 1000, 60000);
};

export const generateRubricFromTaskAndSamples = async (
    taskFiles: Page[], 
    modelOverride: string = PRO_MODEL,
    onProgress?: (msg: string, partialRubric?: Rubric) => void
): Promise<Rubric> => {
  const parts = taskFiles.map(f => {
    if (f.mimeType === 'text/plain') return { text: `FIL: ${f.transcription}` };
    return { inlineData: { mimeType: f.mimeType, data: f.base64Data || "" } };
  });

  const activeModel = modelOverride;

  try {
      // 1. SCAN
      if (onProgress) onProgress("Fase 1: Kartlegger oppgavestruktur...");
      const rawStructure = await scanForTaskStructure(parts, activeModel);
      
      const cleanStructure = rawStructure.map((t: any) => {
          const pair = cleanTaskPair(t.taskNumber, t.subTask);
          return { ...pair, part: t.part || "Del 1" };
      }).sort((a: any, b: any) => {
          if (a.part !== b.part) return a.part.localeCompare(b.part);
          return a.taskNumber.localeCompare(b.taskNumber, undefined, {numeric: true}) || a.subTask.localeCompare(b.subTask);
      });

      // 2. BUILD LOOP
      const completedCriteria: RubricCriterion[] = [];
      let currentRubric: Rubric = { title: "Genererer...", criteria: [], totalMaxPoints: 0 };

      for (let i = 0; i < cleanStructure.length; i++) {
          const task = cleanStructure[i];
          if (onProgress) onProgress(`Fase 2: Genererer oppgave ${task.taskNumber}${task.subTask} (${i+1}/${cleanStructure.length})...`, currentRubric);
          
          try {
              const criterion = await generateCriterionForTask(task, parts, activeModel);
              completedCriteria.push(criterion);
              
              currentRubric = {
                  title: "Genererer...",
                  criteria: [...completedCriteria],
                  totalMaxPoints: completedCriteria.reduce((acc, c) => acc + (c.maxPoints || 0), 0)
              };
              if (onProgress) onProgress(`Ferdig med ${task.taskNumber}${task.subTask}`, currentRubric);

          } catch (e) {
              console.error(`Failed to generate task ${task.taskNumber}`, e);
          }
          await new Promise(r => setTimeout(r, 200));
      }

      // 3. THEME & TITLE
      if (onProgress) onProgress("Fase 3: Analyserer temaer og lager tittel...", currentRubric);
      const finalResult = await assignThemesToRubric(completedCriteria, activeModel);

      return {
          title: finalResult.title,
          criteria: finalResult.criteria,
          totalMaxPoints: finalResult.criteria.reduce((acc, c) => acc + (c.maxPoints || 0), 0)
      };

  } catch (e) { return handleApiError(e); }
};

export const improveRubricWithStudentData = async (rubric: Rubric, candidates: Candidate[], modelOverride: string = PRO_MODEL): Promise<Rubric> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const taskEvidence: Record<string, string[]> = {};
  candidates.forEach(cand => {
    cand.pages.forEach(p => {
      if (!p.transcription) return;
      p.identifiedTasks?.forEach(t => {
        const key = `${sanitizeTaskId(t.taskNumber)}${sanitizeTaskId(t.subTask)}`.toUpperCase();
        if (!taskEvidence[key]) taskEvidence[key] = [];
        taskEvidence[key].push(`Svar: ${p.transcription.substring(0, 300)}`); 
      });
    });
  });
  try {
    return await withRetry(async () => {
      const response = await ai.models.generateContent({
        model: modelOverride,
        contents: { parts: [{ text: `Analyser svar og oppdater 'commonErrors'. ${LATEX_MANDATE}\nDATA: ${JSON.stringify(taskEvidence)}` }] },
        config: {
          systemInstruction: `Analyser elevsvar og oppdater 'commonErrors'.
VIKTIG REGEL 1: Hvert punkt i commonErrors SKAL starte med poengtrekk i klammer: [-0.5 p] eller [-1.0 p]. 
VIKTIG REGEL 2: Bruk LaTeX for matematikk i commonErrors.
VIKTIG REGEL 3: Behold 'suggestedSolution' med vertikale linjeskift.
${LATEX_MANDATE}`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                taskNumber: { type: Type.STRING },
                subTask: { type: Type.STRING },
                commonErrors: { type: Type.STRING }
              }
            }
          }
        }
      });
      const updates = JSON.parse(cleanJson(response.text)) as any[];
      const newCriteria = rubric.criteria.map(original => {
        const matchingUpdate = updates.find(u => {
            const up = cleanTaskPair(u.taskNumber, u.subTask);
            return up.taskNumber === original.taskNumber && up.subTask === original.subTask;
        });
        // v8.3.1: Enforce format
        let updatedErrors = matchingUpdate ? (matchingUpdate.commonErrors || original.commonErrors) : original.commonErrors;
        if (updatedErrors) updatedErrors = formatCommonErrors(updatedErrors);
        
        return { ...original, commonErrors: updatedErrors };
      });
      return { ...rubric, criteria: newCriteria };
    }, 3, 1000, 600000); // 10 min timeout for heavy reasoning
  } catch (e) { throw e; }
};

export const evaluateCandidate = async (candidate: Candidate, rubric: Rubric, modelOverride: string = PRO_MODEL): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const content = candidate.pages.map(p => `SIDE ${p.pageNumber}:\n${p.transcription}`).join("\n");
  const rubricSpec = rubric.criteria.map(c => `- ${c.taskNumber}${c.subTask} (${c.part}): MAKS ${c.maxPoints}\n  Løsning: ${c.suggestedSolution}\n  Vanlige feil: ${c.commonErrors}`).join("\n");
  
  // v8.1.8: Flash Optimization (Reasoning-First Architecture)
  const isFlash = modelOverride === OCR_MODEL;
  
  let reasoningInstruction = "";
  if (isFlash) {
      reasoningInstruction = `
FLASH-PROTOKOLL FOR HØY PRESISJON (v8.1.8):
Du MÅ følge denne prosessen for HVER ENESTE OPPGAVE:
1. IDENTIFISER: Finn elevens svar i teksten.
2. SAMMENLIGN: Sjekk svaret mot 'Løsning' i rettemanualen.
3. FEILSØK: Se etter feil listet i 'Vanlige feil'.
4. BEGRUNN: Skriv en kort forklaring i 'reasoning'-feltet. (F.eks: "Riktig svar, men mangler mellomregning. Trekk -0.5p").
5. POENG: Sett poengsum basert på begrunnelsen. Hvis oppgaven ikke er besvart, sett score: 0 og comment: "Ikke besvart".

VIKTIG: Du MÅ fylle ut 'reasoning' for å sikre korrekt poengsetting. Dette feltet er din "tenkeboks".
      `;
  }

  try {
    return await withRetry(async () => {
      const response = await ai.models.generateContent({
        model: modelOverride,
        contents: { parts: [{ text: `VURDER:\n${rubricSpec}\n\nELEV:\n${content}` }] },
        config: { 
          // v8.1.7: Added STRICT prohibition against merging tasks (1a-d)
          // v8.1.8: Added Reasoning-First Architecture for Flash
          systemInstruction: `Du er sensor. Vurder kun oppgaver i listen. ${LATEX_MANDATE} Bruk commonErrors logikk.
          ${reasoningInstruction}
          
CRITICAL RULE: DO NOT MERGE TASKS. If the rubric defines separate tasks for '1a', '1b', '1c', you MUST return separate scores for each. DO NOT return '1ad' or '1a-c' as a single task.

PEDAGOGISKE PRINSIPPER (Vurderings-grunnlov v8.1.2):
1. FØLGEFEIL SKAL RESPEKTERES:
   - Hvis kandidaten gjør en feil tidlig (f.eks. feil i oppgave a) og bruker dette svaret videre i oppgave b:
   - Du skal IKKE trekke poeng i b hvis utregningen i b er korrekt basert på det feilaktige svaret fra a.
   - Kandidaten skal honoreres for konsistent logikk.

2. AVSKRIFTSFEIL & TRIVIELLE FEIL VS KOMPETANSE:
   - Hvis kandidaten skriver av tall feil fra oppgaveteksten, men løser den "nye" oppgaven korrekt: Gi uttelling for vist kompetanse (minimalt trekk).
   - Åpenbare aritmetiske slurvefeil på lavt nivå (f.eks. 1+1=3) i ellers avanserte oppgaver SKAL IGNORERES i poengtrekket, men kommenteres. Vi måler matematisk forståelse, ikke hoderegning.

3. KOMPETANSEJAKT ("Lete med lupe"):
   - Du skal aktivt lete etter tegn på kompetanse. Selv om svaret er feil, kan metoden være delvis riktig.

4. STANDARDISERT TREKKSKALA:
   - [-0.5 p]: Slurvefeil, manglende benevning, fortegnsfeil i ellers riktig utregning.
   - [-1.0 p]: Konseptuell feil, men viser forståelse. Halvveis løst.
   - [-1.5 p]: Løst feil, men vist relevant kompetanse/metode.
   - [-2.0 p]: Total skivebom eller manglende besvarelse.

5. DEL 1 vs DEL 2 FOKUS:
   - DEL 1 (Uten hjelpemidler): Vurder strengt på algebraisk føring, aritmetikk og nøyaktighet.
   - DEL 2 (Med hjelpemidler): Vurder primært på forståelse, tolkning av resultater, metodevalg, argumentasjon og svarsetninger. Små regnefeil er mindre kritisk her enn manglende forståelse.
          `,
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
                    part: { type: Type.STRING },
                    reasoning: { type: Type.STRING, description: "Internal reasoning step. Explain WHY this score is given before assigning it." }, // v8.1.8
                    score: { type: Type.NUMBER },
                    max: { type: Type.NUMBER },
                    comment: { type: Type.STRING }
                  },
                  // v8.0.49: 'part' is now REQUIRED to prevent matrix misalignment in frontend
                  required: ["taskNumber", "subTask", "part", "score", "max", "comment", "reasoning"] // v8.1.8: reasoning required
                }
              }
            }
          }
        }
      });
      // v8.0.54: Auto-clean tasks before returning to ensure ID matching in results table
      const result = JSON.parse(cleanJson(response.text));
      if (result.taskBreakdown) {
          result.taskBreakdown = result.taskBreakdown.map((t: any) => {
              const cleaned = cleanTaskPair(t.taskNumber, t.subTask);
              return { ...t, taskNumber: cleaned.taskNumber, subTask: cleaned.subTask };
          });
      }
      return result;
    }, 3, 1000, 600000); // 10 min timeout for heavy reasoning
  } catch (e) { return handleApiError(e); }
};

export const reconcileProjectData = async (project: Project): Promise<Candidate[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    return await withRetry(async () => {
      const response = await ai.models.generateContent({
        model: OCR_MODEL,
        contents: { parts: [{ text: "Rydd i kandidater." }] },
        config: { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties: { merges: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { fromId: { type: Type.STRING }, toId: { type: Type.STRING } } } } } } }
      });
      return project.candidates;
    }, 3, 1000, 30000); 
  } catch (e) { return handleApiError(e); }
};

export const analyzeTextContent = async (text: string, rubric?: Rubric | null, attachedImages?: { data: string, mimeType: string }[], signal?: AbortSignal): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    return await withRetry(async () => {
      const response = await ai.models.generateContent({
        model: OCR_MODEL,
        contents: { parts: [{ text: text }] },
        config: { 
          // v8.0.33: Removed Anti-Stutter text constraint.
          // v8.0.41: Added context about Digital Documents being "Del 2".
          systemInstruction: `Digital analyse v8.0.42. Transkriber TEGN-FOR-TEGN. SPRÅK: NORSK (Bokmål). ${LATEX_MANDATE} ${VISUAL_MANDATE}. KONTEKST: Digitale dokumenter (Word/Tekst) er nesten alltid 'Del 2' (med hjelpemidler). Standardiser til 'Del 2' hvis ikke annet er spesifisert.`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              candidateId: { type: Type.STRING },
              fullText: { type: Type.STRING },
              part: { type: Type.STRING },
              visualEvidence: { type: Type.STRING },
              identifiedTasks: { 
                type: Type.ARRAY, 
                items: { type: Type.OBJECT, properties: { taskNumber: { type: Type.STRING }, subTask: { type: Type.STRING } } } 
              }
            }
          }
        }
      });
      const res = JSON.parse(cleanJson(response.text));
      return { ...res, identifiedTasks: filterTasksAgainstRubric(res.identifiedTasks, rubric), pageNumber: 1, layoutType: 'A4_SINGLE', rotation: 0 };
    }, 3, 1000, 300000, signal); 
  } catch (e) { return handleApiError(e); }
};

export const regenerateSingleCriterion = async (criterion: RubricCriterion, modelOverride: string = PRO_MODEL): Promise<Partial<RubricCriterion>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    return await withRetry(async () => {
      const response = await ai.models.generateContent({
        model: modelOverride,
        contents: { parts: [{ text: `Regenerer: ${criterion.taskNumber}${criterion.subTask || ''}` }] },
        config: { 
          systemInstruction: `Generer løsningsforslag og trekkliste (commonErrors). ${LATEX_MANDATE} 
REGEL: commonErrors SKAL starte hver feil med poengtrekk i klammer: [-0.5 p] eller [-1.0 p]. 
REGEL: Bruk LaTeX for matematikk i commonErrors.
REGEL: suggestedSolution SKAL være VERTIKAL. Bruk mange linjeskift. ALDRI skriv lange kjede-likninger på én linje.
HUSK: Maks 2.0 poeng.`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: { 
              suggestedSolution: { type: Type.STRING }, 
              commonErrors: { type: Type.STRING },
              maxPoints: { type: Type.NUMBER }
            }
          }
        }
      });
      const res = JSON.parse(cleanJson(response.text));
      // v8.3.1: Enforce format
      if (res.commonErrors) res.commonErrors = formatCommonErrors(res.commonErrors);
      
      return {
        ...res,
        maxPoints: Math.min(2.0, res.maxPoints || 2.0)
      };
    }, 3, 1000, 600000); // 10 min timeout for heavy reasoning
  } catch (e) { return handleApiError(e); }
};
