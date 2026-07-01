# Audit Logs

`audit_logs` es la tabla prevista para registrar operaciones sensibles de Runia Catalog System. Sales ya escribe eventos desde `lib/audit.ts`; el resto de los modulos se integrara de forma progresiva.

## Para Que Sirve

- Tener trazabilidad de cambios hechos desde el backoffice.
- Auditar importaciones y operaciones masivas.
- Investigar errores de carga, cambios de precio o modificaciones de productos.
- Preparar el producto para multiples clientes sin depender de logs externos.

## Tabla

Archivo de migracion:

```text
db/migrations/002_audit_logs.sql
```

Campos principales:

| Campo | Uso |
| --- | --- |
| tenant_id | Cliente al que pertenece el evento. |
| actor_type | Tipo de actor: admin, system, importer, customer. |
| actor_id | Identificador futuro del usuario, proceso o integracion. |
| actor_name | Nombre legible del actor. |
| entity_type | Tipo de entidad afectada: product, product_price, order, import_batch. |
| entity_id | ID de la entidad afectada. |
| action | Accion normalizada: updated, created, imported, status_changed. |
| before_json | Estado anterior cuando aplique. |
| after_json | Estado posterior cuando aplique. |
| metadata_json | Contexto adicional: origen, request id, archivo, fila de Excel. |
| created_at | Fecha del evento. |

## Eventos Previstos

### Producto Actualizado

```json
{
  "actor_type": "admin",
  "actor_id": "future-user-id",
  "entity_type": "product",
  "entity_id": "product-uuid",
  "action": "updated",
  "before_json": { "name": "Sahumerio Sagrada India" },
  "after_json": { "name": "Sahumerio Sagrada India Premium" },
  "metadata_json": { "source": "admin.products.edit" }
}
```

### Precio Actualizado

```json
{
  "actor_type": "admin",
  "entity_type": "product_price",
  "entity_id": "product-uuid",
  "action": "updated",
  "before_json": { "price_list": "minorista", "price": 1384 },
  "after_json": { "price_list": "minorista", "price": 1450 },
  "metadata_json": { "source": "admin.products.edit" }
}
```

### Sales Order Creado

```json
{
  "actor_type": "system",
  "entity_type": "sales_order",
  "entity_id": "order-uuid",
  "action": "sales_order.created",
  "after_json": { "status": "draft", "total": 12500, "items": [] },
  "metadata_json": null
}
```

### Importacion Ejecutada

```json
{
  "actor_type": "importer",
  "actor_name": "RB catalog import",
  "entity_type": "import_batch",
  "entity_id": "batch-uuid",
  "action": "imported",
  "after_json": { "products_created": 29, "errors": 0 },
  "metadata_json": { "file": "data/RB_CATALOGO_MASTER.xlsx" }
}
```

## Reglas Futuras

- No usar `audit_logs` como fuente de verdad operacional.
- Registrar eventos despues de confirmar que la escritura principal fue exitosa.
- Mantener `before_json` y `after_json` compactos: solo campos relevantes.
- No guardar secretos, passwords, tokens ni service role keys.
- Cuando exista autenticacion real, mapear `actor_id` al usuario autenticado.

## Pendiente

- Integrar `updateProduct()`, `updateProductPrice()` y `updateProductStatus()` con auditoria.
- Integrar Accounts con auditoria.
- Agregar `created_by`, `updated_by` y `change_log` si el modelo operativo lo requiere.
