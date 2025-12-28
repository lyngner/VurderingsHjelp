# ElevVurdering PRO - Brukermanual & Teknisk Dokumentasjon

## 🚀 Versjon 3.8 - Optimalisert for Sky-distribusjon

Denne versjonen inkluderer "cache-busting" mekanismer for å sikre at brukere på Google Cloud alltid ser den nyeste koden.

---

## 🏗 Innlastingsprosessen

### 1. Filtyper som støttes
*   **Word (.docx)**: Tekst trekkes ut lokalt.
*   **PDF (.pdf)**: Splittes automatisk i sider.
*   **Bilder (.jpg, .png)**: Skannede besvarelser analyseres med OCR.
*   **Google Drive**: Du kan lime inn en mappe-link for å hente alle JPG-filer direkte.

### 2. Slik fungerer "Smart Side-splitting" (A3 til A4)
Mange skannere tar to A4-sider i én operasjon (A3). Appen håndterer nå dette automatisk ved å bruke KI til å finne sidene og fysisk "klippe" dem i to bilder lokalt i nettleseren din.

### 3. Del 1 og Del 2 Inndeling
Prøver er ofte delt i to (f.eks. med og uten hjelpemidler). Appen støtter nå dette fullt ut i både rettemanual og filtrering.

---

## ☁️ Distribusjon til Google Cloud (Viktig!)

Hvis du distribuerer appen til Google Cloud Storage (GCS) eller Firebase, kan brukere oppleve å se en gammel versjon på grunn av caching.

### Slik fikser du caching:
Når du laster opp filene (f.eks. med `gsutil` eller i konsollen), må `index.html` ha en `Cache-Control` header som sier "ikke cache".

**Kommando for GCS:**
```bash
gsutil cp -z html,js,css -h "Cache-Control:no-cache,max-age=0" index.html gs://din-mappe/
gsutil cp -z html,js,css -h "Cache-Control:public,max-age=3600" * gs://din-mappe/
```

**Kommando for Firebase (firebase.json):**
```json
{
  "hosting": {
    "headers": [
      {
        "source": "/**",
        "headers": [{ "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }]
      }
    ]
  }
}
```

### Problemer med CORS på Google Cloud?
Vi har endret `index.html` til å bruke en relativ bane `./index.tsx`. Dette fjerner behovet for kompliserte CORS-oppsett på selve script-kilden.

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
