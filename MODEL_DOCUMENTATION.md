
# KI-Modeller & Kostnadsoversikt (v8.5.1)

Dette dokumentet beskriver den enhetlige AI-strategien som driver systemet.

## 1. Unified Flash Strategy
Fra v8.5.0 bruker systemet **Gemini 3 Flash** til alle operasjoner. Det er ingen bruk av Pro-modellen.

### Gemini 3 Flash (The Workhorse)
- **OCR & Layout:** Lynrask bildeanalyse og transkribering.
- **Fasit & Resonnering:** Ved å gi modellen "Thinking Budget" (tenketid) eller dele opp oppgaven i steg, oppnår Flash en kvalitet som er mer enn god nok for vurdering av elevbesvarelser.
- **Kostnad:** Ekstremt lav. Ca 1/20 av prisen til Pro.

## 2. Kostnadsanalyse (Estimat)
Med dagens priser for Gemini Flash (Paid Tier):

For en klasse på **30 elever** med **8 sider** hver (totalt 240 sider):
*   **Transkribering (OCR):** ~0,25 NOK.
*   **Vurdering (Sensor):** ~0,50 NOK.
*   **Total kostnad for hele bunken:** Under 2 kroner.

## 3. Symmetrisk Paritet
Selv om vi kun bruker Flash, opprettholder vi strenge krav til output:
1. **Layout:** Tvungen A3-til-A4 splitting (Rule 8).
2. **Matematikk:** Tvungen bruk av `aligned` med `& =` for vertikal orden.
3. **Resonnering:** Flash bruker `reasoning`-feltet til å begrunne poengsetting før den setter score.
