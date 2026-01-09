
// ... existing imports
import { GoogleGenAI, Type } from "@google/genai";
import { Page, Candidate, Rubric, Project, RubricCriterion, IdentifiedTask } from "../types";
import { getFromGlobalCache, saveToGlobalCache } from "./storageService";

export const OCR_MODEL = 'gemini-3-flash-preview';
// v8.5.0: "Flash Standard" - Pro model identifier now points to Flash to enforce low-cost mode globally.
export const PRO_MODEL = 'gemini-3-flash-preview'; 
// v8.9.16: Flash Theme Restoration - Using Flash with strict prompts instead of expensive Pro
const THEME_MODEL = 'gemini-3-flash-preview';

// Rate Limiter for å beskytte mot 429 (Kvote nådd)
class RateLimiter {
  private lastRequestTime: number = 0;
  private queue: Promise<any> = Promise.resolve();
  // Forsiktig delay for å unngå burst-limit
  private static DELAY = 1000; // v9.0.6: Reduced delay slightly for better responsiveness

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    // v9.1.15: CRITICAL QUEUE FIX
    // Vi må fange opp eventuelle feil i forrige ledd av kjeden før vi legger til neste.
    // Hvis vi bruker .then() direkte på en 'rejected' promise, vil callbacken aldri kjøre, og køen dør.
    // Ved å legge inn .catch(() => {}) sikrer vi at kjeden alltid fortsetter.
    const chain = this.queue.catch(() => {});

    const operation = chain.then(async () => {
      const now = Date.now();
      const timeSinceLast = now - this.lastRequestTime;
      
      if (timeSinceLast < RateLimiter.DELAY) {
        await new Promise(resolve => setTimeout(resolve, RateLimiter.DELAY - timeSinceLast));
      }

      let attempt = 0;
      const maxRetries = 2;
      let currentBackoff = 5000; 

      while (attempt <= maxRetries) {
        try {
          const result = await fn();
          this.lastRequestTime = Date.now();
          return result;
        } catch (error: any) {
          attempt++;
          const errorMsg = error?.message || JSON.stringify(error);
          console.error("Gemini API Error:", error); // v9.1.11: Added explicit logging
          
          // v9.1.14: Fail Fast on Client Errors (4xx)
          // Do not retry if the request is invalid (400), unauthorized (401/403), or model not found (404).
          // Retrying these will just result in the same error and waste time ("hanging").
          if (errorMsg.includes("400") || errorMsg.includes("401") || errorMsg.includes("403") || errorMsg.includes("404") || errorMsg.includes("Bad Request") || errorMsg.includes("Not Found")) {
             throw error;
          }
          
          // v9.1.15: Fail fast on SyntaxError (JSON parse error)
          // Retrying a parse error usually won't help unless the model output changes significantly, 
          // but often it's better to just fail the file than block the queue.
          if (errorMsg.includes("SyntaxError") || errorMsg.includes("JSON")) {
             throw error;
          }

          const isQuota = errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED");

          if (isQuota) {
            if (attempt <= maxRetries) {
              console.warn(`[Kvote] 429 mottatt. Venter ${currentBackoff/1000}s...`);
              await new Promise(resolve => setTimeout(resolve, currentBackoff));
              currentBackoff *= 2;
            } else {
              // Just re-throw, don't use special string KVOTE_NAADD
              throw error;
            }
          } else {
            // For other errors (5xx, network), let the loop continue (retry)
            if (attempt > maxRetries) throw error;
            await new Promise(resolve => setTimeout(resolve, 2000)); // Small wait for generic errors
          }
        }
      }
      throw new Error("Maks forsøk nådd.");
    });

    // Update the queue pointer to wait for THIS operation to finish (whether success or fail)
    this.queue = operation;
    return operation as Promise<T>;
  }
}

// v9.0.6: Dual Limiters to prevent background OCR from blocking user actions (Rubric/Eval)
const backgroundLimiter = new RateLimiter(); // For OCR, Images, Batch Jobs
const interactiveLimiter = new RateLimiter(); // For Rubric Gen, Single Eval, "Click" actions

// v8.2.11: Updated LaTeX Mandate with stricter Line Break rules
const LATEX_MANDATE = `
VIKTIG FOR MATHJAX:
1. DELIMITERE: Alt matematisk SKAL pakkes inn i \\( ... \\).
2. EKSPONENTER: Bruk ALLTID krøllparenteser for eksponenter. Skriv e^{2x}, ALDRI e^2x.
3. ALIGNMENT: Bruk \\begin{aligned} ... \\end{aligned} og '& =' for å aligne likhetstegn.
4. LINE BREAKS: Bruk dobbel backslash (\\\\) for ny linje i aligned. ALDRI bruk enkelt backslash (\\) som linjeskift.
5. TEKST I MATEMATIKK: Bruk \\text{...} for ord inne i formler.
6. FORBUD: IKKE bruk '\\b' som kulepunkt eller separator. Det ødelegger LaTeX-koden.

VIKTIG OM KODE (Python/CAS):
- ALDRI bruk \\begin{verbatim} eller \\begin{lstlisting}.
- For å vise kode, bruk Markdown kodeblokker:
  \`\`\`python
  def f(x):
      return x**2
  \`\`\`
`;

// v8.8.0: General Visual Reconstruction Mandate
// v8.9.46: Updated to mandate LaTeX for math inside visual descriptions and use double newlines.
// v9.0.10: Relaxed newline requirement for normal text to avoid spacing issues.
// v9.1.1: Emphasize compactness and math wrapping.
// v9.1.5: STRICT ANTI-DUPLICATION.
const VISUAL_MANDATE = `
VISUELT BEVIS (FIRE MODUSER):

SPRÅK: NORSK BOKMÅL. All beskrivelse og tolkning SKAL være på norsk. Ingen engelsk.
VIKTIG: HOLD DET KOMPAKT. Bruk enkelt linjeskift.

STRICT ANTI-DUPLICATION RULE:
- If you find content (CAS, Graphs, Code) that you place in 'visualEvidence', you MUST use the [BILDEVEDLEGG: ...] tag in the 'fullText'.
- You MUST NOT write the same content in plain text outside the tag.
- EITHER use the tag OR write plain text. NEVER BOTH.

MODUS 1: TEKST-BASERT (CAS / PYTHON / PROGRAMMERING)
- SKAL TRANSKRIBERES SLAVISK (Verbatim).
- BRUK LATEX: Alle matematiske uttrykk (formler, likninger) MÅ pakkes inn i \\( ... \\). 
  EKSEMPEL: \\( f(x) = 2x + 3 \\)
  VIKTIG: Selv om det ser ut som kode, BRUK LATEX for matematikk for bedre visning.
- Format: "Linje 1: \\( \\text{Løs}(x^2=4) \\) -> \\( \\{x=-2, x=2\\} \\)".
- Legg dette i 'visualEvidence' feltet.

MODUS 2: FORTEGNSSKJEMA (SIGN CHART)
- Rekonstruer fortegnsskjema digitalt.
- Format: [SIGN_CHART: Points: x1, x2 | Line: faktor1, -, 0, +, + | Sum: f(x), +, 0, -, +]
- 'Points' er nullpunktene. 'Line' er hver rad. Bruk -, +, 0 eller X (ikke definert).

MODUS 3: GRAFER & VEKTORER (PLOTS)
- Funksjonsgraf: [FUNCTION_PLOT: formula="x^2 - 2*x", xMin=-2, xMax=4]
- Vektorer i rutenett: [VECTOR_PLOT: vec(u, dx, dy), vec(v, dx, dy, startX, startY), label("tekst", x, y)]
  - 'vec': navn, deltaX, deltaY, [startX, startY]. 
  - startX/startY er VALGFRIE (default 0). Bruk dem til å "kjede" vektorer (Head-to-Tail) ved addisjon/subtraksjon.
  - Eksempel vektoraddisjon u+v: [VECTOR_PLOT: vec(u, 2, 1), vec(v, 1, 3, 2, 1), vec(u+v, 3, 4)].
  - 'label': tekst i anførselstegn, x-pos, y-pos. Bruk dette for å plassere oppgavenummer (f.eks "c)") eller uttrykk i diagrammet.

MODUS 4: GENERISK GRAFISK (GEOMETRI / SKISSER)
- For andre figurer, beskriv figuren nøyaktig på NORSK.
- Legg dette i 'visualEvidence' feltet.

VIKTIG: I 'fullText' (brødteksten) skal du lime inn hele innholdet fra 'visualEvidence' inni taggen [BILDEVEDLEGG: <Innhold her>] der bildet hører hjemme logisk.
`;

const RUBRIC_LOGIC_GUARD = `
PEDAGOGISK EKSPERT v8.9.2 (STRUKTUR & FORMAT):

1. LØSNINGSFORSLAG (STRENGT VERTIKALT & VISUELT):
   - Bruk MANGE linjeskift. Hvert matematisk steg SKAL være på en ny linje.
   - Bruk \\begin{aligned} ... \\end{aligned} for vertikal struktur.
   - **VISUELT PÅBUD:** Hvis oppgaven ber eleven om å "Tegne", "Konstruere" eller "Skissere":
     - DU SKAL IKKE BARE BESKRIVE TEGNINGEN MED ORD.
     - DU SKAL GENERERE KODEN FOR TEGNINGEN.
     - For vektorer: Bruk [VECTOR_PLOT]. Regn ut resultantvektoren og plott den. 
       Eksempel: Hvis oppgaven er "Tegn u+v" og u=[1,2], v=[2,1], SKAL du skrive: [VECTOR_PLOT: vec(u, 1, 2), vec(v, 2, 1, 1, 2), vec(u+v, 3, 3)]. Start gjerne pilene i nye punkter når du tegner, slik at det blir oversiktlig.
     - For grafer: Bruk [FUNCTION_PLOT].
     - For fortegnsskjema: Bruk [SIGN_CHART].

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

// ... helper functions (unchanged) ...
const formatCommonErrors = (text: string | undefined): string => {
  if (!text) return "";
  let clean = text.replace(/\[\s*(-?[\d.,]+)\s*p\s*\]/gi, "[$1 p]"); 
  clean = clean.replace(/([^\n])\s*(\[-[\d.,]+\s*p\])/g, "$1\n$2");
  return clean;
};

// ... calculateGrade, cleanJson, sanitizeTaskId, cleanTaskPair ...
export const calculateGrade = (score: number, maxPoints: number): string => {
    if (maxPoints <= 0) return "-";
    const percent = Math.round((score / maxPoints) * 100);
    
    let grade = 1;
    let rangeMin = 0;
    let rangeMax = 19;

    if (percent >= 90) { grade = 6; rangeMin = 90; rangeMax = 100; }
    else if (percent >= 75) { grade = 5; rangeMin = 75; rangeMax = 89; }
    else if (percent >= 60) { grade = 4; rangeMin = 60; rangeMax = 74; }
    else if (percent >= 40) { grade = 3; rangeMin = 40; rangeMax = 59; }
    else if (percent >= 20) { grade = 2; rangeMin = 20; rangeMax = 39; }
    else { grade = 1; rangeMin = 0; rangeMax = 19; }

    let suffix = "";
    if (percent <= rangeMin + 1) suffix = "-";
    if (percent >= rangeMax - 1) suffix = "+";

    if (grade === 6 && suffix === "+") suffix = ""; 
    if (grade === 1 && suffix === "-") suffix = ""; 

    return `${grade}${suffix}`;
};

const cleanJson = (text: string | undefined): string => {
  if (!text) return "[]";
  let cleaned = text.trim();
  // Better markdown stripping
  if (cleaned.includes("```")) {
    cleaned = cleaned.replace(/^[\s\S]*?```(?:json)?\n?/, "").replace(/```[\s\S]*$/, "").trim();
  }
  
  // Isolate the JSON object/array
  const start = Math.min(cleaned.indexOf('{') === -1 ? 9999 : cleaned.indexOf('{'), cleaned.indexOf('[') === -1 ? 9999 : cleaned.indexOf('['));
  const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
  if (start !== 9999 && end !== -1) {
      cleaned = cleaned.substring(start, end + 1);
  }

  // v9.1.20: STRICT ESCAPING (No Whitelist for Control Chars)
  // We explicitly REMOVED 'n', 'r', 't', 'b', 'f' from the "safe list" in the regex.
  // This means \n becomes \\n, \t becomes \\t, \b becomes \\b.
  // JSON.parse will read these as literal strings "\n", "\t", "\b", instead of control chars.
  // This protects LaTeX commands like \text (would be Tab+ext), \right (Return+ight) and \begin (Backspace+egin).
  // Only double backslash (\\), forward slash (/), quotes (") and unicode (\uXXXX) are preserved as JSON syntax.
  
  cleaned = cleaned.replace(/\\(?!(?:["\\/]|u[0-9a-fA-F]{4}))/g, '\\\\');

  // Also pre-escape specific dangerous LaTeX tokens that might have slipped through if the model 
  // returned them in a weird way, just to be safe.
  cleaned = cleaned.replace(/\\end(?![a-zA-Z])/g, '\\\\end'); 

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
  if (msg.includes("Requested entity was not found")) {
    if ((window as any).aistudio?.openSelectKey) (window as any).aistudio.openSelectKey();
  }
  if (e.name === 'AbortError' || msg.includes('Aborted')) throw e;
  throw e;
};

// v9.0.6: Pass limiter explicitly to allow priority queues
const withRetry = async <T>(fn: () => Promise<T>, retries = 3, delay = 1000, timeoutMs = 300000, signal?: AbortSignal, limiter: RateLimiter = backgroundLimiter): Promise<T> => {
  try {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const timeoutPromise = new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`Request timed out (${timeoutMs/1000}s)`)), timeoutMs);
      if (signal) signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); });
    });
    // Use the passed limiter (interactive or background)
    const result = await Promise.race([limiter.schedule(() => fn()), timeoutPromise]);
    return result as T;
  } catch (e: any) {
    if (e.name === 'AbortError' || e.message === 'Aborted') throw e;
    
    const msg = e?.message || String(e);
    // v9.1.14: Do NOT retry 400/404 errors as they are likely permanent (bad config/input)
    if (msg.includes("400") || msg.includes("401") || msg.includes("403") || msg.includes("404") || msg.includes("Bad Request") || msg.includes("Not Found")) {
        throw e;
    }

    const isRetryable = msg.includes("503") || msg.includes("504") || msg.includes("timeout") || msg.includes("overloaded") || msg.includes("fetch failed");
    if ((retries > 0) && isRetryable) {
      await new Promise(res => setTimeout(res, delay));
      return withRetry(fn, retries - 1, delay * 2, timeoutMs, signal, limiter);
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
  // v9.0.11: RUBRIC FIREWALL (Blind Transcription)
  // Only expose TASK IDs, NOT content. This prevents hallucination from the answer key.
  const validTaskIDs = rubric ? rubric.criteria.map(c => `${c.taskNumber}${c.subTask || ''}`).join(", ") : "Ingen begrensning.";
  const rubricContext = `GYLDIGE OPPGAVE-IDER (WHITELIST): [${validTaskIDs}]. 
  KUN disse ID-ene skal brukes. Du kjenner IKKE oppgaveteksten. Du skal KUN lese elevens tekst.`;

  const activeModel = modelOverride || OCR_MODEL;
  const initialBudget = modelOverride ? 4096 : 0;

  const performOCR = async (budget: number) => {
      // v9.0.6: Use backgroundLimiter for OCR tasks
      return await withRetry(async () => {
        const response = await ai.models.generateContent({
          model: activeModel,
          contents: { parts: [{ inlineData: { mimeType: page.mimeType, data: page.base64Data || "" } }] },
          config: { 
            temperature: 0.0, 
            thinkingConfig: { thinkingBudget: budget }, 
            systemInstruction: `TEGN-FOR-TEGN AVSKRIFT v8.2.0: Transkriber teksten nøyaktig slik den står. Ingen repetisjon. SPRÅK: NORSK (Bokmål). ${LATEX_MANDATE} ${VISUAL_MANDATE} 
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
      }, 2, 1000, 300000, signal, backgroundLimiter);
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

// v8.9.50: Helper for parallel image transcription
const transcribeImageWorker = async (image: { data: string, mimeType: string }, index: number): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    // v9.0.6: Use backgroundLimiter for workers
    // v9.0.8: Removed redundant backgroundLimiter.schedule wrapping from call-site to prevent deadlock.
    return await withRetry(async () => {
        const response = await ai.models.generateContent({
            model: OCR_MODEL,
            contents: {
                parts: [
                    { inlineData: { mimeType: image.mimeType, data: image.data } },
                    { text: `WORKER TASK (Image ${index}): Transcribe the content of this image verbatim.
                    CONTEXT: Part of a student exam answer.
                    CONTENT TYPE: Likely CAS (Computer Algebra System) screenshot, code, or graph.
                    OUTPUT FORMAT:
                    - If text/code: Write it line-by-line using standard characters.
                    - If graph: Describe key features briefly (e.g. "Graf av f(x) som stiger...").
                    - Use LaTeX for math equations AND WRAP IT in \\( ... \\). Example: \\( x^2 \\) not just x^2.
                    - Return ONLY the content string. No conversational filler.
                    - CRITICAL: DO NOT SOLVE MATH PROBLEMS. COPY TEXT EXACTLY. If the image is empty or unclear, return "[Ingen tekst funnet]".` }
                ]
            },
            config: {
                temperature: 0.0,
                thinkingConfig: { thinkingBudget: 0 } // Speed is key for workers
            }
        });
        return response.text || `[Kunne ikke tolke bilde ${index}]`;
    }, 2, 1000, 180000, undefined, backgroundLimiter); // v9.0.5: Increased to 180s (3min)
};

export const analyzeTextContent = async (
    text: string, 
    rubric?: Rubric | null, 
    attachedImages?: { data: string, mimeType: string }[],
    signal?: AbortSignal
): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  // v9.0.11: RUBRIC FIREWALL (Blind Transcription)
  // Only expose TASK IDs, NOT content. This prevents hallucination from the answer key.
  const validTaskIDs = rubric ? rubric.criteria.map(c => `${c.taskNumber}${c.subTask || ''}`).join(", ") : "Ingen begrensning.";
  const rubricContext = `GYLDIGE OPPGAVE-IDER (WHITELIST): [${validTaskIDs}]. 
  KUN disse ID-ene skal brukes. Du kjenner IKKE oppgaveteksten. Du skal KUN lese elevens tekst.`;

  // 1. Parallel Evidence Pipeline (v9.0.5 Sequential Batch Processing for robustness)
  const imageTranscriptions: string[] = [];
  
  if (attachedImages && attachedImages.length > 0) {
      // v9.1.9: Filter out unsupported image types BEFORE sending to Gemini to prevent API errors.
      const supportedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
      const validImages = attachedImages.filter(img => supportedMimes.includes(img.mimeType.toLowerCase()));
      
      if (validImages.length < attachedImages.length) {
          console.warn(`Filtered out ${attachedImages.length - validImages.length} unsupported images.`);
      }

      // v9.0.5: Reduced batch size to 1 to prevent bandwidth choking on heavy images
      const BATCH_SIZE = 1; 
      for (let i = 0; i < validImages.length; i += BATCH_SIZE) {
          const batch = validImages.slice(i, i + BATCH_SIZE);
          const batchPromises = batch.map((img, batchIdx) => 
              // v9.0.8: Removed redundant backgroundLimiter.schedule wrapper that caused DEADLOCK
              transcribeImageWorker(img, i + batchIdx + 1)
                  .catch(e => `[Feil ved lesing av bilde ${i + batchIdx + 1}: ${e.message}]`)
          );
          const batchResults = await Promise.all(batchPromises);
          imageTranscriptions.push(...batchResults);
      }
  }

  const parts: any[] = [{ text: `ANALYSER FØLGENDE TEKST (Digital innlevering):\n${text}` }];

  // v9.0.8: Removed redundant backgroundLimiter.schedule wrapper to fix DEADLOCK
  // withRetry ALREADY schedules on the limiter internally.
  const mainAnalysisTask = withRetry(async () => {
    const response = await ai.models.generateContent({
      model: OCR_MODEL, 
      contents: { parts: parts },
      config: { 
        temperature: 0.0, 
        systemInstruction: `ANALYSE AV DIGITAL TEKST:
        Du mottar råtekst fra en elevbesvarelse (Word/PDF).
        
        ANTI-HALLUCINATION PROTOCOL (SUPREME):
        - You are a TRANSCRIBER, NOT A SOLVER. 
        - DO NOT calculate answers. 
        - DO NOT expand on the student's text. 
        - ONLY write what is explicitly present in the input text.
        - If the student has not written a solution, DO NOT INVENT ONE based on the Rubric Context.
        
        PLACEHOLDER PROTOCOL (CRITICAL):
        You will encounter placeholders like [BILDEVEDLEGG 1] in the text.
        These represent images that are being processed by a separate system.
        DO NOT remove or replace these placeholders.
        DO NOT try to guess what is in the images.
        KEEP [BILDEVEDLEGG X] exactly where it appears in the text structure.
        
        CAS/MATH EXTRACTION (XML):
        If the text contains [DETECTED_RAW_MATH_FROM_XML], this is CRITICAL EVIDENCE. Reconstruct it in 'visualEvidence'.
        Use LaTeX wrapping \\( ... \\) for math.
        
        VISUAL EVIDENCE RULE:
        - WARNING: Do not generate 'visualEvidence' unless there is actual CAS code or image placeholders present. 
        - Text describing a math problem is NOT visual evidence.
        
        ${rubricContext}

        VIKTIG:
        1. Identifiser hvilke oppgaver som besvares.
        2. Behold all tekst verbatim i 'fullText'.
        
        Returner JSON med 'candidateId' (hvis funnet), 'fullText', 'identifiedTasks' og evt 'visualEvidence'.`,
        responseMimeType: "application/json",
        responseSchema: {
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
          required: ["fullText", "identifiedTasks"]
        }
      }
    });
    return JSON.parse(cleanJson(response.text));
  }, 2, 1000, 300000, signal, backgroundLimiter); // v9.0.6: 300s timeout

  // 2. Main Analysis
  const mainResult = await mainAnalysisTask;

  // 3. Stitching (v8.9.50)
  let improvedText = mainResult.fullText || "";
  let accumulatedVisualEvidence = mainResult.visualEvidence || "";

  imageTranscriptions.forEach((transcription: string, index: number) => {
      const placeholder = `[BILDEVEDLEGG ${index + 1}]`;
      const visualBlock = `\n[AI-TOLKNING AV FIGUR: ${transcription.trim()}]\n`;
      
      if (improvedText.includes(placeholder)) {
          improvedText = improvedText.replace(placeholder, visualBlock);
      } else {
          accumulatedVisualEvidence += `\n\n[Bilde ${index+1}]:\n${transcription}`;
      }
  });

  mainResult.fullText = improvedText;
  mainResult.visualEvidence = accumulatedVisualEvidence.trim();
  
  mainResult.identifiedTasks = filterTasksAgainstRubric(mainResult.identifiedTasks, rubric);
  
  return mainResult;
};

// ... scanForTaskStructure ...
const scanForTaskStructure = async (parts: any[], model: string): Promise<any[]> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    // v9.0.6: Use interactiveLimiter for rubric generation (FAST LANE)
    // v9.0.6: Increased timeout to 600s
    return await withRetry(async () => {
        const response = await ai.models.generateContent({
            model: model,
            contents: { parts: [...parts, { text: "LIST ALL TASKS. Strict structure scan only. Differentiate Del 1 and Del 2." }] },
            config: {
                thinkingConfig: { thinkingBudget: 0 }, // v9.0.6: Speed up scanning phase (no deep thinking needed for structure)
                systemInstruction: "You are a scanner. List every math task found in the documents. Only return the structure (number, subtask, part). NO content, NO solutions yet. EXTREME CONSTRAINT: Do not create sub-subtasks (like i, ii). Only TaskNumber and SubTaskLetter.",
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            taskNumber: { type: Type.STRING },
                            subTask: { type: Type.STRING },
                            part: { type: Type.STRING, enum: ["Del 1", "Del 2"] },
                        },
                        required: ["taskNumber", "part"]
                    }
                }
            }
        });
        return JSON.parse(cleanJson(response.text));
    }, 2, 1000, 600000, undefined, interactiveLimiter); 
};

// ... generateCriterionForTask ...
const generateCriterionForTask = async (task: any, parts: any[], model: string): Promise<RubricCriterion> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const taskLabel = `${task.taskNumber}${task.subTask || ''} (${task.part})`;
    
    // v9.0.6: Use interactiveLimiter for rubric generation (FAST LANE)
    // v9.0.6: Increased timeout to 600s
    return await withRetry(async () => {
        const response = await ai.models.generateContent({
            model: model,
            contents: { parts: [...parts, { text: `GENERATE CRITERION FOR: ${taskLabel}` }] },
            config: {
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
                - **VISUALS:** If the task asks to DRAW a graph or vector, you MUST include [FUNCTION_PLOT] or [VECTOR_PLOT].
                - For Vectors: [VECTOR_PLOT: vec(u, 2, 3), vec(v, -1, 4, 2, 3), vec(result, 1, 7)].

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
        if (res.commonErrors) res.commonErrors = formatCommonErrors(res.commonErrors);
        
        return {
            ...task,
            ...res,
            maxPoints: Math.min(4.0, res.maxPoints || 2.0),
            tema: "" 
        };
    }, 2, 1000, 600000, undefined, interactiveLimiter); 
};

// ... assignThemesToRubric ...
const assignThemesToRubric = async (criteria: RubricCriterion[], model: string): Promise<{ criteria: RubricCriterion[], title: string }> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const criteriaSummary = criteria.map(c => 
        `- "${c.description}"`
    ).join("\n");

    // v9.0.6: Use interactiveLimiter
    return await withRetry(async () => {
        const response = await ai.models.generateContent({
            model: model,
            contents: { parts: [{ text: `EXTRACT MATH TOPICS FROM THESE TEXTS:\n${criteriaSummary}` }] },
            config: {
                thinkingConfig: { thinkingBudget: 4096 },
                systemInstruction: `You are a KEYWORD EXTRACTOR.
TASK: Read the math problems provided.
OUTPUT: 5-8 mathematical keywords (topics) that cover the content.

RULES:
1. MAX 2-3 WORDS per topic.
2. NO sentences.
3. FORBIDDEN: "Bestemmelse av...", "Beregning av...", "Generelt", "Diverse".
4. GOOD EXAMPLES: "Algebra", "Funksjoner", "Sannsynlighet", "Vektorer", "Derivasjon".

OUTPUT JSON:
{
  "examTitle": "Short descriptive title (e.g. 'Matematikk R1 Vår 2024')",
  "criteriaWithThemes": [
    { "taskNumber": "...", "subTask": "...", "part": "...", "tema": "One Keyword" }
  ]
}`,
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
        
        const enrichedCriteria = criteria.map(c => {
            const match = result.criteriaWithThemes?.find((t: any) => 
                String(t.taskNumber) === String(c.taskNumber) && 
                String(t.subTask||"") === String(c.subTask||"") && 
                t.part === c.part
            );
            return { ...c, tema: match ? match.tema : "Generelt" };
        });

        return { criteria: enrichedCriteria, title: result.examTitle || "Matematikk Vurdering" };

    }, 2, 1000, 60000, undefined, interactiveLimiter);
};

// ... exports ...
export const regenerateRubricThemes = async (rubric: Rubric, modelOverride: string = THEME_MODEL): Promise<Rubric> => {
    const res = await assignThemesToRubric(rubric.criteria, modelOverride);
    return {
        ...rubric,
        title: res.title,
        criteria: res.criteria
    };
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
      if (onProgress) onProgress("Fase 1: Kartlegger oppgaver...");
      const rawStructure = await scanForTaskStructure(parts, activeModel);
      
      const cleanStructure = rawStructure.map((t: any) => {
          const pair = cleanTaskPair(t.taskNumber, t.subTask);
          return { ...pair, part: t.part || "Del 1" };
      }).sort((a: any, b: any) => {
          if (a.part !== b.part) return a.part.localeCompare(b.part);
          return a.taskNumber.localeCompare(b.taskNumber, undefined, {numeric: true}) || a.subTask.localeCompare(b.subTask);
      });

      // v8.9.42: EMIT SKELETON IMMEDIATELY
      const skeletonCriteria: RubricCriterion[] = cleanStructure.map((t: any) => ({
          taskNumber: t.taskNumber,
          subTask: t.subTask,
          part: t.part,
          name: `${t.taskNumber}${t.subTask}`,
          description: "Venter på innhold...",
          suggestedSolution: "Venter på generering...",
          maxPoints: 0,
          tema: "Generelt"
      }));
      
      const skeletonRubric: Rubric = {
          title: "Genererer rettemanual...",
          criteria: skeletonCriteria,
          totalMaxPoints: 0
      };
      
      if (onProgress) onProgress("Fase 1 Fullført: Struktur klar. Starter innhold...", skeletonRubric);

      // 2. BUILD LOOP
      const completedCriteria: RubricCriterion[] = [];
      let currentRubric: Rubric = skeletonRubric;

      for (let i = 0; i < cleanStructure.length; i++) {
          const task = cleanStructure[i];
          if (onProgress) onProgress(`Fase 2: Genererer oppgave ${task.taskNumber}${task.subTask} (${i+1}/${cleanStructure.length})...`, currentRubric);
          
          try {
              const criterion = await generateCriterionForTask(task, parts, activeModel);
              completedCriteria.push(criterion);
          } catch (e: any) {
              console.error(`Failed to generate task ${task.taskNumber}`, e);
              // v9.0.3: Explicitly mark as failed in the rubric
              const errorMsg = e.message?.includes("timeout") ? "Tidsavbrudd" : (e.message?.includes("429") ? "Kvote nådd" : "Feilet");
              completedCriteria.push({
                  taskNumber: task.taskNumber,
                  subTask: task.subTask,
                  part: task.part,
                  name: `${task.taskNumber}${task.subTask}`,
                  description: `Generering feilet (${errorMsg}). Klikk på ↻ for å prøve igjen.`,
                  suggestedSolution: "Feilet.",
                  commonErrors: "Ingen data.",
                  maxPoints: 0,
                  tema: "Feil"
              });
          }
          
          // Merge completed with skeleton
          const mergedCriteria = skeletonCriteria.map(sc => {
              const completed = completedCriteria.find(cc => 
                  cc.taskNumber === sc.taskNumber && 
                  cc.subTask === sc.subTask && 
                  cc.part === sc.part
              );
              return completed || sc;
          });

          currentRubric = {
              title: "Genererer...",
              criteria: mergedCriteria,
              totalMaxPoints: mergedCriteria.reduce((acc, c) => acc + (c.maxPoints || 0), 0)
          };
          if (onProgress) onProgress(`Ferdig med ${task.taskNumber}${task.subTask}`, currentRubric);
          
          await new Promise(r => setTimeout(r, 200));
      }

      // 3. THEME & TITLE
      if (onProgress) onProgress("Fase 3: Analyserer temaer og lager tittel...", currentRubric);
      const finalResult = await assignThemesToRubric(completedCriteria, THEME_MODEL);

      return {
          title: finalResult.title,
          criteria: finalResult.criteria,
          totalMaxPoints: finalResult.criteria.reduce((acc, c) => acc + (c.maxPoints || 0), 0)
      };

  } catch (e) { return handleApiError(e); }
};

// ... improveRubricWithStudentData, regenerateSingleCriterion, evaluateCandidate, reconcileProjectData ...
export const improveRubricWithStudentData = async (rubric: Rubric, candidates: Candidate[], modelOverride: string = PRO_MODEL): Promise<Rubric> => {
    return rubric;
};

export const regenerateSingleCriterion = async (
    criterion: RubricCriterion, 
    taskFiles: Page[], 
    model: string = PRO_MODEL
): Promise<RubricCriterion> => {
    const parts = taskFiles.map(f => {
        if (f.mimeType === 'text/plain') return { text: `FIL: ${f.transcription}` };
        return { inlineData: { mimeType: f.mimeType, data: f.base64Data || "" } };
    });

    return await generateCriterionForTask({ 
        taskNumber: criterion.taskNumber, 
        subTask: criterion.subTask, 
        part: criterion.part 
    }, parts, model);
};

export const evaluateCandidate = async (
    candidate: Candidate, 
    rubric: Rubric, 
    modelOverride: string = PRO_MODEL
): Promise<Candidate> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Construct context from pages
    const fullText = candidate.pages.map(p => 
        `SIDE ${p.pageNumber || '?'}:\n${p.transcription || ''}\n[VISUELLE BEVIS]: ${p.visualEvidence || 'Ingen'}`
    ).join("\n\n");

    // v9.0.6: Use interactiveLimiter and 300s timeout
    return await withRetry(async () => {
        const response = await ai.models.generateContent({
             model: modelOverride,
             contents: { parts: [{ text: `EVALUATE CANDIDATE: ${candidate.name}\n\nRUBRIC: ${JSON.stringify(rubric.criteria)}\n\nCANDIDATE TEXT:\n${fullText}` }] },
             config: {
                 thinkingConfig: { thinkingBudget: 4096 },
                 systemInstruction: "You are a strict grading assistant. Grade based on rubric.",
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
                                    score: { type: Type.NUMBER },
                                    max: { type: Type.NUMBER },
                                    comment: { type: Type.STRING }
                                }
                            }
                        }
                    }
                 }
             }
        });
        const evalResult = JSON.parse(cleanJson(response.text));
        return {
            ...candidate,
            status: 'evaluated',
            evaluation: evalResult
        };
    }, 2, 1000, 300000, undefined, interactiveLimiter);
};

export const reconcileProjectData = async (project: Project): Promise<Candidate[]> => {
    return project.candidates; 
};
