
import { GoogleGenAI, Type } from "@google/genai";
import { Page, Candidate, Rubric, Project, RubricCriterion, IdentifiedTask } from "../types";
import { getFromGlobalCache, saveToGlobalCache } from "./storageService";

export const OCR_MODEL = 'gemini-3-flash-preview';
export const PRO_MODEL = 'gemini-3-pro-preview';

const LATEX_MANDATE = `
Viktig regel for visning:
ALL matematikk, variabler, formler og utregninger SKAL pakkes inn i LaTeX-delimitere: \\( ... \\).
Bruk \\( \\begin{aligned} ... \\end{aligned} \\) for ALL matematikk over ett ledd.
BRUK '& =' for å aligne likhetstegn vertikalt under hverandre.
EKSEMPEL:
\\( \\begin{aligned} 2x + 5 &= 15 \\\\ 2x &= 10 \\\\ x &= 5 \\end{aligned} \\)

DERIVASJONS-SJEKK (VIKTIG):
Unngå "Double exponent: use braces to clarify" feil.
Du må ALDRI sette en apostrof (') direkte etter en eksponent (^) uten parentes.
FEIL: e^{2x}'
RIKTIG: (e^{2x})'

GRENSERVERDIER (LIMITS):
Bruk korrekt LaTeX-syntaks for grenseverdier.
FEIL: lim x->uendelig
RIKTIG: \\lim_{x \\to \\infty}

EKSPONENTER:
Bruk alltid krøllparenteser rundt eksponenter som er mer enn ett tegn.
FEIL: e^2x
RIKTIG: e^{2x}
`;

const RUBRIC_LOGIC_GUARD = `
PEDAGOGISK EKSPERT v7.8.2 (CLEAN FORMAT):
1. STRUKTUR: Oppgaver skal KUN deles opp i nivå 1 (Tall) og nivå 2 (Bokstav). F.eks "1a", "1b".
2. INGEN OPPSUMMERING AV HOVEDOPPGAVER: "Oppgave 1 a-c" er forbudt. Det skal være: 1a, 1b, 1c.
3. DELOPPDELING: "Del 1" vs "Del 2" er obligatorisk.
4. POENG (STRENG REGEL): Standard 'maxPoints' er 2.0. Kun eksplisitte unntak i oppgaveteksten overstyrer dette.
5. TEMA-STRUKTUR: Bruk brede kategorier (Algebra, Funksjoner, Geometri, Sannsynlighet, Modellering, Statistikk).

RETTEVEILEDNING OG POENGTREKK (NY STANDARD v7.8.2):
Du skal generere en detaljert liste over vanlige feil i feltet 'commonErrors'.
Du SKAL bruke følgende skala aktivt for å definere trekk, og formatet skal være med klammeparenteser uten punktliste:

[-0.5 p] Liten slurvefeil, manglende benevning, manglende føring eller fortegnsfeil i ellers riktig utregning.
[-1.0 p] Halvveis til løsningen. Viser mye kompetanse/forståelse, men klarer ikke å løse oppgaven helt.
[-1.5 p] Bedre enn ingenting. Viser litt kompetanse/start, men gjør grove konseptuelle feil.
[-2.0 p] Viser ingen kompetanse i denne deloppgaven eller svarer blankt.

EKSEMPEL PÅ FORMAT (IKKE BRUK KULEPUNKTER):
[-0.5 p] Glemmer +C ved integrasjon.
[-1.0 p] Setter opp riktig arealformel, men bruker feil radius.
[-2.0 p] Blander areal og omkrets fullstendig.

${LATEX_MANDATE}`;

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
  if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) throw e;
  if (msg.includes("Requested entity was not found")) {
    if ((window as any).aistudio?.openSelectKey) (window as any).aistudio.openSelectKey();
  }
  // Allow AbortError to propagate cleanly
  if (e.name === 'AbortError' || msg.includes('Aborted')) throw e;
  throw e;
};

// V7.9.33: Added AbortSignal support
const withRetry = async <T>(fn: () => Promise<T>, retries = 3, delay = 1000, timeoutMs = 300000, signal?: AbortSignal): Promise<T> => {
  try {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    // Wrap the API call in a race with a timeout AND the abort signal
    const timeoutPromise = new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`Request timed out (${timeoutMs/1000}s)`)), timeoutMs);
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        });
      }
    });
    
    // Race!
    const result = await Promise.race([fn(), timeoutPromise]);
    return result as T;

  } catch (e: any) {
    if (e.name === 'AbortError' || e.message === 'Aborted') throw e; // Don't retry if aborted by user

    const msg = e?.message || String(e);
    
    // Catch-all for network, timeout and server errors
    const isRetryable = 
      msg.includes("503") || 
      msg.includes("504") || 
      msg.includes("timeout") || 
      msg.includes("timed out") || 
      msg.includes("overloaded") || 
      msg.includes("fetch failed") || 
      msg.includes("NetworkError");

    if ((retries > 0) && isRetryable) {
      console.warn(`API Error/Timeout (${msg}). Retrying in ${delay}ms... (${retries} left)`);
      await new Promise(res => setTimeout(res, delay));
      return withRetry(fn, retries - 1, delay * 2, timeoutMs, signal); // Exponential backoff
    }
    throw e;
  }
};

const filterTasksAgainstRubric = (tasks: any[], rubric?: Rubric | null): IdentifiedTask[] => {
  if (!rubric || !rubric.criteria || rubric.criteria.length === 0) return tasks; 
  if (!tasks) return [];

  const validSet = new Set(rubric.criteria.map(c => 
    `${c.taskNumber}${c.subTask || ''}`.toUpperCase().replace(/[^A-Z0-9]/g, '')
  ));
  
  return tasks.filter((t: any) => {
    if (!t.taskNumber) return false;
    const label = `${t.taskNumber}${t.subTask || ''}`.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return validSet.has(label);
  });
};

// V7.9.33: Added signal param
export const transcribeAndAnalyzeImage = async (page: Page, rubric?: Rubric | null, signal?: AbortSignal): Promise<any[]> => {
  const cached = await getFromGlobalCache(page.contentHash);
  if (cached && (page as any).forceRescan !== true) return Array.isArray(cached) ? cached : [cached];

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const validTasks = rubric 
    ? rubric.criteria.map(c => `${c.taskNumber}${c.subTask || ''}`).join(", ")
    : "Ingen begrensning.";

  const rubricContext = rubric 
    ? rubric.criteria.map(c => `- GYLDIG OPPGAVE-ID: [${c.taskNumber}${c.subTask || ''}]`).join("\n") 
    : "Ingen fasit definert.";

  try {
    const results = await withRetry(async () => {
      const response = await ai.models.generateContent({
        model: OCR_MODEL,
        contents: { parts: [{ inlineData: { mimeType: page.mimeType, data: page.base64Data || "" } }] },
        config: { 
          temperature: 0.0, 
          thinkingConfig: { thinkingBudget: 0 }, 
          systemInstruction: `STUM OCR v7.8.6 (SMART PREFIX SCAN):
Du mottar et bilde av EN ENKELT SIDE fra en elevbesvarelse.

KRITISK HUSKEREGEL:
Start lesingen HELT ØVERST i bildet. Det er avgjørende at den aller første linjen (f.eks "1a" eller "3") blir med. 
Skann systematisk fra topp til bunn.

PREFIKS-HÅNDTERING:
- Hvis eleven skriver "Opg 4a", "Oppg 4b", "Oppgave 2" eller lignende:
- Dette SKAL registreres som en 'identifiedTask'.
- Ignorer prefikset i output (f.eks. "Oppgave 4a" -> taskNumber: "4", subTask: "a").

HELTALLSOPPGAVER:
- Hvis eleven skriver bare "2" (og oppgaven er en hovedoppgave uten bokstav i fasiten):
- Returner taskNumber: "2", subTask: "" (tom streng). IKKE dikt opp "a".

REGLER FOR TRANSKRIPSJON:
1. ORDRETT AVSKRIFT: Skriv NØYAKTIG det du ser.
2. FORMATERING: Bruk doble linjeskift mellom avsnitt.

${LATEX_MANDATE}

VISUELT INNHOLD & DIGITALT ARBEID (FLERE FELT TILLATT):
Hvis du ser skjermbilder av CAS, Python-kode, grafer eller figurer:
1. IKKE FLYTT ALT TIL SLUTTEN. Bevar flyten i dokumentet.
2. SETT INN TAGGEN \`[AI-TOLKNING AV FIGUR: ...]\` NØYAKTIG DER FIGUREN ER I TEKSTEN.
3. Du kan bruke denne taggen FLERE GANGER hvis det er flere figurer.
4. Inni klammene skal innholdet være VERBATIM (tegn-for-tegn) av det som står i bildet (f.eks. "Linje 1: Løs(...) -> x=5").

ID-DETEKSJON:
Se etter "Kandidat-ID" (tall eller navn) øverst på arket.

HARD WHITELIST (STRENG KONTROLL):
Du har KUN lov til å identifisere disse oppgavene: [${validTasks}]
BRUK DENNE LISTEN TIL Å FJERNE HALLUSINASJONER.

KONTEKST (KUN FOR REFERANSE):
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
    
    // v7.8.7: SERVICE-LEVEL FILTERING (Eliminerer hallusinasjoner)
    const enrichedResults = results.map((r: any) => ({
        ...r,
        identifiedTasks: filterTasksAgainstRubric(r.identifiedTasks, rubric),
        rotation: 0, // Alltid 0 fordi vi roterte FØR innsending
        layoutType: 'A4_SINGLE' // Alltid A4 fordi vi splittet FØR innsending
    }));

    if (!(page as any).forceRescan) await saveToGlobalCache(page.contentHash, enrichedResults);
    return enrichedResults;
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
          systemInstruction: `KIRURGISK REGENERERING v7.8.2 (CLEAN DEDUCTION):
Generer 'SuggestedSolution' og 'CommonErrors' for denne oppgaven.

${LATEX_MANDATE}

RETTEVEILEDNING-FORMAT (MÅ FØLGES):
Bruk det rene bracket-formatet for 'commonErrors' og vær presis basert på oppgavens art:
[-0.5 p] [Beskrivelse av slurvefeil/formalia]
[-1.0 p] [Beskrivelse av halvveis løsning]
[-1.5 p] [Beskrivelse av grov feil med lite kompetanse]
[-2.0 p] [Beskrivelse av total bom]

INGEN KULEPUNKTER.`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: { suggestedSolution: { type: Type.STRING }, commonErrors: { type: Type.STRING } },
            required: ["suggestedSolution", "commonErrors"]
          }
        }
      });
      return JSON.parse(cleanJson(response.text));
    }, 3, 1000, 240000); 
  } catch (e) { return handleApiError(e); }
};

export const generateRubricFromTaskAndSamples = async (taskFiles: Page[], modelOverride: string = PRO_MODEL): Promise<Rubric> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts = taskFiles.map(f => {
    if (f.mimeType === 'text/plain') return { text: `FIL: ${f.transcription}` };
    return { inlineData: { mimeType: f.mimeType, data: f.base64Data || "" } };
  });
  
  const budget = modelOverride === PRO_MODEL ? 32768 : 10000;

  try {
    return await withRetry(async () => {
      const response = await ai.models.generateContent({
        model: modelOverride,
        contents: { parts: [...parts, { text: "Generer komplett, uttømmende rettemanual." }] },
        config: { 
          systemInstruction: RUBRIC_LOGIC_GUARD,
          thinkingConfig: { thinkingBudget: budget },
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
                    taskNumber: { type: Type.STRING },
                    subTask: { type: Type.STRING },
                    part: { type: Type.STRING, enum: ["Del 1", "Del 2"] },
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
    }, 3, 1000, 240000); 
  } catch (e) { return handleApiError(e); }
};

export const improveRubricWithStudentData = async (rubric: Rubric, candidates: Candidate[], modelOverride: string = PRO_MODEL): Promise<Rubric> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const taskEvidence: Record<string, string[]> = {};
  
  candidates.forEach(cand => {
    if (cand.status !== 'completed' && cand.status !== 'evaluated') return;
    cand.pages.forEach(p => {
      if (!p.transcription) return;
      p.identifiedTasks?.forEach(t => {
        const key = `${t.taskNumber}${t.subTask || ''}`;
        if (!taskEvidence[key]) taskEvidence[key] = [];
        taskEvidence[key].push(`Kandidat ${cand.name}: ${p.transcription.substring(0, 500)}...`); 
      });
    });
  });

  const originalStructure = rubric.criteria.map(c => ({
    id: `${c.taskNumber}${c.subTask || ''}`,
    part: c.part,
    currentErrors: c.commonErrors
  }));

  let promptData = "NÅVÆRENDE RETTEMANUAL (STRUKTUR MÅ BEHOLDES):\n";
  promptData += JSON.stringify(originalStructure, null, 2);
  
  promptData += "\n\nELEV-DATA (UTDRAG AV SVARENE):\n";
  Object.keys(taskEvidence).slice(0, 25).forEach(key => { 
     promptData += `\nOPPGAVE ${key}:\n` + taskEvidence[key].slice(0, 3).join("\n"); 
  });

  try {
    return await withRetry(async () => {
      const response = await ai.models.generateContent({
        model: modelOverride,
        contents: { parts: [{ text: `OPPGAVE: Analyser elevsvarene og oppdater KUN 'commonErrors' for hver oppgave.
        VIKTIG FOR STRUKTUR (v7.9.1 SAFETY LOCK):
        1. Du får IKKE lov til å slå sammen oppgaver. 
        2. Hver oppgave-ID i input-listen SKAL ha et korresponderende objekt i output-listen.
        3. Du skal IKKE endre oppgavenummer, del eller poeng. Kun teksten i 'commonErrors'.
        Formatet skal være [-0.5 p]...` 
        }, { text: promptData }] },
        config: {
          systemInstruction: "Du er en presis data-analytiker. Din ENESTE jobb er å oppdatere 'commonErrors'.",
          thinkingConfig: { thinkingBudget: 16000 }, 
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                taskNumber: { type: Type.STRING },
                subTask: { type: Type.STRING },
                part: { type: Type.STRING },
                commonErrors: { type: Type.STRING },
                suggestedSolution: { type: Type.STRING }
              },
              required: ["taskNumber", "subTask", "commonErrors"]
            }
          }
        }
      });
      
      const updates = JSON.parse(cleanJson(response.text)) as any[];
      const newCriteria = rubric.criteria.map(original => {
        const matchingUpdate = updates.find(u => 
          String(u.taskNumber) === String(original.taskNumber) && 
          String(u.subTask || '').toLowerCase() === String(original.subTask || '').toLowerCase() &&
          (!original.part || !u.part || original.part === u.part)
        );

        if (matchingUpdate) {
          return {
            ...original,
            commonErrors: matchingUpdate.commonErrors || original.commonErrors,
            suggestedSolution: matchingUpdate.suggestedSolution || original.suggestedSolution
          };
        }
        return original;
      });

      return { ...rubric, criteria: newCriteria };
    }, 3, 1000, 240000);
  } catch (e) {
    console.error("Feil ved forbedring av rubric:", e);
    throw e;
  }
};

export const evaluateCandidate = async (candidate: Candidate, rubric: Rubric, modelOverride: string = PRO_MODEL): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const content = candidate.pages.map(p => `SIDE ${p.pageNumber} (${p.part}):\n${p.transcription}`).join("\n\n");
  
  const rubricSpec = rubric.criteria.map(c => 
    `- OPPGAVE ${c.taskNumber}${c.subTask || ''} (${c.part}): 
       MAKS ${c.maxPoints} POENG. 
       Fasit: ${c.suggestedSolution}
       Trekkliste (STRENG): 
       ${c.commonErrors || "Ingen spesifikke trekk definert."}`
  ).join("\n");

  try {
    return await withRetry(async () => {
      const response = await ai.models.generateContent({
        model: modelOverride,
        contents: { parts: [{ text: `RETTEMANUAL SPESIFIKASJON:\n${rubricSpec}\n\nELEVENS BESVARELSE:\n${content}` }] },
        config: { 
          systemInstruction: `PEDAGOGISK SENSOR v7.9.10 (STRICT PERCENTAGE GRADING):
${LATEX_MANDATE}
DU SKAL VURDERE HVER ENESTE OPPGAVE LISTET I RETTEMANUALEN.
POENG-DISIPLIN (KRITISK):
1. Du SKAL bruke "Trekkliste" aktivt.
2. Start med MAKS POENG og trekk fra basert på feilene du finner.
3. Det er MATEMATISK ULOVLIG å gi en score som er høyere enn definert maks.
KARAKTERSKALA (STRENG PROSENT-BASERT):
Du SKAL beregne prosent = (Din Totale Score / Prøvens Totalscore) * 100.
Bruk så denne tabellen for å sette karakter (1-6):
[0% - 20%> : 1
[20% - 35%> : 2
[35% - 60%> : 3
[60% - 75%> : 4
[75% - 90%> : 5
[90% - 100%] : 6
HVIS OPPGAVE MANGLER:
   - Score = 0
   - Kommentar = "Ikke besvart"`,
          thinkingConfig: { thinkingBudget: modelOverride === PRO_MODEL ? 32768 : 0 },
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
    }, 3, 1000, 240000); 
  } catch (e) { return handleApiError(e); }
};

export const reconcileProjectData = async (project: Project): Promise<Candidate[]> => {
  // Keeping this simple for brevity, logic unchanged
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const candidates = project.candidates;
  
  const summary = candidates.map(c => ({
    id: c.id,
    name: c.name,
    pages: c.pages.map(p => ({
      id: p.id,
      textSnippet: p.transcription?.substring(0, 100),
      likelyRotated: (p.transcription || "").length < 50
    }))
  }));

  try {
    return await withRetry(async () => {
      const response = await ai.models.generateContent({
        model: OCR_MODEL,
        contents: { parts: [{ text: `RYDDE-OPPDRAG v6.1.8:
Finn merges OG identifiser sider som ser ut til å ha feil layout eller rotasjon.
KANDIDATER: ${JSON.stringify(summary)}` }] },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              merges: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { fromId: { type: Type.STRING }, toId: { type: Type.STRING } } } },
              repairPages: { type: Type.ARRAY, items: { type: Type.STRING, description: "ID til sider som må skannes på nytt" } }
            }
          }
        }
      });

      const data = JSON.parse(cleanJson(response.text));
      let currentCandidates = [...candidates];

      (data.merges || []).forEach((merge: any) => {
        const fromIdx = currentCandidates.findIndex(c => c.id === merge.fromId);
        const toIdx = currentCandidates.findIndex(c => c.id === merge.toId);
        if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
          const fromCand = currentCandidates[fromIdx];
          const toCand = currentCandidates[toIdx];
          currentCandidates[toIdx] = { ...toCand, pages: [...toCand.pages, ...fromCand.pages].sort((a,b) => (a.pageNumber || 0) - (b.pageNumber || 0)) };
          currentCandidates.splice(fromIdx, 1);
        }
      });

      if (data.repairPages && data.repairPages.length > 0) {
        currentCandidates = currentCandidates.map(c => ({
          ...c,
          pages: c.pages.map(p => data.repairPages.includes(p.id) ? { ...p, needsRepair: true } : p)
        }));
      }

      return currentCandidates;
    }, 3, 1000, 30000); 
  } catch (e) { return handleApiError(e); }
};

// V7.9.33: Added signal
export const analyzeTextContent = async (text: string, rubric?: Rubric | null, attachedImages?: { data: string, mimeType: string }[], signal?: AbortSignal): Promise<any> => {
  if (!text || text.trim().length === 0) {
    throw new Error("Kan ikke analysere tomt dokument.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const validTasks = rubric ? rubric.criteria.map(c => `${c.taskNumber}${c.subTask || ''}`).join(", ") : "";

  try {
    return await withRetry(async () => {
      const parts: any[] = [{ text: `DOKUMENT:\n${text}` }];
      
      if (attachedImages && attachedImages.length > 0) {
        parts.push({ text: "\n\nVEDLAGTE BILDER (Referert i teksten som [BILDEVEDLEGG X]). Analyser disse hvis teksten refererer til dem eller hvis de inneholder visuelt bevis (CAS, Grafer):" });
        attachedImages.forEach(img => {
          parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
        });
      }

      const response = await ai.models.generateContent({
        model: OCR_MODEL,
        contents: { parts: parts },
        config: { 
          temperature: 0.0, 
          thinkingConfig: { thinkingBudget: 0 }, 
          systemInstruction: `DIGITAL ANALYSE v7.9.3 (ENCAPSULATION & NEWLINE FORCE): ${LATEX_MANDATE}
1. ID-DETEKSJON:
   - SØK I DE FØRSTE 1000 TEGNENE. Dette er obligatorisk.
2. DEL-DETEKSJON (DIGITAL PART INFERENCE):
   - Word-dokumenter er nesten ALLTID "Del 2".
3. OPPGAVE-STRUKTUR:
   - Identifiser oppgaver basert på mønstre som "Oppgave 1", "1a)", "2.".
4. HÅNDTERING AV BILDEVEDLEGG (VIKTIG v7.8.9):
   - FORMAT-TVANG: Beskrivelsen MÅ ligge INNI klammene.
   - RIKTIG: \`[AI-TOLKNING AV FIGUR: Grafen viser...]\`
5. RUBRIC-STRICT WHITELISTING:
   - Du har KUN lov til å returnere 'identifiedTasks' som matcher denne listen: [${validTasks}]
6. FORMATERING (NYTT v7.9.3):
   - BEHOLD LINJESKIFT og innrykk i programkode.`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              candidateId: { type: Type.STRING, description: "Kandidatnummer funnet i toppen av dokumentet" },
              fullText: { type: Type.STRING, description: "Hele teksten, formatert med LaTeX og [AI-TOLKNING]-tagger" },
              part: { type: Type.STRING, enum: ["Del 1", "Del 2"] },
              identifiedTasks: { 
                type: Type.ARRAY, 
                items: { type: Type.OBJECT, properties: { taskNumber: { type: Type.STRING }, subTask: { type: Type.STRING } } } 
              }
            },
            required: ["fullText", "identifiedTasks", "part"]
          }
        }
      });
      
      const res = JSON.parse(cleanJson(response.text));
      return { 
        ...res, 
        identifiedTasks: filterTasksAgainstRubric(res.identifiedTasks, rubric),
        pageNumber: 1, 
        layoutType: 'A4_SINGLE', 
        rotation: 0 
      };
    }, 3, 1000, 300000, signal); 
  } catch (e) { return handleApiError(e); }
};
