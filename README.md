
# Vurderingshjelp - Systemdokumentasjon

Profesjonelt verktøy for digitalisering og vurdering av elevbesvarelser.

## 🚀 Hovedprinsipper
1. **Læreren som kontrollør**: KI foreslår, læreren bekrefter.
2. **Symmetrisk arkitektur**: Rettemanual og elevsvar følger samme 3-nivå struktur (Del -> Oppgave -> Deloppgave).
3. **A4-Portrett Standard**: Systemet transformerer automatisk alle skanneformater (A3, rotert A4) til standard portrett-visning for optimal lesbarhet.

## 🎨 Designvalg (v4.6.4)
* **Kompakt layout**: Minimal bruk av whitespace for å maksimere mengden synlig matematikk.
* **Hierarkisk navigasjon**: Isolerte sidebarer for lynrask veksling mellom elever og oppgaver.
* **LaTeX-først**: All matematikk rendres med MathJax for krystallklar visning av utregninger.

## 🛠 Teknisk Stack
* **KI**: Gemini 3 Pro (OCR, Analyse, Vurdering).
* **Database**: IndexedDB (Normalisert lagring av kandidater og bilder).
* **Bildebehandling**: Canvas API for fysisk rotasjon og splitting av A3-oppslag.

For detaljerte designvalg, se `DESIGN_CHOICES.md`.
