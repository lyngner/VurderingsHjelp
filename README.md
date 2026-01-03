
# Vurderingshjelp - Master Documentation (v6.5.9)

Profesjonelt verktøy for digitalisering, kontroll og pedagogisk vurdering av elevbesvarelser.

## 🚀 Hovedfunksjoner (v6.5.x)

### 1. Oppgaver & Fasit (Rettemanual)
*   **Automatisk Generering:** Laster opp oppgavetekst og genererer en strukturert rettemanual med poeng og løsningsforslag.
*   **Dynamiske Temaer:** Lærer definerer tema (f.eks. "Algebra") per oppgave, som senere brukes til ferdighetsanalyse.
*   **Kirurgisk Redigering:** Endre poeng, tekst eller regenerer enkelt-kriterier med KI.

### 2. Digitalisering & Kontroll
*   **Hybrid OCR:** Støtter både håndskrevne skanninger (JPG/PDF) og digitale dokumenter (Word/.docx).
*   **A3-Splitting:** Automatisk deteksjon, rotasjon og splitting av A3-ark til A4-format.
*   **CAS-Rekonstruksjon:** Linje-for-linje tolkning av digitale verktøy (GeoGebra) integrert i teksten.
*   **Live Redigering:** Rett opp feil i transkripsjonen før vurdering.

### 3. Resultater & Vurdering
*   **Unified Matrix:** Kompakt oversikt over alle elever og alle oppgaver i én tabell.
*   **Pedagogisk Analyse:**
    *   **Vekstpunkter:** Konkrete tips til forbedring.
    *   **Ferdighetsprofil:** Visuelt "edderkopp-diagram" basert på prøvens temaer.
    *   **Du-form:** Personlig tilbakemelding skrevet direkte til eleven.
*   **Utskrift (One-Pager):** Optimalisert utskriftsmodus som samler all info på ett A4-ark per elev.

## 🛡️ Teknisk Standard (Regresjonsvern)
Se [TECHNICAL_STANDARD.md](./TECHNICAL_STANDARD.md) for de 35 absolutte reglene som styrer systemets logikk, inkludert:
*   **Rotate-then-Bisect:** Geometrisk lås for bildebehandling.
*   **Hard Whitelisting:** Streng filtrering av oppgaver mot fasit.
*   **Vertical Math:** Tvungen LaTeX-formatering for lesbarhet.

## 🛠️ Arkitektur
*   **Frontend:** React 19, TypeScript, Vite.
*   **AI:** Google Gemini 3 Flash (OCR) + Gemini 3 Pro (Resonnering).
*   **Database:** IndexedDB (Lokal lagring i nettleser).
*   **Personvern:** Ingen data sendes til tredjepartsserver (kun transient til Google AI API).

---
*Systemversjon: v6.5.9*
