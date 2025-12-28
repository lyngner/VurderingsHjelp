
# Vurderingshjelp - Master-manual & Systemlogikk

Vurderingshjelp er et profesjonelt verktøy for lærere som automatiserer transkribering og vurdering av store mengder elevbesvarelser ved bruk av Google Gemini.

---

## 🏛️ Kjernefilosofi & Systemregler

Denne dokumentasjonen fungerer som systemets "hukommelse". Ved enhver regenerering eller feilsøking skal disse reglene følges:

### 1. Poengstandarder (v3.19.0)
*   **Standard poengsum**: Hver deloppgave/kriterium i rettemanualen skal som standard settes til **2.0 poeng**. Dette er et ufravikelig krav fra brukeren.
*   **KI-instruks**: Gemini 3 Pro er tvingende instruert til å bruke 2.0 som basispoengsum i systeminstruksjonen.

### 2. Matematisk Rendring ($LaTeX$)
*   **Delimitere**: Bruk ALLTID `\( ... \)` for inline matematikk og `\[ ... \]` for blokker.
*   **Visuell stabilitet**: Appen bruker en "fade-in" arkitektur (`LatexRenderer`) som hindrer visning av råkode.

### 3. Skalerbarhet og Minnehåndtering (v3.15.0)
*   **Lazy Loading**: Bilder med høy oppløsning lagres i IndexedDB og lastes kun ved behov for å spare RAM.
*   **Thin State**: React-tilstanden for et prosjekt inneholder kun metadata og tekst.

### 4. Kontroll og Verifisering (v3.19.0)
*   **Deloppdeling**: Oppgaver i kandidatlisten i sidebar er nå tydelig gruppert under overskriftene **Del 1** og **Del 2**. Dette gir læreren rask oversikt over eksamensstrukturen.
*   **Alignment**: I kontroll-steget vises bilde og tekst side-ved-side per side for enkel korrekturlesing.
*   **Pro OCR**: Bruker Gemini 3 Pro for maksimal nøyaktighet på koordinater og tekstgjenkjenning.

---

## 🛠️ Arbeidsflyt

1.  **Innlasting**: Opplasting av oppgaveark og elevbesvarelser.
2.  **Kontroll**: Verifisering av transkripsjon mot originalbilde. Sidebar viser detekterte oppgaver gruppert på Del 1/2.
3.  **Rettemanual**: Generering av manual med default 2.0 poeng per del.
4.  **Resultater**: Automatisk vurdering, karakterforslag og detaljert tilbakemelding.

---

## 📅 Historikk (Sammendrag)
*   **v3.19.0**: Forbedret Del 1/2 gruppering i sidebar, forsterket 2.0 poeng default-regel.
*   **v3.18.0**: Gruppering av oppgaver i Del 1 og Del 2 i kandidatoversikten.
*   **v3.17.0**: Låst sidebar i rettemanual, filtrering på hovedoppgaver, tvinger 2.0 poeng som default.
*   **v3.16.0**: Redesignet Kontroll-modul med side-ved-side visning og Pro-OCR.
