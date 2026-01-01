
# KI-Modeller & Kostnadsoversikt (v5.0.0)

Dette dokumentet beskriver hvilke modeller som driver de ulike prosessene i Vurderingshjelp, hvorfor de er valgt, og hva de faktiske brukskostnadene er.

## 1. Modellvalg: Gemini 3 Pro Preview
Gjennom hele applikasjonen brukes **`gemini-3-pro-preview`**. 

### Hvorfor Pro i stedet for Flash?
1.  **Håndskrifts-presisjon:** Pro-modellen har vesentlig bedre visuell forståelse for ujevn håndskrift i kombinasjon med matematiske symboler.
2.  **Contextual Mapping (v5.0.0):** For å unngå "fiktive" oppgaver (som 1I, 1III), kreves den høye resonneringsevnen til Pro for å sammenligne elevens tekst mot beskrivelsene i rettemanualen i sanntid.
3.  **LaTeX-stabilitet:** Pro-modellen følger instruksene om `aligned`-miljøer og korrekt formatering mye strengere enn Flash.
4.  **Thinking Budget:** Vi utnytter Pro-modellens mulighet for et utvidet "tenke-budsjett" (opptil 32k tokens) for komplekse vurderinger.

---

## 2. Prosesser og Instruksjoner

| Prosess | Modell | Budsjett (Thinking) | Hovedfokus i instruks |
| :--- | :--- | :--- | :--- |
| **OCR (Bilde)** | Gemini 3 Pro | 16 000 | ID-tabeller, Context-Aware Mapping mot fasit. |
| **Digital (Word)** | Gemini 3 Pro | 16 000 | "Greedy" ID-søk i XML-headers, Evidence-based Mapping. |
| **Fasit-gen** | Gemini 3 Pro | 16 000 | Strukturere kaos til logiske kriterier (max 2p). |
| **Vurdering** | Gemini 3 Pro | 24 000 | Pedagogisk begrunnelse, mestringspoeng. |

---

## 3. Kostnadsoversikt (Pay-as-you-go)

Basert på standard priser for Gemini Pro-modeller (estimert per 2024/2025):

### Pris per enhet:
*   **Input:** ~$1.25 per 1 million tokens (tekst/bilde).
*   **Output:** ~$5.00 per 1 million tokens (generert tekst).

### Estimat per Elevbesvarelse (5 sider skann):
| Operasjon | Input (est) | Output (est) | Kostnad (USD) |
| :--- | :--- | :--- | :--- |
| OCR (5 sider) | 25 000 tokens | 5 000 tokens | $0.056 |
| Vurdering (Total) | 12 000 tokens | 4 000 tokens | $0.035 |
| **Totalt per elev** | | | **~$0.09 (ca. 1,00 NOK)** |

*Merk: Kostnaden har økt noe i v5.0.0 på grunn av "Contextual Mapping" (vi sender mer tekst til KI-en for å øke presisjonen), men dette sparer læreren for betydelig manuelt rettearbeid.*

---

## 4. Sikkerhet og Personvern
Ingen data sendt til `gemini-3-pro-preview` via denne applikasjonen brukes til å trene Google sine modeller (forutsatt bruk av betalt API-nøkkel/GCP-prosjekt). Dataene behandles som midlertidige transienter for OCR/Analyse og lagres kun lokalt i lærerens nettleser (IndexedDB).
