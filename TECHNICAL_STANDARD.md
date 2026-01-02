# Teknisk Standard & Algoritmer (v5.5.9)

Dette dokumentet er systemets "Grunnlov". Ved alle fremtidige oppdateringer SKAL disse 23 reglene følges for å hindre regresjon og funksjonell degenerasjon.

## 1. Bildebehandling: "Rotate-then-Bisect"
**CRITICAL: REGRESSION_GUARD** - Rekkefølgen her er matematisk låst:
1. **Identifisering:** Bruk KI til å identifisere to visuelle spalter med tekst. Dette trigger `A3_SPREAD` uavhengig av bildets filformat (portrett/landskap).
2. **Fysisk Rotasjon:** Bruk Canvas API til å rotere det opprinnelige bildet basert på KI-deteksjon (0, 90, 180, 270 grader). Dette SKAL skje fysisk på pikselnivå FØR splitting.
3. **A3 Force-Split:** Alle bilder som etter rotasjon inneholder to sider SKAL returnere to objekter (LEFT/RIGHT).
4. **Geometrisk 50/50 kutt:** Del det roterte bildet nøyaktig på midten langs X-aksen. Ingen piksler skal forkastes.

## 2. Navngivning & Badges (Strikt Sanitering)
* **taskNumber:** SKAL KUN inneholde siffer (f.eks. "1"). ALDRI ordet "Oppgave".
* **subTask:** SKAL KUN inneholde bokstav (f.eks. "a"). 
* **UI-Visning:** Kombiner disse til en ren ID i badges (f.eks. "1A", "4B"). Tekststøy i badges er forbudt.

## 3. Matematikk: "Vertical Pedagogical Flow"
* **Krav:** All matematikk over ett ledd SKAL bruke LaTeX `aligned`-miljøet for vertikal oppstilling.
* **Alignment:** Bruk `&` for å aligne likhetstegn vertikalt under hverandre. Ingen kjede-likninger (A=B=C=D).

## 4. Atomic Persistence
* **Regel:** React-tilstand (state) skal kun oppdateres ETTER at database-skriving (IndexedDB) er bekreftet (`await`). Dette forhindrer tap av elevdata ved rask prosessering.

## 5. Rubric-Strict Whitelisting
* **Regel:** Systemet skal kun identifisere oppgaver som finnes i den opplastede rettemanualen. Alt annet markeres som "UKJENT". Dette fjerner støy-oppgaver som "1I" eller "1III" generert fra punkt lister.

## 6. Deep Word Extraction (XML Headers)
* **Regel:** For Word-filer (.docx) skal tekst hentes fra `word/header*.xml` via `jszip` i tillegg til hovedinnholdet. Dette er kritisk for å fange opp Kandidatnummer som ligger i toppteksten.

## 7. Selection-Sync Scrolling (UX)
* **Regel:** Ved bytte av kandidat i Kontroll-modulen SKAL hovedvisningen automatisk rulle til toppen av den første siden. Læreren skal aldri måtte skrolle manuelt for å finne starten på en ny elev.

## 8. Terminologi & Skille (Pedagogisk Kontekst)
* **Termer:** Bruk konsekvent "Oppgaver / prøver" og "Rettemanual".
* **Fargekoder:** Del 1 = Indigo (blå), Del 2 = Emerald (grønn). Dette gjelder både filter-knapper og oppgave-badges.

## 9. Digital Part Inference
* **Regel:** Digitale filer (.docx) har en standard bias mot "Del 2" (med hjelpemidler). Hvis ingen del er oppgitt, velges Del 2 automatisk.

## 10. Individualization of Unknowns
* **Regel:** Hver fil som ikke får en kandidat-ID skal tildeles en unik container (f.eks. "Ukjent (filnavn.jpg)"). Dette hindrer at flere elever blandes i samme boks i kontroll-modulen.

## 11. Evidence-Level Figur- og Graf-tolkning
* **Regel:** KI skal identifisere visuelle bevis (CAS, GeoGebra, grafer).
* **Krav til CAS/GeoGebra:** KI-en SKAL utføre en linje-for-linje rekonstruksjon av kommandoer og resultater. Dette skal brukes som bevis for poengsetting.
* **Krav til grafer:** Beskriv akser, tydelige skjæringspunkter og funksjonstype.
* **Format:** Disse beskrivelsene SKAL omsluttes av `[AI-TOLKNING AV FIGUR: ...]`.

## 12. LaTeX Delimiter Stability
* **Regel:** Bruk konsekvent `\[ ... \]` for blokk-matematikk og `\( ... \)` for inline-matematikk. Dette sikrer stabilitet mot MathJax 3 rendering-motoren.

## 13. Orientation Guard (Automatic Flip)
* **Regel:** KI-en SKAL identifisere om bildet er opp-ned (180 grader). Se spesifikt på tekstens orientering. Hvis arket er opp-ned, skal `rotation` settes til 180 slik at systemet roterer bildet fysisk før transkribering.

## 14. Empty Page Labeling
* **Regel:** Dersom en side eller en del av et oppslag er funnet å være blank, SKAL KI-en returnere transkripsjonen "[TOM SIDE]". Dette fjerner forvirring rundt arealer uten innhold.

## 15. Results Matrix Consistency
* **Regel:** Resultatsiden SKAL alltid inneholde en permanent sidebar med kandidatliste og oppgave-badges.
* **Krav:** En totaloversikt (matrise) over alle poeng for alle kandidater SKAL være tilgjengelig som hovedvisning før individuell rapport velges.

## 16. Evaluation Refresh
* **Regel:** Det SKAL være mulig å re-evaluere enkeltkandidater eller hele gruppen selv om de er markert som 'evaluated'. Dette sikrer at endringer i rettemanualen kan propageres til alle besvarelser.

## 17. Evaluation Stop
* **Regel:** Alle asynkrone loop-prosesser for vurdering SKAL ha en stopp-mekanisme (abort controller eller flagg) som læreren kan trigge for å spare ressurser.

## 18. Pedagogical Feedback Requirements
* **Regel:** KI-generert vurdering SKAL inneholde:
    1. **Vekstpunkter:** Minst 2 konkrete punkter for mestring og forbedring.
    2. **Ferdighetsprofil:** Aggregering av resultater per tema (f.eks. Algebra, Funksjoner).
    3. **Feilkommentarer:** Alle deloppgaver med poengtrekk SKAL ha en begrunnelse.

## 19. Missing Task Representation
* **Regel:** I resultattabellen skal oppgaver som mangler (ikke detektert i besvarelsen) vises med en strek (`-`). Tallet `0` skal kun brukes hvis oppgaven er forsøkt besvart, men gitt null poeng.

## 20. Visual Evidence Separation
* **Regel:** All transkribert data fra bilder (CAS-utklipp, grafer, geometriske figurer) skal lagres i feltet `visualEvidence` separat fra `transcription`. Dette gjelder både for skannede besvarelser og digitale dokumenter med innlimte bilder.

## 21. CAS Mandatory Reconstruction
* **Regel:** All digital bevisføring (CAS/GeoGebra) SKAL rekonstrueres i et teknisk format (linje-for-linje) i `visualEvidence`. Det er strengt forbudt å bare oppsummere innholdet; nøyaktige kommandoer og svar skal gjengis.

## 22. Interleaved Evidence Flow
* **Regel:** For å sikre pedagogisk sammenheng SKAL visuelle bevis (CAS/Figurer) integreres direkte i `fullText` nøyaktig der de naturlig forekommer i besvarelsen ved bruk av tagen `[AI-TOLKNING AV FIGUR: ...]`. Dette sikrer at læreren ser beviset i kontekst av elevens øvrige tekst.

## 23. Zero Conversational Filler
* **Regel:** KI-en har et absolutt forbud mot å bruke naturlig språk ("forklarende tekst") for å beskrive sine handlinger, vurderinger eller mangler i transkripsjonsfeltene. Du skal være en "Silent Laborer". Ord som "refererer til", "indikerer", "sannsynligvis" eller "her er" skal ikke forekomme. Kun rådata (transkripsjon) og direkte rekonstruksjon (CAS) er tillatt.
