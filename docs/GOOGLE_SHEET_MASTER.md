# Google Sheet Maestro - RB Distribuidora

Este documento define la estructura definitiva del Google Sheet maestro para la carga inicial de productos y precios de RB Distribuidora en Runia Catalog System.

El Sheet sera la fuente inicial de datos. No reemplaza al panel administrador ni implica automatizacion permanente en V1.

## Reglas generales

- No cambiar los nombres exactos de las hojas.
- No cambiar los nombres exactos de las columnas.
- Usar una fila por registro.
- No dejar filas intermedias vacias.
- Usar `SI` o `NO` para columnas booleanas visibles al cliente.
- Usar precios numericos sin simbolo de moneda.
- Mantener `sku` como identificador principal de producto.
- Si el cliente no tiene codigos internos confiables, usar SKUs internos secuenciales por cliente. Para RB, el formato validado es `RB-000001`.
- Los textos deben cargarse sin formato especial.
- Las hojas deben cargarse en este orden recomendado: `Categorías`, `Marcas`, `Productos`, `Precios`, `Clientes`, `Fotos`.

## 1. Productos

Nombre exacto de la hoja: `Productos`

Uso: define los productos base del catalogo.

| Columna | Tipo esperado | Obligatorio | Ejemplo | Reglas de validacion | Observaciones para importacion |
|---|---|---:|---|---|---|
| sku | Texto | Si | RB-000001 | Debe ser unico. No puede estar vacio. No debe cambiar una vez importado. | Identificador principal para relacionar precios y fotos. |
| categoria_id | Texto | Si | CAT001 | Debe existir en la hoja `Categorías`. | Relaciona el producto con `categories`. Evita errores por texto de categoria. |
| marca_id | Texto | Si | MAR001 | Debe existir en la hoja `Marcas`. | Relaciona el producto con `brands`. Puede apuntar a `Sin marca` si no hay marca visible. |
| linea | Texto | No | Sagrada India | Puede estar vacio. | Linea comercial del PDF o catalogo fuente. Se importara como `products.product_line`. |
| producto | Texto | Si | Detergente liquido | No puede estar vacio. | Nombre principal visible del producto. |
| variante | Texto | No | 500 ml | Puede estar vacio. | Diferencia presentaciones, tamanos, sabores o formatos. |
| descripcion | Texto | No | Detergente liquido para ropa | Puede estar vacio. | Texto visible en detalle de producto. |
| unidad | Texto | No | unidad | Valores sugeridos: unidad, pack, caja, kg, litro. | Ayuda a mostrar presentacion comercial. |
| codigo_barra | Texto | No | 7791234567890 | Puede estar vacio. Si se usa, debe mantenerse como texto. | Dato auxiliar para busqueda o conciliacion futura. |
| activo | Texto SI/NO | Si | SI | Solo admite `SI` o `NO`. | `SI` publica el producto; `NO` lo deja oculto. |
| destacado | Texto SI/NO | No | NO | Si se informa, solo admite `SI` o `NO`. | Puede usarse para ordenar o destacar en futuras vistas. |
| notas_internas | Texto | No | Revisar precio antes de publicar | Puede estar vacio. | No debe mostrarse en el catalogo publico. |

Reglas importantes:

- `sku` es obligatorio y unico.
- `categoria_id` es obligatorio.
- `marca_id` es obligatorio.
- `linea` es opcional.
- `producto` es obligatorio.
- `variante` es opcional.
- `activo` debe ser `SI` o `NO`.
- No cargar precios en esta hoja.
- No cargar URLs de fotos en esta hoja.
- Si el producto no tiene marca visible, usar el `marca_id` correspondiente a la marca controlada `Sin marca`.
- `pagina_pdf`, notas de revision y observaciones de carga pueden usarse en planillas auxiliares, pero son auditoria interna y no datos publicos del catalogo.

## 2. Precios

Nombre exacto de la hoja: `Precios`

Uso: define precios por producto y lista de precio.

| Columna | Tipo esperado | Obligatorio | Ejemplo | Reglas de validacion | Observaciones para importacion |
|---|---|---:|---|---|---|
| sku | Texto | Si | RB-0001 | Debe existir en `Productos`. | Relaciona el precio con el producto. |
| lista_precio | Texto | Si | Minorista | Valores admitidos V1: `Minorista`, `Mayorista`. | Define que publico puede ver el precio. |
| precio | Numero decimal | Si | 1250.50 | Debe ser mayor o igual a 0. No usar simbolo `$`. | Se importara a `product_prices`. |
| moneda | Texto | No | ARS | Valor sugerido V1: `ARS`. | Si esta vacio, se asume `ARS`. |
| activo | Texto SI/NO | Si | SI | Solo admite `SI` o `NO`. | Permite desactivar un precio sin borrar el producto. |
| vigencia_desde | Fecha | No | 2026-06-24 | Formato recomendado: `AAAA-MM-DD`. | Preparado para control futuro de vigencia. |
| notas | Texto | No | Precio actualizado por lista junio | Puede estar vacio. | No se muestra al cliente. |

Reglas importantes:

- `sku` es obligatorio.
- `lista_precio` es obligatoria.
- `precio` es obligatorio.
- Debe soportar como minimo `Minorista` y `Mayorista`.
- Para cada `sku`, deberia existir un precio `Minorista`.
- Para productos con venta mayorista, solo debe existir un precio `Mayorista` si RB lo informa o define explicitamente.
- Si el catalogo fuente trae un solo precio y no distingue listas, cargarlo como `Minorista` o como lista base definida para el cliente.
- No inventar precios `Mayorista`.

## 3. Fotos

Nombre exacto de la hoja: `Fotos`

Uso: deja preparada la estructura para imagenes de productos. En RB V1 es opcional porque la carga inicial contratada no incluye fotos.

| Columna | Tipo esperado | Obligatorio | Ejemplo | Reglas de validacion | Observaciones para importacion |
|---|---|---:|---|---|---|
| sku | Texto | Si | RB-0001 | Debe existir en `Productos`. | Relaciona la foto con el producto. |
| url_foto | URL o texto | Si | https://example.com/foto.jpg | Debe ser una URL accesible si se importa automaticamente. | Puede copiarse luego a Supabase Storage. |
| orden | Numero entero | No | 1 | Debe ser mayor o igual a 1. | Permite varias fotos por producto. |
| principal | Texto SI/NO | No | SI | Solo admite `SI` o `NO`. | Si hay varias, una sola deberia ser principal. |
| alt_text | Texto | No | Detergente liquido 500 ml | Puede estar vacio. | Texto alternativo para accesibilidad y SEO. |
| activo | Texto SI/NO | Si | SI | Solo admite `SI` o `NO`. | Permite ocultar fotos sin borrarlas. |

Reglas importantes:

- La hoja puede quedar vacia en RB V1.
- No bloquear la importacion de productos si esta hoja no tiene registros.
- La estructura debe conservarse para una futura carga de fotos.

## 4. Clientes

Nombre exacto de la hoja: `Clientes`

Uso: define clientes mayoristas o usuarios que podran acceder a lista mayorista. No es necesario cargar todos los clientes ahora.

| Columna | Tipo esperado | Obligatorio | Ejemplo | Reglas de validacion | Observaciones para importacion |
|---|---|---:|---|---|---|
| email | Email | Si | cliente@empresa.com | Debe tener formato de email. Debe ser unico por cliente. | Se usara para crear o vincular usuario mayorista. |
| nombre | Texto | Si | Juan Perez | No puede estar vacio. | Nombre de contacto. |
| razon_social | Texto | No | Autoservicio Centro SRL | Puede estar vacio. | Dato comercial del mayorista. |
| telefono | Texto | No | 3515555555 | Mantener como texto. | Puede usarse para contacto manual. |
| cuit | Texto | No | 30-12345678-9 | Mantener como texto. | Dato comercial opcional. |
| direccion | Texto | No | Av. Siempre Viva 123 | Puede estar vacio. | Dato comercial opcional. |
| lista_precio | Texto | Si | Mayorista | Valor admitido V1: `Mayorista`. | Define que lista puede ver el cliente autenticado. |
| activo | Texto SI/NO | Si | SI | Solo admite `SI` o `NO`. | `SI` habilita acceso; `NO` lo deshabilita. |
| notas | Texto | No | Cliente aprobado por RB | Puede estar vacio. | No se muestra al cliente. |

Reglas importantes:

- Esta hoja es para usuarios/clientes mayoristas.
- No es obligatorio cargar todos los clientes de RB en V1.
- `lista_precio` debe permitir `Mayorista`.
- La creacion de credenciales puede requerir un paso manual o flujo de invitacion, segun implementacion final.

## 5. Marcas

Nombre exacto de la hoja: `Marcas`

Uso: define marcas disponibles y deja preparado el ajuste porcentual futuro para aumentos masivos.

| Columna | Tipo esperado | Obligatorio | Ejemplo | Reglas de validacion | Observaciones para importacion |
|---|---|---:|---|---|---|
| marca_id | Texto | Si | MAR001 | Debe ser unico. No puede estar vacio. | Codigo operativo de marca para importacion. |
| marca | Texto | Si | Marca Ejemplo | Debe ser unica. No puede estar vacia. | Se importara como `brands.name`. |
| activo | Texto SI/NO | Si | SI | Solo admite `SI` o `NO`. | Permite ocultar o dejar de usar una marca. |
| ajuste_porcentaje | Numero decimal | No | 12.5 | Puede ser 0 o estar vacio. No usar simbolo `%`. | Preparado para aumentos masivos futuros. |
| notas | Texto | No | Proveedor actualiza trimestralmente | Puede estar vacio. | Uso interno. |

Reglas importantes:

- `marca_id` debe coincidir exactamente con la columna `marca_id` de `Productos`.
- `ajuste_porcentaje` no se aplicara automaticamente en V1 salvo decision tecnica posterior.
- Debe existir una marca controlada `Sin marca` cuando el catalogo tenga productos sin marca visible.
- `Sin marca` no debe usarse para evitar normalizar marcas reales. Solo aplica cuando la marca no este clara en la fuente.

## 6. Categorías

Nombre exacto de la hoja: `Categorías`

Uso: define las categorias visibles del catalogo.

| Columna | Tipo esperado | Obligatorio | Ejemplo | Reglas de validacion | Observaciones para importacion |
|---|---|---:|---|---|---|
| categoria_id | Texto | Si | CAT001 | Debe ser unico. No puede estar vacio. | Codigo operativo de categoria para importacion. |
| categoria | Texto | Si | Limpieza | Debe ser unica. No puede estar vacia. | Se importara como `categories.name`. |
| categoria_padre | Texto | No | Hogar | Si se informa, debe existir como categoria. | Preparado para categorias anidadas futuras. V1 puede usar un solo nivel. |
| orden | Numero entero | No | 10 | Debe ser mayor o igual a 0. | Define orden visual sugerido. |
| activo | Texto SI/NO | Si | SI | Solo admite `SI` o `NO`. | `SI` muestra la categoria; `NO` la oculta. |
| descripcion | Texto | No | Productos de limpieza para el hogar | Puede estar vacio. | Texto auxiliar o futuro SEO. |

Reglas importantes:

- `categoria_id` debe coincidir exactamente con la columna `categoria_id` de `Productos`.
- `orden` debe permitir controlar la visualizacion del catalogo.
- `activo` permite desactivar categorias sin borrar productos.

## Orden recomendado de carga

1. `Categorías`
2. `Marcas`
3. `Productos`
4. `Precios`
5. `Clientes`
6. `Fotos`

La primera hoja a cargar debe ser `Categorías`, seguida por `Marcas`, porque `Productos` depende de ambas para validar cada registro.

## Validaciones previas a la importacion

- Todos los `sku` de `Productos` deben ser unicos.
- Todos los `sku` de `Precios` deben existir en `Productos`.
- Todos los `sku` de `Fotos` deben existir en `Productos`.
- Todas las `categoria_id` usadas en `Productos` deben existir en `Categorías`.
- Todas las `marca_id` usadas en `Productos` deben existir en `Marcas`.
- Todos los productos activos deben tener precio `Minorista`.
- Los precios `Mayorista` solo se muestran a usuarios autorizados.
- No cargar precios `Mayorista` si la fuente no los distingue con claridad.
- Los valores SI/NO deben estar escritos en mayuscula y sin acento.

## Mapeo con modelo de datos

```text
Categorías -> categories
Marcas -> brands
Productos -> products
Precios -> price_lists + product_prices
Clientes -> customer_accounts + profiles
Fotos -> product_images
```

## Fuera de alcance V1

- No crear codigo de importacion todavia.
- No crear app Next.js todavia.
- No automatizar ajustes por marca todavia.
- No exigir fotos para publicar productos.
- No convertir el Sheet en sistema de gestion completo.
