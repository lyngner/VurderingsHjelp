# ElevVurdering PRO - V2

ElevVurdering PRO er et spesialisert verktøy designet for lærere som ønsker å digitalisere, transkribere og vurdere håndskrevne elevbesvarelser ved hjelp av avansert kunstig intelligens (Google Gemini).

## 🌟 For Læreren: Hva gjør denne appen?

Tradisjonell rettetid for håndskrevne prøver er ofte preget av manuelt arbeid med å tyde skrift, summere poeng og skrive individuelle tilbakemeldinger. Denne appen automatiserer de tidkrevende delene:

1.  **Innlasting:** Du laster opp bilder (JPG/PNG) av elevbesvarelser og selve oppgaveteksten/fasiten. Appen håndterer automatisk A3-ark ved å dele dem i to.
2.  **Transkripsjon:** Ved hjelp av KI leses håndskriften og gjøres om til digital tekst. Matematikk og formler blir automatisk formatert med LaTeX.
3.  **Kandidatstyring:** Appen identifiserer kandidatnummer på arkene og grupperer automatisk sidene per elev.
4.  **Rettemanual:** Basert på oppgaveteksten din og et utvalg av elevenes faktiske svar, genererer appen en detaljert rettemanual med poengkriterier og vanlige feilkilder.
5.  **Vurdering:** Hver kandidat vurderes mot manualen. Du får forslag til poengsum, karakter, konstruktiv tilbakemelding og spesifikke vekstpunkter.
6.  **Rapportering:** Generer profesjonelle PDF-rapporter som inkluderer varmekart over klassens resultater, radar-diagrammer av ferdighetsprofiler og individuelle elevark.

---

## 🛠 Teknisk Løsning

Applikasjonen er bygget som en moderne "Single Page Application" (SPA) med fokus på personvern og ytelse.

### Arkitektur og Teknologivalg
*   **Frontend:** React 19 med Tailwind CSS for et responsivt og moderne brukergrensesnitt.
*   **KI-Motor:** Google Gemini API (@google/genai).
    *   `gemini-3-flash-preview`: Brukes til transkripsjon og generering av rettemanual på grunn av sin ekstreme hastighet og lave kostnad.
    *   `gemini-3-pro-preview`: Brukes til selve vurderingen for å sikre høyest mulig logisk presisjon og pedagogisk kvalitet.
*   **Lokal Lagring:** All data lagres i brukerens egen nettleser via **IndexedDB**. Ingen elevdata sendes til våre servere eller lagres i skyen (utover selve KI-forespørselen).
*   **Global Cache:** Appen har en innebygd cache-mekanisme. Hvis du laster opp det samme arket på nytt (identifisert via innholdshash), gjenbrukes transkripsjonen umiddelbart uten nye API-kostnader.
*   **Matematikk:** Bruker **MathJax** for høykvalitets rendering av matematiske uttrykk i både transkripsjon og rapporter.

### Robushet og Skalering
*   **Rate Limiting:** Implementert en sofistikert kø-håndterer med "exponential backoff". Dette forhindrer `429 Too Many Requests`-feil ved å pause og skalere forsinkelsen automatisk dersom API-kvoten nås.
*   **Feilhåndtering:** Individuell prosessering av sider. Hvis én fil feiler under analyse, stoppes ikke hele køen. Brukeren får visuelle varsler og mulighet for manuell "Retry".
*   **A3-Splitting:** Innebygd logikk for å detektere bredformat-bilder og dele dem symmetrisk for å simulere korrekt siderekkefølge.

## 🔐 Personvern og Sikkerhet
*   **Ingen trening:** Ved bruk av betalt Google Cloud-prosjekt (Pay-as-you-go) brukes ikke dataene dine til å trene Googles modeller.
*   **Lokal kontroll:** Siden all lagring skjer i IndexedDB, har brukeren full kontroll. Sletter du nettleserdata eller sletter prosjektet i appen, er dataene borte.
*   **GDPR:** Appen er designet for å være et verktøy som støtter læreren ("Human-in-the-loop"), ikke en autonom beslutningstaker. Alle transkripsjoner og vurderinger kan og bør kontrolleres manuelt i "Kontroll"-fanen.

---

*Utviklet som et verktøy for å gi lærere mer tid til det som betyr noe: Eleven.*
