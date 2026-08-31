import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  GuideMatch,
  PricingContext,
  PricingPolicy,
  SalesCatalog,
  SalesProduct,
} from './types';

const VINROS_CODE = 'vinros';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CATEGORY_RULES = [
  { slug: 'destilados', name: 'Destilados', prefixes: ['APE', 'BB', 'BDS', 'COS', 'CRA', 'KNH', 'LIC', 'NWS', 'PHA', 'PIND', 'VV', 'WI'] },
  { slug: 'cervezas', name: 'Cervezas', prefixes: ['CER'] },
  { slug: 'sin-alcohol', name: 'Sin alcohol', prefixes: ['AG', 'GAS', 'YAC'] },
  { slug: 'gourmet', name: 'Gourmet', prefixes: ['BAD', 'BIM', 'BOR', 'CAF', 'CHO', 'COM', 'DEC', 'FOL', 'JCR', 'LAU', 'LOM', 'MAI', 'MOR', 'QES', 'SEG', 'VALE'] },
  { slug: 'regalos', name: 'Regalos y accesorios', prefixes: ['ACC', 'BLO', 'BOL'] },
] as const;

type Relation<T> = T | T[] | null;

type ProductRow = {
  id: string;
  supplier_sku: string;
  name_raw: string;
  normalized_name: string;
  presentation_raw: string | null;
  normalized_presentation: string | null;
  active: boolean;
  eligibility_status: string;
  supplier_prices: Relation<{ price_type: string; current_price: number | string }>;
  lombardo_selling_prices: Relation<{
    id: string;
    price_type: string;
    current_price: number | string;
    active: boolean;
  }>;
  lombardo_product_opportunities: Relation<{
    selling_price_id: string;
    reference_price: number | string;
    opportunity: boolean;
    opportunity_start: string;
    opportunity_review_at: string;
  }>;
  supplier_product_editorial: Relation<{
    name_override: string | null;
    brand_name: string | null;
    category_slug: string | null;
    description: string | null;
    tags: string[] | null;
    editorial_status: string;
  }>;
};

type MediaRow = {
  supplier_product_id: string;
  bucket_id: string;
  storage_path: string;
};

type GuideResponse = {
  guides?: Array<{
    slug?: unknown;
    title?: unknown;
    description?: unknown;
    searchText?: unknown;
  }>;
};

export class RuniaSalesCatalog implements SalesCatalog {
  private supplierId: Promise<string> | null = null;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly tenantSlug: string,
    private readonly publicStorageUrl: string,
    private readonly lombardoPublicUrl: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async searchProducts(input: {
    query?: string;
    categorySlug?: string;
    maxPrice?: number;
    limit: number;
    pricing: PricingContext;
    opportunitiesOnly?: boolean;
  }) {
    const supplierId = await this.getSupplierId();
    const candidateLimit = Math.min(Math.max(input.limit * 4, 24), 120);
    const priceType = priceTypeFor(input.pricing.policy);
    let query = this.supabase
      .from('supplier_products')
      .select(productSelect())
      .eq('supplier_id', supplierId)
      .eq('eligibility_status', 'safe')
      .eq('active', true)
      .eq('supplier_prices.price_type', priceType)
      .eq('lombardo_selling_prices.price_type', 'retail')
      .eq('lombardo_selling_prices.active', true)
      .order('normalized_name', { ascending: true })
      .order('id', { ascending: true })
      .limit(candidateLimit);

    const normalizedQuery = sanitizeSearch(input.query);
    if (normalizedQuery) {
      query = query.or(
        `normalized_name.ilike.%${normalizedQuery}%,supplier_sku.ilike.%${normalizedQuery}%`,
      );
    }
    if (input.opportunitiesOnly) {
      const now = new Date().toISOString();
      query = query
        .eq('lombardo_product_opportunities.opportunity', true)
        .lte('lombardo_product_opportunities.opportunity_start', now)
        .gt('lombardo_product_opportunities.opportunity_review_at', now);
    }

    const result = await query;
    if (result.error) throw new Error('RUNIA_MCP_CATALOG_QUERY_FAILED');
    let rows = (result.data ?? []) as unknown as ProductRow[];

    if (normalizedQuery && rows.length < input.limit) {
      const brandIds = await this.searchBrandProductIds(
        supplierId,
        normalizedQuery,
        candidateLimit,
      );
      const missingIds = brandIds.filter((id) => !rows.some((row) => row.id === id));
      if (missingIds.length) {
        const brandRows = await this.loadProductsByIds(
          supplierId,
          missingIds,
          priceType,
        );
        rows = [...rows, ...brandRows];
      }
    }

    const images = await this.loadPrimaryImages(rows.map((row) => row.id));
    return rows
      .map((row) => mapProduct(row, input.pricing, images.get(row.id) ?? null))
      .filter((product) => !input.categorySlug || product.categorySlug === input.categorySlug)
      .filter((product) => !input.maxPrice || product.price <= input.maxPrice)
      .filter((product) => !input.opportunitiesOnly || product.opportunity !== null)
      .sort((left, right) => rankProduct(left, normalizedQuery) - rankProduct(right, normalizedQuery))
      .slice(0, input.limit);
  }

  async getProduct(input: {
    productId?: string;
    sku?: string;
    pricing: PricingContext;
  }) {
    const supplierId = await this.getSupplierId();
    const priceType = priceTypeFor(input.pricing.policy);
    let query = this.supabase
      .from('supplier_products')
      .select(productSelect())
      .eq('supplier_id', supplierId)
      .eq('eligibility_status', 'safe')
      .eq('active', true)
      .eq('supplier_prices.price_type', priceType)
      .eq('lombardo_selling_prices.price_type', 'retail')
      .eq('lombardo_selling_prices.active', true)
      .limit(2);
    if (input.productId && UUID_PATTERN.test(input.productId)) {
      query = query.eq('id', input.productId);
    } else if (input.sku?.trim()) {
      query = query.eq('supplier_sku', input.sku.trim());
    } else {
      return null;
    }

    const result = await query;
    if (result.error) throw new Error('RUNIA_MCP_PRODUCT_QUERY_FAILED');
    const rows = (result.data ?? []) as unknown as ProductRow[];
    if (rows.length !== 1) return null;
    const images = await this.loadPrimaryImages([rows[0].id]);
    return mapProduct(rows[0], input.pricing, images.get(rows[0].id) ?? null);
  }

  async searchGuides(input: { query: string; limit: number }): Promise<GuideMatch[]> {
    const endpoint = new URL('/api/ai/guides', this.lombardoPublicUrl);
    endpoint.searchParams.set('q', input.query.slice(0, 120));
    endpoint.searchParams.set('limit', String(input.limit));
    const response = await this.fetcher(endpoint, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) throw new Error('RUNIA_MCP_GUIDES_UNAVAILABLE');
    const payload = (await response.json()) as GuideResponse;
    return (payload.guides ?? []).flatMap((guide) => {
      if (
        typeof guide.slug !== 'string' ||
        typeof guide.title !== 'string' ||
        typeof guide.description !== 'string'
      ) return [];
      return [{
        slug: guide.slug,
        title: guide.title,
        description: guide.description,
        href: `/guias/${guide.slug}`,
        matchedOn: typeof guide.searchText === 'string'
          ? guide.searchText.split(' ').filter(Boolean).slice(0, 8)
          : [],
      }];
    }).slice(0, input.limit);
  }

  private getSupplierId() {
    this.supplierId ??= this.loadSupplierId().catch((error: unknown) => {
      this.supplierId = null;
      throw error;
    });
    return this.supplierId;
  }

  private async loadSupplierId() {
    const result = await this.supabase
      .from('suppliers')
      .select('id,active,tenants:tenant_id!inner(slug,status)')
      .eq('code', VINROS_CODE)
      .eq('active', true)
      .eq('tenants.slug', this.tenantSlug)
      .eq('tenants.status', 'active')
      .limit(2);
    if (result.error || result.data?.length !== 1) {
      throw new Error('RUNIA_MCP_TENANT_NOT_FOUND');
    }
    return String(result.data[0].id);
  }

  private async searchBrandProductIds(supplierId: string, term: string, limit: number) {
    const result = await this.supabase
      .from('supplier_product_editorial')
      .select('supplier_product_id,product:supplier_product_id!inner(supplier_id,active,eligibility_status)')
      .ilike('brand_name', `%${term}%`)
      .eq('product.supplier_id', supplierId)
      .eq('product.active', true)
      .eq('product.eligibility_status', 'safe')
      .limit(limit);
    if (result.error) return [];
    return (result.data ?? []).map((row) => String(row.supplier_product_id));
  }

  private async loadProductsByIds(
    supplierId: string,
    ids: string[],
    priceType: 'retail' | 'wholesale' | 'business',
  ) {
    const result = await this.supabase
      .from('supplier_products')
      .select(productSelect())
      .eq('supplier_id', supplierId)
      .eq('eligibility_status', 'safe')
      .eq('active', true)
      .eq('supplier_prices.price_type', priceType)
      .eq('lombardo_selling_prices.price_type', 'retail')
      .eq('lombardo_selling_prices.active', true)
      .in('id', ids.slice(0, 120));
    if (result.error) return [];
    return (result.data ?? []) as unknown as ProductRow[];
  }

  private async loadPrimaryImages(productIds: string[]) {
    const ids = [...new Set(productIds)].filter((id) => UUID_PATTERN.test(id));
    const images = new Map<string, string>();
    if (!ids.length) return images;
    const result = await this.supabase
      .from('supplier_product_public_media')
      .select('supplier_product_id,bucket_id,storage_path,is_primary,position')
      .in('supplier_product_id', ids)
      .order('is_primary', { ascending: false })
      .order('position', { ascending: true });
    if (result.error) return images;
    for (const media of (result.data ?? []) as unknown as MediaRow[]) {
      if (images.has(media.supplier_product_id)) continue;
      const path = media.storage_path.split('/').map(encodeURIComponent).join('/');
      images.set(
        media.supplier_product_id,
        `${this.publicStorageUrl}/storage/v1/object/public/${encodeURIComponent(media.bucket_id)}/${path}`,
      );
    }
    return images;
  }
}

function productSelect() {
  return `id,supplier_sku,name_raw,normalized_name,presentation_raw,normalized_presentation,active,eligibility_status,supplier_prices!inner(price_type,current_price),lombardo_selling_prices(id,price_type,current_price,active),lombardo_product_opportunities(selling_price_id,reference_price,opportunity,opportunity_start,opportunity_review_at),supplier_product_editorial(name_override,brand_name,category_slug,description,tags,editorial_status)`;
}

function mapProduct(row: ProductRow, pricing: PricingContext, imageUrl: string | null): SalesProduct {
  if (row.eligibility_status !== 'safe' || !row.active) {
    throw new Error('RUNIA_MCP_NON_SAFE_PRODUCT');
  }
  const editorial = first(row.supplier_product_editorial);
  const supplierPrice = rows(row.supplier_prices).find(
    (price) => price.price_type === priceTypeFor(pricing.policy),
  );
  const sellingPrice = pricing.policy === 'RETAIL' || pricing.policy === 'CUSTOM_DISCOUNT'
    ? rows(row.lombardo_selling_prices).find((price) => price.price_type === 'retail' && price.active)
    : undefined;
  const rawPrice = numberValue(sellingPrice?.current_price ?? supplierPrice?.current_price);
  if (!rawPrice) throw new Error('RUNIA_MCP_PRICE_NOT_FOUND');
  const discountPercent = pricing.policy === 'CUSTOM_DISCOUNT'
    ? validDiscount(pricing.discountPercent)
    : 0;
  const basePrice = roundMoney(rawPrice);
  const price = roundMoney(basePrice * (1 - discountPercent / 100));
  const name = editorial?.editorial_status === 'approved' && editorial.name_override?.trim()
    ? editorial.name_override.trim()
    : row.name_raw.trim();
  const category = categoryFor(row.supplier_sku, editorial?.category_slug ?? null);
  const brand = editorial?.brand_name?.trim() || inferBrand(name);
  const presentation = row.normalized_presentation?.trim()
    || row.presentation_raw?.trim()
    || row.name_raw.match(/\bx\s*([^,]+)$/i)?.[1]?.trim()
    || 'Unidad';
  const opportunity = activeOpportunity(row, sellingPrice?.id);
  return {
    id: row.id,
    sku: row.supplier_sku.trim(),
    slug: `${slugify(name)}--${row.id}`,
    name,
    brand,
    category: category.name,
    categorySlug: category.slug,
    presentation,
    description: editorial?.editorial_status === 'approved'
      ? editorial.description?.trim() || null
      : null,
    imageUrl,
    price,
    basePrice,
    currency: 'ARS',
    pricingPolicy: pricing.policy,
    discountPercent,
    availability: 'SUPPLIER_AVAILABLE',
    opportunity,
  };
}

function activeOpportunity(row: ProductRow, sellingPriceId?: string) {
  if (!sellingPriceId) return null;
  const now = Date.now();
  const match = rows(row.lombardo_product_opportunities).find((candidate) =>
    candidate.opportunity && candidate.selling_price_id === sellingPriceId,
  );
  const referencePrice = numberValue(match?.reference_price);
  const startAt = Date.parse(match?.opportunity_start ?? '');
  const reviewAt = Date.parse(match?.opportunity_review_at ?? '');
  if (!match || !referencePrice || !Number.isFinite(startAt) || !Number.isFinite(reviewAt) || startAt > now || reviewAt <= now) {
    return null;
  }
  return { referencePrice, startAt: match.opportunity_start, reviewAt: match.opportunity_review_at };
}

function categoryFor(sku: string, editorialSlug: string | null) {
  const matchingEditorial = editorialSlug
    ? [...CATEGORY_RULES, { slug: 'vinos', name: 'Vinos', prefixes: [] as string[] }].find((entry) => entry.slug === editorialSlug)
    : null;
  if (matchingEditorial) return { slug: matchingEditorial.slug, name: matchingEditorial.name };
  const prefix = sku.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() ?? '';
  const rule = CATEGORY_RULES.find((entry) => entry.prefixes.includes(prefix as never));
  return rule ? { slug: rule.slug, name: rule.name } : { slug: 'vinos', name: 'Vinos' };
}

function priceTypeFor(policy: PricingPolicy) {
  if (policy === 'WHOLESALE') return 'wholesale' as const;
  if (policy === 'BUSINESS') return 'business' as const;
  return 'retail' as const;
}

function rows<T>(value: Relation<T>): T[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function first<T>(value: Relation<T>) {
  return rows(value)[0] ?? null;
}

function validDiscount(value: number) {
  if (!Number.isFinite(value) || value <= 0 || value >= 100) {
    throw new Error('RUNIA_MCP_INVALID_DISCOUNT');
  }
  return value;
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function sanitizeSearch(value?: string) {
  return value?.trim().slice(0, 80).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-AR').replace(/[%_*,()"'\\]/g, ' ').replace(/\s+/g, ' ').trim() ?? '';
}

function slugify(value: string) {
  return sanitizeSearch(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function inferBrand(name: string) {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  const uppercase: string[] = [];
  for (const token of tokens.slice(0, 4)) {
    const letters = token.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '');
    if (letters && letters !== letters.toLocaleUpperCase('es-AR')) break;
    uppercase.push(token);
  }
  return uppercase.join(' ') || tokens[0] || 'VINROS';
}

function rankProduct(product: SalesProduct, term: string) {
  if (!term) return product.imageUrl ? 0 : 1;
  const sku = product.sku.toLocaleLowerCase('es-AR');
  const name = product.name.toLocaleLowerCase('es-AR');
  const brand = product.brand.toLocaleLowerCase('es-AR');
  if (sku === term) return 0;
  if (sku.startsWith(term)) return 1;
  if (name.startsWith(term)) return 2;
  if (brand.startsWith(term)) return 3;
  if (name.includes(term)) return 4;
  return brand.includes(term) ? 5 : 6;
}
