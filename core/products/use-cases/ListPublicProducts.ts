import type { ProductsResult } from '../errors';
import type { PublicPriceResolver } from '../../pricing/interfaces';
import type { PublicTenantConfigResolver } from '../../tenant/interfaces';
import type {
  ListPublicProductsInput,
  ListPublicProductsOutput,
  PublicCategorySnapshot,
  PublicProductListItem,
  PublicProductsRepository,
  PublicProductSort,
} from '../interfaces';
import {
  isPublicPriceUnavailable,
  mapPublicPricingFailure,
  mapPublicTenantFailure,
  productsFailure,
  projectPublicProduct,
  resolvePublicCatalogContext,
  toPublicPricingTenant,
} from '../publicCatalogPolicy';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const PUBLIC_SORTS = new Set<PublicProductSort>([
  'name_asc',
  'name_desc',
  'price_asc',
  'price_desc',
  'sku_asc',
]);

export class ListPublicProducts {
  constructor(
    private readonly repository: PublicProductsRepository,
    private readonly pricing: PublicPriceResolver,
    private readonly tenantConfig: PublicTenantConfigResolver,
  ) {}

  async execute(
    input: ListPublicProductsInput,
  ): Promise<ProductsResult<ListPublicProductsOutput>> {
    const normalized = normalizeInput(input);
    if (!normalized) {
      return productsFailure('INVALID_INPUT', 'The public product query is invalid.');
    }

    const tenantResult = await this.tenantConfig.execute({ slug: normalized.tenantSlug });
    if (!tenantResult.ok) return mapPublicTenantFailure(tenantResult.error);
    const context = resolvePublicCatalogContext(tenantResult.value);
    if (!context.ok) return context;

    let snapshot;
    try {
      snapshot = await this.repository.loadCatalogSnapshot(tenantResult.value.id);
    } catch {
      return productsFailure('REPOSITORY_FAILURE', 'The public catalog could not be loaded.');
    }

    const categories = snapshot.categories
      .filter((category) => category.active)
      .sort(compareCategories);
    const brands = snapshot.brands
      .filter((brand) => brand.active)
      .sort((left, right) => compareText(left.name, right.name));
    const categoryById = new Map(categories.map((category) => [category.id, category]));
    const brandById = new Map(brands.map((brand) => [brand.id, brand]));
    const candidates = snapshot.products
      .filter((product) => product.active)
      .filter((product) => categoryById.has(product.categoryId) && brandById.has(product.brandId));
    const visibleProducts: PublicProductListItem[] = [];
    for (const product of candidates) {
      const resolvedPrice = this.pricing.execute({
        tenant: toPublicPricingTenant(tenantResult.value),
        priceLists: snapshot.priceLists,
        productId: product.id,
        prices: product.prices,
      });
      if (!resolvedPrice.ok) {
        if (isPublicPriceUnavailable(resolvedPrice.error)) continue;
        return mapPublicPricingFailure(resolvedPrice.error);
      }
      visibleProducts.push(
        projectPublicProduct(
          product,
          categoryById.get(product.categoryId)!,
          brandById.get(product.brandId)!,
          resolvedPrice.value,
        ),
      );
    }
    const filtered = visibleProducts
      .filter((product) => matchesFilters(product, normalized))
      .sort((left, right) => comparePublicProducts(left, right, normalized.sort));
    const pagination = buildPagination(filtered.length, normalized.page, normalized.pageSize);
    const start = (pagination.page - 1) * pagination.pageSize;

    return {
      ok: true,
      value: {
        tenant: context.value.tenant,
        products: filtered.slice(start, start + pagination.pageSize),
        categories: categories.map(({ id, name }) => ({ id, name })),
        brands: brands.map(({ id, name }) => ({ id, name })),
        totalVisibleProducts: visibleProducts.length,
        pagination,
      },
    };
  }
}

function normalizeInput(input: ListPublicProductsInput) {
  const tenantSlug = input.tenantSlug.trim();
  if (!tenantSlug) return null;
  const page = positiveInteger(input.page, 1);
  const pageSize = Math.min(positiveInteger(input.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  return {
    tenantSlug,
    search: normalizeSearch(input.search ?? '').slice(0, 100),
    categoryId: input.categoryId?.trim() || null,
    brandId: input.brandId?.trim() || null,
    sort: input.sort && PUBLIC_SORTS.has(input.sort) ? input.sort : 'name_asc',
    page,
    pageSize,
  };
}

function matchesFilters(
  product: PublicProductListItem,
  input: NonNullable<ReturnType<typeof normalizeInput>>,
) {
  if (input.categoryId && product.categoryId !== input.categoryId) return false;
  if (input.brandId && product.brandId !== input.brandId) return false;
  if (!input.search) return true;
  return normalizeSearch([
    product.sku,
    product.name,
    product.variant,
    product.line,
    product.brandName,
    product.categoryName,
  ].filter(Boolean).join(' ')).includes(input.search);
}

function comparePublicProducts(
  left: PublicProductListItem,
  right: PublicProductListItem,
  sort: PublicProductSort,
) {
  if (sort === 'price_asc' || sort === 'price_desc') {
    const leftPrice = left.price ? Number(left.price.amount) : null;
    const rightPrice = right.price ? Number(right.price.amount) : null;
    if (leftPrice === null && rightPrice === null) return compareText(left.name, right.name);
    if (leftPrice === null) return 1;
    if (rightPrice === null) return -1;
    const result = leftPrice - rightPrice;
    return sort === 'price_asc' ? result : -result;
  }
  const leftValue = sort === 'sku_asc' ? left.sku : left.name;
  const rightValue = sort === 'sku_asc' ? right.sku : right.name;
  const result = compareText(leftValue, rightValue);
  return sort === 'name_desc' ? -result : result;
}

function compareCategories(left: PublicCategorySnapshot, right: PublicCategorySnapshot) {
  return left.sortOrder - right.sortOrder || compareText(left.name, right.name);
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, 'es', { sensitivity: 'base', numeric: true });
}

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function positiveInteger(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

function buildPagination(total: number, requestedPage: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasPrevious: page > 1,
    hasNext: page < totalPages,
  };
}
