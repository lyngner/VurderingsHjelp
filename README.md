
# Vurderingshjelp - Master Documentation (v4.18.0)

Profesjonelt verktøy for digitalisering og vurdering av elevbesvarelser ved bruk av Gemini 3 Pro Preview.

## 🛡️ Kritiske Regler for Regresjonsvern
For å forhindre at applikasjonen degenererer, skal følgende regler ALLTID følges ved koding:

1.  **API-Håndtering (Pro Models)**: Siden appen bruker Gemini 3 Pro, MÅ brukeren velge en API-nøkkel via `window.aistudio.openSelectKey()`. 
2.  **Dynamisk Klient**: `GoogleGenAI` må instansieres på nytt inne i service-funksjoner før API-kall for å sikre at den mest oppdaterte nøkkelen brukes (Anti-400 fix).
3.  **Bilde-Pipeline (Anti-Crop)**: Automatisk beskjæring (cropping) er strengt forbudt. Vis alltid full frame.
4.  **A3-Splitting**: Alle landskapsbilder skal vurderes som A3_SPREAD. De skal roteres fysisk før de splittes 50/50 via Canvas API.
5.  **Matematikk-Standard**: Bruk konsekvent `aligned`-miljøer i LaTeX for vertikal utregning. ALDRI bruk horisontale kjede-likninger (A=B=C).
6.  **KI-Isolasjon**: Systeminstruksjoner skal KUN ligge i `systemInstruction`. ALDRI la KI-ens tankeprosess eller instrukser lekke inn i transkripsjonsfeltene.
7.  **Database (V4 Normalisering)**: Respekter IndexedDB V4-strukturen. Kandidater lagres i `candidates`, bilder i `media_blobs`. ALDRI lagre base64-strenger direkte i prosjekt-objektet.
8.  **ID-Prioritet**: Ved OCR skal tabellen i øvre høyre hjørne ('Kandidatnr' og 'sidenummer') ha absolutt prioritet over all annen tekst.
9.  **Design (Compact Focus)**: Radius 16-24px, minimal padding, Inter 900 for titler. Sticky sidebars med uavhengig skroll er påkrevd.
10. **Asynkronitet & Progress**: Bruk det intelligente køsystemet. Fremdriftslinjen skal holdes på 98% under KI-analyse og ha en forsinket nullstilling for visuell stabilitet.

## 🚀 Hovedmoduler
*   **Innlasting**: Støtter lokal opplasting (PDF, Word, JPG) og Google Drive-mapper.
*   **Kontroll**: Side-ved-side visning av original (full frame) og transkripsjon (LaTeX).
*   **Rettemanual**: KI-generert fasit med 3-nivå hierarki: Del -> Oppgave -> Deloppgave.
*   **Resultater**: Automatisk poengberegning og generering av tilbakemelding.
