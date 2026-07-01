import type {
  PublicCatalogSnapshot,
  PublicProductDetailSnapshot,
  PublicProductsRepository,
} from '@/core/products/interfaces';
import { supabaseServer } from '@/lib/supabaseServer';

export class SupabasePublicProductsRepository implements PublicProductsRepository {
  async loadCatalogSnapshot(tenantId: string): Promise<PublicCatalogSnapshot> {
    const [categories, brands, priceLists, products] = await Promise.all([
      supabaseServer
        .from('categories')
        .select('id, name, is_active, sort_order')
        .eq('tenant_id', tenantId),
      supabaseServer
        .from('brands')
        .select('id, name, is_active')
        .eq('tenant_id', tenantId),
      supabaseServer
        .from('price_lists')
        .select('id, code, name, is_active, is_default')
        .eq('tenant_id', tenantId),
      supabaseServer
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
          product_prices(
            price_list_id,
            price,
            currency,
            pricing_mode,
            calculated_from_cost
          )
        `)
        .eq('tenant_id', tenantId),
    ]);
    const error =
      categories.error?.message ??
      brands.error?.message ??
      priceLists.error?.message ??
      products.error?.message ??
      null;
    if (error) throw new Error(error);

    return {
      categories: (categories.data ?? []).map((category) => ({
        id: String(category.id),
        name: String(category.name),
        active: category.is_active === true,
        sortOrder: Number(category.sort_order ?? 0),
      })),
      brands: (brands.data ?? []).map((brand) => ({
        id: String(brand.id),
        name: String(brand.name),
        active: brand.is_active === true,
      })),
      priceLists: (priceLists.data ?? []).map((priceList) => ({
        id: String(priceList.id),
        code: String(priceList.code),
        name: String(priceList.name),
        active: priceList.is_active === true,
        isDefault: priceList.is_default === true,
      })),
      products: (products.data ?? []).map((product) => ({
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
      })),
    };
  }

  async loadProductBySkuSnapshot(
    tenantId: string,
    sku: string,
  ): Promise<PublicProductDetailSnapshot> {
    const [priceLists, productResult] = await Promise.all([
      supabaseServer
        .from('price_lists')
        .select('id, code, name, is_active, is_default')
        .eq('tenant_id', tenantId),
      supabaseServer
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
        .maybeSingle(),
    ]);
    const error = priceLists.error?.message ?? productResult.error?.message ?? null;
    if (error) throw new Error(error);

    const product = productResult.data;
    const category = product ? firstRelation(product.categories) : null;
    const brand = product ? firstRelation(product.brands) : null;

    return {
      priceLists: (priceLists.data ?? []).map((priceList) => ({
        id: String(priceList.id),
        code: String(priceList.code),
        name: String(priceList.name),
        active: priceList.is_active === true,
        isDefault: priceList.is_default === true,
      })),
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
