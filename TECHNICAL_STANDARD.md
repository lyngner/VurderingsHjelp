
# Teknisk Standard & Algoritmer (v4.99.0)

Dette dokumentet beskriver de kritiske tekniske valgene i applikasjonen. Ved videreutvikling SKAL disse standardene følges for å unngå regelbrudd.

## 1. Bildebehandling: "Rotate-then-Bisect"
Dette er den eneste tillatte metoden for å håndtere A3-oppslag.
1. **Fysisk Rotasjon:** Bruk Canvas API til å "brenne inn" orientering.
2. **Geometrisk Splitting:** Del bildet nøyaktig 50/50 på X-aksen ETTER rotasjon.

## 2. Greedy XML Extraction
**Standard:** Bruk JSZip for å skanne ALLE filer i `word/` som inneholder tekstmetadata (headers/footers).

## 3. Mandatory Individualization
**Standard:** Hvis en fil er "Ukjent", skal den tildeles en container med ID `UKJENT_[UNIQUE_ID]`. 

## 4. Matematikk: "Vertical Pedagogical Flow"
**Standard:** All matematikk over ett ledd SKAL bruke LaTeX-miljøet `aligned`.

## 5. Selection-Sync Scrolling
**Standard:** Hovedvisningen (`main`) SKAL automatisk nullstille scrollposisjon (`scrollTop = 0`) ved hvert kandidatbytte.

## 6. Hard Whitelisting
**Standard:** Applikasjonen SKAL filtrere `identifiedTasks` mot den aktive `rubric` før lagring.

## 7. KI-Dokumentasjon
**Standard:** Alle endringer i modellbruk eller instrukser SKAL dokumenteres i `MODEL_DOCUMENTATION.md` med oppdaterte kostnadsestimater.
