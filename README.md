
# Vurderingshjelp - Master Documentation (v4.24.0)

Profesjonelt verktøy for digitalisering og vurdering av elevbesvarelser ved bruk av Gemini 3 Pro Preview.

## 🛡️ Kritiske Regler for Regresjonsvern (Grunnloven)
For å forhindre at applikasjonen degenererer, skal følgende regler ALLTID følges:

1.  **Fysisk Pipeline (Rotate-then-Bisect)**: Alle rotasjoner og splittinger skal skje FYSISK via Canvas API før lagring. Se `TECHNICAL_STANDARD.md` for matematisk detaljering.
2.  **Atomic Persistence**: Alle database-operasjoner SKAL avventes (`await`) før staten oppdateres. Dette hindrer race-conditions der kandidater forsvinner.
3.  **Deterministisk A3-Splitting**: Landskapsbilder skal roteres til korrekt orientering FØR de splittes nøyaktig 50/50 vertikalt. Gemini SKAL returnere to objekter.
4.  **API-Håndtering**: Bruk dynamisk klient-instansiering for Gemini 3 Pro for å fange opp aktiv API-nøkkel fra brukerdialogen.
5.  **Anti-Crop**: Vis alltid full frame (A4). Ingen automatisert beskjæring av marger.
6.  **Vertikal Matematikk**: Bruk konsekvent `aligned`-miljøer i LaTeX. Ingen horisontale kjede-likninger (A=B=C).
7.  **Database Normalisering**: Respekter IndexedDB V4-strukturen (prosjekter, kandidater, media_blobs separert).

## 🛠️ Teknisk Standard
Se [TECHNICAL_STANDARD.md](./TECHNICAL_STANDARD.md) for detaljert dokumentasjon av "HVORDAN" systemet er bygget. Dette dokumentet er kritisk for å hindre kode-degenerasjon.
