# Import Report Example

Cada ejecucion del importador RB genera un reporte JSON en:

```text
reports/import-rb-YYYYMMDD-HHMM.json
```

Estructura esperada:

```json
{
  "mode": "dry-run",
  "sourceFile": "data/RB_CATALOGO_MASTER.xlsx",
  "tenantSlug": "rb-distribuidora",
  "startedAt": "2026-06-25T14:00:00.000Z",
  "finishedAt": "2026-06-25T14:00:03.000Z",
  "blocked": false,
  "stats": {
    "Categorias": {
      "rowsRead": 6,
      "rowsValid": 6,
      "errors": 0,
      "toCreate": 0,
      "toUpdate": 6
    },
    "Marcas": {
      "rowsRead": 8,
      "rowsValid": 8,
      "errors": 0,
      "toCreate": 0,
      "toUpdate": 8
    },
    "Productos": {
      "rowsRead": 29,
      "rowsValid": 29,
      "errors": 0,
      "toCreate": 29,
      "toUpdate": 0
    },
    "Precios": {
      "rowsRead": 29,
      "rowsValid": 29,
      "errors": 0,
      "toCreate": 29,
      "toUpdate": 0
    }
  },
  "errors": []
}
```

Cuando hay errores, `blocked` queda en `true` y `errors` incluye:

```json
{
  "sheet": "Productos",
  "rowNumber": 12,
  "field": "marca_id",
  "error": "marca_id no existe en Marcas",
  "value": "MAR999"
}
```
