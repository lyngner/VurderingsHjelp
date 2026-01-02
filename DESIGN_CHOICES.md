# Designvalg & Brukeropplevelse (v5.3.0)

Dette dokumentet definerer det visuelle språket for å sikre konsistens.

## 1. Visuell Separasjon av Prøvedeler
* **Del 1 (Uten hjelpemidler):** Bruk Indigo-paletten (`bg-indigo-600`, `text-indigo-500`).
* **Del 2 (Med hjelpemidler):** Bruk Emerald-paletten (`bg-emerald-600`, `text-emerald-600`).
Dette skillet skal være konsekvent i både sidebar, badges og overskrifter.

## 2. Badge-arkitektur
* **Dimensjoner:** Faste 12x12 enheter (`w-12 h-12`).
* **Innhold:** Kun renset oppgave-ID (f.eks "3C", "1A"). Tekststøy som "Oppgave" eller "Del" i badges er strengt forbudt da det fører til visuelt krasj.

## 3. Kompakt Profesjonalitet
* **Radius:** Konsekvent 16-24px for alle containere.
* **Padding:** Minimert for å gi maksimal plass til matematikk og bilder.

## 4. Matematikk-estetikk
* Løsningsforslag vises i `bg-slate-50` eller `bg-indigo-600` avhengig av kontekst, men ALLTID med MathJax-rendring og vertikal alignment via `aligned`.