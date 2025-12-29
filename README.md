
# Vurderingshjelp - Systemdokumentasjon & Master-manual

Vurderingshjelp er et profesjonelt verktøy designet for lærere for å digitalisere og effektivisere rettingsarbeidet. Systemet bruker avansert KI (Gemini 3 Pro) for å tolke håndskrevne besvarelser, men er bygget på prinsippet om **læreren som kontrollør**.

---

## 🏛️ Teknisk Arkitektur (v4.0.0)

### 1. Symmetrisk Hierarki
*   **Hva**: Hele systemet følger et 3-nivå hierarki: **Del -> Oppgave -> Deloppgave**.
*   **Hvorfor**: Sikrer at elevens svar kobles 100% nøyaktig mot fasiten i rettemanualen.

### 2. Normalisert Database (v4-skjema)
*   **Hva**: Kandidater lagres i en egen database-store separat fra prosjekt-metadata.
*   **Ytelse**: Tillater Delta-oppdateringer og lynrask håndtering av svært store prøvesett.

---

## 📅 Versjonshistorikk (Siste)

### v4.0.0 - Produksjonsklar Arkitektur
*   **Status**: Offisiell release av normalisert og hierarkisk arkitektur.

### v3.38.0 - Symmetrisk Hierarki
*   **Hva**: Siste oppdatering før spranget til v4. Utvidet hierarkiet til elevdata.

### v3.36.0 - Database Normalisering
*   **Hva**: Implementerte IndexedDB v4 med normalisert lagring.
