
## 66. Sequential Orphan Rescue (v8.9.5)
*   **Problem:** Ved skanning av dobbeltsidige ark (Duplex) oppstår filnavn i par (Scan1+Scan2, Scan3+Scan4).
*   **Løsning (Duplex Pairing):**
    *   Systemet sorterer alle filene i prosjektet.
    *   Redning (sammenslåing av Ukjent til Kjent) tillates **KUN** innenfor et par (Oddetall -> Partall i 0-indeksert liste).
    *   **Eksempel:** Fil nr 2 i listen (indeks 1) kan redde seg inn til fil nr 1.
    *   **Brannmur:** Fil nr 3 i listen (indeks 2, start på nytt ark) får **IKKE** koble seg til fil nr 2, selv om de er sekvensielle. Dette hindrer at Elev B limes bakpå Elev A.
*   **Start-sperre:** "Side 1"-deteksjon gjelder fortsatt som en ekstra sikring.

## 67. Word Split Guard (v9.0.0)
*   **Problem:** Digitale dokumenter (.docx) ble av og til forsøkt splittet som A3-oppslag i prosesseringskøen på grunn av manglende type-sjekk.
*   **Regel:** Filer med endelsen `.docx` eller `.doc` skal ALDRI underlegges geometrisk splitting eller rotasjon, uavhengig av hva `mimeType` sier.
*   **Implementasjon:** En eksplisitt `if (isWordFile) continue;` guard må ligge før geometrisjekken i `useProjectProcessor`.

## 68. Parallel Evidence Pipeline (Split & Hersk) (v9.0.0)
*   **Problem:** Ved å sende Word-tekst og 20+ bilder i én stor prompt til Gemini Flash, ble modellen overveldet ("Context Overload") og ignorerte bildene.
*   **Arkitektur:**
    1.  **Main Analysis (Text Only):** Hoved-prompten får KUN teksten (med plassholdere `[BILDEVEDLEGG X]`). Den får IKKE bildedataene.
    2.  **Worker Isolation:** Hvert bilde sendes til en *egen, dedikert* API-forespørsel (Worker).
    3.  **Instruction:** Workeren har kun én jobb: "Transkriber dette bildet slavisk". Ingen annen kontekst.
*   **Krav:** Alle `analyzeTextContent` operasjoner SKAL bruke `Promise.all` for å kjøre tekst og bilder parallelt.

## 69. Evidence Stitching (v9.0.0)
*   **Problem:** Resultatene fra de parallelle arbeiderne (Rule 68) må flettes inn i hovedteksten på riktig sted.
*   **Regel:**
    *   Hovedanalysen returnerer tekst med `[BILDEVEDLEGG X]`.
    *   Systemet MÅ iterere over worker-resultatene og utføre `string.replace('[BILDEVEDLEGG X]', workerResult)`.
    *   Hvis plassholderen mangler i teksten (AI-feil), skal worker-resultatet appendes til `visualEvidence` som en fallback ("Sikkerhetsnett").

## 70. Rubric Firewall (Blind Transcription) (v9.1.0)
*   **Problem:** Hvis OCR-modellen (Flash) får se rettemanualens innhold (fasit/beskrivelse), har den en tendens til å "hjelpe til" ved å hallusinere svar der eleven har svart blankt eller ufullstendig.
*   **Løsning:** Under transkribering (`transcribeAndAnalyzeImage` / `analyzeTextContent`) skal KI-en **ALDRI** motta beskrivelser, løsningsforslag eller temaer fra rettemanualen.
*   **Whitelist Only:** KI-en skal KUN motta en liste med gyldige Oppgave-IDer (f.eks. `["1a", "1b", "2"]`) for å strukturere JSON-outputen korrekt.
*   **Prinsipp:** Transkribering er en ren "avlesning". Vurdering (sammenligning mot fasit) er en separat prosess som skjer senere med en annen modell.
