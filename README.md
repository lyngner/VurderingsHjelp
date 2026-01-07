
# Vurderingshjelp - Master Documentation (v8.5.1)

Profesjonelt verktøy for digitalisering, kontroll og pedagogisk vurdering av elevbesvarelser.

## 🚀 Hovedfunksjoner (v8.5.x)

### 1. Oppgaver & Fasit (Rettemanual)
*   **Multi-Phase Construction:** Genererer rettemanual i tre faser (Skann -> Bygg -> Tema) for høyest mulig presisjon.
*   **Verbatim Oppgave-kopiering:** KI-en kopierer oppgaveteksten ordrett fra bildet før den lager fasit.
*   **Cleaner Rubric:** Retteveiledningen bruker et rent klammeparentes-format (`[-0.5 p]`) for bedre lesbarhet.
*   **Dynamiske Temaer:** Systemet tvinges til å finne 5-8 brede temaer for god ferdighetsanalyse.

### 2. Digitalisering & Kontroll
*   **Smart Regex Context:** Systemet husker kontekst (f.eks. "Oppgave 1") nedover siden.
*   **Code Block Support:** Python-kode og CAS rendres nå i lekre mørke kodeblokker.
*   **Verbatim Transkripsjon:** Kode og teknisk innhold transkriberes tegn-for-tegn uten "AI-oppsummering".
*   **Full Screen Editor:** Utnytter hele skjermbredden for bedre oversikt.

### 3. Resultater & Vurdering
*   **Unified Matrix:** Kompakt oversikt over alle elever og oppgaver i én tabell.
*   **A4-optimalisert PDF:** Rapporten er redesignet med ferdighetsprofilen i bunn for perfekt utskrift.
*   **Manuell Overstyring:** Lærer kan redigere poengsummer og karakter manuelt direkte i rapporten.
*   **Pedagogisk Analyse:**
    *   **Vekstpunkter:** Konkrete tips til forbedring.
    *   **Ferdighetsprofil:** Visuelt "edderkopp-diagram" basert på prøvens temaer.

## 🛡️ Teknisk Standard (Regresjonsvern)
Se [TECHNICAL_STANDARD.md](./TECHNICAL_STANDARD.md) for de absolutte reglene som styrer systemets logikk, inkludert:
*   **Flash Mandate:** Systemet kjører 100% på Gemini 3 Flash for kostnadseffektivitet.
*   **Aggressiv Task ID Sanitization:** Alle IDer vaskes for støy ("1bDel1" -> "1b").
*   **Manual Override Supremacy:** Lærerens manuelle endringer overstyrer alltid KI.
*   **Standard Point Policy:** Maks 2.0 poeng per deloppgave som default.

## 🛠️ Arkitektur
*   **Frontend:** React 19, TypeScript, Vite.
*   **AI:** Gemini 3 Flash (Unified Architecture).
*   **Database:** IndexedDB (Lokal lagring).
*   **Personvern:** Ingen lagring på tredjepartsserver.

---
*Systemversjon: v8.5.1*
