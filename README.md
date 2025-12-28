
# Vurderingshjelp - Brukermanual & Teknisk Dokumentasjon

## 🚀 Versjon 3.14.1 - Standardisert Poengsum

Denne versjonen introduserer en standardisert poengsum for deloppgaver for å gjøre rettingen mer konsistent.

---

## 📋 Rettemanual (Rubrikk)

### 1. Standard Poengsum: 2.0 poeng
For å sikre rettferdig og konsistent vurdering, setter systemet nå automatisk **2.0 poeng** som standard maks poeng for alle deloppgaver (a, b, c, d...). 
*   Læreren kan selvfølgelig justere dette manuelt i rettemanualen dersom en oppgave er mer eller mindre omfattende.
*   Systemet støtter nå desimalpoeng (f.eks. 0.5 eller 1.5).

### 2. Gemini 3 Pro - Motoren bak manualen
Vi bruker den kraftigste tilgjengelige modellen for å generere rettemanualen. Dette sikrer at selv små deloppgaver blir identifisert og dekomponert korrekt med riktig poengstandard.

### 3. Forbedret Layout og Visning
*   **Header-optimalisering**: Overskriften på rettemanualen er fleksibel og takler lange prosjektnavn uten å kutte tekst.
*   **Stabil LaTeX**: Matematikk-visningen er herdet for å sikre at formler alltid rendres korrekt i både løsningsforslag og retteveiledning.

---

## 🏗 Innlastingsprosessen

*   **A3-splitting**: Appen splitter automatisk oppslag til to A4-sider.
*   **Automatisk rotering**: KI analyserer tekstretningen og roterer bildene for deg.
*   **Kandidat-ID**: Appen forsøker å kjenne igjen kandidatnummer øverst på arkene.

---

## 🔒 GDPR & Sikkerhet
*   **Fullstendig lokal**: Alt lagres i din lokale nettleser (IndexedDB).
*   **Ingen trening**: Dataene brukes ikke til trening av Google-modeller ved bruk av standard API-oppsett.
