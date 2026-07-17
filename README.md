# Runia Catalog System

Runia Catalog System es un sistema de catalogo digital mayorista/minorista pensado como producto reutilizable para distribuidoras, comercios y proveedores que necesitan publicar productos, recibir pedidos y administrar precios diferenciados.

RB Distribuidora es el cliente inicial y la primera implementacion del producto.

## Objetivo del proyecto

Construir una plataforma base que permita:

- Publicar un catalogo publico de productos.
- Mostrar precios de consumidor final sin login.
- Mostrar precios mayoristas solo a usuarios autenticados.
- Armar pedidos desde un carrito.
- Enviar pedidos por WhatsApp.
- Administrar productos, categorias y usuarios mayoristas.
- Importar productos desde Google Sheets o archivos Excel.

La primera version incluye desarrollo, implementacion y carga inicial de productos sin fotos para RB Distribuidora.

## Stack previsto

- Next.js para frontend, backend liviano y rutas de aplicacion.
- Supabase para base de datos, autenticacion y permisos.
- Supabase Storage para archivos futuros, especialmente imagenes de productos.
- Vercel para deploy.
- Google Sheets como fuente de carga inicial y posible herramienta operativa temprana.

## Cliente inicial

**RB Distribuidora**

RB Distribuidora acepto la propuesta comercial de Runia System y pago seña. Esta implementacion debe resolver sus necesidades de catalogo y pedidos, pero el codigo, la base de datos y la documentacion deben mantenerse preparados para futuros clientes.

## Documentacion interna

- [ALCANCE_RB_V1.md](./ALCANCE_RB_V1.md): alcance funcional y limites de la primera version.
- [ROADMAP.md](./ROADMAP.md): etapas previstas del producto.
- [DATA_MODEL_DRAFT.md](./DATA_MODEL_DRAFT.md): borrador inicial del modelo de datos.
- [docs/GOOGLE_SHEET_MASTER.md](./docs/GOOGLE_SHEET_MASTER.md): estructura del Google Sheet maestro para carga inicial.
- [docs/TEMPLATE_CARGA_RB.md](./docs/TEMPLATE_CARGA_RB.md): proceso operativo para convertir el PDF de RB en datos estructurados.
- [docs/PILOTO_CARGA_RB.md](./docs/PILOTO_CARGA_RB.md): muestra piloto real usada para validar el modelo.
- [db/migrations/001_initial_schema.sql](./db/migrations/001_initial_schema.sql): migracion inicial de Supabase.
- [db/migrations/002_audit_logs.sql](./db/migrations/002_audit_logs.sql): tabla de auditoria futura para operaciones sensibles.
- [db/migrations/003_tenant_settings.sql](./db/migrations/003_tenant_settings.sql): configuracion multi-tenant, branding, settings comerciales y feature flags.
- [db/migrations/004_accounts.sql](./db/migrations/004_accounts.sql): accounts comerciales, condiciones basicas y estructura futura de contactos/direcciones.
- [db/migrations/005_sales.sql](./db/migrations/005_sales.sql): Sales Engine con pedidos comerciales e items con snapshot.
- [db/migrations/006_pricing_engine.sql](./db/migrations/006_pricing_engine.sql): costos, reglas por lista y precios calculados con margen.
- [db/migrations/009_runia_setup_engine_v0.sql](./db/migrations/009_runia_setup_engine_v0.sql): Setup Engine, RPC transaccional, estado setup y default único por tenant.
- [db/seed/001_rb_seed.sql](./db/seed/001_rb_seed.sql): seed inicial de RB Distribuidora.
- [docs/AUDIT_LOGS.md](./docs/AUDIT_LOGS.md): estrategia de auditoria futura.
- [scripts/imports/import-rb-catalog.ts](./scripts/imports/import-rb-catalog.ts): importador del catalogo piloto de RB a Supabase.
- [modules/imports](./modules/imports): motor compartido de lectura, validacion, preview e importacion para CLI y panel web.
- [modules/catalog](./modules/catalog): lecturas publicas, filtros, lista de precios, detalle y consulta por WhatsApp.
- [docs/IMPORT_REPORT_EXAMPLE.md](./docs/IMPORT_REPORT_EXAMPLE.md): estructura del reporte JSON del importador.
- [docs/RUNIA_COMMERCE_SDK_SPEC.md](./docs/RUNIA_COMMERCE_SDK_SPEC.md): especificacion estrategica y tecnica de Runia Commerce SDK.
- [docs/RUNIA_COMMERCE_SDK_V1.md](./docs/RUNIA_COMMERCE_SDK_V1.md): API implementada del SDK interno server-only, ejemplos, errores y guia de integracion.
- [docs/RUNIA_COMMERCE_PERFORMANCE.md](./docs/RUNIA_COMMERCE_PERFORMANCE.md): contrato y linea base de rendimiento de Runia Commerce.
- [docs/RUNIA_SETUP_ENGINE_V0.md](./docs/RUNIA_SETUP_ENGINE_V0.md): alcance, arquitectura, seguridad, despliegue y QA del alta interna transaccional.
- [docs/RUNIA_DOMAIN_ARCHITECTURE.md](./docs/RUNIA_DOMAIN_ARCHITECTURE.md): arquitectura oficial del Domain Layer y sus limites con Repository, API, SDK y Runia Web.

## Estructura propuesta

```text
runia-catalog-system/
  README.md
  ALCANCE_RB_V1.md
  ROADMAP.md
  DATA_MODEL_DRAFT.md
  app/
    layout.tsx
    page.tsx
    catalogo/
      page.tsx
  components/
    ProductCard.tsx
  lib/
    supabaseClient.ts
    catalog.ts
  sdk/
    server/
      createCommerceClient.ts
      products.ts
      categories.ts
      brands.ts
      pricing.ts
      tenant.ts
      types.ts
      errors.ts
      index.ts
  modules/
    tenants/
      queries.ts
      commands.ts
      mapper.ts
      validators.ts
      types.ts
    workspace/
      queries.ts
      mapper.ts
      types.ts
  db/
    migrations/
      001_initial_schema.sql
      002_audit_logs.sql
      003_tenant_settings.sql
      004_accounts.sql
      005_sales.sql
      006_pricing_engine.sql
      009_runia_setup_engine_v0.sql
    seed/
      001_rb_seed.sql
  scripts/
    imports/
      import-rb-catalog.ts
  docs/
    GOOGLE_SHEET_MASTER.md
    TEMPLATE_CARGA_RB.md
    PILOTO_CARGA_RB.md
    IMPORT_REPORT_EXAMPLE.md
```

## Base de datos

Las migraciones iniciales estan preparadas para ejecutarse manualmente en Supabase SQL Editor.

Orden de ejecucion:

1. Abrir Supabase SQL Editor.
2. Copiar y ejecutar `db/migrations/001_initial_schema.sql`.
3. Copiar y ejecutar `db/migrations/002_audit_logs.sql`.
4. Copiar y ejecutar `db/migrations/003_tenant_settings.sql`.
5. Copiar y ejecutar `db/migrations/004_accounts.sql`.
6. Copiar y ejecutar `db/migrations/005_sales.sql`.
7. Copiar y ejecutar `db/migrations/006_pricing_engine.sql`.
8. Copiar y ejecutar `db/seed/001_rb_seed.sql`.
9. Verificar que existan el tenant `RB Distribuidora`, las listas `Minorista` y `Mayorista`, la marca controlada `Sin marca`, las categorias base, la tabla `audit_logs`, las columnas de configuracion en `tenants`, las columnas comerciales en `customer_accounts`, las tablas `sales_orders` / `sales_order_items` y las columnas del Pricing Engine.

Notas tecnicas:

- La migracion usa `gen_random_uuid()` y habilita `pgcrypto`.
- `updated_at` se actualiza con el trigger generico `update_updated_at_column()`.
- RLS queda pendiente para una etapa posterior del MVP.
- Los precios mayoristas no se inventan si la fuente no los distingue.
- Los precios existentes e importados conservan modo `manual`. El modo `cost_plus_percent` solo se activa mediante una accion explicita del panel.
- En precios calculados se usa `costo * (1 + margen / 100)`. El override por producto/lista tiene prioridad sobre el margen general de la lista.
- `source_page`, notas y observaciones son auditoria interna.
- `audit_logs` queda preparada para registrar cambios futuros. Sales ya registra creacion y edicion mediante `lib/audit.ts`; Products y Accounts quedan pendientes.
- `tenants` concentra configuracion editable del cliente: empresa, branding, settings comerciales y feature flags.
- `customer_accounts` se opera desde el producto como `Accounts`: entidades comerciales con lista de precios, descuento, estado y estructura futura para contactos/direcciones.
- `sales_orders` y `sales_order_items` concentran el Sales Engine. Los items guardan snapshots de SKU, nombre y precio para preservar historico.

## Importacion RB

El primer importador real carga `data/RB_CATALOGO_MASTER.xlsx` en Supabase en este orden:

```text
Categorias -> Marcas -> Productos -> Precios
```

Variables requeridas:

```text
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
RB_TENANT_SLUG=rb-distribuidora
RB_CATALOG_XLSX=data/RB_CATALOGO_MASTER.xlsx
```

Instalacion:

```bash
npm install
cp .env.example .env
```

En Windows PowerShell, crear `.env` copiando `.env.example` y completando las credenciales de Supabase.

Flujo recomendado:

1. Editar el Google Sheet maestro.
2. Exportar como XLSX a `data/RB_CATALOGO_MASTER.xlsx`.
3. Ejecutar preview:

```bash
npm run import:rb:dry
```

4. Corregir errores reportados en el Excel.
5. Ejecutar import real:

```bash
npm run import:rb
```

Tambien se puede ejecutar preview con:

```bash
npm run import:rb -- --dry-run
```

Cada ejecucion genera un reporte en `reports/import-rb-YYYYMMDD-HHMM.json`.

El mismo motor esta disponible en `/admin/importador`:

1. Seleccionar un `.xlsx` de hasta 4 MB.
2. Ejecutar la validacion sin escrituras.
3. Revisar altas, actualizaciones y errores por hoja/fila/campo.
4. Confirmar la importacion solamente cuando el preview no tenga errores.
5. Consultar el resultado y el historial de `import_batches` desde el panel.

La confirmacion vuelve a validar el archivo y el estado actual del tenant antes de escribir. Cada fila procesada queda registrada en `import_rows` y el resultado del batch se registra en `audit_logs`.

Validacion en Supabase SQL Editor:

```sql
select count(*) from products p
join tenants t on t.id = p.tenant_id
where t.slug = 'rb-distribuidora';

select count(*) from product_prices pp
join tenants t on t.id = pp.tenant_id
where t.slug = 'rb-distribuidora';

select status, summary_json
from import_batches
order by created_at desc
limit 1;
```

Criterio esperado para el piloto: `29` productos y `29` precios cargados para RB.

## Desarrollo local

Variables requeridas para la app:

```text
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_TENANT_SLUG=rb-distribuidora
ADMIN_PASSWORD=change-this-admin-password
RUNIA_INTERNAL_PASSWORD=change-this-separate-setup-password
SUPABASE_SERVICE_ROLE_KEY=server-only-service-role
```

Sólo las variables con prefijo `NEXT_PUBLIC` llegan al navegador. `ADMIN_PASSWORD`, `RUNIA_INTERNAL_PASSWORD` y `SUPABASE_SERVICE_ROLE_KEY` son server-only. `NEXT_PUBLIC_TENANT_SLUG` define qué tenant opera la app actual.

Comandos:

```bash
npm install
npm run dev
npm run test:sdk
npm run test:setup
npm run test:contracts
```

## Runia Commerce SDK interno v1.1

Las webs nuevas deben consumir Commerce exclusivamente desde el SDK server-only:

```ts
import { createCommerceClient } from '@/sdk/server';

export async function loadPage() {
  const commerce = createCommerceClient({
    tenantSlug: 'rb-distribuidora',
  });

  const [tenant, featured] = await Promise.all([
    commerce.tenant.getPublicConfig(),
    commerce.products.featured({ limit: 6 }),
  ]);

  return { tenant, featured };
}
```

Crear el cliente por request o render. La instancia memoiza sólo la resolución del tenant durante su propia vida; productos y precios no se cachean indefinidamente.

API v1.1:

- `commerce.tenant.getPublicConfig()`;
- `commerce.tenant.buildWhatsAppUrl({ message })`;
- `commerce.products.featured({ limit, category, brand })`;
- `commerce.products.list()`;
- `commerce.products.getBySku()`;
- `commerce.categories.list()`;
- `commerce.brands.list()`;
- `commerce.pricing.resolve()`;
- `commerce.errors.isNotFound(error)` y `commerce.errors.hasCode(error, code)`.

`featured()` aplica aislamiento por tenant, visibilidad, precio público, límite seguro y orden estable. El helper de WhatsApp normaliza el número público y devuelve un estado controlado cuando no está configurado. Los errores públicos usan códigos estables sin filtrar errores de Supabase.

El SDK no incluye React, hooks, JSX, CSS ni componentes. No debe importarse desde Client Components y no expone Supabase, adapters, `tenant_id`, `price_lists` o secrets. Ver [documentación v1.1](./docs/RUNIA_COMMERCE_SDK_V1.md) y [QA de la segunda implementación](./docs/SDK_SECOND_IMPLEMENTATION_QA.md).

`tenant.getPublicConfig()` incluye `features.showPrices`, configurado por Setup Engine. Es una preferencia pública de presentación; Commerce sigue resolviendo el precio autoritativo.

## Runia Setup Engine v0

`/runia/setup` es la herramienta interna para crear un motor Commerce sin ejecutar SQL por tenant. Configura identidad, contacto, moneda, locale, mínimos, funcionalidades, listas, lista pública default y datos públicos básicos. La confirmación ejecuta una RPC PostgreSQL única e idempotente por slug.

La ruta usa `RUNIA_INTERNAL_PASSWORD` y una cookie HMAC propia. Una sesión de `/admin` no concede acceso a Setup. Todas las escrituras son server-side y la RPC sólo puede ejecutarse con `service_role`.

Antes de usarla se debe aplicar [009_runia_setup_engine_v0.sql](./db/migrations/009_runia_setup_engine_v0.sql) mediante el pipeline de migraciones. Ver [documentación completa](./docs/RUNIA_SETUP_ENGINE_V0.md).

Rutas iniciales:

- `/`: home de Runia Catalog System.
- `/catalogo`: catalogo publico configurable con busqueda, filtros por categoria/marca, orden y la lista publica/default del tenant.
- `/catalogo/[sku]`: detalle publico del producto y consulta por WhatsApp usando el numero configurado en el tenant.
- `/demo-commerce`: segunda experiencia pública editorial; usa selección destacada, búsqueda, filtros e índice completo mediante el SDK.
- `/demo-commerce/[sku]`: detalle editorial con WhatsApp y not-found resueltos por contratos públicos del SDK.
- `/runia`: consola central SaaS para listar tenants y entrar al workspace de un cliente.
- `/runia/setup`: Setup Engine interno con autenticación independiente.
- `/runia/tenants/new`: redirige al Setup Engine transaccional.
- `/admin`: Commercial Workspace con quick actions, trabajo pendiente, actividad reciente y resumen operativo.
- `/admin/productos`: listado y edicion de productos.
- `/admin/precios`: gestion de listas Minorista y Mayorista, edicion inline y acciones masivas auditadas.
- `/admin/accounts`: listado, creacion y edicion de accounts comerciales.
- `/admin/sales`: modulo funcional de Pedidos; conserva `sales` como nombre tecnico interno.
- `/admin/pedidos`: alias que redirige al modulo funcional `/admin/sales`.
- `/admin/importador`: carga XLSX con preview, errores bloqueantes, confirmacion e historial.
- `/admin/categorias`, `/admin/marcas`: secciones preparadas con estado `Proximamente`.
- `/admin/configuracion`: configuracion editable del tenant, branding, comercio y feature flags.

La app no usa `SUPABASE_SERVICE_ROLE_KEY` en frontend. Esa clave queda reservada para scripts operativos como el importador.

Backoffice:

- Layout propio oscuro con menu lateral.
- Dashboard convertido en Commercial Workspace con conteos reales desde Supabase, actividad desde `audit_logs` e indicadores visuales en el sidebar.
- `/runia` es el nivel superior interno de Runia. Permite crear tenants, ver metricas por cliente y seleccionar el tenant operativo antes de entrar a `/admin`.
- Al entrar a un tenant desde `/runia`, la app guarda una seleccion segura en cookie httpOnly. Si no hay seleccion, usa `NEXT_PUBLIC_TENANT_SLUG` como fallback.
- `/admin` y `/admin/*` requieren sesion simple con cookie httpOnly.
- `/runia` y el workspace central usan la sesión de `ADMIN_PASSWORD`.
- `/runia/setup` usa una sesión independiente basada en `RUNIA_INTERNAL_PASSWORD`.
- `/admin/login` es publico y valida contra `ADMIN_PASSWORD`.
- `ADMIN_PASSWORD` nunca debe tener prefijo `NEXT_PUBLIC`.
- `RUNIA_INTERNAL_PASSWORD` y `SUPABASE_SERVICE_ROLE_KEY` tampoco deben tener prefijo `NEXT_PUBLIC`.
- `/catalogo` y `/` siguen siendo publicos.
- Sin Supabase Auth, roles, carrito ni checkout en esta etapa.

Prueba del guard admin:

```bash
npm run dev
```

1. Abrir `/admin`: debe redirigir a `/admin/login`.
2. Ingresar la contraseña configurada en `ADMIN_PASSWORD`.
3. Confirmar acceso al dashboard.
4. Usar `Salir` en el menu lateral.
5. Abrir `/catalogo`: debe seguir siendo publico.

## Principios de producto

- RB Distribuidora es la primera implementacion, no un desarrollo aislado.
- Las reglas especificas de cada cliente deben modelarse como configuracion o datos, no como codigo rigido.
- El catalogo debe funcionar con productos sin fotos en V1.
- El flujo de pedido debe ser simple: catalogo, carrito y envio por WhatsApp.
- El panel administrador debe priorizar carga, mantenimiento y correccion rapida de datos.

## Proximo paso recomendado

Aplicar `009_runia_setup_engine_v0.sql`, ejecutar el E2E de creación sobre un tenant de QA y usar el SDK interno como único acceso Commerce en la próxima web Runia.
