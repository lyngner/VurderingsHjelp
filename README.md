
# Vurderingshjelp - Master Documentation (v7.9.31)

Profesjonelt verktøy for digitalisering, kontroll og pedagogisk vurdering av elevbesvarelser.

## 🚀 Hovedfunksjoner (v7.9.x)

### 1. Oppgaver & Fasit (Rettemanual)
*   **Cleaner Rubric (Nytt i 7.8.2):** Retteveiledningen bruker nå et rent klammeparentes-format (`[-0.5 p]`) i stedet for kulepunkter for å bedre lesbarheten.
*   **Dynamiske Temaer:** Lærer definerer tema (f.eks. "Algebra") per oppgave, som senere brukes til ferdighetsanalyse.
*   **Kirurgisk Redigering:** Endre poeng, tekst eller regenerer enkelt-kriterier med KI.

### 2. Digitalisering & Kontroll
*   **Smart Regex Context (Nytt i 7.9.29):** Systemet husker kontekst (f.eks. "Oppgave 1") mens det leser nedover siden, slik at løsrevne bokstaver som "b)" automatisk kobles til riktig hovedoppgave ("1b").
*   **Editor Ergonomics:** Stort redigeringsvindu og automatisk konvertering av linjeskift-koder til faktisk tekstflyt gjør manuell korrigering smertefritt.
*   **Manual Badge Editing:** Lærer kan manuelt overstyre hvilke oppgaver som tilhører en side ved å redigere headeren direkte.
*   **Natural Sorting:** Kandidater sorteres logisk (1, 2, 10) i stedet for alfabetisk, med ukjente til slutt.
*   **Cross-Type Sibling Inference:** Systemet kobler automatisk sammen deler av samme besvarelse selv om filene har ulike format (f.eks. .jpg og .docx).
*   **Service-Level Whitelist:** Innført et nådeløst filter direkte i API-laget som automatisk sletter alle hallusinerte oppgaver som ikke finnes i rettemanualen.
*   **Network Resilience:** Systemet tåler at internett faller ut. Prosessering pauses og gjenopptas automatisk når nettet er tilbake.
*   **Tvungen Splitting (Universal Split):** Alle opplastede bilder deles automatisk i to på midten for å håndtere A3-oppslag og roterte ark uten ventetid.

### 3. Resultater & Vurdering
*   **Unified Matrix:** Kompakt oversikt over alle elever og alle oppgaver i én tabell.
*   **Strict Komplett-indikator (✅):** Automatisk markering av kandidater som har levert svar på alle oppgaver i rettemanualen. Sjekken er nå "Part-Aware" (v7.9.31) og skiller mellom Del 1 og Del 2.
*   **Pedagogisk Analyse:**
    *   **Vekstpunkter:** Konkrete tips til forbedring.
    *   **Ferdighetsprofil:** Visuelt "edderkopp-diagram" basert på prøvens temaer.
    *   **Du-form:** Personlig tilbakemelding skrevet direkte til eleven.

## 🛡️ Teknisk Standard (Regresjonsvern)
Se [TECHNICAL_STANDARD.md](./TECHNICAL_STANDARD.md) for de absolutte reglene som styrer systemets logikk, inkludert:
*   **Strict Part-Aware Completion:** Grønn hake krever unike treff på Del+Oppgave.
*   **Natural Sorting Policy:** Alltid sorter kandidater numerisk.
*   **Mandatory Universal Split:** Ingen AI-gjetting på layout. Alt splittes.
*   **Standard Point Deduction:** -0.5p for slurv, -1.0p for konseptuelle feil.
*   **Network Auto-Retry:** Uendelig loop ved 503/FetchError.

## 🛠️ Arkitektur
*   **Frontend:** React 19, TypeScript, Vite.
*   **AI:** Google Gemini 3 Flash (OCR) + Gemini 3 Pro (Resonnering).
*   **Database:** IndexedDB (Lokal lagring i nettleser).
*   **Personvern:** Ingen data sendes til tredjepartsserver (kun transient til Google AI API).

---
*Systemversjon: v7.9.31*
