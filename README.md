# Vurderingshjelp - Master Documentation (v5.3.0)

Profesjonelt verktøy for digitalisering og vurdering av elevbesvarelser.

## 🛡️ De Hellige Reglene for Regresjonsvern (v5.3.0)
Disse reglene er absolutte. Endringer som bryter med disse vil føre til systemfeil:

1.  **Fysisk Pipeline (Rotate-then-Bisect)**: Bilder skal roteres FYSISK (Canvas API) før de splittes eller lagres. Dette brenner orienteringen inn i pikslene.
2.  **A3 Force-Split**: Landskapsbilder skal alltid behandles som potensielle A3-oppslag og splittes 50/50 geometrisk.
3.  **Clean Badges**: Visning i grensesnitt skal kun inneholde rene ID-er (f.eks "1A"). Ingen tekststøy i sirkler.
4.  **Atomic Persistence**: Database-operasjoner SKAL avventes (`await`) før React-state oppdateres.
5.  **Vertikal Matematikk**: Bruk konsekvent `aligned`-miljøer i LaTeX for alle utregninger over ett ledd.

## 🛠️ Teknisk Standard
Se [TECHNICAL_STANDARD.md](./TECHNICAL_STANDARD.md) for detaljert dokumentasjon av algoritmer.
Se [DESIGN_CHOICES.md](./DESIGN_CHOICES.md) for stilguide.
Se [DOCS_JSON_STRUCTURE.md](./DOCS_JSON_STRUCTURE.md) for dataspek.