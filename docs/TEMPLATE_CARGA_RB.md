# Template de Carga RB Distribuidora

Este documento prepara la fase de carga real del catalogo de RB Distribuidora antes de crear Supabase, migraciones o codigo de importacion.

El objetivo es convertir el PDF de productos/precios en datos estructurados compatibles con:

- [GOOGLE_SHEET_MASTER.md](./GOOGLE_SHEET_MASTER.md)
- [DATA_MODEL_DRAFT.md](../DATA_MODEL_DRAFT.md)

## Flujo operativo

```text
PDF
↓
Carga manual inicial
↓
Validacion
↓
Importacion futura
```

## Principio de trabajo

El PDF no debe importarse directamente al sistema. Primero debe convertirse en un Google Sheet ordenado, validado y normalizado. Ese Sheet sera la fuente confiable para la importacion futura.

No se debe crear codigo, migraciones ni Supabase hasta validar la estructura con datos reales.

## Como convertir el PDF a datos estructurados

1. Extraer el contenido del PDF a una planilla auxiliar.
2. Separar cada linea comercial en una fila.
3. Identificar si cada fila representa un producto unico o una variante de un producto.
4. Normalizar categoria, marca, linea comercial, nombre de producto y variante.
5. Asignar o confirmar `sku`.
6. Cargar primero las hojas maestras `Categorías` y `Marcas`.
7. Cargar productos base en `Productos`.
8. Cargar precios en `Precios`.
9. Dejar `Fotos` vacia salvo que existan URLs validas.
10. Cargar `Clientes` solo si RB define usuarios mayoristas iniciales.

El trabajo inicial puede ser manual. Lo importante es que el resultado final respete las columnas y reglas del Google Sheet maestro.

## Hoja que se carga primero

La primera hoja a cargar debe ser `Categorías`.

Orden recomendado:

1. `Categorías`
2. `Marcas`
3. `Productos`
4. `Precios`
5. `Clientes`
6. `Fotos`

Motivo: `Productos` depende de categorias y marcas existentes. `Precios` depende de productos existentes por `sku`.

## Reglas para categorias

- Usar un listado controlado de categorias.
- No crear una categoria nueva por cada descripcion del PDF.
- Mantener categorias simples y visibles para clientes.
- Usar un solo nivel en V1 salvo que el PDF obligue a una separacion clara.
- Evitar categorias demasiado parecidas.
- La columna `categoria` de `Productos` debe coincidir exactamente con `categoria` en `Categorías`.
- Toda categoria debe tener `activo = SI` o `activo = NO`.
- Definir `orden` para controlar la visualizacion inicial del catalogo.

Ejemplos de problemas a evitar:

- `Limpieza`, `Productos de limpieza` y `Limpieza hogar` como tres categorias separadas sin necesidad.
- Categorias basadas en proveedor cuando deberian ser marcas.
- Categorias mezcladas con variantes, como `Shampoo 1L`.

## Reglas para marcas

- La marca es obligatoria en `Productos`.
- Toda marca usada en `Productos` debe existir antes en `Marcas`.
- Normalizar mayusculas, espacios y abreviaturas.
- Usar un unico nombre oficial por marca.
- Si el PDF no informa marca, usar una marca temporal acordada, por ejemplo `Sin marca`, y marcarla para revision.
- No usar proveedor como marca salvo que comercialmente sea la marca visible.
- `ajuste_porcentaje` puede quedar vacio o en `0` durante la carga inicial.
- `Sin marca` es una marca controlada permitida, no un texto libre. Debe existir una sola vez en `Marcas` y usarse solo cuando no haya marca visible.

Ejemplos de normalizacion:

```text
ACME
Acme
Acme S.A.
```

Debe quedar como un unico valor, por ejemplo:

```text
Acme
```

## Reglas para productos

- Cada fila de `Productos` representa un producto vendible.
- `sku` es obligatorio y unico.
- `producto` debe contener el nombre base, sin precio y sin informacion de lista.
- `categoria_id` y `marca_id` son obligatorios en el Sheet final. En planillas auxiliares puede trabajarse con texto de categoria y marca, pero antes de importar deben resolverse a IDs.
- `linea` es opcional y debe conservar la linea comercial cuando el PDF la informa, por ejemplo `Sagrada India`, `Buena Onda`, `Aromanza` o `Iluminarte`.
- `activo` debe ser `SI` o `NO`.
- No cargar precios en `Productos`.
- No cargar fotos en `Productos`.
- No duplicar el mismo producto con distinto nombre si solo cambia la escritura.

Formato recomendado para nombre base:

```text
Tipo de producto + linea o descripcion corta
```

Ejemplos:

```text
Detergente liquido
Jabon en polvo
Servilleta de papel
```

Evitar:

```text
DETERGENTE LIQUIDO X 500 ML OFERTA
Detergente liquido minorista $1250
Marca Ejemplo - Detergente 500 ml
```

La marca va en `marca` o `marca_id`. La linea comercial va en `linea`. La presentacion va en `variante`. El precio va en `Precios`.

## Reglas para variantes

- Una variante es una diferencia de presentacion, tamano, cantidad, sabor, color, fragancia o formato.
- Cada variante vendible debe tener su propio `sku`.
- Si dos filas del PDF tienen mismo producto pero distinto tamano, deben ser dos filas en `Productos`.
- Si dos filas tienen mismo producto, misma marca y misma variante, son posibles duplicados.
- La variante debe ser corta y comparable.

Ejemplos:

| producto | variante |
|---|---|
| Detergente liquido | 500 ml |
| Detergente liquido | 1 l |
| Jabon en polvo | 800 g |
| Papel higienico | Pack 4 rollos |

Reglas de escritura:

- Usar espacios entre numero y unidad: `500 ml`, `1 l`, `800 g`.
- Usar una sola forma para packs: `Pack 4 unidades`, `Pack 6 unidades`.
- No mezclar precio, categoria o marca dentro de `variante`.
- Si no hay variante clara, dejar la celda vacia.

## Reglas para precios

- Los precios se cargan solo en la hoja `Precios`.
- Cada precio debe referenciar un `sku` existente en `Productos`.
- `lista_precio` debe ser `Minorista` o `Mayorista` en V1.
- `precio` debe ser numerico y sin simbolo de moneda.
- `activo` debe ser `SI` o `NO`.
- Todo producto activo debe tener precio `Minorista`.
- Todo producto ofrecido a mayoristas debe tener precio `Mayorista` solo si esa lista esta clara en la fuente o fue definida por RB.
- Si el PDF trae un solo precio, cargarlo como `Minorista` o como la lista base definida para el cliente.
- Si el PDF no distingue con claridad entre listas, cargar solo `Minorista` o la lista base definida para el cliente. No inventar `Mayorista`.

Ejemplo:

| sku | lista_precio | precio | moneda | activo |
|---|---|---:|---|---|
| RB-0001 | Minorista | 1250.50 | ARS | SI |
| RB-0001 | Mayorista | 980.00 | ARS | SI |

## Estrategia de SKU

Prioridad de decision:

1. Si RB ya tiene codigos internos estables, usarlos como `sku`.
2. Si el PDF trae codigos confiables, usarlos como `sku`.
3. Si no hay codigos, crear SKUs internos con formato secuencial.

Formato recomendado si hay que crear SKUs:

```text
RB-000001
RB-000002
RB-000003
```

Este formato secuencial fue validado en el piloto RB con productos reales y puede usarse para la carga inicial si RB no entrega codigos internos.

Reglas:

- No codificar categoria ni marca dentro del SKU.
- No reutilizar SKUs eliminados.
- No cambiar un SKU despues de validado.
- Un SKU identifica una variante vendible, no solo un nombre general.
- Si se detecta un duplicado real, mantener un solo SKU.

## Estrategia de nombres normalizados

Separar la informacion en campos:

```text
marca -> Marca visible
linea -> Linea comercial o familia del PDF
producto -> Nombre base
variante -> Presentacion o diferencia vendible
categoria -> Agrupador de navegacion
```

Reglas:

- Usar capitalizacion consistente.
- Eliminar dobles espacios.
- Quitar precios del nombre.
- Quitar textos promocionales temporales.
- No repetir marca dentro de `producto` salvo que forme parte inseparable del nombre comercial.
- No incluir unidades en `producto` si corresponden a `variante`.
- No usar `linea` para guardar auditoria, pagina del PDF u observaciones.

## Estrategia de variantes

La combinacion funcional para detectar un producto vendible es:

```text
marca + producto + variante
```

Si esa combinacion se repite, revisar antes de asignar un nuevo SKU.

Criterios:

- Diferente tamano: nueva variante.
- Diferente cantidad por pack: nueva variante.
- Diferente fragancia, sabor o color: nueva variante.
- Diferente precio solamente: no es nueva variante.
- Diferente lista de precio: se resuelve en `Precios`, no en `Productos`.

## Estrategia de categorias

Antes de cargar productos, crear una lista inicial de categorias leyendo todo el PDF.

Proceso sugerido:

1. Leer el PDF completo.
2. Anotar agrupadores evidentes.
3. Consolidar categorias repetidas o similares.
4. Validar si las categorias son utiles para navegar el catalogo.
5. Cargar `Categorías` con `orden` y `activo`.
6. Usar exactamente esos nombres en `Productos`.

Criterio: una categoria debe ayudar al cliente a encontrar productos, no reflejar necesariamente la estructura interna del PDF.

## Riesgos detectados

### Productos duplicados

Riesgo: el mismo producto puede aparecer dos veces por diferencias de escritura, proveedor, ubicacion en el PDF o lista de precio.

Como detectarlo:

- Comparar `marca + producto + variante`.
- Revisar nombres muy parecidos.
- Revisar precios repetidos con distinta descripcion.
- Revisar codigos o codigos de barra repetidos si existen.

Accion recomendada: consolidar en un solo `sku` antes de validar la carga.

### Variantes ambiguas

Riesgo: informacion como tamano, pack, fragancia o color puede venir mezclada en el nombre del producto.

Como detectarlo:

- Buscar numeros y unidades dentro del nombre.
- Buscar textos como `x 6`, `pack`, `caja`, `surtido`, `repuesto`, `clasico`, `limon`.
- Revisar productos con mismo nombre base y precios distintos.

Accion recomendada: separar presentacion en `variante` y dejar `producto` como nombre base.

### Marcas inconsistentes

Riesgo: una misma marca puede aparecer escrita de varias formas.

Como detectarlo:

- Ordenar alfabeticamente la columna `marca`.
- Revisar diferencias de mayusculas, puntos, tildes, espacios y razon social.
- Comparar marcas contra nombres de productos.

Accion recomendada: definir un nombre oficial en `Marcas` y usarlo exactamente igual en `Productos`.

### Categorias inconsistentes

Riesgo: el PDF puede tener secciones utiles para imprimir, pero no necesariamente buenas para navegar un catalogo.

Como detectarlo:

- Revisar categorias con muy pocos productos.
- Revisar categorias que mezclan marcas, presentaciones o promociones.
- Revisar categorias duplicadas con nombres parecidos.

Accion recomendada: crear categorias orientadas al usuario final y mayorista, no a la estructura del PDF.

### Precios incompletos o mal asignados

Riesgo: el PDF puede no distinguir claramente precios minoristas y mayoristas.

Como detectarlo:

- Revisar si hay una o dos columnas de precios.
- Confirmar con RB que significa cada precio.
- Detectar productos activos sin precio.
- Detectar precios con simbolos, textos o formatos no numericos.

Accion recomendada: no importar precios dudosos hasta confirmar la lista correspondiente.

## Checklist de validacion antes de importar

- `Categorías` no tiene duplicados.
- `Marcas` no tiene duplicados.
- Todo `sku` de `Productos` es unico.
- Toda `categoria` de `Productos` existe en `Categorías`.
- Toda `marca` de `Productos` existe en `Marcas`.
- Todo producto activo tiene precio `Minorista`.
- Los productos mayoristas tienen precio `Mayorista` solo cuando esa lista esta clara en la fuente o fue definida por RB.
- No hay precios `Mayorista` inventados a partir de un unico precio fuente.
- No hay precios con simbolo `$`.
- No hay filas con valores booleanos distintos de `SI` o `NO`.
- No hay productos con variantes mezcladas en el nombre base.
- No hay marcas escritas de multiples formas.
- No hay categorias creadas accidentalmente por descripcion o presentacion.
- `pagina_pdf` y observaciones quedan en columnas auxiliares o documentos de auditoria, no como datos publicos.

## Recomendacion final antes de empezar la carga real

Antes de cargar todo el PDF, hacer una prueba controlada con una muestra de 20 a 30 productos que incluya:

- Productos simples.
- Productos con variantes.
- Productos de distintas marcas.
- Productos de distintas categorias.
- Productos con precio minorista y mayorista.
- Casos dudosos del PDF.

Con esa muestra se debe validar si las columnas del Google Sheet alcanzan para representar el catalogo real de RB. Solo despues conviene cargar el PDF completo.

## Proximo paso tecnico

Crear el Google Sheet real con las seis hojas definidas en `GOOGLE_SHEET_MASTER.md`, cargar una muestra piloto y revisar los datos contra este documento antes de generar migraciones de Supabase.
