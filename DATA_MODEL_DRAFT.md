# Data Model Draft

Este documento define un primer borrador del modelo de datos de Runia Catalog System. Debe convertirse luego en migraciones de Supabase.

El modelo toma a RB Distribuidora como primera implementacion, pero debe mantenerse preparado para futuros clientes.

La estructura queda alineada con el Google Sheet maestro definido en [docs/GOOGLE_SHEET_MASTER.md](./docs/GOOGLE_SHEET_MASTER.md).

## Entidades principales

```text
tenants
categories
brands
products
price_lists
product_prices
product_images
profiles
customer_accounts
account_contacts
account_addresses
sales_orders
sales_order_items
import_batches
import_rows
audit_logs
```

## tenants

Representa cada cliente/tenant que usa Runia Catalog System. Es la entidad raiz del modelo multi-tenant.

Campos sugeridos:

- id
- name
- slug
- status
- legal_name
- contact_email
- whatsapp_phone
- address
- website_url
- logo_url
- primary_color
- secondary_color
- currency
- minimum_order_amount
- minimum_purchase_amount
- default_price_list_id
- feature_public_catalog
- feature_orders
- feature_wholesale_login
- feature_multiple_price_lists
- feature_importer
- feature_images
- feature_stock
- feature_invoicing
- created_at
- updated_at

Uso inicial:

- RB Distribuidora debe existir como primer registro.
- La configuracion editable del cliente vive en `tenants` para V1. No se crea una tabla generica `settings` hasta que aparezca una necesidad real de configuracion dinamica no modelada.
- `NEXT_PUBLIC_TENANT_SLUG` define temporalmente que tenant opera la instancia de la app. A futuro puede reemplazarse por resolucion por dominio/subdominio.

## categories

Representa categorias de productos.

Campos sugeridos:

- id
- tenant_id
- name
- slug
- description
- parent_id
- sort_order
- is_active
- created_at
- updated_at

Origen en Google Sheet:

- Hoja `Categorías`.

Notas:

- `tenant_id` permite reutilizar el sistema con mas clientes.
- `parent_id` permite categorias anidadas en una version futura, aunque V1 puede usar solo un nivel.
- `sort_order` corresponde a la columna `orden`.

## brands

Representa marcas de productos.

Campos sugeridos:

- id
- tenant_id
- name
- slug
- adjustment_percentage
- is_active
- notes
- created_at
- updated_at

Origen en Google Sheet:

- Hoja `Marcas`.

Notas:

- `adjustment_percentage` queda preparado para aumentos masivos futuros.
- En V1 no implica aplicacion automatica de aumentos salvo decision posterior.

## products

Representa productos publicados en el catalogo.

Campos sugeridos:

- id
- tenant_id
- category_id
- brand_id
- sku
- product_line
- name
- slug
- variant
- description
- unit
- barcode
- is_active
- is_featured
- internal_notes
- source_row_id
- created_at
- updated_at

Origen en Google Sheet:

- Hoja `Productos`.

Notas:

- `sku` es obligatorio y unico por cliente.
- `category_id` se resuelve desde `categoria_id` cuando el Sheet lo informa. Si una carga temprana solo trae texto de categoria, debe resolverse contra `categories.name` antes de importar.
- `brand_id` se resuelve desde `marca_id` cuando el Sheet lo informa. Si una carga temprana solo trae texto de marca, debe resolverse contra `brands.name` antes de importar.
- `product_line` corresponde a la columna `linea` del Google Sheet. Es opcional y permite conservar la linea comercial detectada en catalogos como el PDF de RB.
- `name` corresponde a la columna `producto`.
- `variant` permite presentaciones, tamanos, sabores o formatos.
- Los precios no viven en `products`; se modelan en `product_prices`.
- Las fotos no viven en `products`; se modelan en `product_images`.
- `source_row_id` puede ayudar a rastrear importaciones.

Politica para productos sin marca visible:

- `brand_id` sigue siendo obligatorio a nivel de producto.
- Si el catalogo fuente no informa una marca visible, se debe usar una marca controlada llamada `Sin marca`.
- `Sin marca` debe existir en `brands` como registro activo del cliente.
- No usar `Sin marca` cuando la marca pueda inferirse con seguridad desde el PDF, proveedor o linea comercial.
- Los productos cargados con `Sin marca` deben quedar marcados para revision operativa antes de la carga completa.

## price_lists

Representa listas de precio disponibles por cliente.

Campos sugeridos:

- id
- tenant_id
- name
- slug
- visibility
- currency
- is_active
- created_at
- updated_at

Origen en Google Sheet:

- Hoja `Precios`, columna `lista_precio`.

Valores iniciales:

- Minorista
- Mayorista

Valores posibles de `visibility`:

- public
- wholesale
- admin

Notas:

- `Minorista` debe tener visibilidad publica.
- `Mayorista` debe requerir login mayorista o administrador.
- Este modelo permite agregar futuras listas sin alterar `products`.

## product_prices

Representa precios por producto y lista de precio.

Campos sugeridos:

- id
- tenant_id
- product_id
- price_list_id
- price
- currency
- valid_from
- is_active
- notes
- source_row_id
- created_at
- updated_at

Origen en Google Sheet:

- Hoja `Precios`.

Notas:

- Reemplaza los campos simples `consumer_price` y `wholesale_price`.
- Para V1, `Minorista` equivale al precio publico.
- Para V1, `Mayorista` equivale al precio visible con login.
- Debe existir como minimo un precio `Minorista` activo para productos publicados.
- Si el catalogo fuente trae un solo precio y no distingue con claridad entre `Minorista` y `Mayorista`, cargarlo como `Minorista` o como la lista base definida para el cliente. No inventar precios `Mayorista`.

## product_images

Representa fotos de productos.

Campos sugeridos:

- id
- tenant_id
- product_id
- source_url
- storage_path
- sort_order
- is_primary
- alt_text
- is_active
- created_at
- updated_at

Origen en Google Sheet:

- Hoja `Fotos`.

Notas:

- RB V1 no incluye carga de fotos, pero la estructura queda preparada.
- `source_url` permite importar desde una URL externa.
- `storage_path` permite guardar la imagen final en Supabase Storage.
- Un producto puede no tener imagen.

## profiles

Extiende usuarios autenticados de Supabase Auth.

Campos sugeridos:

- id
- auth_user_id
- tenant_id
- full_name
- email
- phone
- role
- is_active
- created_at
- updated_at

Roles iniciales:

- admin
- wholesale

Notas:

- Los visitantes publicos no necesitan registro.
- Los administradores gestionan productos, categorias y usuarios mayoristas.
- Los mayoristas ven precios de listas con visibilidad `wholesale`.

## customer_accounts

Representa accounts: entidades comerciales que pueden realizar pedidos y tener una lista de precios. En producto se nombran como `Accounts`; la tabla fisica conserva `customer_accounts` porque ya esta referenciada por pedidos.

Campos sugeridos:

- id
- tenant_id
- profile_id
- name
- legal_name
- tax_id
- email
- phone
- whatsapp_phone
- address
- price_list_id
- discount_percent
- status
- credit_limit
- commercial_terms
- metadata_json
- notes
- approved_at
- created_at
- updated_at

Origen en Google Sheet:

- Hoja `Clientes`.

Notas:

- No es necesario cargar todas las accounts comerciales en RB V1.
- `price_list_id` permite asignar `Mayorista` u otra lista futura.
- `status` reemplaza la idea simple de `is_active` y permite `active`, `inactive`, `pending` o `blocked`.
- `discount_percent` queda disponible para condiciones comerciales simples sin alterar precios base.
- `credit_limit` y `commercial_terms` quedan preparados para una etapa posterior; no se operan todavia desde UI.
- `profile_id` puede quedar vacio hasta crear el usuario de Supabase Auth.
- Esta entidad reemplaza el nombre anterior `wholesale_users` para representar mejor cuentas comerciales y no solo usuarios.
- `account_contacts` y `account_addresses` quedan preparados para multiples contactos y multiples direcciones sin exponer UI todavia.

## sales_orders

Representa pedidos comerciales del Sales Engine. Es la entidad operativa para el flujo account -> lista de precios -> productos -> pedido.

Campos sugeridos:

- id
- tenant_id
- account_id
- status
- price_list_id
- subtotal
- discount
- total
- notes
- metadata_json
- created_at
- updated_at

Estados iniciales:

- draft
- pending
- confirmed
- preparing
- delivered
- closed
- cancelled

Notas:

- No reutiliza `orders` del esquema inicial para evitar arrastrar un modelo limitado.
- `price_list_id` se resuelve desde la account o desde la lista default del tenant.
- `discount` guarda el monto calculado al momento del pedido.
- Las creaciones y ediciones deben registrar auditoria en `audit_logs`.

## sales_order_items

Representa items comerciales con snapshot de producto y precio.

Campos sugeridos:

- id
- tenant_id
- order_id
- product_id
- sku_snapshot
- product_name_snapshot
- variant_snapshot
- unit_price_snapshot
- quantity
- subtotal
- created_at

Notas:

- El pedido no debe depender solo del producto vivo.
- `sku_snapshot`, `product_name_snapshot` y `unit_price_snapshot` preservan el historico comercial.
- Si cambia el precio del producto luego de crear el pedido, el pedido reabierto conserva el snapshot.
- En edicion, items existentes conservan su `unit_price_snapshot`; items nuevos toman el precio vigente para la lista de la account.

## import_batches

Representa una importacion de datos desde Google Sheets o Excel.

Campos sugeridos:

- id
- tenant_id
- source_type
- source_name
- status
- total_rows
- successful_rows
- failed_rows
- created_by
- created_at
- completed_at

Valores posibles de `source_type`:

- google_sheets
- excel

Valores posibles de `status`:

- pending
- processing
- completed
- completed_with_errors
- failed

## import_rows

Detalle de filas procesadas durante una importacion.

Campos sugeridos:

- id
- tenant_id
- batch_id
- sheet_name
- row_number
- source_page
- raw_data
- target_table
- target_record_id
- status
- error_message
- notes
- created_at

Notas:

- `raw_data` puede ser JSONB.
- `sheet_name` permite auditar si el error vino de `Productos`, `Precios`, `Fotos`, `Clientes`, `Marcas` o `Categorías`.
- `target_table` y `target_record_id` permiten rastrear que registro se creo o actualizo.
- `source_page`, `notes`, `pagina_pdf` y observaciones de carga son datos internos de auditoria. No deben mostrarse en el catalogo publico ni formar parte del detalle comercial visible.
- Permite auditar errores de carga y corregir datos.

## audit_logs

Registro de auditoria para operaciones sensibles.

Campos sugeridos:

- id
- tenant_id
- actor_type
- actor_id
- actor_name
- entity_type
- entity_id
- action
- before_json
- after_json
- metadata_json
- created_at

Ejemplos:

- producto actualizado
- precio actualizado
- pedido creado
- importacion ejecutada

Notas:

- La tabla queda creada en `002_audit_logs.sql`.
- Sales ya escribe auditoria mediante `lib/audit.ts`. Products y Accounts quedan pendientes de integracion.
- Debe integrarse antes de ampliar escrituras administrativas criticas.

## Relaciones iniciales

```text
tenants 1 - N categories
tenants 1 - N brands
tenants 1 - N products
tenants 1 - N price_lists
tenants 1 - N product_prices
tenants 1 - N product_images
tenants 1 - N profiles
tenants 1 - N customer_accounts
tenants 1 - N account_contacts
tenants 1 - N account_addresses
tenants 1 - N sales_orders
tenants 1 - N sales_order_items
tenants 1 - N import_batches
tenants 1 - N audit_logs
categories 1 - N products
brands 1 - N products
products 1 - N product_prices
products 1 - N product_images
price_lists 1 - N product_prices
price_lists 1 - N customer_accounts
profiles 1 - N customer_accounts
customer_accounts 1 - N account_contacts
customer_accounts 1 - N account_addresses
customer_accounts 1 - N sales_orders
sales_orders 1 - N sales_order_items
products 1 - N sales_order_items
import_batches 1 - N import_rows
```

## Reglas de acceso sugeridas

- Productos activos, categorias activas y marcas activas pueden leerse publicamente.
- Precios de listas con visibilidad `public` pueden mostrarse publicamente.
- Precios de listas con visibilidad `wholesale` solo pueden mostrarse a usuarios con rol `wholesale` o `admin`.
- Solo `admin` puede crear, editar o desactivar productos, categorias, marcas, precios y fotos.
- Solo `admin` puede gestionar accounts comerciales.
- Solo `admin` puede ejecutar o revisar importaciones.

## Hojas del Google Sheet maestro

```text
Categorías -> categories
Marcas -> brands
Productos -> products
Precios -> price_lists + product_prices
Clientes -> customer_accounts + profiles
Fotos -> product_images
```

## Columnas minimas por hoja

### Productos

```text
sku
categoria_id
marca_id
linea
producto
activo
```

### Precios

```text
sku
lista_precio
precio
activo
```

### Categorías

```text
categoria_id
categoria
activo
```

### Marcas

```text
marca_id
marca
activo
```

### Clientes

```text
email
nombre
lista_precio
activo
```

### Fotos

```text
sku
url_foto
activo
```

## Decisiones pendientes

- Confirmar si V1 necesita guardar pedidos en base de datos o solo enviarlos por WhatsApp.
- Confirmar si RB Distribuidora necesita mas listas ademas de `Minorista` y `Mayorista`.
- Confirmar formato final del Google Sheet real de RB Distribuidora.
- Confirmar si los usuarios mayoristas seran creados manualmente por admin o invitados desde el sitio.
- Confirmar si los ajustes por marca seran solo informativos o aplicables desde una herramienta futura.

## Decisiones cerradas por piloto RB

- El modelo base `categories`, `brands`, `products`, `price_lists` y `product_prices` funciona con una muestra real de 29 productos/variantes.
- `products.product_line` queda incorporado para conservar la linea comercial del catalogo fuente.
- Los SKUs internos secuenciales por cliente son validos para RB cuando no existan codigos internos confiables. Formato inicial validado: `RB-000001`.
- La marca controlada `Sin marca` queda permitida solo para productos sin marca visible y debe revisarse antes de carga completa.
- Los precios mayoristas no deben inventarse. Si el PDF no distingue listas, se carga solo la lista base definida.
- `pagina_pdf`, observaciones y notas de importacion son auditoria interna, no datos publicos.
- La arquitectura base usa `tenants` y `tenant_id` desde las migraciones iniciales.
- La configuracion administrable del tenant se modela como columnas en `tenants` para V1: empresa, branding, configuracion comercial y feature flags.
- Los settings dinamicos key/value quedan descartados por ahora para evitar configuracion opaca antes de tener casos reales.
