
# Designvalg & Brukeropplevelse (v4.6.x)

Dette dokumentet beskriver de bevisste designvalgene som er tatt for å gjøre Vurderingshjelp til et effektivt lærerverktøy.

## 1. Kompakt Innholdsfokus
For å minimere skrolling har vi valgt en tettere layout:
* **Padding**: Redusert fra 48px til 24px i hovedcontainere.
* **Typografi**: Bruker 'Inter' med ekstra tung vekt (black/900) for titler for å skape tydelig hierarki selv med mindre tekststørrelser.
* **Hjørner**: Radius er satt til 16-24px. Dette sparer plass i hjørnene sammenlignet med de tidligere 50px-radiene, noe som er kritisk i tabeller og rutenett.

## 2. Den Strikte Portrett-pipelinen (A4-standard)
Lærere er vant til å rette A4 på høykant. Systemet tvinger alt innhold inn i denne formen:
* **Automatisk Splitting**: A3-oppslag (to sider i ett bilde) blir alltid fysisk delt i to. Dette fjerner kognitiv belastning ved at man slipper å se to sider samtidig.
* **Pre-Rotation**: Bilder roteres i "mørkerommet" (Canvas API) før de vises. Dette sikrer at transkripsjon og bilde alltid er synkronisert i orientering.

## 3. Fargepsykologi i Rettemanualen
* **Indigo (Blå)**: Brukes for Del 1 (uten hjelpemidler). Signaliserer fokus og struktur.
* **Emerald (Grønn)**: Brukes for Del 2 (med hjelpemidler). Signaliserer kreativitet og problemløsning.
* **Rose (Rød)**: Brukes for feil, mangler og "Ukjente" elementer som krever lærerens oppmerksomhet.
