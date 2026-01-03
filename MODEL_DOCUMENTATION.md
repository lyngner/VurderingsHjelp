
# KI-Modeller & Kostnadsoversikt (v6.5.9)

Dette dokumentet beskriver hvilke modeller som driver prosessene.

## 1. Hybrid Modell-strategi v6.5.9
Vi bruker nå en "Universal Parity" strategi for å sikre 100% konsistens mellom Pro og Flash.

### Gemini 3 Flash (OCR & Layout Master)
- **Oppgave:** All transkribering og fysisk bilde-analyse.
- **Geometri:** Tvinges nå til streng portrett-visning og splitting av landskaps-ark (A3 to A4).
- **Paritet:** Mottar nå identiske instrukser som Pro for matematisk formatering.

### Gemini 3 Pro Preview (Reasoning Master)
- **Oppgave:** Master-modell for fasit-generering og pedagogisk vurdering.
- **Surgical Precision:** Brukes nå målrettet for kirurgisk regenerering av enkelt-oppgaver i rettemanualen for å unngå full refresh.

## 2. Symmetrisk Paritet (v6.5.9)
Fra og med v6.5.x er instruksjonene for Flash og Pro synkronisert på tre områder:
1. **Layout:** Tvungen A3-til-A4 splitting (Rule 8).
2. **Matematikk:** Tvungen bruk av `aligned` med `& =` for vertikal orden.
3. **Kontekst:** Kirurgisk isolasjon ved regenerering for å hindre uønsket full-refresh.
