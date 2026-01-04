
# Teknisk Standard & Algoritmer (v7.9.31)

Dette dokumentet er systemets "Grunnlov". Ved alle fremtidige oppdateringer SKAL disse reglene følges for å hindre regresjon.

## 1. Bildebehandling: "Mandatory Universal Split"
**CRITICAL: REGRESSION_GUARD** - Vi har fjernet AI-basert sjekk av layout for å garantere null ventetid og robust håndtering av alle skanne-retninger.
1.  **Ingen AI-preflight:** Vi spør ikke Gemini om rotasjon eller layout før behandling.
2.  **Lokal Geometri:** Vi måler dimensjonene på bildet lokalt.
3.  **Tvungen Deling:**
    *   **Landskap (Bredde > Høyde):** Klipp vertikalt (Venstre / Høyre). Antas å være A3-oppslag.
    *   **Portrett (Høyde > Bredde):** Klipp horisontalt (Øvre / Nedre). Antas å være A3-oppslag skannet sidelengs.
4.  **Transkribering:** De to halvdelene sendes deretter til AI for rotasjon og tekstlesing.

## 2. Symmetrisk Instruksjons-paritet
* **Regel:** Både Flash og Pro-modeller SKAL motta identiske krav til pedagogisk innhold og layout.
* **Deloppdeling:** Obligatorisk identifikasjon av Del 1 vs Del 2 uansett modell.
* **LaTeX Mandat:** Begge modeller SKAL bruke `\( ... \)` for all matematikk.

## 3. Matematikk: "Vertical Alignment Supremacy"
* **Krav:** All matematikk over ett ledd SKAL bruke LaTeX `aligned`-miljøet.
* **Alignment:** Bruk `& =` for å aligne likhetstegn vertikalt. Dette er et absolutt krav for visuell orden og profesjonelt utseende.

## 4. CAS Evidence Supremacy
* **Regel:** All digital bevisføring (CAS/GeoGebra) SKAL rekonstrueres bokstavelig i `visualEvidence`.
* **Format:** Bruk et terminal-lignende format (In/Out eller $1, $2).

## 5. Standard Point Policy (2.0 Default)
* **Regel:** Hver deloppgave SKAL som standard ha 2,0 poeng som maks.

## 6. Zero Conversational Filler
* **Regel:** KI-en har et absolutt forbud mot å bruke naturlig språk i transkripsjonsfeltene. Kun rådata og rekonstruksjon.

## 7. Mandatory Rubric Whitelisting (v7.8.7 Enforced)
* **Regel:** Kun oppgaver som finnes i den gjeldende rettemanualen er tillatt detektert. 
* **API-Filter:** Alle "hallusinerte" oppgaver som ikke matcher fasiten SKAL slettes programmatisk i `geminiService` før de når frontend.

## 8. Universal Splitting Enforced
* **Regel:** Det finnes ikke lenger konseptet "Enkelt A4-side" i inntaks-pipelinen for bilder.
* **Regel:** Alle bildefiler behandles som om de inneholder to logiske sider.

## 9. Del 1 / Del 2 Kontinuitet
* **Regel:** Systemet skal aldri "glemme" hvilken del en side tilhører. Dette feltet er påkrevd i alle KI-skjemaer.

## 10. Dual-Matrix Results
* **Regel:** Resultatmatrisen SKAL deles i to seksjoner: Del 1 (Indigo) og Del 2 (Emerald).

## 11. Figur- og Graf-tolkning
* **Regel:** Visuelle elementer skal beskrives i `visualEvidence` feltet eller via `[AI-TOLKNING AV FIGUR: ...]` tagger.
* **Stil:** Disse skal vises med distinkt styling (f.eks. grå bakgrunn) for å skille dem fra elevens tekst.

## 12. LaTeX Delimiter Stability
* **Regel:** Bruk `\[ ... \]` for display math og `\( ... \)` for inline math. Unngå `$$` da det kan skape problemer med asynkron rendering.

## 13. Orientation Guard
* **Regel:** KI-en skal sjekke etter 180-graders rotasjon (opp-ned) ved å analysere bokstav-anatomi i de splittede delene.

## 14. Explicit Empty Page
* **Regel:** Tomme sider skal returnere strengen `[TOM SIDE]` i transkripsjonen, ikke være tomme strenger eller null.

## 15. Results Matrix Consistency
* **Regel:** Resultatmatrisen skal alltid vise hele klassen og alle oppgaver definert i rettemanualen. Manglende svar skal markeres med bindestrek `-`, mens 0 poeng skal markeres med `0` (rød tekst).

## 16. Evaluation Refresh
* **Regel:** Brukeren skal kunne tvinge en re-evaluering av en enkelt kandidat uten å måtte kjøre hele batchen på nytt.

## 17. Evaluation Stop
* **Regel:** Det skal være mulig å avbryte en pågående gruppeevaluering for å spare tokens/kostnader.

## 18. Pedagogical Feedback Requirements
* **Regel:** Evalueringen skal inkludere "Vekstpunkter" (hva kan forbedres) og en "Ferdighetsprofil" basert på temaer.

## 19. Missing Task Representation
* **Regel:** UI-en må skille visuelt mellom "Ikke besvart" (Missing) og "0 poeng" (Failed).

## 20. Visual Evidence Separation (Code & CAS)
* **Regel:** CAS, Python-kode og figurer skal holdes adskilt fra håndskrift i datamodellen (`visualEvidence`), men kan vises interleaved i UI for lesbarhet.
* **Digitalt Innhold:** Også i Word-dokumenter skal programmeringskode (Python, Java) behandles som "visuelt bevis" og plasseres i egen boks.

## 21. CAS Mandatory Reconstruction
* **Regel:** CAS-bilder skal ikke oppsummeres ("Eleven løser likningen"). De skal rekonstrueres linje for linje ("Linje 1: Løs(...) -> x=2").
* **Regel:** Python-kode skal gjengis med korrekt innrykk og syntaks.

## 22. Interleaved Evidence Flow
* **Regel:** I visningsmodus skal `visualEvidence` flettes inn i teksten der det naturlig hører hjemme, ved bruk av plassholdere.

## 23. Zero Conversational Filler (Reiteration)
* **Regel:** Absolutt forbud mot meta-kommentarer ("Her ser vi en graf").

## 24. Standard Point Policy (Reiteration)
* **Regel:** Maks 2.0 poeng per deloppgave med mindre annet er spesifisert manuelt.

## 25. Visual Page Anchor
* **Regel:** Sortering av sider skal primært baseres på visuelle sidetall (OCR) dersom fil-metadata er upålitelig.

## 26. Mandatory Column Check
* **Regel:** (Erstattet av Regel 1: Mandatory Universal Split).

## 27. Literal CAS Transcription
* **Regel:** 1:1 avskrift av tekst i CAS-vinduer. Ingen tolkning.

## 28. Single-Criterion Regeneration
* **Regel:** Mulighet for å regenerere fasit for KUN én oppgave om gangen.

## 29. Single-Page Re-Scan
* **Regel:** Mulighet for å kaste cache og re-skanne en enkelt side med full `thinkingBudget`.

## 30. No Itemize/Tabular
* **Regel:** Forbud mot `\begin{itemize}` og `\begin{tabular}` i LaTeX-output for å unngå rendringsfeil. Bruk Markdown lister og `aligned`.

## 31. Re-Scan Visual Feedback
* **Regel:** Tydelig spinnere/loading-state lokalt på siden som re-skannes.

## 32. Hard Whitelisting (Frontend & API)
* **Regel:** Både Frontend og API-tjenesten skal filtrere bort alle oppgaver fra API-responsen som ikke finnes i den aktive rettemanualen. Ingen unntak.

## 33. Dynamic Theme Extraction (v6.2.3)
* **Regel:** Ferdighetsprofilen (Radar Chart) skal bygges dynamisk basert på unike verdier i "Tema"-feltet i rettemanualen. Ingen hardkodede kategorier er tillatt.

## 34. Direct Address Policy (v6.2.4)
* **Regel:** Alle tilbakemeldinger til eleven skal skrives i "Du"-form. Tredjeperson ("Eleven", "Kandidaten") er forbudt i sluttrapporten.

## 35. Print-Ready CSS (v6.2.4)
* **Regel:** Alle resultatvisninger må støtte `@media print`. Utskrift skal komprimeres til A4-format, fjerne mørke bakgrunner og skjule navigasjonselementer.

## 36. Sequential Context Logic (v6.6.4)
* **Regel:** Dersom en side inneholder en "ensom" underoppgave (f.eks. "c)") uten hovedtall, SKAL systemet sjekke forrige side hos samme kandidat.
* **Arv:** Hvis forrige side sluttet med samme oppgavesekvens (f.eks. "3b"), skal den nye siden arve hovednummeret ("3c") og del-tilhørighet (Del 1/2) automatisk.

## 37. Ghost Cache Buster (v6.6.8)
* **Regel:** Ved splitting av sider SKAL `contentHash` genereres på nytt basert på den *faktiske pikseldataen* i den nye filen. Det er strengt forbudt å arve hash fra originalfilen.

## 38. Strict Deduction Scale (v7.8.2)
* **Regel:** KI-sensor skal bruke følgende standardiserte trekk-satser ved retting, i formatet `[-X.X p]`:
    *   **[-0.5 p]**: Slurvefeil, manglende benevning, fortegnsfeil i ellers riktig utregning.
    *   **[-1.0 p]**: Konseptuell feil, men viser forståelse. Halvveis løst.
    *   **[-2.0 p]**: Total skivebom eller manglende besvarelse.

## 39. Network Resilience (v7.8.1)
* **Regel:** Systemet skal ALDRI avbryte en pågående batch-prosessering på grunn av nettverksfeil (503, 504, fetch failed).
* **Action:** Ved feil skal prosessen vente 5 sekunder og prøve samme side på nytt i det uendelige til nettet er tilbake.

## 40. Natural Sorting Policy (v7.9.5)
* **Regel:** All sortering av kandidater skal skje numerisk ("Natural Sort").
* **Logikk:** Kandidat "2" kommer før "10". Kandidat "105" kommer før "1005".
* **Ukjente:** Kandidater merket "Ukjent" skal alltid ligge nederst i listen.

## 41. Literal Newline Sanitization (v7.9.6)
* **Regel:** Transkripsjoner som inneholder literale `\n` tegn (escaped newlines) MÅ konverteres til faktiske linjeskift i både visnings- og redigeringsmodus.
* **Editor:** Tekstbokser for redigering skal ha tilstrekkelig høyde til å vise innholdet uten overdreven intern skrolling.

## 42. Strict Part-Aware Completion (v7.9.31)
* **Regel:** "Komplett"-status (grønn hake) krever en eksakt match mot kombinasjonen av DEL (1/2) og OPPGAVE (Nr+Bokstav).
* **Duplikater:** Hvis manualen inneholder "1a (Del 1)" og "1a (Del 2)", må kandidaten ha besvart BEGGE for å regnes som komplett.
