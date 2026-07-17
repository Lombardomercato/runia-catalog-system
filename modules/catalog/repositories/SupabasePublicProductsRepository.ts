import type {
  PublicBrandSnapshot,
  PublicCatalogSnapshot,
  PublicCategorySnapshot,
  PublicFeaturedProductCandidateSnapshot,
  PublicFeaturedProductsRepository,
  PublicProductDetailSnapshot,
  PublicProductsRepository,
} from '@/core/products/interfaces';
import type { PublicProductPriceSnapshot } from '@/core/pricing/interfaces';
import { supabaseServer } from '@/lib/supabaseServer';

const SMALL_CATALOG_PRODUCT_LIMIT = 100;

export class SupabasePublicProductsRepository
  implements PublicProductsRepository, PublicFeaturedProductsRepository {
  async loadCatalogSnapshot(
    tenantId: string,
    priceListId: string,
  ): Promise<PublicCatalogSnapshot> {
    const [categories, brands, products] = await Promise.all([
      this.listPublicCategories(tenantId),
      this.listPublicBrands(tenantId),
      supabaseServer
        .from('products')
        .select(`
          id,
          sku,
          name,
          product_line,
          variant,
          category_id,
          brand_id,
          product_prices!inner(
            price_list_id,
            price,
            currency,
            pricing_mode,
            calculated_from_cost
          )
        `)
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .eq('product_prices.price_list_id', priceListId)
        .limit(SMALL_CATALOG_PRODUCT_LIMIT + 1),
    ]);
    const error = products.error?.message ?? null;
    if (error) throw new Error(error);
    if ((products.data?.length ?? 0) > SMALL_CATALOG_PRODUCT_LIMIT) {
      throw new Error('PUBLIC_CATALOG_REQUIRES_SERVER_PAGINATION');
    }

    return {
      categories,
      brands,
      products: (products.data ?? []).map((product) => ({
        id: String(product.id),
        sku: String(product.sku),
        name: String(product.name),
        description: null,
        line: product.product_line ? String(product.product_line) : null,
        variant: product.variant ? String(product.variant) : null,
        categoryId: String(product.category_id),
        brandId: String(product.brand_id),
        active: true,
        prices: mapPrices(product.product_prices),
      })),
    };
  }

  async loadProductBySkuSnapshot(
    tenantId: string,
    sku: string,
    priceListId: string,
  ): Promise<PublicProductDetailSnapshot> {
    const productResult = await supabaseServer
        .from('products')
        .select(`
          id,
          sku,
          name,
          description,
          product_line,
          variant,
          category_id,
          brand_id,
          is_active,
          categories:category_id(id, name, is_active, sort_order),
          brands:brand_id(id, name, is_active),
          product_prices(
            price_list_id,
            price,
            currency,
            pricing_mode,
            calculated_from_cost
          )
        `)
        .eq('tenant_id', tenantId)
        .eq('sku', sku)
        .eq('product_prices.price_list_id', priceListId)
        .maybeSingle();
    const error = productResult.error?.message ?? null;
    if (error) throw new Error(error);

    const product = productResult.data;
    const category = product ? firstRelation(product.categories) : null;
    const brand = product ? firstRelation(product.brands) : null;

    return {
      product: product
        ? {
            id: String(product.id),
            sku: String(product.sku),
            name: String(product.name),
            description: product.description ? String(product.description) : null,
            line: product.product_line ? String(product.product_line) : null,
            variant: product.variant ? String(product.variant) : null,
            categoryId: String(product.category_id),
            brandId: String(product.brand_id),
            active: product.is_active === true,
            prices: mapPrices(product.product_prices),
          }
        : null,
      category: category
        ? {
            id: String(category.id),
            name: String(category.name),
            active: category.is_active === true,
            sortOrder: Number(category.sort_order ?? 0),
          }
        : null,
      brand: brand
        ? {
            id: String(brand.id),
            name: String(brand.name),
            active: brand.is_active === true,
          }
        : null,
    };
  }

  async loadFeaturedCandidatesSnapshot(
    tenantId: string,
    priceListId: string,
    input: { limit: number; categoryId: string | null; brandId: string | null },
  ): Promise<PublicFeaturedProductCandidateSnapshot[]> {
    let query = supabaseServer
      .from('products')
      .select(`
        id,
        sku,
        name,
        product_line,
        variant,
        category_id,
        brand_id,
        is_active,
        categories:category_id!inner(id, name, is_active, sort_order),
        brands:brand_id!inner(id, name, is_active),
        product_prices!inner(
          price_list_id,
          price,
          currency,
          pricing_mode,
          calculated_from_cost
        )
      `)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .eq('categories.is_active', true)
      .eq('brands.is_active', true)
      .eq('product_prices.price_list_id', priceListId)
      .order('name', { ascending: true })
      .order('sku', { ascending: true })
      .order('id', { ascending: true })
      .limit(input.limit);
    if (input.categoryId) query = query.eq('category_id', input.categoryId);
    if (input.brandId) query = query.eq('brand_id', input.brandId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => {
      const category = firstRelation(row.categories);
      const brand = firstRelation(row.brands);
      return {
        product: {
          id: String(row.id),
          sku: String(row.sku),
          name: String(row.name),
          description: null,
          line: row.product_line ? String(row.product_line) : null,
          variant: row.variant ? String(row.variant) : null,
          categoryId: String(row.category_id),
          brandId: String(row.brand_id),
          active: row.is_active === true,
          prices: mapPrices(row.product_prices),
        },
        category: category
          ? {
              id: String(category.id),
              name: String(category.name),
              active: category.is_active === true,
              sortOrder: Number(category.sort_order ?? 0),
            }
          : null,
        brand: brand
          ? {
              id: String(brand.id),
              name: String(brand.name),
              active: brand.is_active === true,
            }
          : null,
      };
    });
  }

  async listPublicCategories(tenantId: string): Promise<PublicCategorySnapshot[]> {
    const { data, error } = await supabaseServer
      .from('categories')
      .select('id, name, sort_order')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((category) => ({
      id: String(category.id),
      name: String(category.name),
      active: true,
      sortOrder: Number(category.sort_order ?? 0),
    }));
  }

  async listPublicBrands(tenantId: string): Promise<PublicBrandSnapshot[]> {
    const { data, error } = await supabaseServer
      .from('brands')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((brand) => ({
      id: String(brand.id),
      name: String(brand.name),
      active: true,
    }));
  }

  async loadPublicPriceContext(
    tenantId: string,
    productId: string,
    priceListId: string,
  ): Promise<{
    productId: string;
    productActive: boolean;
    categoryActive: boolean;
    brandActive: boolean;
    prices: PublicProductPriceSnapshot[];
  } | null> {
    const { data, error } = await supabaseServer
      .from('products')
      .select(`
        id,
        is_active,
        categories:category_id(is_active),
        brands:brand_id(is_active),
        product_prices(
          price_list_id,
          price,
          currency,
          pricing_mode,
          calculated_from_cost
        )
      `)
      .eq('tenant_id', tenantId)
      .eq('id', productId)
      .eq('product_prices.price_list_id', priceListId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const category = firstRelation(data.categories);
    const brand = firstRelation(data.brands);
    return {
      productId: String(data.id),
      productActive: data.is_active === true,
      categoryActive: category?.is_active === true,
      brandActive: brand?.is_active === true,
      prices: mapPrices(data.product_prices),
    };
  }
}

function mapPrices(
  prices: Array<{
    price_list_id: string;
    price: number | string | null;
    currency: string | null;
    pricing_mode: string | null;
    calculated_from_cost: boolean | null;
  }> | null,
) {
  return (prices ?? [])
    .filter((price) => price.price !== null)
    .map((price) => ({
      priceListId: String(price.price_list_id),
      amount: String(price.price),
      currency: String(price.currency ?? ''),
      pricingMode: price.pricing_mode === 'cost_plus_percent'
        ? 'cost_plus_percent' as const
        : 'manual' as const,
      calculatedFromCost: price.calculated_from_cost === true,
    }));
}

function firstRelation<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}
