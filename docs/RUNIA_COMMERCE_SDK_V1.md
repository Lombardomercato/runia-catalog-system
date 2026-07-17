# Runia Commerce SDK interno v1.1

Estado: implementado  
Superficie: server-only, interna al repositorio  
UI, React, hooks y CSS: fuera de alcance

## 1. Objetivo

El SDK es la interfaz pública interna que una web de Runia usa para leer tenant, selección destacada, catálogo, taxonomías, detalle, precio y destino de WhatsApp. La web no conoce Supabase, tablas, adapters, `tenant_id`, `price_lists` ni credenciales.

La v1.1 resuelve únicamente fricciones verificadas por `/demo-commerce`:

- selección inicial explícita con `products.featured()`;
- construcción segura de una URL de WhatsApp;
- códigos y guards públicos para not-found y estados esperables;
- política documentada de ciclo de vida y memoización.

El SDK reutiliza el Domain Layer. No replica reglas de visibilidad, tenant, lista pública ni pricing.

## 2. Instalación interna

No existe paquete npm ni se agregaron dependencias. Dentro de este repositorio:

```ts
import { createCommerceClient } from '@/sdk/server';
```

El consumidor debe ser un Server Component, Route Handler, Server Action o módulo exclusivamente servidor.

## 3. Crear y conservar el cliente

Crear una instancia por request o árbol de render:

```ts
import { createCommerceClient } from '@/sdk/server';

export async function renderPage() {
  const commerce = createCommerceClient({
    tenantSlug: process.env.NEXT_PUBLIC_TENANT_SLUG ?? 'rb-distribuidora',
  });

  return commerce.products.featured();
}
```

### Política de ciclo de vida v1.1

- La instancia está asociada a un solo `tenantSlug` y debe durar, como máximo, un request/render.
- Sólo se memoiza la promesa de resolución de `TenantPublicConfig` dentro de esa instancia. Llamadas concurrentes a tenant, products y pricing comparten esa resolución.
- La memoización termina cuando la instancia deja de ser referenciada. No existe cache global, distribuida ni con TTL en el SDK.
- Entre requests no se comparte estado si cada request crea su cliente, que es la política recomendada.
- Productos, candidatos destacados, detalle y contexto de precio no se memoizan: cada método vuelve a consultar su snapshot comercial.
- La configuración de tenant incluye la identidad de la lista pública vigente. Una instancia global de módulo podría retener esa selección y branding durante toda la vida del proceso; por eso no está soportada como patrón de consumo.
- No cachear indefinidamente DTOs de productos ni precios. Si una web agrega cache por encima del SDK, debe tener invalidación o revalidación explícita y una política comercial acordada.

Esta política evita una cache global riesgosa y reduce el riesgo de precios obsoletos sin duplicar la resolución de tenant dentro de una misma página.

## 4. API v1.1

```ts
await commerce.tenant.getPublicConfig();
await commerce.tenant.buildWhatsAppUrl({ message });

await commerce.products.featured({ limit, category, brand });
await commerce.products.list({ search, category, brand, sort, page, pageSize });
await commerce.products.getBySku(sku);

await commerce.categories.list();
await commerce.brands.list();
await commerce.pricing.resolve({ productId });
```

### Tenant

```ts
const tenant = await commerce.tenant.getPublicConfig();
```

Devuelve nombre, slug, branding público, contacto, moneda, locale y feature flags públicos. `features.showPrices` expresa si la web debería presentar importes; no cambia la resolución autoritativa del precio. No devuelve ID interno, lista de precio, estado administrativo, settings privados ni secrets.

### Featured

```ts
const featured = await commerce.products.featured({
  limit: 6,
  category: categoryId,
  brand: brandId,
});
```

Contrato v1.1:

- límite por defecto: 3;
- límite máximo seguro: 12; valores mayores se acotan a 12;
- sólo productos activos, con categoría y marca activas;
- sólo productos con precio público válido en la lista pública vigente;
- aislamiento por tenant en repository y Domain Layer;
- filtros opcionales por ID de categoría y marca;
- una única consulta de candidatos una vez resuelto el tenant;
- orden determinístico por nombre, SKU e ID opaco como desempate.

La estrategia explícita se llama `stable_name_sku_id_v1`. El modelo actual no posee `products.sort_order` ni un destacado persistido, por lo que la v1.1 no finge que los “primeros productos” sean una selección manual. La política es una dependencia separada e inyectable para permitir en el futuro destacados manuales, orden editorial o campañas sin cambiar el contrato público. No se agregaron migraciones ni comportamiento de campañas.

### Products list

```ts
const result = await commerce.products.list({
  search: 'cepillo',
  category: 'category-uuid',
  brand: 'brand-uuid',
  sort: 'price_asc',
  page: 1,
  pageSize: 24,
});
```

`sort` acepta `name_asc`, `name_desc`, `price_asc`, `price_desc` y `sku_asc`. Todos los órdenes tienen desempates estables. El resultado contiene `products`, `categories`, `brands`, `pagination` y `totalProducts`; usar sus taxonomías cuando la pantalla ya necesita el listado evita consultas adicionales.

El modo pequeño actual admite hasta 100 productos. Antes del producto 101 debe implementarse la paginación SQL definida en el Performance Contract.

### Product y pricing

```ts
type CommerceProduct = {
  id: string;
  sku: string;
  name: string;
  productLine: string | null;
  variant: string | null;
  category: { id: string; name: string };
  brand: { id: string; name: string };
  price: { amount: string; currency: string };
};
```

`products.getBySku()` agrega `description`. El monto se mantiene como string decimal para evitar pérdida de precisión.

```ts
const price = await commerce.pricing.resolve({ productId });
```

`pricing.resolve()` devuelve `productId`, `amount`, `currency` y `source`. No permite elegir listas privadas ni expone costos o reglas internas.

### Categories y brands

```ts
const categories = await commerce.categories.list();
const brands = await commerce.brands.list();
```

Cada entidad contiene sólo `id` y `name`. Repository y Domain vuelven a comprobar tenant y estado activo.

### WhatsApp

El mensaje es copy de Runia Web; el SDK sólo resuelve el destino público:

```ts
const action = await commerce.tenant.buildWhatsAppUrl({
  message: `Hola, quiero consultar por ${product.name}.`,
});

if (action.available) {
  return <a href={action.url}>Consultar</a>;
}

// action.code === 'WHATSAPP_NOT_CONFIGURED': ocultar el CTA.
```

El helper usa el WhatsApp público del tenant, elimina separadores y prefijo internacional `00`, valida entre 8 y 15 dígitos y codifica el mensaje con `encodeURIComponent`. Si el número falta o no es utilizable devuelve un resultado controlado, no una URL incompleta ni un error interno.

## 5. Errores públicos

Los métodos que fallan rechazan con `CommerceSdkError`, con `code`, `operation` y un mensaje seguro. La instancia ofrece guards para que la web no dependa de `instanceof`:

```ts
try {
  await commerce.products.getBySku(sku);
} catch (error) {
  if (commerce.errors.isNotFound(error)) {
    notFound();
  }

  if (commerce.errors.hasCode(error, 'PUBLIC_PRICE_NOT_FOUND')) {
    // Estado sin precio público.
  }

  throw error;
}
```

Códigos estables v1.1:

- `INVALID_CLIENT_CONFIG`, `INVALID_INPUT`;
- `TENANT_NOT_FOUND`, `TENANT_INACTIVE`, `PUBLIC_CATALOG_DISABLED`;
- `PRODUCT_NOT_FOUND`, `PRODUCT_NOT_VISIBLE`;
- `PUBLIC_PRICE_LIST_NOT_FOUND`, `PUBLIC_PRICE_NOT_FOUND`, `CURRENCY_UNAVAILABLE`;
- `WHATSAPP_NOT_CONFIGURED`;
- `REPOSITORY_FAILURE`.

`isNotFound()` cubre tenant inexistente, producto inexistente y producto no visible. `hasCode()` permite decidir entre 404, estado vacío, CTA oculto o logging. El helper de WhatsApp representa la ausencia como resultado; el código existe también como parte del vocabulario público estable.

Los errores de Supabase se capturan y normalizan. No se exponen causas, payloads, nombres de tablas ni mensajes del adapter.

## 6. Restricción server-only

Los entrypoints soportados importan `server-only`. Un Client Component no puede importar el SDK en runtime. Los tipos pueden usarse con `import type` porque se eliminan durante compilación.

El SDK no contiene JSX, React, hooks, CSS, imágenes, iconos ni animaciones.

## 7. Ejemplo de integración server-first

```tsx
import { createCommerceClient } from '@/sdk/server';

export default async function CatalogPage() {
  const commerce = createCommerceClient({ tenantSlug: 'rb-distribuidora' });
  const [tenant, products] = await Promise.all([
    commerce.tenant.getPublicConfig(),
    commerce.products.featured({ limit: 6 }),
  ]);

  return (
    <main style={{ color: tenant.primaryColor }}>
      {products.map((product) => (
        <article key={product.id}>{product.name}</article>
      ))}
    </main>
  );
}
```

La estructura visual, copy y comportamiento de UI pertenecen a Runia Web. No importar `modules/*`, repositories, `lib/supabaseServer` ni casos de uso individuales.

## 8. Consumidores

`/catalogo` y `/demo-commerce` consumen el mismo SDK y mantienen experiencias visuales independientes. La demo v1.1 usa:

- `products.featured()` para su selección inicial;
- `products.list()` para búsqueda, filtros, paginación e índice completo;
- `tenant.buildWhatsAppUrl()` para el CTA;
- `commerce.errors.isNotFound()` para resolver el 404 de producto;
- un cliente nuevo por render.

Draft Order continúa fuera del SDK v1.1.

## 9. Performance v1 frente a v1.1

Medición del 2026-07-14 con el mismo tenant y build de producción:

| Métrica | SDK v1 | SDK v1.1 | Delta |
| --- | ---: | ---: | ---: |
| Consultas inicial `/demo-commerce` | 5 | 5 | 0 |
| Payload Supabase inicial | 13.774 B | 9.720 B | -4.054 B (-29,4 %) |
| Consultas listado completo | 5 | 5 | 0 |
| Payload Supabase listado completo | 13.774 B | 13.238 B | -536 B |
| Consultas detalle | 3 | 3 | 0 |
| Payload Supabase detalle | 1.449 B | 1.466 B | +17 B (+1,2 %) |
| JS gzip `/demo-commerce` | 106.277 B | 106.280 B | +3 B |
| JS gzip detalle | 106.277 B | 106.280 B | +3 B |

La selección `featured` reemplaza el listado completo inicial sin agregar consultas y reduce el payload. Los 17 B adicionales del detalle corresponden a traer el estado activo necesario para distinguir producto inexistente de producto no visible. No es una regresión significativa.

Build final v1.1: 55,7 s total, 7,6 s de compilación. El build v1 observado fue 68,5 s/11,2 s; la diferencia depende de cache y entorno y no se atribuye al SDK. TypeScript, build y 22 contratos pasan.

No se agregaron dependencias. Los chunks cliente no contienen SDK, Supabase, adapters, repositorios, `service_role` ni el valor de `SUPABASE_SERVICE_ROLE_KEY`.

## 10. Pruebas de contrato

```bash
npm run test:sdk
```

La suite conserva los 13 contratos v1 y agrega cobertura para:

- aislamiento de `featured` por tenant;
- sólo productos visibles y con precio público;
- límite seguro, filtros y orden determinístico;
- WhatsApp configurado y ausente;
- códigos y guards públicos;
- ausencia de repositories, resolvers e implementaciones internas en la API.

No escribe datos en Supabase.

## 11. Fuera de v1.1

- destacados persistidos, campañas y orden editorial administrable;
- cache distribuida;
- Draft Orders dentro del SDK;
- Client SDK, hooks React y componentes visuales;
- API pública remota, autenticación, carrito y checkout;
- paquete npm y Setup Engine.
