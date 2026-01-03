
import { GoogleGenAI, Type } from "@google/genai";
import { Page, Candidate, Rubric, Project, RubricCriterion } from "../types";
import { getFromGlobalCache, saveToGlobalCache } from "./storageService";

export const OCR_MODEL = 'gemini-3-flash-preview';
export const PRO_MODEL = 'gemini-3-pro-preview';

const LATEX_MANDATE = `
Viktig regel for visning:
ALL matematikk, variabler, formler og utregninger SKAL pakkes inn i LaTeX-delimitere: \\( ... \\).
Bruk \\( \\begin{aligned} ... \\end{aligned} \\) for ALL matematikk over ett ledd.
BRUK '& =' for å aligne likhetstegn vertikalt under hverandre.
EKSEMPEL:
\\( \\begin{aligned} 2x + 5 &= 15 \\\\ 2x &= 10 \\\\ x &= 5 \\end{aligned} \\)`;

const RUBRIC_LOGIC_GUARD = `
PEDAGOGISK EKSPERT v6.6.0:
1. STRUKTUR: Oppgaver skal KUN deles opp i nivå 1 (Tall) og nivå 2 (Bokstav). F.eks "1a", "1b".
   - FORBUD: Du har strengt forbud mot å lage egne kriterier for nivå 3 (romertall som i, ii, iii).
   - SAMMENSLÅING: Hvis en oppgave har underpunkter (f.eks. 1a har i. og ii.), skal disse bakes inn i løsningsforslaget til hoved-deloppgaven (1a).
2. INGEN OPPSUMMERING AV HOVEDOPPGAVER: Det er strengt forbudt å slå sammen "Oppgave 1 a-c". Det skal være tre objekter: 1a, 1b, 1c.
3. DELOPPDELING: "Del 1" vs "Del 2" er obligatorisk.
4. POENG (STRENG REGEL): Du skal ALLTID sette 'maxPoints' til 2.0 for hver deloppgave.
   - IKKE øk poengsummen selv om oppgaven har underpunkter (i, ii).
   - Unntak: Hvis oppgaveteksten eksplisitt skriver "4 poeng" i parentes, kan du bruke det. Ellers 2.0.
5. TEMA-STRUKTUR (VIKTIG FOR ANALYSE):
   - Du skal kategorisere oppgaver i BREDE matematiske hovedområder for å lage en lesbar ferdighetsanalyse.
   - IKKE bruk smale etiketter som "Potenser", "Logaritmer", "Asymptoter", "Derivasjon".
   - SLÅ SAMMEN til overordnede kategorier: "Algebra", "Funksjoner", "Geometri", "Sannsynlighet", "Modellering", "Statistikk".
   - Maks 6-8 unike temaer totalt for hele prøven.
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
  throw e;
};

// V6.5.7: Retry wrapper for ustabile API-kall (503, 504)
const withRetry = async <T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> => {
  try {
    return await fn();
  } catch (e: any) {
    const msg = e?.message || String(e);
    // Retry kun på server-feil eller timeouts
    if ((retries > 0) && (msg.includes("503") || msg.includes("504") || msg.includes("timeout") || msg.includes("overloaded"))) {
      console.warn(`API Error (${msg}). Retrying in ${delay}ms... (${retries} left)`);
      await new Promise(res => setTimeout(res, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw e;
  }
};

/**
 * NY FUNKSJON v6.3.0: Geometric Pre-Flight
 * Kjører en lynrask analyse KUN for å bestemme rotasjon og layout (A3/A4).
 * Dette gjør at vi kan klippe og rotere bildet FØR vi ber om transkripsjon.
 */
export const detectPageLayout = async (page: Page): Promise<{ rotation: number, isSpread: boolean }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    return await withRetry(async () => {
      const response = await ai.models.generateContent({
        model: OCR_MODEL,
        contents: { parts: [{ inlineData: { mimeType: page.mimeType, data: page.base64Data || "" } }] },
        config: {
          systemInstruction: `GEOMETRISK PRE-FLIGHT SCANNER v6.3.0:
Du skal KUN analysere bildets fysiske orientering og layout. Ikke les teksten.

OPPGAVE 1: ROTASJON
Er teksten rotert? Angi antall grader som skal til for å få teksten stående rett (0, 90, 180, 270).
Se på bokstaver som 'e', 'a', 'n' for å avgjøre hva som er opp/ned.

OPPGAVE 2: A3 SPREAD DETEKSJON
Er dette et bilde av to A4-sider ved siden av hverandre (A3 landscape)?
Hvis bildet er bredere enn det er høyt, eller du ser en tydelig midt-brettekant/linje med tekst på begge sider, er det en SPREAD.`,
          temperature: 0.0, // Ice cold for precision
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              rotation: { type: Type.INTEGER, enum: [0, 90, 180, 270], description: "Grader bildet må roteres med klokken" },
              isSpread: { type: Type.BOOLEAN, description: "True hvis bildet inneholder to sider (A3)" }
            },
            required: ["rotation", "isSpread"]
          }
        }
      });
      return JSON.parse(cleanJson(response.text));
    });
  } catch (e) {
    console.warn("Layout detection failed, defaulting to 0/False", e);
    return { rotation: 0, isSpread: false };
  }
};

export const transcribeAndAnalyzeImage = async (page: Page, rubric?: Rubric | null): Promise<any[]> => {
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
          temperature: 0.0, // ZERO TEMPERATURE: Critical for preventing hallucinations/bleeding
          systemInstruction: `STUM OCR v6.6.3 (INTERLEAVED EVIDENCE):
Du mottar et bilde av EN ENKELT SIDE fra en elevbesvarelse.

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
Se etter "Kandidat-ID" (tall eller navn).

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
    });
    
    // Legg til pageNumber offset og rotation metadata for lagring, selv om bildet er pre-rotert
    const enrichedResults = results.map((r: any) => ({
        ...r,
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
          systemInstruction: `KIRURGISK REGENERERING v6.1.8: Generer KUN SuggestedSolution og CommonErrors for denne oppgaven.`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: { suggestedSolution: { type: Type.STRING }, commonErrors: { type: Type.STRING } },
            required: ["suggestedSolution", "commonErrors"]
          }
        }
      });
      return JSON.parse(cleanJson(response.text));
    });
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
    });
  } catch (e) { return handleApiError(e); }
};

// NY FUNKSJON v6.6.7: Lærende Rettemanual
export const improveRubricWithStudentData = async (rubric: Rubric, candidates: Candidate[], modelOverride: string = PRO_MODEL): Promise<Rubric> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // 1. Samle inn alle elevsvar per oppgave
  const taskEvidence: Record<string, string[]> = {};
  
  candidates.forEach(cand => {
    if (cand.status !== 'completed' && cand.status !== 'evaluated') return;
    cand.pages.forEach(p => {
      if (!p.transcription) return;
      p.identifiedTasks?.forEach(t => {
        const key = `${t.taskNumber}${t.subTask || ''}`;
        if (!taskEvidence[key]) taskEvidence[key] = [];
        // Legg til en liten snippet av teksten rundt oppgaven (forenklet: sender hele siden for kontekst, men merket)
        taskEvidence[key].push(`Kandidat ${cand.name}: ${p.transcription.substring(0, 500)}...`); 
      });
    });
  });

  // 2. Bygg en prompt med nåværende rubric + elevbevis
  let promptData = "NÅVÆRENDE RETTEMANUAL:\n";
  promptData += JSON.stringify(rubric.criteria.map(c => ({ id: `${c.taskNumber}${c.subTask}`, errors: c.commonErrors })), null, 2);
  
  promptData += "\n\nELEV-DATA (UTDRAG AV SVARENE):\n";
  // Begrens mengden data for å ikke sprenge context window (selv om Pro har 2M, er det greit å være ryddig)
  Object.keys(taskEvidence).slice(0, 20).forEach(key => { // Tar de første 20 oppgavene som eksempel
     promptData += `\nOPPGAVE ${key}:\n` + taskEvidence[key].slice(0, 3).join("\n"); // Tar 3 tilfeldige elever per oppgave
  });

  try {
    return await withRetry(async () => {
      const response = await ai.models.generateContent({
        model: modelOverride,
        contents: { parts: [{ text: `OPPGAVE: Analyser elevsvarene ovenfor. Identifiser faktiske, gjentakende feil.
        Oppdater 'commonErrors' for hver oppgave i rettemanualen slik at den reflekterer hva elevene faktisk sliter med.
        
        VIKTIG:
        1. Du skal IKKE endre poeng, oppgavenummer eller løsning. KUN 'commonErrors'.
        2. Behold eksisterende gode poenger i 'commonErrors', men legg til nye oppdagelser.
        3. Returner HELE rettemanualen oppdatert.` }] },
        config: {
          systemInstruction: "Du er en pedagogisk ekspert som analyserer prøveresultater for å lage en mer rettferdig rettemanual.",
          thinkingConfig: { thinkingBudget: 16000 }, // God tid til å tenke
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
      
      const newRubric = JSON.parse(cleanJson(response.text)) as Rubric;
      newRubric.totalMaxPoints = newRubric.criteria.reduce((acc, c) => acc + (c.maxPoints || 0), 0);
      return newRubric;
    });
  } catch (e) {
    console.error("Feil ved forbedring av rubric:", e);
    throw e;
  }
};

export const evaluateCandidate = async (candidate: Candidate, rubric: Rubric, modelOverride: string = PRO_MODEL): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const content = candidate.pages.map(p => `SIDE ${p.pageNumber} (${p.part}):\n${p.transcription}`).join("\n\n");
  
  // v6.6.7: INKLUDER COMMON ERRORS I SENSOR-INSTRUKSEN
  const rubricSpec = rubric.criteria.map(c => 
    `- OPPGAVE ${c.taskNumber}${c.subTask || ''} (${c.part}): 
       MAKS ${c.maxPoints} POENG. 
       Fasit: ${c.suggestedSolution}
       Vanlige feil/Trekk: ${c.commonErrors || "Ingen spesifikke trekk definert."}`
  ).join("\n");

  try {
    return await withRetry(async () => {
      const response = await ai.models.generateContent({
        model: modelOverride,
        contents: { parts: [{ text: `RETTEMANUAL SPESIFIKASJON:\n${rubricSpec}\n\nELEVENS BESVARELSE:\n${content}` }] },
        config: { 
          systemInstruction: `PEDAGOGISK SENSOR v6.6.7 (STRICT SCORING & ERROR CHECK):
${LATEX_MANDATE}

DU SKAL VURDERE HVER ENESTE OPPGAVE LISTET I RETTEMANUALEN.

POENG-DISIPLIN (KRITISK):
1. Du SKAL respektere "MAKS POENG" definert for hver oppgave ovenfor.
2. Det er MATEMATISK ULOVLIG å gi en score som er høyere enn definert maks.
3. SJEKK "Vanlige feil/Trekk" nøye for hver oppgave. Hvis eleven har gjort en av disse feilene, SKAL det trekkes poeng som beskrevet (eller skjønnsmessig).

HVIS OPPGAVE MANGLER:
   - Score = 0
   - Kommentar = "Ikke besvart"

TILTALEFORM:
Du skal skrive vurderingen DIREKTE til eleven i 'feedback'-feltet.`,
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
    });
  } catch (e) { return handleApiError(e); }
};

export const reconcileProjectData = async (project: Project): Promise<Candidate[]> => {
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
    });
  } catch (e) { return handleApiError(e); }
};

export const analyzeTextContent = async (text: string, rubric?: Rubric | null): Promise<any> => {
  if (!text || text.trim().length === 0) {
    throw new Error("Kan ikke analysere tomt dokument.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const validTasks = rubric ? rubric.criteria.map(c => `${c.taskNumber}${c.subTask || ''}`).join(", ") : "";

  try {
    return await withRetry(async () => {
      const response = await ai.models.generateContent({
        model: OCR_MODEL,
        contents: { parts: [{ text: `DOKUMENT:\n${text}` }] },
        config: { 
          temperature: 0.0, // ZERO TEMPERATURE
          systemInstruction: `DIGITAL ANALYSE v6.6.3 (INTERLEAVED EVIDENCE): ${LATEX_MANDATE}

1. ID-DETEKSJON: 
   - Se etter Kandidat-ID (Navn eller Nummer) i toppteksten/starten av dokumentet.

2. FORMATTERING & LESBARHET:
   - Du SKAL sette inn doble linjeskift (\\n\\n) mellom avsnitt.

3. TEKNISK INNHOLD (MULTIPLE BOXES):
   - Siden dette er en digital fil, inneholder den ofte teknisk bevisførsel (CAS, Python, GeoGebra, Grafer) FLETTET inn i teksten.
   - IKKE flytt dette ut til en separat boks på slutten.
   - I STEDET: Pakk innholdet inn i taggen \`[AI-TOLKNING AV FIGUR: ...]\` der det forekommer i teksten.
   - Du kan bruke denne taggen FLERE GANGER hvis dokumentet har flere figurer/kodeblokker.
   - Formatet inni taggen skal være verbatim avskrift (f.eks. Python-kode med innrykk, eller CAS-linjer).

4. WHITELIST: 
   - Bruk KUN oppgavenavn fra denne listen: [${validTasks}]
   - Ikke oppfinn oppgaver som ikke står i listen.`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              candidateId: { type: Type.STRING },
              part: { type: Type.STRING, enum: ["Del 1", "Del 2"] },
              fullText: { type: Type.STRING },
              visualEvidence: { type: Type.STRING, description: "Bruk kun som backup. Foretrekk interleaving i fullText." },
              identifiedTasks: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { taskNumber: { type: Type.STRING }, subTask: { type: Type.STRING } } } }
            }
          }
        }
      });
      return JSON.parse(cleanJson(response.text));
    });
  } catch (e) { return handleApiError(e); }
};
