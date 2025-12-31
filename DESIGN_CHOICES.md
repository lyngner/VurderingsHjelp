
# Designvalg & Brukeropplevelse (v4.7.x)

Dette dokumentet beskriver de bevisste designvalgene som er tatt for å gjøre Vurderingshjelp til et effektivt lærerverktøy.

## 1. Rubrikk-Låst Pipeline (v4.7.0)
For å sikre 100% nøyaktighet i oppgavedeteksjon, er arbeidsflyten nå lineær og streng:
* **Fasit Først**: Det er ikke lenger mulig å laste opp elevbesvarelser før rettemanualen er generert. Dette er fordi KI-en trenger "kartet" (oppgavestrukturen) for å vite hva den skal lete etter i elevens tekst.
* **Validerings-garanti**: Ved å ha fasiten klar, kan systemet umiddelbart forkaste støy og "fiktive" oppgaver som ofte oppstår i komplekse Word-dokumenter.

## 2. Digital Presisjon (Word/PDF)
* **Word-lister**: Systemet er spesialisert på å gjenkjenne lister i Word-format, inkludert romertall (i, ii, iii), bokstavlister (a, b, c) og hierarkiske punktlister.
* **ID-Aggresjon**: Vi søker etter kandidatnummer i alle tekstlag (inkludert det som Mammoth trekker ut fra topp/bunntekst) før vi kategoriserer som "Ukjent".

## 3. Kompakt Innholdsfokus
* **Padding**: Redusert padding i alle hovedcontainere.
* **Typografi**: Bruker 'Inter' med black/900 vekt for titler.
* **Hjørner**: Radius satt til 16-24px for optimal plassutnyttelse.

## 4. Den Strikte Portrett-pipelinen
* **A3-Splitting**: Alle landskapsbilder splittes fysisk i to.
* **Pre-Rotation**: Bilder roteres fysisk i Canvas før lagring for å sikre at tekst og bilde alltid er synkronisert.
