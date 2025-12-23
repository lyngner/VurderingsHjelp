
# ElevVurdering PRO - V2

ElevVurdering PRO er et spesialisert verktøy designet for lærere som ønsker å digitalisere, transkribere og vurdere håndskrevne elevbesvarelser ved hjelp av avansert kunstig intelligens (Google Gemini).

## 🌟 Kritisk Funksjonalitetslogg (Feature Log)
*For å forhindre de-generering av appen, må følgende funksjoner alltid vedlikeholdes:*

1.  **Global OCR Cache:** Sider hashes basert på innhold. Ved gjenbruk av samme fil (på tvers av prosjekter) hentes transkripsjon umiddelbart fra `global_cache` i IndexedDB uten API-kall.
2.  **Duplikatsjekk:** Systemet hindrer opplasting av samme side flere ganger i samme prosjekt ved å sjekke hashes før prosessering.
3.  **Discovery Search:** Knappen "Finn tidligere besvarelser" søker gjennom hele databasen etter besvarelser som ikke finnes i nåværende prosjekt.
4.  **Inkrementell Gruppestatistikk:** Resultatvisningen gir umiddelbar snittberegning og fremgangsoversikt så snart første elev er vurdert.
5.  **Varmekart (Heatmap):** En fargekodet tabell som viser alle elever mot alle oppgaver for rask identifisering av kollektive misforståelser i klassen.
6.  **A3 Symmetrisk Splitting:** Automatisk deteksjon og deling av brede bilder.
7.  **Auto-LaTeX Rendering:** Bruker MathJax for profesjonell visning av matematiske formler i både transkripsjon og fasit.

---

## 🛠 Teknisk Løsning

### Arkitektur
*   **Frontend:** React 19 + Tailwind CSS.
*   **KI-Motor:** `gemini-3-flash-preview` og `gemini-3-pro-preview`.
*   **Lokal Lagring:** IndexedDB (`projects` og `global_cache`).

## 🔐 Personvern (GDPR)
*   Appen er bygget etter "Privacy by Design".
*   Ingen elevdata lagres sentralt; alt forblir i lærerens lokale nettleserdatabase.
*   API-kall til Google Gemini brukes kun til prosessering, ikke trening av modeller (enterprise-standard).
