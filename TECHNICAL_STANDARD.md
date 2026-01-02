# Teknisk Standard & Algoritmer (v5.8.5)

Dette dokumentet er systemets "Grunnlov". Ved alle fremtidige oppdateringer SKAL disse reglene følges for å hindre regresjon.

## 1. Bildebehandling: "Rotate-then-Bisect"
**CRITICAL: REGRESSION_GUARD** - Rekkefølgen her er matematisk låst:
1. **Identifisering:** Bruk KI til å identifisere to visuelle spalter. Dette trigger `A3_SPREAD` uavhengig av bildets format.
2. **Fysisk Rotasjon:** Bruk Canvas API til å rotere det opprinnelige bildet FØR splitting.
3. **A3 Force-Split:** Alle A3-oppslag SKAL returnere to objekter (LEFT/RIGHT). Dette gjelder også for Flash-modellen (OCR).
4. **Geometrisk 50/50 kutt:** Del det roterte bildet nøyaktig på midten.

## 2. Hybrid Modellering
* **Gemini 3 Flash:** All OCR, transkripsjon og layout-deteksjon.
* **Gemini 3 Pro:** Fasit-generering og pedagogisk vurdering.
* **LaTeX Mandat:** Begge modeller SKAL bruke `\( ... \)` for all matematikk.

## 3. Matematikk: "Vertical Pedagogical Flow"
* **Krav:** All matematikk over ett ledd SKAL bruke LaTeX `aligned`-miljøet.
* **Alignment:** Bruk `&` for å aligne likhetstegn vertikalt.

## 4. CAS Evidence Supremacy
* **Regel:** All digital bevisføring (CAS/GeoGebra) SKAL rekonstrueres bokstavelig i `visualEvidence`.
* **Format:** Bruk et terminal-lignende format (In/Out eller $1, $2).

## 5. Standard Point Policy (2.0 Default)
* **Regel:** Hver deloppgave SKAL som standard ha 2,0 poeng som maks.

## 6. Zero Conversational Filler
* **Regel:** KI-en har et absolutt forbud mot å bruke naturlig språk i transkripsjonsfeltene. Kun rådata og rekonstruksjon.

## 7. Mandatory Rubric Whitelisting
* **Regel:** Kun oppgaver som finnes i den gjeldende rettemanualen er tillatt detektert. Alt annet markeres som "UKJENT".