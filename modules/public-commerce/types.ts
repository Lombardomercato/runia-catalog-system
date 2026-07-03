export type PublicCommerceTenant = {
  id: string;
  slug: string;
  commercialName: string;
  currency: string;
  locale: string;
  enabled: boolean;
  priceList: {
    id: string;
    code: string;
    name: string;
  } | null;
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
  status: 'draft' | 'ready_to_submit' | 'submitted';
  updatedAt: string;
};

export type PublicCommerceIdentity = {
  name: string;
  company: string | null;
  whatsapp: string;
  email: string | null;
  cuit: string | null;
  notes: string | null;
};

export type PublicCommerceIdentityInput = {
  name: string;
  company: string;
  whatsapp: string;
  email: string;
  cuit: string;
  notes: string;
};

export type PublicCommerceIdentityField = keyof PublicCommerceIdentityInput;

export type PublicCommerceWhatsAppReceipt = {
  orderId: string;
  message: string;
  whatsappUrl: string | null;
  destinationConfigured: boolean;
};

export type PublicCommerceDraft = {
  id: string;
  status: 'draft' | 'ready_to_submit' | 'submitted';
  items: PublicCommerceDraftItem[];
  summary: PublicCommerceDraftSummary;
  identity: PublicCommerceIdentity | null;
};

export type PublicCommerceResult =
  | {
      ok: true;
      draft: PublicCommerceDraft | null;
      salesOrderId?: string;
      salesOrderCreated?: boolean;
      whatsappReceipt?: PublicCommerceWhatsAppReceipt;
      whatsappError?: string | null;
    }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<PublicCommerceIdentityField, string>>;
    };

export interface PublicCommerceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
