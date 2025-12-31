
# Vurderingshjelp - Master Documentation (v4.20.0)

Profesjonelt verktøy for digitalisering og vurdering av elevbesvarelser ved bruk av Gemini 3 Pro Preview.

## 🛡️ Kritiske Regler for Regresjonsvern
For å forhindre at applikasjonen degenererer, skal følgende regler ALLTID følges ved koding:

1.  **Fysisk Pipeline**: Alle rotasjoner og splittinger skal skje FYSISK via Canvas API før lagring i IndexedDB. Aldri stol utelukkende på CSS-transform eller metadata for orientering.
2.  **A3-Splitting**: Alle landskapsbilder som inneholder to kolonner/sider skal vurderes som A3_SPREAD. KI skal returnere TO objekter (LEFT/RIGHT), og disse splittes nøyaktig 50/50 etter rotasjon.
3.  **API-Håndtering**: Bruk Gemini 3 Pro med dynamisk klient-instansiering for å fange opp aktiv API-nøkkel fra brukerdialogen.
4.  **Bilde-Pipeline (Anti-Crop)**: Automatisk beskjæring (cropping) er strengt forbudt. Vis alltid full frame (A4).
5.  **Matematikk-Standard**: Bruk konsekvent `aligned`-miljøer i LaTeX for vertikal utregning. ALDRI bruk horisontale kjede-likninger (A=B=C).
6.  **KI-Isolasjon**: Systeminstruksjoner skal KUN ligge i `systemInstruction`. ALDRI la KI-ens tankeprosess eller instrukser lekke inn i transkripsjonsfeltene.
7.  **Database (V4 Normalisering)**: Respekter IndexedDB V4-strukturen. Kandidater lagres i `candidates`, bilder i `media_blobs`. ALDRI lagre base64-strenger direkte i prosjekt-objektet.
8.  **ID-Prioritet**: Ved OCR skal tabellen i øvre høyre hjørne ('Kandidatnr' og 'sidenummer') ha absolutt prioritet over all annen tekst.
9.  **Design (Compact Focus)**: Radius 16-24px, minimal padding, Inter 900 for titler. Sticky sidebars med uavhengig skroll er påkrevd.
10. **Lokal Filhåndtering**: Appen støtter kun lokale filopplastinger (PDF, Word, JPG).

## 🚀 Hovedmoduler
*   **Innlasting**: Støtter lokal opplasting (PDF, Word, JPG) fra din egen maskin.
*   **Kontroll**: Side-ved-side visning av original (full frame) og transkripsjon (LaTeX).
*   **Rettemanual**: KI-generert fasit med 3-nivå hierarki: Del -> Oppgave -> Deloppgave.
*   **Resultater**: Automatisk poengberegning og generering av tilbakemelding.
