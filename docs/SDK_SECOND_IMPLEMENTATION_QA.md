# Runia Commerce SDK v1.1 — QA de segunda implementación

Fecha: 2026-07-14  
Implementación validada: `/demo-commerce` y `/demo-commerce/[sku]`  
Tenant de prueba: configuración existente, sin backend, datos ni migraciones nuevas

## Veredicto

La segunda implementación sigue consumiendo exclusivamente `createCommerceClient()` y ahora ya no necesita soluciones locales para destacados, normalización de WhatsApp ni clasificación de not-found.

Las rutas no importan Supabase, repositories, casos de uso, `modules/catalog`, componentes de RB ni archivos de `/catalogo`. Commerce entrega contratos y decisiones comerciales; Runia Web conserva estructura, copy, tipografía, color, navegación y CTA.

## Integración v1.1

`app/demo-commerce/commerce.ts` continúa siendo el único archivo que importa el SDK:

```ts
import { createCommerceClient } from '@/sdk/server';

export function createDemoCommerce() {
  return createCommerceClient({
    tenantSlug: process.env.NEXT_PUBLIC_TENANT_SLUG ?? 'rb-distribuidora',
  });
}
```

La factory crea una instancia por render. De esta forma, la memoización del tenant se comparte dentro de la página y no sobrevive indefinidamente entre requests.

El índice inicial ejecuta en paralelo:

- `tenant.getPublicConfig()`;
- `products.featured({ limit: 12 })`;
- `categories.list()`;
- `brands.list()`.

La búsqueda, los filtros, la paginación y el vínculo “Ver el índice completo” usan `products.list()`. El detalle usa `getBySku()`, `tenant.buildWhatsAppUrl()` y `commerce.errors.isNotFound()`.

No se llama `pricing.resolve()` porque los DTO públicos ya contienen el precio autoritativo.

## Hallazgos de v1 cerrados

| Fricción verificada | Solución v1.1 | Resultado en la demo |
| --- | --- | --- |
| “Primeros productos” como selección implícita | `products.featured()` con política estable | La portada usa una selección contractual y el índice completo queda explícito |
| Construcción manual de `wa.me` | `tenant.buildWhatsAppUrl({ message })` | Se eliminó el helper local; el copy sigue perteneciendo a la web |
| Ciclo de vida ambiguo | cliente por request/render; tenant memoizado sólo por instancia | Se eliminó la instancia global de módulo |
| 404 dependiente de la clase de error | `commerce.errors.isNotFound()` y códigos estables | El detalle usa `notFound()` y una página 404 propia |

No se crearon campañas, orden editorial persistido ni destacados en base de datos. El modelo no posee `products.sort_order`; la estrategia v1.1 documentada es nombre, SKU e ID opaco, y puede sustituirse en el Domain Layer cuando exista una necesidad demostrada.

## Independencia visual

La migración no modificó la identidad de `/demo-commerce` ni reutilizó UI de RB.

| Aspecto | `/catalogo` RB | `/demo-commerce` |
| --- | --- | --- |
| Composición | grilla de cards | índice editorial horizontal |
| Superficie | catálogo comercial convencional | papel cálido con grandes espacios |
| Tipografía | sans-serif funcional | títulos serif y metadata sans-serif |
| Acento | branding dinámico | tinta verde oscuro y terracota |
| Jerarquía | producto/card | folio, número editorial y fila completa |
| Interacción | controles cliente y Draft Order | formulario GET server-first, sin Draft Order |
| Detalle | panel comercial | ficha editorial asimétrica |

El único cambio CSS v1.1 ajusta el subrayado del vínculo al índice completo. `/catalogo` no fue modificado durante esta migración.

## Tiempo de integración

La segunda implementación v1 tomó 2 h 55 min. Con las tres soluciones locales absorbidas por v1.1, la estimación repetible para una tercera experiencia equivalente queda más cerca de 2 horas que de 4:

| Trabajo | v1 observado | Próxima integración con v1.1 |
| --- | ---: | ---: |
| Conectar cliente y estados Commerce | 25 min | 15 min |
| Listado, filtros, detalle y CTA | 40 min | 30 min |
| Dirección visual y responsive | 75 min | 75 min |
| QA y mediciones | 35 min | 20 min |
| **Total** | **175 min (2 h 55 min)** | **140 min (2 h 20 min)** |

La cifra de 2 h 20 min es una estimación basada en las fricciones eliminadas, no una nueva medición cronometrada.

## Archivos y líneas de la demo

La experiencia v1.1 contiene 7 archivos de runtime más este documento. Se agregó solamente el `not-found.tsx` específico de la ruta; el resto son evoluciones de los archivos originales.

| Archivo de runtime | Líneas | Responsabilidad |
| --- | ---: | --- |
| `commerce.ts` | 7 | factory del cliente |
| `page.tsx` | 239 | portada featured, índice y composición |
| `[sku]/page.tsx` | 118 | detalle, guard y CTA |
| `[sku]/not-found.tsx` | 22 | 404 visual de la demo |
| `presentation.ts` | 12 | formato monetario neutro |
| `layout.tsx` | 12 | metadata y CSS aislado |
| `demo-commerce.css` | 839 | identidad visual y responsive |
| **Total runtime** | **1.249** | |

Clasificación manual por responsabilidad dominante (cada línea se cuenta una sola vez):

- 60 líneas específicas de Commerce: factory, tipos inferidos, parámetros, llamadas y guards;
- 1.123 líneas visuales/presentacionales: CSS, markup, copy, formato y estados de la experiencia;
- 66 líneas genéricas de web: search params, paginación y navegación.

La frontera sigue siendo una medición manual porque algunas líneas combinan presentación y lectura de DTOs. No existe lógica de tenant, visibilidad, pricing ni normalización de WhatsApp en la web.

## Código reutilizado y código visual

Se reutilizó mediante el SDK:

- resolución y memoización request-scoped del tenant;
- selección destacada, búsqueda, filtros, orden y paginación;
- visibilidad de producto, categoría y marca;
- resolución autoritativa del precio;
- normalización del destino WhatsApp;
- clasificación pública de not-found.

Fue puramente responsabilidad visual de la demo:

- JSX, layout editorial y responsive;
- paleta, tipografías, espacios y bordes;
- copy del hero y del mensaje de WhatsApp;
- labels, navegación y página 404;
- formato de presentación del monto.

No se reutilizaron `ProductCard`, controles o CSS de `/catalogo`, Public Commerce/Draft Order, mappers, queries ni helpers de `modules/catalog`.

## Funcionalidad validada

`/demo-commerce` incluye tenant, hero, selección `featured`, buscador, filtros por categoría y marca, índice completo paginado y acceso al detalle.

`/demo-commerce/[sku]` incluye nombre, variante, marca, categoría, línea, precio, descripción cuando existe, CTA de WhatsApp cuando está configurado y 404 controlado cuando el producto no existe o no es visible.

No se agregó Draft Order, checkout, hooks, Client SDK, componentes compartidos, dependencias, migraciones ni backend.

## Performance v1 frente a v1.1

### Build y TypeScript

- `npx tsc --noEmit`: correcto.
- `npm run test:sdk`: 22/22 contratos correctos; conserva los 13 originales.
- `npm run build`: correcto.
- build final v1.1: 55,7 s total; compilación Next 7,6 s.
- build v1: 68,5 s total; compilación Next 11,2 s.

La diferencia de tiempo total depende de cache y entorno. No se interpreta como una mejora causal.

### JavaScript público

| Ruta | v1 gzip | v1.1 gzip | Delta |
| --- | ---: | ---: | ---: |
| `/demo-commerce` | 106.277 B | 106.280 B | +3 B |
| `/demo-commerce/[sku]` | 106.277 B | 106.280 B | +3 B |
| `/catalogo` | 117.818 B | 117.818 B | 0 B |
| `/catalogo/[sku]` | 116.712 B | 116.712 B | 0 B |

Next informa 106 kB de First Load JS para ambas rutas de la demo. El delta de 3 B no es significativo y no se agregó ningún Client Component.

### Consultas y bytes transferidos por Supabase

Medición directa de los cuerpos de respuesta con una instancia fría por escenario:

| Operación | v1 consultas / bytes | v1.1 consultas / bytes | Resultado |
| --- | ---: | ---: | --- |
| portada inicial | 5 / 13.774 B | 5 / 9.720 B | mismas queries, -29,4 % de payload |
| índice completo | 5 / 13.774 B | 5 / 13.238 B | mismas queries |
| detalle | 3 / 1.449 B | 3 / 1.466 B | mismas queries, +17 B |

`featured()` usa una única consulta de candidatos después de resolver tenant/lista. El detalle incorpora el flag de actividad para distinguir `PRODUCT_NOT_VISIBLE`; el incremento es 1,2 % sobre un payload pequeño.

### Smoke de producción

- `/demo-commerce`: HTTP 200, 32.739 B.
- `/demo-commerce?view=all`: HTTP 200, 33.041 B.
- búsqueda: HTTP 200, 15.909 B.
- detalle: HTTP 200, 11.793 B y URL `https://wa.me/` generada por el SDK.
- SKU inexistente: HTTP 404.
- `/catalogo`: HTTP 200, 79.096 B.

### Seguridad y límites

- cero secrets o valores de `SUPABASE_SERVICE_ROLE_KEY` en `.next/static`;
- los chunks de la demo no contienen SDK, Supabase, repositories, casos de uso, componentes RB ni Draft Order;
- el único `NEXT_PUBLIC_*` usado por la integración es el slug público del tenant;
- no se agregaron dependencias visuales ni de runtime.

## Fricciones remanentes verificadas

Las cuatro fricciones registradas en v1 quedaron resueltas. La única limitación explícita es que `featured()` todavía no representa curaduría manual: devuelve una selección pública estable y determinística. Esto es deliberado porque no existe señal persistida de negocio y el alcance prohíbe inventarla.

No se identificó otro método faltante durante la migración v1.1.

## Respuestas finales

### ¿La demo pudo construirse sin conocer Supabase?

Sí. No conoce tablas, relaciones, columnas, RLS, credenciales ni sintaxis de Supabase. Los barridos de imports y chunks lo verifican.

### ¿El diseño fue realmente independiente?

Sí. Sólo comparte los DTO y decisiones de Commerce. La estructura, paleta, tipografía, ritmo, filas editoriales, detalle y 404 son propios de la demo.

### ¿Qué tan rápida fue la integración?

La implementación v1 fue 2 h 55 min. Con v1.1, una integración equivalente se estima en 2 h 20 min porque destacados, WhatsApp y not-found ya no requieren diseño técnico local.

### ¿Qué partes del SDK necesitan mejora?

No quedó una fricción bloqueante verificada. La estrategia destacada deberá sustituirse cuando exista una señal real de curaduría; la separación de política ya prepara ese cambio sin exponerlo prematuramente.

### ¿Estamos cerca del objetivo de integración en menos de 4 horas?

Sí. La segunda experiencia ya estuvo por debajo de 3 horas y la estimación v1.1 queda a 20 minutos de 2 horas, mucho más cerca de 2 que de 4.
