import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  PublicBrandSnapshot,
  PublicCatalogSnapshot,
  PublicCategorySnapshot,
  PublicProductDetailSnapshot,
  PublicProductSnapshot,
} from '@/core/products/interfaces';
import { ResolvePublicPrice } from '@/core/pricing/use-cases/ResolvePublicPrice';
import type {
  PublicTenantRepository,
  PublicTenantSnapshot,
} from '@/core/tenant/interfaces';
import { CommerceSdkError } from './errors';
import type {
  CommerceDataRepository,
  PublicPriceContext,
} from './internal/dependencies';
import { createCommerceClientWithDependencies } from './internal/createCommerceClientWithDependencies';

test('aisla productos y resolucion de tenant por cliente', async () => {
  const fixture = createFixture();
  const commerceA = fixture.client('tenant-a');
  const commerceB = fixture.client('tenant-b');
  const [tenantA, listA, listB] = await Promise.all([
    commerceA.tenant.getPublicConfig(),
    commerceA.products.list(),
    commerceB.products.list(),
  ]);
  assert.equal(tenantA.slug, 'tenant-a');
  assert.deepEqual(listA.products.map((product) => product.sku), ['SHARED', 'A-002']);
  assert.deepEqual(listB.products.map((product) => product.sku), ['SHARED']);
  assert.equal(fixture.tenantRepository.loads.get('tenant-a'), 1);
  assert.equal(fixture.tenantRepository.loads.get('tenant-b'), 1);
  assert.ok(fixture.dataRepository.catalogTenantIds.every((id) => id === 'tenant-a-id' || id === 'tenant-b-id'));
});

test('aisla la resolucion de precios entre tenants', async () => {
  const fixture = createFixture();
  const [priceA, priceB] = await Promise.all([
    fixture.client('tenant-a').pricing.resolve({ productId: ' shared-id ' }),
    fixture.client('tenant-b').pricing.resolve({ productId: 'shared-id' }),
  ]);
  assert.equal(priceA.amount, '100.00');
  assert.equal(priceB.amount, '200.00');
  assert.deepEqual(fixture.dataRepository.priceTenantIds.sort(), [
    'tenant-a-id',
    'tenant-b-id',
  ]);
});

test('featured respeta el aislamiento por tenant', async () => {
  const fixture = createFixture();
  const [productsA, productsB] = await Promise.all([
    fixture.client('tenant-a').products.featured({ limit: 12 }),
    fixture.client('tenant-b').products.featured({ limit: 12 }),
  ]);
  assert.deepEqual(productsA.map((product) => product.name), ['Alpha', 'Beta']);
  assert.deepEqual(productsB.map((product) => product.name), ['Producto B']);
  assert.deepEqual(fixture.dataRepository.featuredTenantIds.sort(), [
    'tenant-a-id',
    'tenant-b-id',
  ]);
});

test('featured devuelve solo productos visibles con precio publico', async () => {
  const products = await createFixture()
    .client('tenant-a')
    .products.featured({ limit: 12 });
  assert.deepEqual(products.map((product) => product.sku), ['SHARED', 'A-002']);
});

test('featured respeta el limite seguro', async () => {
  const commerce = createFixture().client('tenant-a');
  assert.equal((await commerce.products.featured({ limit: 1 })).length, 1);
  assert.equal((await commerce.products.featured({ limit: 1000 })).length, 2);
  await expectCode(() => commerce.products.featured({ limit: 0 }), 'INVALID_INPUT');
});

test('featured aplica un orden deterministico independiente del repositorio', async () => {
  const commerce = createFixture().client('tenant-a');
  const first = await commerce.products.featured({ limit: 12 });
  const second = await commerce.products.featured({ limit: 12 });
  assert.deepEqual(first.map((product) => product.sku), ['SHARED', 'A-002']);
  assert.deepEqual(second, first);
});

test('featured respeta filtros de categoria y marca', async () => {
  const commerce = createFixture().client('tenant-a');
  const matching = await commerce.products.featured({
    category: 'category-active',
    brand: 'brand-active',
    limit: 12,
  });
  const hiddenCategory = await commerce.products.featured({
    category: 'category-inactive',
    limit: 12,
  });

  assert.deepEqual(matching.map((product) => product.sku), ['SHARED', 'A-002']);
  assert.deepEqual(hiddenCategory, []);
});

test('informa tenant inexistente con un error controlado', async () => {
  const fixture = createFixture();
  await expectCode(
    () => fixture.client('does-not-exist').tenant.getPublicConfig(),
    'TENANT_NOT_FOUND',
  );
});

test('informa producto inexistente sin consultar otro tenant', async () => {
  const fixture = createFixture();
  await expectCode(
    () => fixture.client('tenant-a').products.getBySku('DOES-NOT-EXIST'),
    'PRODUCT_NOT_FOUND',
  );
});

test('oculta productos inactivos', async () => {
  const fixture = createFixture();
  await expectCode(
    () => fixture.client('tenant-a').products.getBySku('INACTIVE'),
    'PRODUCT_NOT_VISIBLE',
  );
});

test('oculta productos con categoria o marca inactiva', async () => {
  const fixture = createFixture();
  const commerce = fixture.client('tenant-a');
  await expectCode(() => commerce.products.getBySku('BAD-CATEGORY'), 'PRODUCT_NOT_VISIBLE');
  await expectCode(() => commerce.products.getBySku('BAD-BRAND'), 'PRODUCT_NOT_VISIBLE');
});

test('rechaza un producto sin precio publico', async () => {
  const fixture = createFixture();
  const commerce = fixture.client('tenant-a');
  await expectCode(() => commerce.products.getBySku('NO-PRICE'), 'PUBLIC_PRICE_NOT_FOUND');
  await expectCode(
    () => commerce.pricing.resolve({ productId: 'no-price' }),
    'PUBLIC_PRICE_NOT_FOUND',
  );
});

test('rechaza tenant sin lista publica', async () => {
  const fixture = createFixture();
  await expectCode(
    () => fixture.client('tenant-no-list').tenant.getPublicConfig(),
    'PUBLIC_PRICE_LIST_NOT_FOUND',
  );
});

test('rechaza tenant inactivo', async () => {
  const fixture = createFixture();
  await expectCode(
    () => fixture.client('tenant-inactive').products.list(),
    'TENANT_INACTIVE',
  );
});

test('mantiene filtros, orden y paginacion del Domain', async () => {
  const fixture = createFixture();
  const commerce = fixture.client('tenant-a');
  const first = await commerce.products.list({
    category: 'category-active',
    sort: 'name_asc',
    page: 1,
    pageSize: 1,
  });
  const second = await commerce.products.list({
    category: 'category-active',
    sort: 'name_asc',
    page: 2,
    pageSize: 1,
  });
  const searched = await commerce.products.list({ search: 'a-002' });
  const byBrand = await commerce.products.list({ brand: 'brand-active' });
  const byDescendingPrice = await commerce.products.list({ sort: 'price_desc' });
  assert.equal(first.pagination.total, 2);
  assert.equal(first.pagination.totalPages, 2);
  assert.equal(first.products.length, 1);
  assert.equal(second.pagination.page, 2);
  assert.notEqual(first.products[0]?.id, second.products[0]?.id);
  assert.deepEqual(searched.products.map((product) => product.sku), ['A-002']);
  assert.deepEqual(byBrand.products.map((product) => product.sku), ['SHARED', 'A-002']);
  assert.deepEqual(
    byDescendingPrice.products.map((product) => product.sku),
    ['A-002', 'SHARED'],
  );
});

test('normaliza entradas invalidas como errores del SDK', async () => {
  const fixture = createFixture();
  const commerce = fixture.client('tenant-a');
  await expectCode(
    () => commerce.products.list(null as never),
    'INVALID_INPUT',
  );
  await expectCode(
    () => commerce.products.getBySku(null as unknown as string),
    'INVALID_INPUT',
  );
  await expectCode(
    () => commerce.pricing.resolve(null as never),
    'INVALID_INPUT',
  );
  await expectCode(
    () => commerce.tenant.buildWhatsAppUrl({ message: '   ' }),
    'INVALID_INPUT',
  );
});

test('construye WhatsApp publico normalizado sin imponer copy', async () => {
  const commerce = createFixture().client('tenant-a');
  const result = await commerce.tenant.buildWhatsAppUrl({
    message: 'Hola & precio?',
  });
  assert.deepEqual(result, {
    available: true,
    url: 'https://wa.me/5491112345678?text=Hola%20%26%20precio%3F',
    code: null,
  });
});

test('informa WhatsApp ausente como estado controlado', async () => {
  const result = await createFixture()
    .client('tenant-no-whatsapp')
    .tenant.buildWhatsAppUrl({ message: 'Consulta' });
  assert.deepEqual(result, {
    available: false,
    url: null,
    code: 'WHATSAPP_NOT_CONFIGURED',
  });
});

test('expone codigos y guards publicos estables', async () => {
  const commerce = createFixture().client('tenant-a');
  const missing = await expectCode(
    () => commerce.products.getBySku('DOES-NOT-EXIST'),
    'PRODUCT_NOT_FOUND',
  );
  const invisible = await expectCode(
    () => commerce.products.getBySku('INACTIVE'),
    'PRODUCT_NOT_VISIBLE',
  );
  const noPrice = await expectCode(
    () => commerce.products.getBySku('NO-PRICE'),
    'PUBLIC_PRICE_NOT_FOUND',
  );
  const invisiblePrice = await expectCode(
    () => commerce.pricing.resolve({ productId: 'inactive' }),
    'PRODUCT_NOT_VISIBLE',
  );
  assert.equal(commerce.errors.isSdkError(missing), true);
  assert.equal(commerce.errors.isNotFound(missing), true);
  assert.equal(commerce.errors.isNotFound(invisible), true);
  assert.equal(commerce.errors.isNotFound(invisiblePrice), true);
  assert.equal(commerce.errors.isNotFound(noPrice), false);
  assert.equal(commerce.errors.hasCode(noPrice, 'PUBLIC_PRICE_NOT_FOUND'), true);
  assert.equal('cause' in missing, false);
  assert.equal(
    JSON.stringify([missing, invisible, invisiblePrice, noPrice]).includes('Supabase'),
    false,
  );
});

test('no expone repositories, resolvers ni implementaciones internas', () => {
  const commerce = createFixture().client('tenant-a');
  assert.deepEqual(Object.keys(commerce).sort(), [
    'brands',
    'categories',
    'errors',
    'pricing',
    'products',
    'tenant',
  ]);
  assert.deepEqual(Object.keys(commerce.products).sort(), ['featured', 'getBySku', 'list']);
  assert.deepEqual(Object.keys(commerce.tenant).sort(), ['buildWhatsAppUrl', 'getPublicConfig']);
  const serialized = JSON.stringify(commerce);
  assert.equal(serialized.includes('repository'), false);
  assert.equal(serialized.includes('resolver'), false);
  assert.equal(serialized.includes('Supabase'), false);
});

test('proyecta configuracion publica sin campos internos', async () => {
  const fixture = createFixture();
  const config = await fixture.client('tenant-a').tenant.getPublicConfig();
  assert.deepEqual(Object.keys(config).sort(), [
    'currency',
    'email',
    'features',
    'locale',
    'logoUrl',
    'name',
    'primaryColor',
    'secondaryColor',
    'slug',
    'whatsapp',
  ]);
  const serialized = JSON.stringify(config);
  assert.equal(serialized.includes('tenant-a-id'), false);
  assert.equal(serialized.includes('price-list'), false);
  assert.equal(serialized.includes('defaultPriceListId'), false);
  assert.equal(serialized.includes('status'), false);
  assert.equal(serialized.includes('importer'), false);
  assert.equal(serialized.includes('invoicing'), false);
  assert.deepEqual(Object.keys(config.features).sort(), [
    'accountLogin',
    'images',
    'multiplePriceLists',
    'orders',
    'publicCatalog',
    'showPrices',
    'stock',
  ]);
});

test('categories y brands devuelven solamente entidades activas del tenant', async () => {
  const fixture = createFixture();
  const commerce = fixture.client('tenant-a');
  const [categories, brands] = await Promise.all([
    commerce.categories.list(),
    commerce.brands.list(),
  ]);
  assert.deepEqual(categories, [{ id: 'category-active', name: 'Activa' }]);
  assert.deepEqual(brands, [{ id: 'brand-active', name: 'Activa' }]);
});

async function expectCode(
  operation: () => Promise<unknown>,
  code: CommerceSdkError['code'],
) {
  let captured: CommerceSdkError | null = null;
  await assert.rejects(operation, (error) => {
    assert.ok(error instanceof CommerceSdkError);
    assert.equal(error.code, code);
    captured = error;
    return true;
  });
  assert.ok(captured);
  return captured;
}

function createFixture() {
  const tenantRepository = new MemoryTenantRepository([
    tenant('tenant-a'),
    tenant('tenant-b'),
    tenant('tenant-inactive', { status: 'inactive' }),
    tenant('tenant-no-list', { priceLists: [], defaultPriceListId: null }),
    tenant('tenant-no-whatsapp', { whatsapp: null }),
  ]);
  const dataRepository = new MemoryCommerceRepository(new Map([
    ['tenant-a-id', tenantACatalog()],
    ['tenant-b-id', tenantBCatalog()],
  ]));
  return {
    tenantRepository,
    dataRepository,
    client(tenantSlug: string) {
      return createCommerceClientWithDependencies(
        { tenantSlug },
        {
          tenantRepository,
          dataRepository,
          priceResolver: new ResolvePublicPrice(),
        },
      );
    },
  };
}

class MemoryTenantRepository implements PublicTenantRepository {
  readonly loads = new Map<string, number>();
  private readonly tenants: Map<string, PublicTenantSnapshot>;

  constructor(tenants: PublicTenantSnapshot[]) {
    this.tenants = new Map(tenants.map((value) => [value.slug, value]));
  }

  async loadPublicTenantSnapshot(slug: string) {
    this.loads.set(slug, (this.loads.get(slug) ?? 0) + 1);
    return this.tenants.get(slug) ?? null;
  }
}

class MemoryCommerceRepository implements CommerceDataRepository {
  readonly catalogTenantIds: string[] = [];
  readonly priceTenantIds: string[] = [];
  readonly featuredTenantIds: string[] = [];

  constructor(private readonly catalogs: Map<string, PublicCatalogSnapshot>) {}

  async loadCatalogSnapshot(tenantId: string) {
    this.catalogTenantIds.push(tenantId);
    return cloneCatalog(this.catalogs.get(tenantId) ?? emptyCatalog());
  }

  async loadProductBySkuSnapshot(
    tenantId: string,
    sku: string,
  ): Promise<PublicProductDetailSnapshot> {
    const catalog = this.catalogs.get(tenantId) ?? emptyCatalog();
    const product = catalog.products.find((candidate) => candidate.sku === sku) ?? null;
    return {
      product,
      category: product
        ? catalog.categories.find((candidate) => candidate.id === product.categoryId) ?? null
        : null,
      brand: product
        ? catalog.brands.find((candidate) => candidate.id === product.brandId) ?? null
        : null,
    };
  }

  async loadFeaturedCandidatesSnapshot(
    tenantId: string,
    _priceListId: string,
    input: { limit: number; categoryId: string | null; brandId: string | null },
  ) {
    this.featuredTenantIds.push(tenantId);
    const catalog = this.catalogs.get(tenantId) ?? emptyCatalog();
    return catalog.products
      .filter((product) => !input.categoryId || product.categoryId === input.categoryId)
      .filter((product) => !input.brandId || product.brandId === input.brandId)
      .slice(0, input.limit)
      .map((product) => ({
        product,
        category: catalog.categories.find((value) => value.id === product.categoryId) ?? null,
        brand: catalog.brands.find((value) => value.id === product.brandId) ?? null,
      }));
  }

  async listPublicCategories(tenantId: string) {
    return [...(this.catalogs.get(tenantId)?.categories ?? [])];
  }

  async listPublicBrands(tenantId: string) {
    return [...(this.catalogs.get(tenantId)?.brands ?? [])];
  }

  async loadPublicPriceContext(
    tenantId: string,
    productId: string,
  ): Promise<PublicPriceContext | null> {
    this.priceTenantIds.push(tenantId);
    const catalog = this.catalogs.get(tenantId) ?? emptyCatalog();
    const product = catalog.products.find((candidate) => candidate.id === productId);
    if (!product) return null;
    const category = catalog.categories.find((candidate) => candidate.id === product.categoryId);
    const brand = catalog.brands.find((candidate) => candidate.id === product.brandId);
    return {
      productId: product.id,
      productActive: product.active,
      categoryActive: category?.active === true,
      brandActive: brand?.active === true,
      prices: [...product.prices],
    };
  }
}

function tenant(
  slug: string,
  overrides: Partial<PublicTenantSnapshot> = {},
): PublicTenantSnapshot {
  const priceListId = `${slug}-price-list`;
  return {
    id: `${slug}-id`,
    slug,
    status: 'active',
    commercialName: `Commerce ${slug}`,
    websiteUrl: 'https://example.test',
    whatsapp: '5491112345678',
    email: 'public@example.test',
    currency: 'ARS',
    locale: 'es-AR',
    defaultPriceListId: priceListId,
    branding: {
      logoUrl: 'https://example.test/logo.webp',
      primaryColor: '#14b8a6',
      secondaryColor: '#0f172a',
    },
    features: {
      showPrices: true,
      publicCatalog: true,
      orders: true,
      accountLogin: false,
      multiplePriceLists: false,
      importer: false,
      images: false,
      stock: false,
      invoicing: false,
    },
    priceLists: [{
      id: priceListId,
      code: 'publica',
      name: 'Publica',
      active: true,
      isDefault: true,
    }],
    ...overrides,
  };
}

function tenantACatalog(): PublicCatalogSnapshot {
  const categories = taxonomyCategories();
  const brands = taxonomyBrands();
  return {
    categories,
    brands,
    products: [
      product('a-002', 'A-002', 'Beta', 'tenant-a-price-list', { amount: '150.00' }),
      product('shared-id', 'SHARED', 'Alpha', 'tenant-a-price-list'),
      product('no-price', 'NO-PRICE', 'Sin precio', 'tenant-a-price-list', { prices: [] }),
      product('inactive', 'INACTIVE', 'Inactivo', 'tenant-a-price-list', { active: false }),
      product('bad-category', 'BAD-CATEGORY', 'Categoria inactiva', 'tenant-a-price-list', { categoryId: 'category-inactive' }),
      product('bad-brand', 'BAD-BRAND', 'Marca inactiva', 'tenant-a-price-list', { brandId: 'brand-inactive' }),
    ],
  };
}

function tenantBCatalog(): PublicCatalogSnapshot {
  return {
    categories: taxonomyCategories(),
    brands: taxonomyBrands(),
    products: [product('shared-id', 'SHARED', 'Producto B', 'tenant-b-price-list', { amount: '200.00' })],
  };
}

function taxonomyCategories(): PublicCategorySnapshot[] {
  return [
    { id: 'category-active', name: 'Activa', active: true, sortOrder: 1 },
    { id: 'category-inactive', name: 'Inactiva', active: false, sortOrder: 2 },
  ];
}

function taxonomyBrands(): PublicBrandSnapshot[] {
  return [
    { id: 'brand-active', name: 'Activa', active: true },
    { id: 'brand-inactive', name: 'Inactiva', active: false },
  ];
}

function product(
  id: string,
  sku: string,
  name: string,
  priceListId: string,
  overrides: Partial<PublicProductSnapshot> & { amount?: string } = {},
): PublicProductSnapshot {
  const { amount = '100.00', ...productOverrides } = overrides;
  return {
    id,
    sku,
    name,
    description: `Descripcion ${name}`,
    line: null,
    variant: null,
    categoryId: 'category-active',
    brandId: 'brand-active',
    active: true,
    prices: [{
      priceListId,
      amount,
      currency: 'ARS',
      pricingMode: 'manual',
      calculatedFromCost: false,
    }],
    ...productOverrides,
  };
}

function cloneCatalog(catalog: PublicCatalogSnapshot): PublicCatalogSnapshot {
  return {
    categories: [...catalog.categories],
    brands: [...catalog.brands],
    products: catalog.products.map((value) => ({ ...value, prices: [...value.prices] })),
  };
}

function emptyCatalog(): PublicCatalogSnapshot {
  return { categories: [], brands: [], products: [] };
}
