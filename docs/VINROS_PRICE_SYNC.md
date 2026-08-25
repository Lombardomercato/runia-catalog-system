# VINROS Price Sync — operación segura

Este módulo sólo administra datos del proveedor. No modifica `products`, `product_prices`, reglas Lombardo ni precios publicados.

## Modos explícitos

```bash
# Descarga, valida, consolida, compara si puede leer Supabase y reporta. Cero escrituras.
npm run sync:vinros:dry

# Escritura explícita. No usar hasta aprobar baselines y migración en un entorno aislado.
npm run sync:vinros:write
```

La API equivalente es `syncVinrosPrices({ dryRun: true })`. En dry-run no se construye un writer, no se abre `supplier_sync_runs` y no se escribe ninguna de las seis tablas del módulo. Sin `SUPABASE_SERVICE_ROLE_KEY` sigue funcionando: las métricas que requieren snapshot aparecen como `N/D`. Las cuatro fuentes sí son necesarias.

El write hace todo el trabajo de red y planificación antes de su primera escritura. Si una fuente tiene un fallo crítico, falta un baseline aprobado, se repite una URL/contenido o no coincide “Precio de Lista N”, aborta sin abrir un run. El plan permitido se aplica en una única función PostgreSQL transaccional.

## Fuentes e integridad

Correspondencia fija:

| Lista | Tipo |
|---|---|
| 1 | `retail` |
| 2 | `wholesale` |
| 3 | `business` |
| 4 | `cost` |

Se aceptan CSV y XLSX. Los enlaces de Google Sheets deben incluir un `gid` numérico explícito y se convierten a export CSV; no existe fallback a la pestaña predeterminada. Se rechazan documento vacío/casi vacío, HTML/login, MIME inesperado, CSV/XLSX corrupto, cabecera/columnas ausentes, identidad equivocada, URL o contenido duplicado y exceso de filas inválidas. El input está limitado a 15 MB; XLSX además limita entradas, tamaño expandido y ratio de expansión.

Lista 2 usa exclusivamente el documento `1RKu0ldsucFIk0fXCVh2KHSi1EVTPM7Gz`, pestaña `Hoja1`, `gid=223050305`. Aunque el `gid` sea correcto, el parser exige que el contenido declare `Precio de Lista 2`.

`read-excel-file@9.3.4` reemplaza `xlsx@0.18.5`: soporta exactamente el XLSX que se necesita, funciona con `Buffer` en Node y tiene una superficie/dependencias menor que suites de edición completas. CSV usa un parser acotado propio; no se incorporó una librería general adicional.

Se conservan por separado:

- `source_emission_date`: fecha comercial extraída de “Fecha de Emisión”.
- `source_http_last_modified`: cabecera HTTP si existe.
- `fetched_at`: instante efectivo de descarga.

El desfase normal de fechas no bloquea; antigüedad o dispersión extraordinarias producen warnings configurables.

## Baselines y guardrails

El primer dry-run real aprobó estos baselines para una prueba de base aislada, todavía no para producción:

- retail: 3.284;
- wholesale: 3.281;
- business: 3.279;
- cost: 3.875.

Sobre cada baseline:

- menos de 95% del baseline: warning;
- menos de 85%: blocking;
- más de 1% de filas inválidas: warning;
- más de 5%: blocking.

Los umbrales son configurables en `SupplierGuardrails`. `VINROS_MINIMUM_PRODUCTS_PER_LIST` es un piso técnico del adaptador (default 10), no un baseline productivo.

La validación cruzada del mismo SKU es prioritaria. Un ratio extremo, precio no positivo o una inversión material de jerarquía bloquea; una inversión de hasta 5% sólo advierte para tolerar rounding. La mediana global de primera carga nunca bloquea: es una señal de triage. Cuando tres o más listas coherentes, presentación y escala aportan evidencia conjunta de un posible factor ×100, el producto queda `pending_review` sin corrección automática. Los pisos absolutos son opcionales y viven en `VINROS_*_MIN_PRICE`; el core genérico no contiene un precio mínimo de vino.

Estados de elegibilidad del catálogo de proveedor:

- `safe`: metadata y precios válidos pueden promoverse a `supplier_prices.current_price`;
- `supplier_only_cost`: metadata y costo pueden persistirse, sin retail ni publicación;
- `pending_review`: metadata y candidatos quedan en raw, sin promover current;
- `blocked`: metadata y candidatos quedan en raw, sin promover ningún current.

Todos los productos se envían al RPC, incluso con `prices=[]`. El RPC valida nuevamente que `pending_review` y `blocked` no contengan precios actuales y que `supplier_only_cost` sólo pueda promover `cost`. Si un SKU previamente seguro cambia a `blocked`/`pending_review`, sus current anteriores se retiran dentro de la misma transacción; si pasa a cost-only, se retiran los current no-cost. Nada de este módulo publica en Lombardo.

Presentaciones como `750cc`, `750 cc`, `750 c.c.` y `750c.c` se comparan como `750 ml`, preservando siempre el raw. Un cambio radical de nombre/presentación en un SKU existente genera anomalía, conserva la metadata canónica y almacena el candidato observado en `source_raw`.

## Configuración

```dotenv
VINROS_TENANT_SLUG=tenant-destino
VINROS_LIST_1_URL=https://docs.google.com/spreadsheets/d/1RfIul9S8Zuyd2H8BiYNd7oMDQtNL2NXm/edit?gid=1877280813#gid=1877280813
VINROS_LIST_2_URL=https://docs.google.com/spreadsheets/d/1RKu0ldsucFIk0fXCVh2KHSi1EVTPM7Gz/edit?gid=223050305#gid=223050305
VINROS_LIST_3_URL=https://docs.google.com/spreadsheets/d/1DdbZSzvLTgtLeTewwpwkjMT6OnTe0Dsb/edit?gid=364032974#gid=364032974
VINROS_LIST_4_URL=https://docs.google.com/spreadsheets/d/1QImDzrFNFFw7qjV8Z1GE5h-053EoDBkB/edit?gid=1011739089#gid=1011739089

# Aprobados sólo para la prueba de DB aislada; no copiar todavía a producción.
VINROS_LIST_1_BASELINE_ROWS=3284
VINROS_LIST_2_BASELINE_ROWS=3281
VINROS_LIST_3_BASELINE_ROWS=3279
VINROS_LIST_4_BASELINE_ROWS=3875

VINROS_MINIMUM_PRODUCTS_PER_LIST=10
VINROS_RUN_LEASE_SECONDS=1800
```

Para comparar contra el snapshot o escribir se requieren `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`, siempre server-side. La service role nunca lleva prefijo `NEXT_PUBLIC_`.

## Ejemplo abreviado de reporte

```text
VINROS PRICE SYNC — DRY-RUN READ-ONLY
[retail] Lista esperada 1 / detectada 1 — WARNING
  emision=2026-08-01 http=2026-08-07T10:00:00.000Z fetched_at=2026-08-07T12:00:00.000Z
  filas=824 validas=821 invalidas=3 codigos=821 duplicados=0 valido=99.64%
  baseline=NO APROBADO proporcion=N/D
[global]
  SKUs=835 cobertura 4/4=790 3/4=31 2/4=10 1/4=4
  nuevos=N/D existentes=N/D faltantes=N/D
  precios unchanged=N/D cambiarian=N/D bloqueados=2
  elegibilidad SAFE=812 (97.25%) BLOCKED=2 (0.24%) PENDING=5 (0.6%) COST_ONLY=16 (1.92%)
  warnings=7 anomalias=12 nombres inconsistentes=1 presentaciones inconsistentes=1
  READY FOR WRITE=NO
```

El comando imprime este formato y la API retorna el mismo contenido como `SupplierDryRunReport` tipado.

## Migración y tests de base aislada

No ejecutar la migración directamente en producción. En una base Supabase/PostgreSQL descartable que tenga los roles Supabase:

```bash
SUPPLIER_TEST_CONFIRM_ISOLATED=yes \
SUPPLIER_TEST_DATABASE_URL=postgresql://... \
npm run test:suppliers:db
```

El harness aplica `001` y `010`, corre dos sesiones concurrentes y luego verifica permisos, rechazo de plan parcial, rollback completo del RPC, retry/stale lease, idempotencia, metadata canónica, historial, persistencia de candidatos sin current, cost-only y un plan de 1.001 productos. Los datos funcionales se prueban dentro de una transacción que termina en rollback; el tenant de concurrencia se elimina explícitamente.

La apertura de run usa advisory lock y recupera un `running` cuyo `heartbeat_at` excede el lease configurable. Un run fresco sigue bloqueando un segundo intento.

## Primera prueba en Runia Dev

Este flujo está preparado para un proyecto Supabase aislado. No contiene una ruta a producción, no publica en Lombardo y falla cerrado si URL API, conexión PostgreSQL, `project_ref`, confirmación y tenant no apuntan al mismo destino esperado.

### Credenciales y anclas de identidad

Las tres variables de Supabase solicitadas son necesarias, pero no alcanzan para DDL y harness: una secret key de la Data API no puede aplicar SQL arbitrario. También se necesita la conexión PostgreSQL de Runia Dev y el tenant explícito.

```bash
export RUNIA_DEV_SUPABASE_URL='https://<RUNIA_DEV_PROJECT_REF>.supabase.co'
export RUNIA_DEV_SUPABASE_SECRET_KEY='<sb_secret_... o service_role legacy>'
export RUNIA_DEV_PROJECT_REF='<project-ref exacto de Runia Dev>'
export RUNIA_DEV_DATABASE_URL='postgresql://...Runia-Dev...?sslmode=require'
export RUNIA_DEV_TENANT_SLUG='<tenant-dev-explicito>'

export RUNIA_DEV_CONFIRM_ISOLATED="RUNIA_DEV_ONLY:${RUNIA_DEV_PROJECT_REF}"

# Recomendado: referencias que deben ser rechazadas aunque otra variable esté mal copiada.
export RUNIA_PROTECTED_PROJECT_REFS='<project-ref-produccion>,<project-ref-sommelier-ia>'
```

Los secretos deben cargarse localmente o mediante un gestor de secretos y nunca agregarse al repositorio. El preflight no imprime la secret key ni la URL PostgreSQL. La conexión debe contener el mismo `project_ref`; se rechazan estados parciales de las seis tablas supplier y cualquier tenant ausente, duplicado o inactivo.

### Secuencia reproducible

1. Preflight 100% read-only:

```bash
npm run sync:vinros:dev:preflight
```

Valida presencia de variables, coincidencia URL/ref/conexión, confirmación aislada, acceso API, privilegio real de secret/service role mediante Auth Admin, acceso SQL, esquema base, tenant y estado `0/6` o `6/6` de las tablas objetivo. Si se informan `RUNIA_PRODUCTION_PROJECT_REF`, `SOMMELIER_IA_PROJECT_REF` o `RUNIA_PROTECTED_PROJECT_REFS`, una coincidencia bloquea todo.

2. Aplicar exclusivamente `012_supplier_price_sync.sql` en una transacción y verificarla:

```bash
export RUNIA_DEV_CONFIRM_MIGRATION="APPLY_012_TO_RUNIA_DEV:${RUNIA_DEV_PROJECT_REF}"
npm run sync:vinros:dev:migrate
```

El comando exige `0/6` tablas supplier; si ya existen, no reaplica silenciosamente la migración. Usa `ON_ERROR_STOP`, `--single-transaction`, `lock_timeout` y luego comprueba tablas, constraints, índices, RLS, ausencia de policies cliente, grants, RPCs `SECURITY INVOKER`, `CHECK eligibility_status`, permisos de ejecución y backstops current/candidate.

Si `010` ya estaba aplicada por un mecanismo de migraciones controlado, usar sólo:

```bash
npm run sync:vinros:dev:verify
```

3. Harness real de DB:

```bash
export RUNIA_DEV_CONFIRM_HARNESS="RUNIA_DEV_HARNESS:${RUNIA_DEV_PROJECT_REF}"
npm run sync:vinros:dev:harness
```

Usa tenants temporales con namespace derivado del `project_ref`, se niega a borrar/reutilizar tenants preexistentes y limpia únicamente el tenant que creó. Valida intentos reales de escritura como `anon` y `authenticated`, acceso como `service_role`, dos sesiones concurrentes, stale recovery, rollback total, retry/idempotencia, safe, blocked, pending, cost-only, candidatos nunca promovidos y 1.001 productos. No reaplica migraciones en este modo.

4. Dry-run actual contra snapshot vacío:

```bash
npm run sync:vinros:dev:dry
```

Las fuentes y baselines quedan fijados por el wrapper aislado:

| Tipo | Baseline | Warning | Blocking |
|---|---:|---:|---:|
| retail | 3.284 | < 95% | < 85% |
| wholesale | 3.281 | < 95% | < 85% |
| business | 3.279 | < 95% | < 85% |
| cost | 3.875 | < 95% | < 85% |

Además del guardrail porcentual, el gate exige que el dry del día siga dando exactamente `SAFE=3265`, `BLOCKED=5`, `PENDING=16`, `COST_ONLY=611`, `TOTAL=3897`, cero filas inválidas/duplicadas y snapshot vacío. Cualquier diferencia se imprime y aborta el write; no se fuerza un baseline potencialmente obsoleto.

5. Primer write controlado, sólo Runia Dev:

```bash
export RUNIA_DEV_CONFIRM_FIRST_WRITE="WRITE_VINROS_TO_RUNIA_DEV:${RUNIA_DEV_PROJECT_REF}:${RUNIA_DEV_TENANT_SLUG}"
npm run sync:vinros:dev:write:first
```

Este comando vuelve a ejecutar preflight, verificación, harness y dry gate inmediatamente antes del write. El propio write repite el gate sobre el plan que acaba de descargar y aborta antes de abrir un run si difiere, cerrando la carrera entre el dry y una posible actualización de las hojas. Después audita automáticamente catálogo, current/candidate, historial, anomalías y el último sync run. Exige blocked/pending sin current, cost-only con exactamente un costo, safe con retail, 3.897 SKUs sin duplicados y cero historial en la primera inserción.

La auditoría puede repetirse sin escribir:

```bash
npm run sync:vinros:dev:audit:first
```

6. Segundo write e idempotencia:

```bash
export RUNIA_DEV_CONFIRM_SECOND_WRITE="REPEAT_VINROS_IN_RUNIA_DEV:${RUNIA_DEV_PROJECT_REF}:${RUNIA_DEV_TENANT_SLUG}"
npm run sync:vinros:dev:write:second
```

Antes de escribir exige snapshot poblado, `nuevos=0`, `existentes=3897`, `faltantes=0` y `precios que cambiarían=0`. Después exige `products_created=0`, `prices_updated=0`, todos los current como unchanged, cero historial para el run y cero duplicados. La auditoría aislada equivalente es `npm run sync:vinros:dev:audit:second`.

### Estado antes de recibir credenciales

- Migración ejecutada: no.
- Harness ejecutado contra Runia Dev: no.
- Dry-run contra Runia Dev: no.
- Writes realizados en Supabase: 0.
- Producción y Sommelier IA: no contactados.

## Automatización diaria en Runia Production

La sincronización productiva se ejecuta una vez por día mediante GitHub Actions,
a las 03:20 de Argentina (`20 6 * * *` UTC). Vercel Cron fue descartado porque
el plan Hobby limita las funciones a 5 minutos y el write real medido necesita
aproximadamente 9,5 minutos. El workflow tiene timeout de 30 minutos, permisos
de repositorio de sólo lectura y usa únicamente secrets server-side. No existe
un endpoint HTTP público capaz de disparar el write.

Cada invocación reclama primero un run en
`supplier_sync_automation_runs`. El RPC usa advisory lock y un índice único
parcial, por lo que una segunda ejecución queda registrada como
`skipped_concurrent` sin descargar ni escribir. GitHub Actions agrega un grupo
de concurrencia que no cancela un run activo. Un run abandonado sólo puede
recuperarse después del lease configurado.

El circuito es:

1. reclamar ejecución y validar identidad productiva;
2. descargar y validar las cuatro listas;
3. ejecutar dry-run contra el snapshot actual;
4. aplicar la política productiva versionada;
5. descargar nuevamente antes del write y exigir las mismas huellas y métricas;
6. aplicar el plan mediante `supplier_apply_sync`, transaccional e idempotente;
7. persistir resumen de dry-run, write, métricas y resultado de alerta.

Los baselines productivos aprobados son retail `3230`, wholesale `3227`,
business `3228`, cost `3875`, con `3916` productos: `3211 safe`, `6 blocked`,
`15 pending_review` y `684 supplier_only_cost`. Una lista por debajo del 95% o
por encima del 110%, duplicados, más de 0,1% de filas inválidas, una variación de
población superior al 2%, más del 25% de precios promovibles cambiando, nuevos
BLOCKED no aprobados, más de 12 BLOCKED o más de 30 PENDING_REVIEW bloquean el
write automático. Los cambios de precios superiores al 5% generan alerta sin
bloquear mientras permanezcan dentro del máximo automático.

Las alertas reutilizan Resend y son idempotentes por run. Un fallo de email se
registra pero nunca cambia el resultado del sync ni fuerza un write bloqueado.
