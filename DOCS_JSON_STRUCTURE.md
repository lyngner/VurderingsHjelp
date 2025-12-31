
# Teknisk Dokumentasjon: JSON & Database (v4.16.0)

## 🏛️ Database-struktur (IndexedDB V4)
Applikasjonen bruker en normalisert database for å håndtere store datamengder uten å krasje nettleseren.

### 1. `projects` store
Lagrer metadata om selve prosjektet.
*   `id`: String (UUID)
*   `name`: String
*   `rubric`: Rubric-objekt (Fasit)
*   `candidateCount`: Integer (Cache for dashboard)
*   `taskFiles`: Array av Page-objekter (Oppgaveark)

### 2. `candidates` store
Lagrer normaliserte elevdata.
*   `id`: String (Kandidatnummer)
*   `projectId`: String (Fremmednøkkel med Index)
*   `name`: String
*   `pages`: Array av Page-objekter (UTEN base64Data)
*   `evaluation`: Vurderingsresultat

### 3. `media_blobs` store
Lagrer tunge binærdata.
*   `id`: String (Koblet til Page.id)
*   `data`: Base64-streng (Full oppløsning)

## 🔍 KI-Kontrakt (Response Schema)
Alle API-kall mot Gemini 3 Pro skal bruke `responseSchema` for å garantere følgende struktur:

### Bildeanalyse (OCR)
```json
{
  "layoutType": "A4_SINGLE" | "A3_SPREAD",
  "candidateId": "KUN siffer",
  "fullText": "LaTeX-transkripsjon uten systeminstruks",
  "rotation": 0 | 90 | 180 | 270,
  "identifiedTasks": [{ "taskNumber": "string", "subTask": "string" }]
}
```

### Digital Analyse (Word)
Søker etter `candidateId` i metadata/header og mapper tekstsekvenser til `identifiedTasks` basert på fasiten.

## 🧼 JSON Sanitering
Funksjonen `cleanJson` i `geminiService.ts` er kritisk. Den må alltid:
1. Fjerne Markdown-kodeblokker (```json).
2. Finne første `{` eller `[` og siste `}` eller `]`.
3. Håndtere asynkrone ufullstendige svar ved bruk av try/catch.
