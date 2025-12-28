
# Vurderingshjelp - Brukermanual & Teknisk Dokumentasjon

Vurderingshjelp er et profesjonelt verktøy utviklet for lærere som ønsker å effektivisere arbeidet med vurdering av skriftlige besvarelser. Ved å kombinere avansert bildebehandling med de nyeste modellene fra Google Gemini, automatiserer systemet tidkrevende oppgaver som transkribering, kandidat-identifisering og poenggivning.

---

## 🏗️ Systemarkitektur

Applikasjonen er bygget som en moderne **Progressive Web App (PWA)** med fokus på hastighet, brukervennlighet og personvern.

### Kjernekomponenter:
1.  **Frontend (React 19)**: Et responsivt grensesnitt med fokus på estetikk og flyt.
2.  **KI-motor (Google Gemini 3)**:
    *   **Flash-modellen**: Brukes til OCR (optisk tegngjenkjenning), kandidat-identifisering og rask bildebeskjæring.
    *   **Pro-modellen**: Brukes til dyp analyse av oppgavesett, generering av rettemanualer og selve vurderingsarbeidet.
3.  **Lagring (IndexedDB)**: Alle data lagres lokalt i brukerens nettleser. Ingenting lagres på våre servere permanent.
4.  **Bildebehandling**: Systemet håndterer JPG, PNG, PDF og konverterer Word-dokumenter (DOCX) til visuelle ark for sømløs kontroll.

---

## 🛠️ Arbeidsflyt

### 1. Innlasting (Setup)
*   Læreren laster opp oppgaveark/fasit fra egen maskin.
*   Elevbesvarelser (bilder, PDF eller Word) lastes opp lokalt.
*   Systemet grupperer automatisk sidene basert på detektert kandidatnummer.

### 2. Kontroll (Review)
*   Læreren verifiserer at kandidatene er korrekt identifisert.
*   Her kan man rotere sider, slette feilaktige ark og redigere KI-transkripsjonen side-om-side med det originale bildet.

### 3. Rettemanual (Rubric)
*   KI genererer en detaljert rettemanual basert på oppgavearkene.
*   Manualen skiller strengt mellom **Del 1** og **Del 2**.
*   Standard poengsum er satt til 2.0 per deloppgave, men kan enkelt endres manuelt av brukeren.

### 4. Resultater (Results)
*   Systemet vurderer hver kandidat mot manualen.
*   Det genereres en individuell rapport med karakterforslag, begrunnelse, mestringspunkter og poengoversikt.

---

## 🔒 Personvern og Sikkerhet
*   **GDPR**: Systemet er designet for å etterleve GDPR. Ved å bruke kandidatnummer istedenfor navn, sikres elevens anonymitet.
*   **Databehandling**: Bilder sendes kryptert til Google Gemini for analyse, men brukes **ikke** til trening av KI-modeller.
*   **Lokal lagring**: Ved å slette prosjektet eller tømme nettleserdata, forsvinner all informasjon permanent.

---

## 📅 Historikk og Versjoner
For detaljert informasjon om tekniske oppdateringer, se filene i mappen `/versions`.
Gjeldende versjon: **3.14.6**
