
# Designvalg & Brukeropplevelse (v4.16.0)

## 1. Informasjonstetthet (Compact Content Focus)
Etter v4.6.3 har applikasjonen gått bort fra "mobil-stilen" med store avrunder og mye luft, til et profesjonelt dashboard-design:
*   **Padding**: Redusert med 40% for å minimere skrolling.
*   **Hjørner**: Radius er satt til 16-24px (tidligere 50px) for å maksimere brukbart areal.
*   **Sidebar**: Låst posisjon (sticky) med uavhengig skroll. Dette sikrer at navigasjon mellom kandidater og oppgaver alltid er tilgjengelig.

## 2. Vertikal Flyt (Pedagogisk Matematikk)
*   **Visuelt Hierarki**: Vi bruker dype indigo-farger (`bg-indigo-600`) for transkripsjonsbokser. Dette gir hvit LaTeX-tekst maksimal lesbarhet.
*   **Vertikalitet**: Siden lærere retter vertikalt, tvinger vi all matematikk inn i `aligned`-miljøer. Dette speiler den tradisjonelle måten å sette opp regnestykker på.
*   **Fade-in Rendering**: Vi bruker en myk fade-in i `LatexRenderer` for å skjule råkoden mens MathJax jobber. Dette fjerner visuelt "hopp" og flimmer.

## 3. Brukerinteraksjon
*   **Direkte Navigasjon**: Kandidatkort i Setup-steget navigerer direkte til aktuell elev i Review-steget.
*   **Manual Overrides**: Alle KI-valg (ID, Side, Del) har tydelige manuelle kontroller i Review-steget.
*   **Symmetri**: Fargekodingen i rettemanualen (Indigo for Del 1, Emerald for Del 2) gjentas konsekvent i alle moduler for umiddelbar kontekstforståelse.
