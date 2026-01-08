
## 66. Sequential Orphan Rescue (v8.9.5)
*   **Problem:** Ved skanning av dobbeltsidige ark (Duplex) oppstår filnavn i par (Scan1+Scan2, Scan3+Scan4).
*   **Løsning (Duplex Pairing):**
    *   Systemet sorterer alle filene i prosjektet.
    *   Redning (sammenslåing av Ukjent til Kjent) tillates **KUN** innenfor et par (Oddetall -> Partall i 0-indeksert liste).
    *   **Eksempel:** Fil nr 2 i listen (indeks 1) kan redde seg inn til fil nr 1.
    *   **Brannmur:** Fil nr 3 i listen (indeks 2, start på nytt ark) får **IKKE** koble seg til fil nr 2, selv om de er sekvensielle. Dette hindrer at Elev B limes bakpå Elev A.
*   **Start-sperre:** "Side 1"-deteksjon gjelder fortsatt som en ekstra sikring.
