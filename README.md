
# ElevVurdering PRO - Brukermanual & Teknisk Dokumentasjon

## 🚀 Versjon 3.0 - Analyse & Gruppeoversikt
Denne versjonen introduserer avansert statistikk og en helhetlig gruppeoversikt for å gi læreren bedre innsikt i klassens prestasjoner.

---

## 🏗 Prosjektets Fire Hovedfaser

### 1. Innlasting (Setup) - `SetupStep.tsx`
*   **Hovedoppgave**: Samle inn oppgaveark (fasit) og elevbesvarelser.
*   **Viktig funksjonalitet**: Automatisk gruppering via OCR, køhåndtering og lokal bildeoptimalisering.

### 2. Kontroll (Review) - `ReviewStep.tsx`
*   **Hovedoppgave**: Verifisere transkripsjon mot originalbilder.
*   **Viktig funksjonalitet**: Side-om-side visning, justerbar splitter, LaTeX-rendring og bilderotering.

### 3. Rettemanual (Rubric) - `RubricStep.tsx`
*   **Hovedoppgave**: Definere vurderingsstandarder.
*   **Viktig funksjonalitet**: KI-generert rettemanual med fasit og poengrammer.

### 4. Resultater (Results) - `ResultsStep.tsx`
*   **Hovedoppgave**: Analyse av resultater på både individ- og gruppenivå.
*   **Ny Funksjonalitet**:
    *   **Gruppeoversikt**: Dashbord med gjennomsnittlig poengsum og karakterfordeling.
    *   **Kandidattabell**: En samlet oversikt over alle elever, deres status, poeng og karakter.
    *   **Individuell Rapport**: Dypdykk i hver elevs prestasjon med konkrete vekstpunkter og poeng per oppgave.
    *   **Utskriftsoptimalisert**: Både gruppeoversikten og elevrapportene er designet for profesjonell utskrift.

---

## 📊 Dataspesifikasjoner (JSON)

### Vurderingsrapport (`Evaluation`)
- `grade`: Karakterforslag (1-6).
- `score`: Oppnådde poeng totalt.
- `feedback`: Pedagogisk begrunnelse.
- `vekstpunkter`: Liste med konkrete tips.
- `taskBreakdown`: Detaljert poengoversikt per deloppgave inkludert kommentarer.

---

## 🛠 Teknisk Arkitektur
- **Frontend**: Modulær React-arkitektur.
- **KI**: Gemini 3 Flash (OCR/Setup) og Gemini 3 Pro (Vurdering).
- **Persistence**: IndexedDB for sikker lokal lagring av store bildemengder.
- **Statistikk**: Sanntids beregning av gruppedata via `useMemo` for optimal ytelse.
