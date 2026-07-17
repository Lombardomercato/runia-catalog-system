export type CatalogSort =
  | 'name_asc'
  | 'name_desc'
  | 'price_asc'
  | 'price_desc'
  | 'sku_asc';

export type CatalogListParams = {
  search: string;
  categoryId: string;
  brandId: string;
  sort: CatalogSort;
};

export type CatalogFilterOption = {
  id: string;
  name: string;
};

export type CatalogPriceList = {
  id: string;
  code: string;
  name: string;
};

export type CatalogTenant = {
  id: string;
  slug: string;
  commercialName: string;
  whatsapp: string | null;
  email: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  primaryContrast: string;
  secondaryContrast: string;
  currency: string;
  locale: string;
  features: {
    showPrices: boolean;
    publicCatalog: boolean;
    orders: boolean;
    accountLogin: boolean;
    multiplePriceLists: boolean;
    importer: boolean;
    images: boolean;
    stock: boolean;
    invoicing: boolean;
  };
  publicCatalogEnabled: boolean;
  priceList: CatalogPriceList | null;
};

export type CatalogProduct = {
  id: string;
  sku: string;
  name: string;
  productLine: string | null;
  variant: string | null;
  description: string | null;
  categoryId: string;
  categoryName: string;
  brandId: string;
  brandName: string;
  price: number | null;
  currency: string;
};

export type CatalogListResult = {
  tenant: CatalogTenant | null;
  products: CatalogProduct[];
  categories: CatalogFilterOption[];
  brands: CatalogFilterOption[];
  totalProducts: number;
  error: string | null;
};

export type CatalogProductResult = {
  tenant: CatalogTenant | null;
  product: CatalogProduct | null;
  notFound: boolean;
  error: string | null;
};
