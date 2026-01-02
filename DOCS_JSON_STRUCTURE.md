# Teknisk Dokumentasjon: JSON & Database (v5.3.0)

## 🔍 KI-Kontrakt (Response Schemas)

### Rettemanual (RubricCriterion)
```json
{
  "taskNumber": "1",        // Kun siffer
  "subTask": "a",           // Kun bokstav
  "part": "Del 1",          // "Del 1" eller "Del 2"
  "suggestedSolution": "...", // LaTeX aligned miljø
  "tema": "Brøkregning"      // Kort tittel
}
```

### Elevbesvarelse (IdentifiedTask)
```json
{
  "taskNumber": "1",
  "subTask": "a"
}
```

## 🛡️ Valideringsregler
1. **Hard Whitelisting:** Alle oppgaver detektert i elevbesvarelser som ikke finnes i rettemanualen skal forkastes umiddelbart.
2. **Roman Numeral Guard:** Romertall (i, ii, iii) skal ALDRI tolkes som egne oppgaver, kun som punktlister i transkripsjonen.