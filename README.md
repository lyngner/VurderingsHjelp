# ElevVurdering PRO - Brukermanual & Teknisk Dokumentasjon

## 🚀 Versjon 3.7 - Strukturert Rettemanual & Del-inndeling

Denne versjonen fokuserer på bedre organisering av prøver med flere deler og en mer intuitiv navigasjon i rettemanualen.

---

## 🏗 Innlastingsprosessen

### 1. Filtyper som støttes
Appen aksepterer følgende formater:
*   **Word (.docx)**: Tekst trekkes ut lokalt. Appen ser nå spesifikt etter navn og kandidatnummer i de første 10 linjene (topptekst).
*   **PDF (.pdf)**: Splittes automatisk i sider lokalt.
*   **Bilder (.jpg, .png)**: Skannede besvarelser analyseres med OCR.

### 2. Slik fungerer "Smart Side-splitting" (A3 til A4)
Mange skannere tar to A4-sider i én operasjon (A3). Appen håndterer nå dette automatisk:
*   **KI-deteksjon**: Gemini analyserer bildet for å se om det inneholder flere fysiske ark.
*   **Automatisk beskjæring**: Hvis to sider oppdages, vil appen automatisk "klippe" bildet i to og opprette separate sider for hver del. Dette sikrer at du i "Kontroll"-steget ser ett og ett ark av gangen.

### 3. Del 1 og Del 2 Inndeling
Prøver er ofte delt i to (f.eks. med og uten hjelpemidler). Appen støtter nå dette fullt ut:
*   **Automatisk kategorisering**: KI-en forsøker å plassere oppgaver i riktig del basert på oppgavearkene.
*   **Filtrering i manuelt**: Sidemenyen i rettemanualen lar deg raskt bytte mellom å se alle oppgaver, bare Del 1, bare Del 2, eller gå direkte til en spesifikk hovedoppgave (f.eks. Oppgave 2).

### 4. Smart Rettemanual (Oppdatert)
Manualen er nå organisert for maksimal oversikt:
*   **Hovedoppgave-fokus**: Sidemenyen viser nå hovedoppgaver (1, 2, 3...) i stedet for hver enkelt deloppgave (1a, 1b). Dette reduserer støy i grensesnittet.
*   **Vertikal struktur**: Matematikk og tekst stables vertikalt slik at komplekse utregninger får den plassen de trenger.

---

## 💰 Kostnadsestimat (Gemini API)
Siden appen kjører lokalt, betaler du kun for faktiske API-kall til Google.

| Oppgave | Modell | Estimert pris (30 elever) |
| :--- | :--- | :--- |
| **OCR / Side-splitting** | Gemini 3 Flash | ~0.50 NOK |
| **Generere Manual** | Gemini 3 Flash | ~0.10 NOK |
| **Vurdering & Feedback** | Gemini 3 Pro | ~30.00 - 50.00 NOK |

---

## 🔒 GDPR & Sikkerhet
*   **Fullstendig lokal**: PDF-splitting, Word-parsing og bildebeskjæring skjer 100% i nettleseren.
*   **Ingen permanent lagring**: Appen lagrer kun data i din lokale `IndexedDB`.
