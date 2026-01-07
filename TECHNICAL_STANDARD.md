
# Teknisk Standard & Algoritmer (v8.6.0)

Dette dokumentet er systemets "Grunnlov". Ved alle fremtidige oppdateringer SKAL disse reglene følges for å hindre regresjon.

## 1. Bildebehandling: "Mandatory Universal Split"
**CRITICAL: REGRESSION_GUARD** - Vi har fjernet AI-basert sjekk av layout for å garantere null ventetid og robust håndtering av alle skanne-retninger.
1.  **Ingen AI-preflight:** Vi spør ikke Gemini om rotasjon eller layout før behandling.
2.  **Lokal Geometri:** Vi måler dimensjonene på bildet lokalt.
3.  **Tvungen Deling:**
    *   **Landskap (Bredde > Høyde):** Klipp vertikalt (Venstre / Høyre). Antas å være A3-oppslag.
    *   **Portrett (Høyde > Bredde):** Klipp horisontalt (Øvre / Nedre). Antas å være A3-oppslag skannet sidelengs.
4.  **Transkribering:** De to halvdelene sendes deretter til AI for tekstlesing.

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

## 7. Mandatory Rubric Whitelisting ("The Iron Dome")
* **Regel:** Det er strengt forbudt for systemet å opprette, vise eller vurdere oppgaver som ikke finnes i den aktive rettemanualen.
* **Greedy Anti-Stutter (v8.0.22):** Alle oppgavenummer skal vaskes gjennom funksjonen `fixStutter` (11->1, 22->2) FØR de valideres. Dette eliminerer hallusinerte duplikater.
* **Filter:** Alle oppgaver som ikke passerer whitelist-sjekken skal forkastes stille.

## 8. Universal Splitting Enforced
* **Regel:** Det finnes ikke lenger konseptet "Enkelt A4-side" i inntaks-pipelinen for bilder.
* **Regel:** Alle bildefiler behandles som om de inneholder to logiske sider.

## 9. Del 1 / Del 2 Kontinuitet
* **Regel:** Systemet skal aldri "glemme" hvilken del en side tilhører. Dette feltet er påkrevd i alle KI-skjemaer.

## 10. Dual-Matrix Results
* **Regel:** Resultatmatrisen SKAL deles i to seksjoner: Del 1 (Indigo) og Del 2 (Emerald).

## 11. Figur- og Graf-tolkning (Gjenopprettet v8.0.30)
* **Regel:** Visuelle elementer (Grafer, CAS, Python) SKAL isoleres fra brødteksten.
* **Mekanisme:** Innholdet skal legges i JSON-feltet `visualEvidence`. I tillegg skal det settes inn en tag `[BILDEVEDLEGG: ...]` i `fullText` der bildet befinner seg visuelt.
* **Stil:** UI-en skal vise dette i en distinkt grå boks for å skille tolkning fra elevens håndskrift.

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
* **Regel:** CAS, Python-kode og figurer skal holdes adskilt fra håndskrift i datamodellen (`visualEvidence`).
* **Digitalt Innhold:** Også i Word-dokumenter skal programmeringskode (Python, Java) behandles som "visuelt bevis" og plasseres i egen boks.

## 21. CAS/Code Mandatory Verbatim Reconstruction (v8.0.42)
* **Regel:** CAS-bilder og Python-kode skal IKKE oppsummeres eller tolkes. De skal transkriberes SLAVISK (tegn-for-tegn).
* **Format:** "Linje 1: [In] -> [Out]".
* **Feil:** Hvis eleven har skrevet syntaksfeil, SKAL denne kopieres nøyaktig. KI-en skal ikke rette koden.

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

## 27. Literal Code Transcription (v8.0.42)
* **Regel:** For programmeringskode (Python) gjelder absolutt presisjon på innrykk og linjeskift. Bruk verbatim kopiering.

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

## 38. Strict Deduction Scale (v8.1.2)
* **Regel:** KI-sensor skal bruke følgende standardiserte trekk-satser ved retting:
    *   **[-0.5 p]**: Slurvefeil, manglende benevning, fortegnsfeil i ellers riktig utregning.
    *   **[-1.0 p]**: Konseptuell feil, men viser forståelse. Halvveis løst.
    *   **[-1.5 p]**: Løst feil, men vist kompetanse. Viktig mellomnivå.
    *   **[-2.0 p]**: Total skivebom eller manglende besvarelse.
*   **Regel (Trivielle feil):** Rene aritmetiske glipper ("1+1=3") som er under oppgavens matematiske nivå skal ignoreres i poengtrekket, men nevnes i kommentaren.

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

## 43. Smart Rotation Retry (v8.0.23)
* **Regel:** Dersom en transkribering feiler (invalid JSON/Error), SKAL systemet forsøke å rotere bildet fysisk 180 grader og prøve én gang til.
* **Hvorfor:** Dette fanger opp sider som er skannet opp-ned, hvor Flash-modellen (uten tenke-budsjett) ofte feiler å produsere gyldig output.

## 44. Anti-Entropy Rules (v8.0.28)
* **Regel:** Retteveiledning SKAL bruke formatet `[-0.5 p]` i klammer.
* **Regel:** Løsningsforslag SKAL ha hyppige linjeskift og bruke `aligned`-miljøer.
* **Regel:** Poeng skal aldri settes høyere enn 2.0 automatisk.

## 45. Strict Math Syntax (Curly Braces) (v8.0.36)
* **Regel:** Alle eksponenter med mer enn ett tegn MÅ ha krøllparenteser: `e^{2x}` (Korrekt) vs `e^2x` (Feil).
* **Regel:** Derivasjon av potenser MÅ beskyttes med parentes: `(e^x)'` eller `{e^x}'` (Korrekt) vs `e^x'` (Feil/Double Exponent).

## 46. Strict JSON Escaping for LaTeX (v8.0.38)
* **Regel:** AI-en MÅ escape backslashes i JSON for LaTeX-kommandoer som kolliderer med JSON-kontrolltegn.
* **Krav:** `\begin` -> `\\begin`, `\text` -> `\\text`, `\frac` -> `\\frac`, `\times` -> `\\times`. Dette hindrer at `\b` (backspace), `\t` (tab), `\f` (formfeed) ødelegger LaTeX-koden.

## 47. Digital Del 2 Mandate (v8.0.41)
* **Regel:** Alle digitale besvarelser (Word/tekstfiler) SKAL automatisk registreres som **Del 2**.
* **Begrunnelse:** I norsk skole er Del 1 uten hjelpemidler (penn/papir), mens Del 2 er med hjelpemidler (PC). En digital fil er derfor per definisjon Del 2.

## 48. Aggressive Task ID Sanitization (v8.1.0)
* **Regel:** Alle oppgave-IDer fra KI-en SKAL vaskes før de sammenlignes med rettemanualen.
* **Krav:** Fjern strengene "Del X", "Part Y", "Oppgave", "Task" og duplikate suffikser. `1bDel1` skal bli `1b`. `22A` skal bli `2A` hvis `22A` ikke finnes i fasiten.

## 49. Manual Override Supremacy (v8.1.0)
* **Regel:** Hvis en lærer manuelt redigerer en poengsum eller karakter, skal denne verdien låses ("Pinned") og ikke overskrives ved en fremtidig "Kjør alle"-operasjon, med mindre læreren eksplisitt ber om full re-evaluering.

## 50. Deep Navigation Integrity (v8.1.0)
* **Regel:** Klikk på en oppgave i Resultat-visningen skal alltid navigere til Kontroll-steget med korrekt kandidat OG korrekt oppgavefilter aktivt. Dette krever at `jumpToTask` state respekterer både ID og Part.

## 51. Pedagogical Competence Principle (v8.1.2)
* **Regel (Følgefeil):** Hvis en kandidat gjør feil i oppgave A, men bruker svaret korrekt i oppgave B, skal kandidaten IKKE trekkes i oppgave B. Sensoren SKAL honorere vist kompetanse og logikk.
* **Regel (Avskriftsfeil):** Hvis en kandidat skriver av oppgaven feil, men løser den "nye" oppgaven korrekt med riktig metode, skal det gis betydelig uttelling for kompetanse (kun symbolsk trekk).
* **Regel (Trivielle feil):** Åpenbare aritmetiske feil på lavt nivå (f.eks. 2+3=6) i avanserte oppgaver skal IGNORERES i poengtrekket, men nevnes i kommentaren. Vi måler matematisk kompetanse, ikke hoderegning.
* **Regel (Kompetansejakt):** Sensoren skal "lete med lupe" etter kompetanse. Bruk trekket **-1.5 p** hvis svaret er feil, men eleven har vist forståelse for metoden.

## 52. Multi-Phase Rubric Generation (v8.2.0)
* **Regel:** Fasit-generering skal ALDRI skje i én operasjon.
* **Faser:** 1. Kartlegg oppgaver (Scan) -> 2. Bygg hver oppgave isolert (Build) -> 3. Tildel temaer (Theme). Dette sikrer kvalitet.

## 53. Verbatim Task Copy (v8.2.7)
* **Regel:** Når KI-en lager en rettemanual, skal den kopiere oppgaveteksten ORDRETT fra bildet. Ingen oppsummering tillatt.

## 54. Markdown Code Blocks (v8.2.10)
* **Regel:** Programmeringskode i løsningsforslag og transkripsjoner skal pakkes inn i Markdown Code Blocks (` ```python ... ``` `).
* **Forbudt:** Bruk aldri LaTeX `verbatim` miljøet, da dette krasjer MathJax.

## 55. Distinct Theme Requirement (v8.2.8)
* **Regel:** Rettemanualen må inneholde mellom 5 og 8 distinkte temaer for å sikre at ferdighetsdiagrammet blir nyttig.
* **Krav:** Hvis prøven er smal, tvinges KI-en til å splitte temaer (f.eks. "Algebra" -> "Likninger" og "Faktorisering").

## 56. Blank Cell Policy for Missing Parts (v8.4.0)
* **Regel:** Dersom en kandidat har status "Mangler Del X" (f.eks. `2️⃣🚫`), skal cellene for oppgaver i denne delen vises som helt blanke i resultattabellen.
* **Krav:** Det skal ikke stå `0` (som indikerer feil svar) eller `-` (som indikerer delvis fravær). Dette bekrefter visuelt at delen er ekskludert fra vurderingsgrunnlaget.

## 57. Rubric-Locked Transcription Queue (v8.3.1 / v6.4.5)
* **Regel:** Systemet skal ALDRI starte OCR/transkribering av elevsider før rettemanualen (Rubric) er ferdig generert og inneholder kriterier.
* **Krav:** Filer i køen skal ha status "Venter..." inntil fasiten er klar. Dette forhindrer at KI-en hallusinerer oppgavenavn (som "11a") uten å ha en whitelist å sjekke mot.

## 58. Deterministic Grading Scale (v8.6.0)
* **Regel:** Karaktersetting er IKKE en AI-oppgave. Den er en matematisk funksjon av poengsum og maks-poeng.
* **Krav:** Systemet skal ALLTID overstyre KI-ens forslag med følgende skala:
    *   1: 0-19%
    *   2: 20-39%
    *   3: 40-59%
    *   4: 60-74%
    *   5: 75-89%
    *   6: 90-100%
*   **Auto-Update:** Ved manuell endring av poengsum SKAL karakteren rekalkuleres automatisk.

## 59. Common Error Line Breaks (v8.3.1)
* **Regel:** Punkter i retteveiledningen (`commonErrors`) skal alltid formateres med linjeskift mellom hvert punkt for lesbarhet.
* **Format:** `[-0.5 p] Feil 1... \n [-1.0 p] Feil 2...`.

## 60. Unified Flash Mandate (v8.5.1)
* **Regel:** Systemet skal utelukkende bruke `gemini-3-flash-preview` til alle oppgaver, inkludert OCR, Fasit-generering og Sensor-vurdering.
* **Forbud:** Det er ikke tillatt å bruke "Pro"-modeller i kildekoden. Variabler som `PRO_MODEL` skal peke til Flash-modellen.
* **Begrunnelse:** Kostnadseffektivitet og hastighet. Flash er kapabel til resonneringsoppgaver når den får tilstrekkelig `thinkingBudget` eller stegvis prompting.
