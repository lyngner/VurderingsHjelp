
# ElevVurdering PRO - Brukermanual & Teknisk Dokumentasjon

## 🚀 Versjon 3.2 - Optimalisert Arkitektur
Denne versjonen har skilt ut all "tung" forretningslogikk fra brukergrensesnittet for å øke robustheten.

---

## 🏗 Prosjektets Arkitektur

### 🆕 Tjenestelag (Services & Hooks)
For å gjøre appen robust, har vi flyttet logikken ut av komponentene:

*   **`services/fileService.ts`**: Hjertet i filhåndteringen. Ansvarlig for å konvertere PDF-sider til bilder og lese DOCX-tekst. Ved å isolere dette kan vi enkelt oppgradere bildekvaliteten eller legge til nye filtyper uten å røre UI-koden.
*   **`hooks/useProjectProcessor.ts`**: Orkestrerer arbeidsflyten. Den vet *når* et oppgaveark skal sendes til Gemini for å lage en rettemanual, og *hvordan* en elevside skal integreres i riktig kandidatmappe. Den fungerer som en bro mellom brukerens handlinger og KI-tjenestene.
*   **`services/geminiService.ts`**: Håndterer API-forespørsler til Google. Inkluderer robust feilhåndtering (`retry`) og begrensning av samtidig aktivitet (`RateLimiter`) for å unngå krasj ved store opplastinger.

### 🖼 Grensesnitt (Components)
*   **`App.tsx`**: Fungerer nå kun som en navigasjons-sentral og lagrer den overordnede tilstanden for det aktive prosjektet.
*   **`Dashboard.tsx`**: Håndterer prosjektarkivet. Her kan læreren se historikk og administrere sletting. Inkluderer også GDPR-panelet (Tannhjulet).
*   **`SetupStep.tsx`**: Spesialisert visning for innlasting. Viser sanntidsstatus på hva som prosesseres.
*   **`ReviewStep.tsx`**: Kvalitetskontroll. Lar læreren manuelt korrigere KI-transkripsjoner dersom håndskriften er spesielt utfordrende.
*   **`RubricStep.tsx`**: Viser den KI-genererte rettemanualen og lar læreren be om en ny versjon dersom kriteriene må finpusses.
*   **`ResultsStep.tsx`**: Sluttrapportene. Gir både klasseoversikt og detaljerte enkeltelev-rapporter.

---

## 🔒 GDPR & Personvern
Appen er bygget med "Privacy by Design":
1.  **Ingen sky-lagring**: All data lagres i din nettlesers `IndexedDB`.
2.  **Lokal prosessering**: PDF-splitting og DOCX-lesing skjer 100% lokalt på din maskin.
3.  **Sikker KI-overføring**: Bilder sendes kun til Google Gemini for analyse og lagres ikke der permanent i henhold til Enterprise-vilkår.

---

## 🛠 For Utviklere
- **Modulær design**: Nye funksjoner legges til som Hooks eller Services.
- **Robusthet**: Separation of Concerns sikrer at feil i én modul ikke senker hele skipet.
- **Ytelse**: Bruker IndexedDB for rask tilgang til store bilde-filer uten å belaste RAM.
