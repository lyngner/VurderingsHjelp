
# Vurderingshjelp - Systemdokumentasjon & Master-manual

Vurderingshjelp er et profesjonelt verktøy designet for lærere for å digitalisere og effektivisere rettingsarbeidet. Systemet bruker avansert KI (Gemini 3 Pro) for å tolke håndskrevne besvarelser, men er bygget på prinsippet om **læreren som kontrollør**.

---

## 🎯 Overordnet Formål
Applikasjonens mål er å transformere en bunke med scannede JPG-filer til en strukturert, rettferdig og konsistent vurderingsrapport. Formålet er ikke å erstatte læreren, men å fjerne det manuelle arbeidet med transkribering, sortering og poengoppsummering, slik at læreren kan fokusere på den faglige vurderingen.

---

## 🧩 Komponentbeskrivelse & Arbeidsflyt

Systemet er bygget opp av fem logiske steg som må følges for å sikre et pålitelig resultat:

### 1. Oversikt (Dashboard)
*   **Hensikt**: Prosjektstyring og inngangsport.
*   **Funksjon**: Her oppretter, sletter og velger læreren vurderingsprosjekter.
*   **Arkitektur**: Lagret lokalt i IndexedDB for maksimal personvern og lynrask tilgang uten server-forsinkelse.

### 2. Innlasting (SetupStep)
*   **Hensikt**: Datainnsamling og initial prosessering.
*   **Funksjon**: Læreren laster opp to typer filer:
    1.  **Oppgave/Fasit**: Grunnlaget for KI-ens forståelse av hva som skal vurderes.
    2.  **Elevbesvarelser**: Scannede ark eller PDF-er.
*   **Bak kulissene**: Systemet kjører umiddelbar OCR (Optical Character Recognition) og segmentering. Arkene blir knyttet til kandidatnumre og sidetall automatisk.

### 3. Kontroll (ReviewStep) - *Kritisk steg*
*   **Hensikt**: Etablere tillit til dataene.
*   **Funksjon**: "Side-ved-side"-visning der læreren ser originalbildet mot KI-ens transkripsjon.
*   **Bruksområde**: 
    - Korrigere feillest kandidat-ID.
    - Rote ark som ligger opp-ned.
    - Redigere transkripsjonen hvis håndskriften var spesielt utfordrende.
    - Sikre at alle sider er kommet med før vurderingen starter.
*   **Viktig**: Dette steget fjerner "KI-frykt" ved at læreren kan gå god for rådataene.

### 4. Rettemanual (RubricStep)
*   **Hensikt**: Definere vurderingskriterier og poenglogikk.
*   **Funksjon**: KI-en foreslår en rettemanual basert på oppgavefilene.
*   **Regler**: 
    - Maksimalt 2.0 poeng per deloppgave for å sikre finmasket vurdering.
    - Læreren kan endre kriterier, løsningsforslag og retteveiledning inline.
    - Skillet mellom Del 1 (uten hjelpemidler) og Del 2 (med hjelpemidler) opprettholdes strengt.

### 5. Resultater (ResultsStep)
*   **Hensikt**: Sluttvurdering og rapportering.
*   **Funksjon**: Systemet vurderer hver enkelt elev mot den godkjente rettemanualen.
*   **Output**: 
    - Karakterstatistikk for hele klassen.
    - Individuelle rapporter med mestringspunkter og poengsum.
    - Utskriftsvennlige rapporter for utdeling til elever.

---

## 🏛️ Tekniske Systemregler (For KI-modellen)

### 1. Poengstandarder
*   **Maksimal poengsum**: Hver deloppgave/kriterium SKAL ha **MAKSIMALT 2.0 poeng**. (v3.24.0).

### 2. Matematisk Rendring ($LaTeX$)
*   **Delimitere**: Bruk ALLTID `\( ... \)` for inline og `\[ ... \]` for blokker. (v3.14.8).

### 3. Layout & Brukervennlighet
*   **Låste Sidebarer**: Sidebarene i Kontroll og Rettemanual SKAL skrolle uavhengig av hovedinnholdet. (v3.29.0).
*   **Hovedoppgave-filter**: Sidebar i rettemanualen skal kun vise numeriske hovedoppgaver (Regex: `(\d+)`). (v3.29.0).

---

## 📅 Versjonshistorikk (Sammendrag)
*   **v3.30.0**: Omfattende systemdokumentasjon og arbeidsflyt-beskrivelse.
*   **v3.29.0**: Arkitektonisk konsolidering av skroll-layout og sidebar-filtre.
*   **v3.27.0**: Intelligent bilde-rotasjon og naturlig kandidat-sortering.
*   **v3.26.0**: Smart-Reconcile (Global avstemming av kandidat-IDer).
*   **v3.15.0**: Lazy Loading av tunge bilder via IndexedDB (Ingen krasj ved store filer).
