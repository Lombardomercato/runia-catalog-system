# Runia Commerce - Performance Contract

Fecha de la auditoria: 2026-07-10  
Proyecto auditado: `runia-catalog-system`  
Entorno: build local de produccion con Next.js 15.5.19 y datos reales del tenant configurado.

## 1. Proposito

Este documento fija el contrato de rendimiento de Runia Commerce y registra la linea base previa al primer SDK interno. El rendimiento es una restriccion de arquitectura: el motor debe poder integrarse progresivamente en sitios disenados por Runia Web sin imponer UI, bloquear la pagina completa ni mezclar codigo administrativo con el comercio publico.

Las cifras de esta auditoria son observaciones del entorno indicado, no SLA ni puntajes Lighthouse garantizados.

## 2. Performance Contract obligatorio

1. El SDK no incluye componentes visuales por defecto.
2. Los modulos `server-only` no deben llegar al bundle del navegador.
3. Las consultas publicas devuelven solo los campos necesarios para el caso de uso.
4. El catalogo debe estar paginado o limitado. Nunca se permite una lectura publica sin limite.
5. La busqueda local solo se usa sobre conjuntos pequenos ya cargados.
6. Los catalogos medianos o grandes buscan, filtran y ordenan en servidor.
7. No se importan librerias completas cuando existe un import granular.
8. No se usan imagenes sin dimensiones reservadas, compresion y `lazy loading`, salvo la imagen critica identificada como LCP.
9. El Draft Order puede ejecutarse en cliente, pero no puede importar modulos administrativos ni credenciales de servidor.
10. Admin y Public Commerce deben conservar bundles y puntos de entrada separados.
11. Ninguna web cliente recibe `service_role`. La clave solo existe en modulos protegidos por `server-only`.
12. El Commerce SDK no incorpora dependencias visuales.
13. Los componentes interactivos se aislan en islas pequenas y con contextos de actualizacion acotados.
14. Los Server Components son la opcion predeterminada.
15. Toda capacidad nueva informa antes de aprobarse: bytes de bundle por ruta, consultas agregadas, campos transferidos, estrategia de limite/paginacion y politica de cache.

Reglas adicionales derivadas de esta auditoria:

- Los precios no se cachean de forma persistente sin una estrategia explicita de invalidacion y vigencia.
- El modo de catalogo pequeno tiene un limite verificable. Al superar ese limite debe migrar al modo paginado; no debe entregar un subconjunto silenciosamente.
- Los DTO publicos no exponen snapshots administrativos, costos, reglas internas ni columnas que la vista publica no consume.
- Una barrera `server-only` y un escaneo del bundle forman parte del QA de cada release.

## 3. Objetivos iniciales

- Catalogo util rapidamente en movil, aun cuando Draft Order todavia no haya hidratado.
- Sin bloqueos perceptibles al buscar, filtrar o agregar productos.
- Respuesta inmediata del Draft Order para cambios locales de cantidad.
- Navegacion a 390 px sin overflow horizontal.
- Minimos cambios de layout: reservar dimensiones de imagenes, controles y paneles.
- Motor independiente de imagenes, animaciones, tipografias y sistema visual de cada web.
- Ningun objetivo Lighthouse se considera garantizado hasta medir un despliegue representativo con un navegador real.

## 4. Metodologia y limites

Se usaron:

- `next build` y los manifiestos de `.next` para JS/CSS por ruta;
- una sonda sobre `fetch` para contar solicitudes Supabase, duracion y bytes de respuesta;
- el servidor local de produccion para estado HTTP, tiempo hasta headers, tiempo total y bytes del documento/RSC;
- manifiestos de referencias cliente y revision de cada limite `'use client'`;
- pruebas HTTP de busqueda, filtro, detalle y rutas autenticadas;
- una prueba en memoria del Draft Order y del generador de mensaje WhatsApp;
- busqueda exacta de `service_role` y del valor secreto dentro de `.next/static`.

No estuvo disponible una automatizacion de navegador valida: al plugin instalado de Chrome le falta `scripts/browser-client.mjs`. Por ello no se informan LCP, INP, CLS, memoria, tiempo real de hidratacion ni Lighthouse. La navegacion a 390 px se valido de forma estatica sobre las reglas CSS, no mediante una captura de viewport.

Las duraciones Supabase incluyen red y variaron entre corridas. Los conteos y bytes son la comparacion mas estable. El build final reutilizo cache, por lo que su mejora de tiempo no se atribuye a los cambios de codigo.

## 5. Linea base de build y JavaScript

Build inicial:

- total observado: 96,701 s;
- compilacion informada por Next: 28,1 s;
- build correcto.

Build final (ultima corrida, con cache caliente):

- total observado: 43,417 s;
- compilacion informada por Next: 5,7 s;
- build y TypeScript correctos;
- la diferencia temporal no es causal: el segundo build estaba caliente.

Suma exacta de archivos JS requeridos por cada arbol de ruta, comprimidos individualmente con gzip:

| Ruta | JS inicial gzip | JS final gzip | Delta | First Load JS final de Next |
| --- | ---: | ---: | ---: | ---: |
| `/` | 106.472 B | 106.472 B | 0 B | 106 kB |
| `/catalogo` | 118.118 B | 118.224 B | +106 B | 118 kB |
| `/catalogo/[sku]` | 117.010 B | 117.117 B | +107 B | 116 kB |
| `/admin` | 107.348 B | 107.348 B | 0 B | 106 kB |
| `/admin/sales` | 109.987 B | 109.987 B | 0 B | 109 kB |

El pequeno aumento publico corresponde al estado local que desacopla cada boton de agregar. No se incorporaron dependencias. A cambio, actualizar el pedido ya no obliga a los botones de las 29 tarjetas a consumir cada cambio del contexto completo.

Rutas mas pesadas entre las auditadas: `/catalogo`, `/catalogo/[sku]`, `/admin/sales`, `/admin` y `/`, en ese orden segun JS gzip exacto.

`First Load JS shared by all` permanece en 102 kB. Admin y Public Commerce poseen chunks de aplicacion separados, aunque comparten el runtime de Next/React.

## 6. Client Components e hidratacion

Componentes cliente propios presentes en el manifiesto compilado:

| Ruta | Entradas cliente propias en manifiesto | Arbol normal de exito |
| --- | ---: | ---: |
| `/` | 0 | 0 |
| `/catalogo` | 6 | 5 |
| `/catalogo/[sku]` | 6 | 4 |
| `/admin` | 1 | 1 |
| `/admin/sales` | 3 | 2 |

El manifiesto incluye tambien los `error.tsx` cliente y, por chunk compartido, puede listar `CatalogControls` en detalle aunque no se renderice en el arbol normal. En catalogo, las islas principales son Provider, panel, sincronizador de tenant, controles y botones de agregar. Las paginas, tarjetas y layouts siguen siendo Server Components.

No se pudo medir cuanto JS fue efectivamente parseado/ejecutado en un navegador. El limite superior reproducible es el JS gzip de la tabla anterior; no debe llamarse “tiempo de hidratacion”.

Componentes que pueden demorar contenido o interaccion:

- el render publico espera la configuracion del tenant y el snapshot de catalogo antes de completar el stream;
- el boton de agregar se entrega con espacio estable y queda deshabilitado hasta que el tenant se sincroniza en cliente;
- el panel y su flujo de identidad/confirmacion se cargan con el chunk Public Commerce en ambas rutas de catalogo;
- `AdminShell` es cliente y envuelve el backoffice, pero no forma parte del bundle publico.

## 7. Datos y consultas

### Comparacion medida

| Ruta / operacion | Consultas antes | Consultas despues | Bytes Supabase antes | Bytes despues | Cambio de bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/catalogo` | 6 | 5 | 15.299 B | 13.774 B | -1.525 B (-10,0 %) |
| `/catalogo/[sku]` | 4 | 3 | 1.709 B | 1.449 B | -260 B (-15,2 %) |
| `/admin` | 8 | 8* | 34.602 B | 17.790 B | -16.812 B (-48,6 %) |
| `/admin/sales` | 6 | 6* | 19.507 B | 14.493 B | -5.014 B (-25,7 %) |

`*` La sonda administrativa ejecuta layout y pagina fuera del dispatcher RSC, por lo que no observa `React.cache`. En un render Next normal, `getTenantIdentity(slug)` queda memoizado solo durante esa solicitud y evita la segunda consulta identica; no se contabiliza como ahorro medido en la tabla.

### Consultas mas costosas observadas

- Catalogo inicial: productos con precios, 12.915 B antes y 11.871 B despues. Sigue siendo la mayor respuesta publica.
- Dashboard: actividad, 28.126 B antes y 11.314 B despues de filtrar acciones en Supabase y limitar a 20.
- Ventas: lista de 12 pedidos, 15.946 B antes y 10.932 B despues de eliminar campos exclusivos del detalle.
- Dashboard: productos con/sin precio, 3.333 B. Sigue descargando IDs anidados para contar en Node y es una optimizacion pendiente.

Las duraciones individuales observadas estuvieron aproximadamente entre 240 ms y 920 ms en la corrida final, con variacion de red. La primera consulta de tenant del baseline llego a 2.621 ms; no se usa como comparacion causal.

### Respuestas HTTP locales finales

Bytes de documento/RSC descomprimido y tiempo total de una segunda corrida local:

| Ruta | Estado | Documento/RSC | Tiempo total observado |
| --- | ---: | ---: | ---: |
| `/` | 200 | 5.639 B | 324,9 ms |
| `/catalogo` | 200 | 79.073 B | 1.034,5 ms |
| `/catalogo/RB-000017` | 200 | 15.694 B | 833,8 ms |
| `/admin` | 200 | 34.917 B | 999,6 ms |
| `/admin/sales` | 200 | 22.073 B | 654,9 ms |

Estas cifras son locales, dependen de Supabase y no representan experiencia de usuario ni paint.

## 8. Arquitectura del catalogo

No existen archivos o encabezados `UC-001`, `UC-002` o `UC-003` en este repositorio. La auditoria se realizo sobre los tres casos de uso publicos implementados que corresponden funcionalmente a ese alcance: `GetPublicTenantConfig`, `ListPublicProducts` y `GetPublicProductBySku`, mas `modules/catalog`.

### Ejecucion actual

- Server-side: tenant, lista publica, categorias, marcas, productos, resolucion de precios, filtrado, orden y proyeccion del DTO.
- Cliente: controles de URL, botones Draft Order, panel, identidad y confirmacion.
- Los 29 productos completos se descargaban desde Supabase al servidor en cada busqueda/filtro. No se enviaban como un estado cliente global, pero si formaban el RSC de las tarjetas.
- Antes no habia paginacion real en base: el caso de uso cortaba en memoria a 100 y la UI fijaba pagina 1.
- Ahora el modo pequeno consulta como maximo 101 y falla de forma explicita si supera 100. Esto evita una lectura publica ilimitada y evita mostrar un subconjunto silencioso.
- La lista ya no selecciona `description`, estados inactivos ni precios de listas no vigentes. El detalle conserva descripcion y relaciones necesarias.
- Tenant y lista se resolvian una vez, pero el repositorio de productos volvia a consultar `price_lists`; ese duplicado fue eliminado.
- Branding no tenia una consulta separada: forma parte de tenant.

### Estrategia por escala

#### 29 productos / catalogo pequeno (actual)

- render inicial server-side;
- maximo 100 productos verificado en repositorio;
- filtro y busqueda en el servidor de aplicacion sobre el snapshot pequeno;
- URL params como fuente de navegacion;
- no agregar infraestructura adicional.

#### 500 productos

- migrar antes de superar 100 a consulta SQL/RPC paginada;
- filtro de categoria/marca y busqueda textual en Supabase;
- `page`/cursor y filtros en URL;
- seleccionar solo la lista de precio vigente;
- devolver conteo/facetas con una consulta o RPC controlada;
- carga incremental de 24-48 productos.

#### 5.000 productos

- busqueda indexada server-side, sin snapshot completo;
- cursor estable (`name,id`, `sku,id` o indice equivalente);
- indices tenant + estado + campos de filtro;
- facetas precomputadas o RPC, no filtrado en Node;
- limites de termino, pagina y tiempo.

#### 20.000 productos

- mismo contrato paginado, con estrategia explicita de busqueda (Postgres FTS/trigram o servicio dedicado si las mediciones lo justifican);
- no enviar todos los IDs/precios para calcular facetas;
- observabilidad por consulta, presupuesto de respuesta y pruebas de carga;
- invalidacion de producto/precio separada; nunca cachear precios indefinidamente.

Los filtros actuales son aceptables para 29 porque ocurren en servidor y el conjunto esta acotado. No son la implementacion objetivo para 500 o mas.

## 9. Draft Order

Resultados:

- JS propio de Public Commerce forma el delta principal entre `/` y `/catalogo`: aproximadamente 11,7 kB gzip en la suma de chunks de ruta.
- No importa `supabaseServer`, comandos admin ni componentes administrativos.
- `sessionStorage` se instancia dentro de una funcion cliente usando `window`, nunca durante SSR. Lecturas corruptas se capturan y devuelven `null`.
- El Provider envuelve el segmento catalogo para compartir el pedido entre lista y detalle. Los hijos de servidor siguen llegando como RSC; no convierte las tarjetas completas en Client Components.
- Antes, cada `AddProductButton` consumia el contexto completo (`draft`, `pending`, tenant y acciones). Cambiar una cantidad notificaba a los 29 consumidores.
- Ahora los botones consumen un contexto pequeno con `enabled` y `addProduct`, y mantienen su `pending` local. Cambios de cantidad actualizan panel/resumen sin propagar el estado completo a todas las tarjetas.
- La prueba en memoria agrego un producto, llevo cantidad a 3, guardo identidad, dejo el draft en `ready_to_submit` y construyo correctamente el mensaje WhatsApp.

No se ejecuto `submitDraft` contra la base real para evitar crear un pedido de prueba persistente. La ruta API, persistencia y WhatsApp compilan; su E2E con escritura queda pendiente para un entorno de QA con datos descartables.

## 10. CSS

Estado medido:

- fuente `app/globals.css`: 85.111 B y 4.821 lineas;
- artefacto final: 71.088 B sin comprimir y 11.913 B gzip;
- el mismo CSS se carga desde el layout raiz en rutas publicas y administrativas;
- hay estilos administrativos al comienzo, catalogo/public-commerce en el medio y admin/runia al final;
- existen bloques repetidos para `.catalog-grid`, `.catalog-order-button`, `.public-commerce-error`, `.public-commerce-identity-field textarea` y `.catalog-card-body small`;
- existen selectores globales necesarios (`*`, `html`, `body`, `a`) y estilos antiguos de catalogo sin uso aparente.

No se separo el archivo en esta iteracion. Las reglas responsive de home, importador, catalogo, admin y Runia estan intercaladas; una extraccion parcial tiene riesgo de cambiar cascada y diseno, y la consigna excluye una reescritura general. La separacion segura recomendada es una tarea dedicada con comparacion visual:

- `app/globals.css`: reset y home;
- `app/catalogo/catalog.css`: catalogo y Public Commerce;
- `app/admin/admin.css`: backoffice e importador;
- `app/runia/runia.css`: consola SaaS;
- import por layout y verificacion de las cuatro familias de rutas.

## 11. Mobile y render inicial

Evidencia estatica para 390 px:

- `.catalog-shell` usa `width: min(100% - 28px, 1200px)` bajo 700 px: 362 px a viewport 390;
- el grid pasa a una columna;
- footer y comandos de tarjeta pasan a columna/ancho completo;
- el panel usa `width: min(390px, calc(100% - 28px))`: 362 px a viewport 390;
- no se encontraron anchos fijos de 400 px o mas ni `100vw` en el CSS.

Esto reduce el riesgo de overflow, pero no sustituye una prueba visual. Render inicial: contenido y tarjetas salen del servidor; busqueda/filtros usan navegacion RSC con `useTransition`, debounce de 240 ms y sin bloquear el documento completo.

## 12. Cambios aplicados

- Barrera `server-only` en el cliente Supabase y queries de tenant.
- Eliminacion de la segunda consulta `price_lists` en lista y detalle publicos.
- Precio filtrado a la lista vigente mediante relacion `!inner`.
- Columnas/filas publicas reducidas y limite pequeno de 100 productos.
- Contexto reducido para botones Draft Order y estado `pending` local.
- Memoizacion RSC por solicitud de identidad de tenant; no cache persistente.
- Filtro server-side y limite 20 para actividad del dashboard.
- DTO de lista de ventas reducido a los campos que la lista consume.
- Contrato de rendimiento formalizado en este documento.

## 13. QA final

- Catalogo: 29 tarjetas, HTTP 200.
- Busqueda `q=RB-000017`: 1 tarjeta; busqueda inexistente: 0 y empty state.
- Filtro por una categoria real: 5 tarjetas, sin error.
- Detalle `RB-000017`: HTTP 200.
- Draft Order en memoria: agregar, cantidad, identidad y confirmacion correctos.
- Generador WhatsApp: correcto con snapshot de pedido.
- Admin y `/admin/sales`: HTTP 200 con sesion local valida.
- TypeScript: `npx tsc --noEmit`, correcto.
- Build: `npm run build`, correcto.
- Secret scan: valor de `SUPABASE_SERVICE_ROLE_KEY` ausente de `.next/static`; cero archivos con `SUPABASE_SERVICE_ROLE_KEY` o `service_role`.
- Imports server-only en cliente: build correcto con barrera activa; no hay import de `lib/supabaseServer` desde archivos `'use client'`.
- Mobile 390 px: reglas estaticas compatibles; prueba visual pendiente por falta del runtime de navegador.
- Submit/persistencia E2E: pendiente para ambiente descartable; no se escribieron pedidos de prueba en la base configurada.

## 14. Riesgos pendientes

1. CSS global compartido: 71.088 B sin comprimir en todas las rutas.
2. La arquitectura publica debe migrar a paginacion SQL antes del producto 101.
3. El conteo “productos sin precio” del sidebar descarga productos/precios y cuenta en Node.
4. La busqueda de `/admin/sales` aun filtra en memoria cuando hay termino y debe moverse al servidor al crecer pedidos.
5. El dashboard lee ventas en paginas de 1.000 para calcular metricas; a escala debe reemplazarse por agregados SQL/RPC.
6. No hay medicion de Web Vitals ni Lighthouse de un despliegue real.
7. El flujo persistente Draft Order/WhatsApp requiere E2E en entorno QA.
8. Los identificadores `UC-001`, `UC-002` y `UC-003` no estan documentados en el repositorio y conviene incorporarlos a la trazabilidad.

## 15. Recomendacion para el primer SDK interno

Crear primero un SDK TypeScript headless y server-first dentro del monorepo, sin React ni CSS:

- `commerce/tenant`: resolver configuracion publica minima;
- `commerce/catalog`: listar/buscar/detallar con DTOs explicitos, limite y paginacion;
- `commerce/pricing`: resolver precio vigente en servidor;
- `commerce/draft-order`: estado y comandos puros, con adaptador de storage inyectable;
- `commerce/orders`: contrato HTTP para confirmar/persistir;
- adaptadores separados `server` y `browser`, con exports condicionados;
- ningun barrel publico que mezcle `server-only` con codigo browser;
- ninguna dependencia de `next`, componentes, iconos, animaciones o estilos en el nucleo.

El primer hito debe extraer contratos y casos de uso existentes, no agregar capacidades. Su acceptance gate debe comparar bundle y consultas contra esta linea base. Los componentes React, si se crean, pertenecen a un paquete opcional posterior (`commerce-react` o blocks), nunca al SDK base.
