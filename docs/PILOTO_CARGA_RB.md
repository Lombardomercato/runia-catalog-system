# Piloto de Carga RB Distribuidora

Este documento registra la muestra piloto real tomada del PDF `CATALOGO MAYO.Mayorista_compressed.pdf` para validar el modelo de datos antes de crear Supabase, migraciones o codigo de importacion.

Archivos de trabajo generados/actualizados:

- `data/RB_CATALOGO_MASTER.xlsx`
- `docs/RB_SHEET_MAESTRO_PILOTO.xlsx`

## Criterio de seleccion

La muestra se limito a productos donde el nombre y el precio pueden auditarse en el texto extraido del PDF. Se excluyeron productos cuyo precio aparece separado visualmente de forma ambigua.

La muestra incluye varias marcas, varias categorias, productos con variantes, productos sin variantes claras y precios entre `170` y `7580`.

## Productos elegidos

| sku | categoria_id | marca_id | linea | producto | variante | precio_minorista | pagina_pdf |
|---|---|---|---|---|---|---:|---:|
| RB-000001 | CAT001 | MAR001 | Sagrada India | Sahumerio Sagrada India | Masala | 1384 | 6 |
| RB-000002 | CAT001 | MAR001 | Sagrada India | Sahumerio Sagrada India | Black | 1160 | 6 |
| RB-000003 | CAT001 | MAR002 | Buena Onda | Sahumerio Buena Onda | X5 | 643 | 9 |
| RB-000004 | CAT001 | MAR002 | Buena Onda | Sahumerio Buena Onda | X30 | 3153 | 9 |
| RB-000005 | CAT001 | MAR003 | Aromanza | Cono Cascada Aromanza |  | 1790 | 12 |
| RB-000006 | CAT002 | MAR003 | Aromanza | Difusor Aromanza | 60 ml | 3150 | 12 |
| RB-000007 | CAT002 | MAR003 | Aromanza | Difusor Aromanza | 200 ml | 6490 | 12 |
| RB-000008 | CAT002 | MAR003 | Aromanza | Difusor Auto Aromanza |  | 2420 | 12 |
| RB-000009 | CAT003 | MAR003 | Aromanza | Esencias Aromanza |  | 1150 | 12 |
| RB-000010 | CAT005 | MAR004 | Iluminarte | Iluminarte Rectangular |  | 570 | 10 |
| RB-000011 | CAT005 | MAR004 | Iluminarte | Iluminarte Long | 40 cm | 1300 | 10 |
| RB-000012 | CAT005 | MAR004 | Iluminarte | Iluminarte Rectangular | 30 v | 1853 | 10 |
| RB-000013 | CAT002 | MAR004 | Iluminarte | Difusor Auto Iluminarte |  | 2800 | 12 |
| RB-000014 | CAT002 | MAR005 | Masala | Aromatizante Textil Masala | 500 ml | 4600 | 28 |
| RB-000015 | CAT002 | MAR005 | Masala | Aromatizante Textil Masala | 200 ml | 2145 | 28 |
| RB-000016 | CAT003 | MAR005 | Masala | Rocio Aurico Masala |  | 2145 | 30 |
| RB-000017 | CAT003 | MAR005 | Masala | Armonizador Esoterico |  | 2000 | 30 |
| RB-000018 | CAT002 | MAR006 | KB | Difusor KB |  | 2805 | 27 |
| RB-000019 | CAT002 | MAR006 | KB | Textil KB |  | 2805 | 27 |
| RB-000020 | CAT003 | MAR006 | KB | Esencia Humidificador KB |  | 2425 | 27 |
| RB-000021 | CAT003 | MAR006 | KB | Esencia Hornito KB |  | 2560 | 27 |
| RB-000022 | CAT002 | MAR006 | KB | Difusor Auto Vidrio KB | 6 ml | 2565 | 29 |
| RB-000023 | CAT002 | MAR007 | Saphirus | Saphirus Touch | Aparato + repuesto | 3705 | 27 |
| RB-000024 | CAT002 | MAR007 | Saphirus | Saphirus Touch | Repuesto solo | 2305 | 27 |
| RB-000025 | CAT004 | MAR007 | Saphirus | Lustramuebles Saphirus |  | 3782 | 27 |
| RB-000026 | CAT004 | MAR007 | Saphirus | Limpiador Multiuso Saphirus |  | 1438 | 27 |
| RB-000027 | CAT006 | MAR003 | Aromanza | Vela Premium Aromanza |  | 7580 | 21 |
| RB-000028 | CAT006 | MAR008 |  | Velas Cortas | Lisas | 170 | 22 |
| RB-000029 | CAT006 | MAR008 |  | Velas Cortas | Combinadas | 190 | 22 |

## Decisiones de categoria

| categoria_id | categoria | criterio |
|---|---|---|
| CAT001 | Sahumerios e inciensos | Agrupa sahumerios, conos y lineas similares. |
| CAT002 | Aromatizantes y difusores | Agrupa difusores, textiles y aromatizantes de ambiente. |
| CAT003 | Esencias y armonizadores | Agrupa esencias, rocios, armonizadores y productos liquidos similares. |
| CAT004 | Limpieza y hogar | Agrupa productos funcionales de limpieza. |
| CAT005 | Porta sahumerios y accesorios | Agrupa accesorios relacionados al uso de sahumerios o ambientacion. |
| CAT006 | Velas | Agrupa velas y velones. |

Las categorias no se copiaron literalmente del PDF. Se definieron para navegacion real del catalogo.

## Decisiones de marca

| marca_id | marca | criterio |
|---|---|---|
| MAR001 | Sagrada India | Linea comercial clara en el PDF. |
| MAR002 | Buena Onda | Linea comercial clara en el PDF. |
| MAR003 | Aromanza | Marca/linea comercial clara en el PDF. |
| MAR004 | Iluminarte | Marca/linea comercial clara en el PDF. |
| MAR005 | Masala | Marca/linea comercial clara en el PDF. |
| MAR006 | KB | Marca/linea comercial clara en el PDF. |
| MAR007 | Saphirus | Marca/linea comercial clara en el PDF. |
| MAR008 | Sin marca | Placeholder controlado para productos sin marca visible en el PDF. Requiere validacion de RB. |

## Problemas encontrados

### SKU

- El PDF no muestra codigos internos estables para la muestra seleccionada.
- Se usaron SKUs internos secuenciales `RB-000001` a `RB-000029`.
- Antes de la carga completa RB deberia confirmar si existen codigos propios.

### Variantes

- Las variantes aparecen mezcladas con el nombre en muchos productos.
- `X5`, `X30`, `60 ml`, `200 ml`, `500 ml`, `6 ml`, `Aparato + repuesto`, `Repuesto solo`, `Lisas` y `Combinadas` se cargaron como variantes.
- En algunos productos la variante podria ser tambien una linea o presentacion comercial. Ejemplo: `Black` en Sagrada India.

### Categorias

- El PDF esta pensado como catalogo visual, no como taxonomia de navegacion.
- Varias secciones mezclan producto, linea, aroma y presentacion.
- La categoria `Porta sahumerios y accesorios` puede necesitar dividirse si RB tiene muchos accesorios no relacionados con sahumerios.

### Marcas

- Hay productos sin marca clara, especialmente velas genericas.
- El modelo exige marca obligatoria; por eso se uso `Sin marca` como placeholder controlado.
- Se recomienda confirmar con RB si esos productos deben quedar como `Sin marca`, `RB Distribuidora` o marca real del proveedor.

### Inconsistencias del PDF

- Algunos precios aparecen lejos del producto o en bloques visuales, lo que impide asociarlos con seguridad solo desde texto.
- Existen productos con precios en linea clara y otros con precios agrupados por columna.
- Algunas lineas muestran nombres y variantes sin separadores consistentes.
- Hay diferencias potenciales en productos `Buena Onda X5`: se detectan valores cercanos `643` y `650` en paginas distintas. Para el piloto se uso `643` de la pagina 9 por estar asociado como `BUENA ONDA X5 $643`.

## Columnas que podrian necesitar ajuste

- `categoria_id`: conviene incorporarla al Google Sheet real para evitar dependencias por texto exacto de categoria.
- `marca_id`: conviene incorporarla al Google Sheet real para evitar errores por escritura de marca.
- `linea`: aparece como dato util en el PDF y deberia agregarse a `products`.
- `pagina_pdf`: no deberia ser parte del modelo principal, pero si conviene mantenerla en la planilla piloto o en columnas de auditoria durante la carga inicial.
- `observaciones_importacion`: util para marcar dudas sin contaminar nombre, variante o precio.

## Cambios aplicados al modelo

- Se agrego `product_line` a `products`.
- Se definio que `brand_id` sigue siendo obligatorio y que `Sin marca` es una marca controlada valida cuando no hay marca visible.
- Se documento soporte operativo para `categoria_id` y `marca_id` en la importacion, aunque la base use IDs internos.
- Se definio que `source_row_id`, `source_page`, `pagina_pdf` y observaciones son datos de importacion/auditoria, no datos publicos.

No se detecto necesidad de cambiar la separacion principal del modelo: `categories`, `brands`, `products`, `price_lists` y `product_prices` sigue siendo correcta.

## Estado del modelo para Supabase

Los ajustes detectados en el piloto fueron aplicados en `DATA_MODEL_DRAFT.md` y `docs/GOOGLE_SHEET_MASTER.md`.

Con `product_line`, la marca controlada `Sin marca`, la politica de SKUs secuenciales y la regla de no inventar precios mayoristas, el modelo queda listo para migraciones iniciales.
