# Sales UX - Implementacion y QA

## Alcance implementado

- Busqueda local por nombre, SKU, marca, variante y linea.
- Resultados navegables con flechas y seleccion con Enter.
- Alta repetida del mismo producto incrementando su cantidad.
- Edicion de cantidad, eliminacion y reordenamiento sin recarga.
- Persistencia del orden mediante `sales_orders.metadata_json.item_order_skus`.
- Resumen lateral sticky con cantidad de productos, subtotal, descuento y total.
- Atajos `Ctrl/Cmd + S` para guardar y `Escape` para cancelar.
- Duplicacion segura desde el listado mediante `duplicateSalesOrder()`.
- Accion futura de WhatsApp aislada en `SalesOrderActions`.

No se agregaron tablas, columnas ni migraciones.

## Medicion

Entorno de prueba: tenant `rb-distribuidora`, 29 productos, 29 productos con marca, 0 Accounts y 0 pedidos.

| Prueba | Resultado |
| --- | ---: |
| Carga de opciones Sales desde Supabase | 940.5 ms |
| 10.000 ejecuciones del filtro local | 353.2 ms |
| Promedio por filtro local | 0.0353 ms |
| `/admin/sales/new` en caliente, servidor dev | 1.324,5 ms |
| Build de produccion | Correcto |
| TypeScript estricto | Correcto |

El tiempo del filtro queda muy por debajo de un frame de 16,7 ms para el catalogo piloto. El tiempo de ruta incluye consultas remotas a Supabase y render del servidor; no representa la latencia del buscador una vez cargado.

## Validaciones

- Las opciones Sales cargan los 29 productos y su marca.
- `/admin/sales` y `/admin/sales/new` responden HTTP 200 sin errores de aplicacion o Supabase.
- Una duplicacion con pedido inexistente se rechaza sin escrituras.
- La duplicacion valida tenant, pedido fuente, Account activa, lista activa, productos activos y precios actuales.
- El pedido duplicado usa estado `draft`, fechas nuevas y auditoria propia con referencia al pedido fuente.
- El orden enviado por el editor se guarda en metadata existente y se reaplica al leer el detalle.

## Pendientes de QA

No se pudo medir el flujo completo Account -> items -> guardado -> reapertura -> duplicacion porque el tenant no tiene Accounts ni pedidos y este sprint excluye modificar Supabase. La medicion operativa de menos de un minuto debe repetirse con una Account real.

## Mejoras detectadas

1. Convertir la escritura de cabecera e items en una operacion transaccional mediante RPC antes de uso comercial intensivo. Actualmente el update conserva el flujo previo de actualizar, eliminar items y reinsertarlos.
2. Medir carga y filtrado con catalogos de 5.000 o mas productos. Para ese volumen puede convenir un indice de busqueda entregado por segmentos.
3. Habilitar WhatsApp solamente cuando exista una politica definida de telefono, plantilla, encoding y auditoria del envio.
