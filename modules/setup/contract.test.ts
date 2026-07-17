import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type {
  PublicBrandSnapshot,
  PublicCatalogSnapshot,
  PublicCategorySnapshot,
  PublicProductDetailSnapshot,
} from '@/core/products/interfaces';
import { ResolvePublicPrice } from '@/core/pricing/use-cases/ResolvePublicPrice';
import type {
  CommerceTenantSetupRepository,
  CreatedCommerceTenantSetup,
  PreparedCommerceTenantSetup,
} from '@/core/tenant/setup';
import type {
  PublicTenantRepository,
  PublicTenantSnapshot,
} from '@/core/tenant/interfaces';
import { CreateCommerceTenant } from '@/core/tenant/use-cases/CreateCommerceTenant';
import { PrepareTenantDefaults } from '@/core/tenant/use-cases/PrepareTenantDefaults';
import { CommerceSdkError } from '@/sdk/server/errors';
import type {
  CommerceDataRepository,
  PublicPriceContext,
} from '@/sdk/server/internal/dependencies';
import { createCommerceClientWithDependencies } from '@/sdk/server/internal/createCommerceClientWithDependencies';
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionValue,
} from '@/lib/adminAuth';
import {
  RUNIA_INTERNAL_SESSION_COOKIE,
  createRuniaInternalSessionValue,
} from '@/lib/runiaInternalAuth';
import { buildImportReport } from '@/modules/imports/mapper';

test('prepara identidad, contacto y defaults comerciales normalizados', () => {
  const result = new PrepareTenantDefaults().execute({
    name: '  Órbita Comercial  ',
    slug: ' Órbita Comercial ',
    email: ' ventas@orbita.test ',
    whatsapp: '00 54 9 11 5555 4444',
    currency: 'ars',
    locale: 'es-ar',
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.name, 'Órbita Comercial');
  assert.equal(result.value.slug, 'orbita-comercial');
  assert.equal(result.value.email, 'ventas@orbita.test');
  assert.equal(result.value.whatsapp, '+5491155554444');
  assert.equal(result.value.currency, 'ARS');
  assert.equal(result.value.locale, 'es-AR');
  assert.equal(result.value.status, 'active');
  assert.deepEqual(result.value.priceLists.map((list) => list.code), [
    'minorista',
    'mayorista',
  ]);
  assert.equal(result.value.priceLists.filter((list) => list.isDefault).length, 1);
});

test('rechaza configuraciones sin una unica lista default activa', () => {
  const useCase = new PrepareTenantDefaults();
  const none = useCase.execute({
    name: 'Sin default',
    slug: 'sin-default',
    priceLists: [priceList('minorista', false)],
  });
  const two = useCase.execute({
    name: 'Dos defaults',
    slug: 'dos-defaults',
    priceLists: [priceList('minorista', true), priceList('mayorista', true)],
  });
  const inactive = useCase.execute({
    name: 'Default inactivo',
    slug: 'default-inactivo',
    priceLists: [{ ...priceList('minorista', true), active: false }],
  });

  assertInvalidPriceLists(none);
  assertInvalidPriceLists(two);
  assertInvalidPriceLists(inactive);
});

test('crea una sola vez y el retry por slug devuelve error controlado', async () => {
  const repository = new MemorySetupRepository();
  const useCase = new CreateCommerceTenant(repository);
  const input = validInput();
  const first = await useCase.execute(input);
  const retry = await useCase.execute(input);

  assert.equal(first.ok, true);
  assert.equal(retry.ok, false);
  if (!retry.ok) {
    assert.equal(retry.error.code, 'TENANT_ALREADY_EXISTS');
    assert.equal(retry.error.fieldErrors.slug, 'El slug ya está en uso.');
  }
  assert.equal(repository.created, 1);
  assert.equal(repository.records.size, 1);
});

test('persiste listas y feature flags preparados sin reinterpretarlos', async () => {
  const repository = new MemorySetupRepository();
  const result = await new CreateCommerceTenant(repository).execute({
    ...validInput(),
    features: {
      showPrices: false,
      publicCatalog: true,
      orders: false,
      importer: true,
      multiplePriceLists: false,
      images: true,
      wholesaleLogin: true,
    },
    priceLists: [
      { ...priceList('web', true), pricingMode: 'cost_plus_percent', marginPercent: 35 },
      priceList('cuentas', false),
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.features, {
    showPrices: false,
    publicCatalog: true,
    orders: false,
    importer: true,
    multiplePriceLists: false,
    images: true,
    wholesaleLogin: true,
  });
  assert.equal(result.value.priceLists.length, 2);
  assert.equal(result.value.priceLists[0].pricingMode, 'cost_plus_percent');
  assert.equal(result.value.priceLists[0].marginPercent, 35);
  assert.equal(result.value.priceLists.filter((list) => list.isDefault).length, 1);
});

test('normaliza fallos del adapter sin exponer detalles internos', async () => {
  const result = await new CreateCommerceTenant({
    async createAtomically() {
      throw new Error('Supabase relation public.tenants leaked');
    },
  }).execute(validInput());

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'REPOSITORY_FAILURE');
    assert.equal(JSON.stringify(result.error).includes('Supabase'), false);
    assert.equal(JSON.stringify(result.error).includes('public.tenants'), false);
  }
});

test('el SDK resuelve el tenant active creado y aisla otro slug', async () => {
  const repository = new MemorySetupRepository();
  const created = await new CreateCommerceTenant(repository).execute(validInput());
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const tenantRepository = new SetupPublicTenantRepository(created.value);
  const dependencies = {
    tenantRepository,
    dataRepository: new EmptyCommerceDataRepository(),
    priceResolver: new ResolvePublicPrice(),
  };
  const commerce = createCommerceClientWithDependencies(
    { tenantSlug: created.value.slug },
    dependencies,
  );
  const config = await commerce.tenant.getPublicConfig();
  assert.equal(config.slug, created.value.slug);
  assert.equal(config.currency, 'ARS');
  assert.equal(config.locale, 'es-AR');
  assert.equal(config.features.showPrices, true);

  const other = createCommerceClientWithDependencies(
    { tenantSlug: 'otro-tenant' },
    dependencies,
  );
  await assert.rejects(
    () => other.tenant.getPublicConfig(),
    (error: unknown) => error instanceof CommerceSdkError && error.code === 'TENANT_NOT_FOUND',
  );
});

test('la migracion define transaccion, idempotencia, auditoria y permisos internos', () => {
  const sql = readFileSync('db/migrations/009_runia_setup_engine_v0.sql', 'utf8');
  for (const contract of [
    'security definer',
    'pg_advisory_xact_lock',
    'price_lists_one_default_per_tenant_idx',
    "'tenant.created'",
    "'tenant.defaults_created'",
    "'price_lists.created'",
    "'setup.completed'",
    'revoke all on function public.setup_create_commerce_tenant(jsonb) from anon',
    'grant execute on function public.setup_create_commerce_tenant(jsonb) to service_role',
  ]) {
    assert.equal(sql.toLowerCase().includes(contract.toLowerCase()), true, contract);
  }
  assert.equal(sql.includes('RUNIA_INTERNAL_PASSWORD'), false);
  assert.equal(sql.includes('SUPABASE_SERVICE_ROLE_KEY'), false);
});

test('la sesion de Setup es criptograficamente independiente de Admin', async () => {
  const [adminSession, setupSession] = await Promise.all([
    createAdminSessionValue('same-test-password'),
    createRuniaInternalSessionValue('same-test-password'),
  ]);
  assert.notEqual(ADMIN_SESSION_COOKIE, RUNIA_INTERNAL_SESSION_COOKIE);
  assert.notEqual(adminSession, setupSession);
  assert.match(setupSession ?? '', /^v0\.[a-f0-9]{64}$/);

  const source = readFileSync('lib/runiaInternalAuth.ts', 'utf8');
  assert.equal(source.includes('NEXT_PUBLIC'), false);
});

test('el importador reutiliza Sin marca aunque cambie su ID externo', () => {
  const report = buildImportReport(
    'preview',
    'qa.xlsx',
    'comercio-qa',
    new Date('2026-07-14T00:00:00.000Z'),
    {
      categories: [],
      brands: [{
        rowNumber: 2,
        raw: {},
        externalId: 'MARCA-LOCAL-99',
        name: 'Sin marca',
        priceAdjustmentPercent: 0,
        isActive: true,
      }],
      products: [],
      prices: [],
      errors: [],
      rowsRead: { Categorias: 0, Marcas: 1, Productos: 0, Precios: 0 },
    },
    {
      categoriesByExternalId: new Map(),
      brandsByExternalId: new Map([['RUNIA-SIN-MARCA', 'brand-controlled']]),
      controlledBrandId: 'brand-controlled',
      productsBySku: new Map(),
      pricesByProductAndList: new Set(),
      priceListsByCode: new Map(),
    },
  );
  assert.equal(report.stats.Marcas.toCreate, 0);
  assert.equal(report.stats.Marcas.toUpdate, 1);
});

function validInput() {
  return {
    name: 'Comercio QA',
    slug: 'comercio-qa',
    email: 'qa@runia.test',
    whatsapp: '+54 9 11 2222 3333',
    currency: 'ARS',
    locale: 'es-AR',
    status: 'active' as const,
  };
}

function priceList(code: string, isDefault: boolean) {
  return {
    name: code.slice(0, 1).toUpperCase() + code.slice(1),
    code,
    active: true,
    isDefault,
    pricingMode: 'manual' as const,
    marginPercent: 0,
  };
}

function assertInvalidPriceLists(
  result: ReturnType<PrepareTenantDefaults['execute']>,
) {
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'INVALID_INPUT');
    assert.ok(result.error.fieldErrors.priceLists);
  }
}

class MemorySetupRepository implements CommerceTenantSetupRepository {
  readonly records = new Map<string, CreatedCommerceTenantSetup>();
  created = 0;

  async createAtomically(input: PreparedCommerceTenantSetup) {
    const existing = this.records.get(input.slug);
    if (existing) return { state: 'exists' as const, value: existing };
    this.created += 1;
    const value: CreatedCommerceTenantSetup = {
      tenantId: `tenant-${this.created}`,
      name: input.name,
      slug: input.slug,
      status: input.status,
      currency: input.currency,
      locale: input.locale,
      email: input.email,
      whatsapp: input.whatsapp,
      features: { ...input.features },
      priceLists: input.priceLists.map((list, index) => ({
        ...list,
        id: `price-list-${this.created}-${index + 1}`,
      })),
      defaultPriceListId: `price-list-${this.created}-${input.priceLists.findIndex((list) => list.isDefault) + 1}`,
      controlledBrandId: `controlled-brand-${this.created}`,
    };
    this.records.set(input.slug, value);
    return { state: 'created' as const, value };
  }
}

class SetupPublicTenantRepository implements PublicTenantRepository {
  constructor(private readonly setup: CreatedCommerceTenantSetup) {}

  async loadPublicTenantSnapshot(slug: string): Promise<PublicTenantSnapshot | null> {
    if (slug !== this.setup.slug) return null;
    return {
      id: this.setup.tenantId,
      slug: this.setup.slug,
      status: this.setup.status === 'active' ? 'active' : 'inactive',
      commercialName: this.setup.name,
      websiteUrl: null,
      whatsapp: this.setup.whatsapp,
      email: this.setup.email,
      currency: this.setup.currency,
      locale: this.setup.locale,
      defaultPriceListId: this.setup.defaultPriceListId,
      branding: {
        logoUrl: null,
        primaryColor: '#14b8a6',
        secondaryColor: '#0f172a',
      },
      features: {
        showPrices: this.setup.features.showPrices,
        publicCatalog: this.setup.features.publicCatalog,
        orders: this.setup.features.orders,
        accountLogin: this.setup.features.wholesaleLogin,
        multiplePriceLists: this.setup.features.multiplePriceLists,
        importer: this.setup.features.importer,
        images: this.setup.features.images,
        stock: false,
        invoicing: false,
      },
      priceLists: this.setup.priceLists.map((list) => ({
        id: list.id,
        code: list.code,
        name: list.name,
        active: list.active,
        isDefault: list.isDefault,
      })),
    };
  }
}

class EmptyCommerceDataRepository implements CommerceDataRepository {
  async loadCatalogSnapshot(): Promise<PublicCatalogSnapshot> {
    return { categories: [], brands: [], products: [] };
  }

  async loadProductBySkuSnapshot(): Promise<PublicProductDetailSnapshot> {
    return { product: null, category: null, brand: null };
  }

  async loadFeaturedCandidatesSnapshot() {
    return [];
  }

  async listPublicCategories(): Promise<PublicCategorySnapshot[]> {
    return [];
  }

  async listPublicBrands(): Promise<PublicBrandSnapshot[]> {
    return [];
  }

  async loadPublicPriceContext(): Promise<PublicPriceContext | null> {
    return null;
  }
}
