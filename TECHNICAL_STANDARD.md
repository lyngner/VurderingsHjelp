# Teknisk Standard & Algoritmer (v5.3.5)

Dette dokumentet er systemets "lov". Ved alle fremtidige oppdateringer SKAL disse algoritmene følges for å hindre regresjon og funksjonell degenerasjon.

## 1. Bildebehandling: "Rotate-then-Bisect"
**CRITICAL: REGRESSION_GUARD** - Rekkefølgen her er matematisk låst:
1. **Identifisering:** Bruk KI til å identifisere to visuelle spalter med tekst. Dette trigger `A3_SPREAD` uavhengig av bildets filformat (portrett/landskap).
2. **Fysisk Rotasjon:** Bruk Canvas API til å rotere det opprinnelige bildet basert på KI-deteksjon (0, 90, 180, 270 grader). Dette SKAL skje fysisk på pikselnivå FØR splitting.
3. **A3 Force-Split:** Alle bilder som etter rotasjon inneholder to sider SKAL returnere to objekter (LEFT/RIGHT).
4. **Geometrisk 50/50 kutt:** Del det roterte bildet nøyaktig på midten langs X-aksen. Ingen piksler skal forkastes, og ingen KI-basert "content detection" skal styre kuttet.
5. **Kvalitet:** Lagre alle resulterende bilder i 95% JPEG for å bevare håndskrift.

## 2. Navngivning & Badges (Strikt Sanitering)
* **taskNumber:** SKAL KUN inneholde siffer (f.eks. "1"). ALDRI ordet "Oppgave".
* **subTask:** SKAL KUN inneholde bokstav (f.eks. "a"). 
* **UI-Visning:** Kombiner disse til en ren ID i badges (f.eks. "1A", "4B"). Hvis en badge inneholder mer enn 3 tegn, er det et brudd på standarden og skal rettes umiddelbart.

## 3. Matematikk: "Vertical Pedagogical Flow"
* **Krav:** All matematikk over ett ledd SKAL bruke LaTeX `aligned`-miljøet for vertikal oppstilling.
* **Alignment:** Bruk `&` for å aligne likhetstegn vertikalt under hverandre. Dette er ikke valgfritt.

## 4. Atomic Persistence
* **Regel:** React-tilstand (state) skal kun oppdateres ETTER at database-skriving (IndexedDB) er bekreftet (`await`). Dette forhindrer "race conditions" og tap av elevdata.

## 5. Diktatorisk A3-Splitting
* **CRITICAL:** KI-modellen har ikke lov til å vurdere om et oppslag skal splittes. Den SKAL alltid returnere to sider (LEFT/RIGHT) for alle bilder identifisert som et A3-ark. Dette sikrer at brettede ark alltid blir til to A4-sider.