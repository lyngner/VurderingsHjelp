
# Teknisk Dokumentasjon: JSON-arkitektur & Datamodeller (v4.0.0)

Vurderingshjelp opererer med en normalisert databasearkitektur og et symmetrisk hierarkisk system.

---

## 🏛️ 1. Database-struktur (IndexedDB V4)

Systemet bruker fire dedikerte Object Stores:

| Store | Nøkkel | Beskrivelse |
| :--- | :--- | :--- |
| `projects` | `id` | Metadata og rettemanual. |
| `candidates` | `id` | Elevdata (normalisert). |
| `media_blobs` | `id` | Bilder (fulloppløselig). |
| `global_cache`| `contentHash` | KI-cache. |

---

## 📋 2. Hierarkisk System (3-nivå)
Både rettemanualen og elevbesvarelsene følger nå samme struktur:

| Nivå | Felt | Beskrivelse |
| :--- | :--- | :--- |
| **1. Del** | `part` | Del 1 eller Del 2. |
| **2. Oppgave** | `taskNumber` | Hovednummer (f.eks. "1"). |
| **3. Deloppgave**| `subTask` | Bokstav (f.eks. "a"). |

---

## 👤 3. Elevbesvarelse (Submission JSON)
Elevens data lagres nå med hierarkiske koblinger for nøyaktig vurdering.

### Sider (`Page`):
Hver side inneholder nå `identifiedTasks`, en liste over objekter med `{ taskNumber, subTask }`.

### Vurdering (`TaskEvaluation`):
Karakterutskriften følger samme mønster, noe som tillater en ryddig tabellvisning av resultater sortert etter oppgave.
