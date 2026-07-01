export type PublicCommerceTenant = {
  id: string;
  slug: string;
  currency: string;
  locale: string;
  enabled: boolean;
};

export type PublicCommerceProduct = {
  id: string;
  sku: string;
  name: string;
  variant: string | null;
  productLine: string | null;
  brandName: string;
  categoryName: string;
  price: number | null;
  currency: string;
};

export type PublicCommerceDraftItem = {
  productId: string;
  sku: string;
  name: string;
  variant: string | null;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  currency: string;
};

export type PublicCommerceDraftSummary = {
  totalQuantity: number;
  lineCount: number;
  productCount: number;
  subtotal: string;
  discount: string;
  total: string;
  currency: string;
  status: 'draft';
  updatedAt: string;
};

export type PublicCommerceDraft = {
  id: string;
  items: PublicCommerceDraftItem[];
  summary: PublicCommerceDraftSummary;
};

export type PublicCommerceResult =
  | { ok: true; draft: PublicCommerceDraft | null }
  | { ok: false; error: string };

export interface PublicCommerceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
