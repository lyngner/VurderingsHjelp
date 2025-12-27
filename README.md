
# ElevVurdering PRO - Brukermanual & Teknisk Dokumentasjon

## 🚀 Versjon 3.4 - Spesifikasjon for Rettemanual & Vurdering

Denne versjonen gir læreren full kontroll over vurderingsgrunnlaget, med mulighet for å finjustere poeng og retningslinjer før den endelige vurderingen kjøres.

---

## 🏗 Innlastingsprosessen (Spesifikasjon)

### 1. Filtyper som støttes
Appen aksepterer følgende formater i begge innlastingskolonner:
*   **Word (.docx)**: Brukes ofte til oppgaveark eller digitale elevbesvarelser. Teksten trekkes ut lokalt ved hjelp av `mammoth.js`.
*   **PDF (.pdf)**: Skannede dokumenter eller lagrede filer. Appen splitter PDF-en automatisk i enkeltbilder (sider) lokalt i nettleseren.
*   **Bilder (.jpg, .jpeg, .png)**: Skannede bilder av håndskrevne ark.

### 2. Slik fungerer "Oppgave / Fasit"
*   **Mål**: Skape et grunnlag for rettemanualen.
*   **Prosess**: Når du laster opp filer her, analyserer Gemini innholdet for å identifisere oppgavenummer, deloppgaver (f.eks. 1a, 1b), poenggrenser og faglig tema. 
*   **Standardpoeng**: Dersom ingen poengsum er oppgitt på arket, settes standarden til **2 poeng** per deloppgave.

### 3. Redigering av Rettemanual
Du kan nå manuelt overstyre KI-ens forslag i "Rettemanual"-steget:
*   **Poengsum**: Klikk på tallet i kolonnen "Maks Poeng" for å endre verdien. Totalen oppdateres automatisk.
*   **Vanlige feil**: Hver deloppgave har et eget felt for "Vanlige feil & Poengtrekk". Her kan du definere nøyaktig hva som skal gi trekk (f.eks. "Trekk 0.5p ved slurvefeil i fortegn"). Gemini vil bruke disse instruksjonene når den vurderer elevene.
*   **Løsningsforslag**: Du kan endre teksten og LaTeX-formlene direkte.

### 4. Automatisk gruppering av besvarelser
*   **OCR-analyse**: Hver side analyseres for å finne **Kandidat-ID**, **Sidenummer** og transkribere innholdet.
*   **Resultat**: Sider som tilhører samme kandidat blir automatisk lagt i samme mappe i oversikten.

---

## 🔒 GDPR & Sikkerhet
*   **Lokal prosessering**: PDF-splitting og uthenting av tekst fra Word skjer 100% i din egen nettleser. Ingen filer lagres på en ekstern server.
*   **Kryptering**: Data som sendes til Gemini API for analyse sendes over krypterte linjer (HTTPS).
*   **Ingen trening**: Ved bruk av din egen API-nøkkel i et profesjonelt oppsett, brukes ikke dataene til å trene Googles modeller.

---

## 🛠 Brukstips
*   **Korrektur**: Bruk "Kontroll"-steget til å sjekke at transkripsjonen av håndskrift er korrekt før du trykker "Start Vurdering".
*   **LaTeX**: Bruk `$` for inline matematikk og `$$` for blokker. Dette rendres vakkert i både manual og rapport.
