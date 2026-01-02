# Vurderingshjelp - Master Documentation (v5.5.7)

Profesjonelt verktøy for digitalisering og vurdering av elevbesvarelser.

## 🛡️ De Hellige Reglene for Regresjonsvern (v5.5.7)
Disse reglene er absolutte. Endringer som bryter med disse vil føre til systemfeil:

1.  **Fysisk Pipeline (Rotate-then-Bisect)**: Bilder skal roteres FYSISK (Canvas API) før de splittes eller lagres. Dette brenner orienteringen inn i pikslene.
2.  **A3 Force-Split**: Landskapsbilder skal alltid behandles som potensielle A3-oppslag og splittes 50/50 geometrisk.
3.  **Clean Badges**: Visning i grensesnitt skal kun inneholde rene ID-er (f.eks "1A"). Ingen tekststøy i sirkler.
4.  **Atomic Persistence**: Database-operasjoner SKAL avventes (`await`) før React-state oppdateres.
5.  **Vertikal Matematikk**: Bruk konsekvent `aligned`-miljøer i LaTeX for alle utregninger over ett ledd.
6.  **CAS Evidence Supremacy (Kritisk)**: All digital bevisføring (CAS/GeoGebra/Word-tabeller) SKAL skilles ut i `visualEvidence`. Det skal utføres en nøyaktig, linje-for-linje rekonstruksjon av kommandoer og resultat (DU SKAL IKKE OPPSUMMERE). I grensesnittet skal dette feltet vises integrert inni den blå transkripsjonsboksen.

## 🛠️ Teknisk Standard
Se [TECHNICAL_STANDARD.md](./TECHNICAL_STANDARD.md) for detaljert dokumentasjon av algoritmer.
Se [DESIGN_CHOICES.md](./DESIGN_CHOICES.md) for stilguide.
Se [DOCS_JSON_STRUCTURE.md](./DOCS_JSON_STRUCTURE.md) for dataspek.