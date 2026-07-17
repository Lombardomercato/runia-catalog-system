import {
  DEFAULT_COMMERCE_TENANT_PRICE_LISTS,
  DEFAULT_COMMERCE_TENANT_SETUP_FEATURES,
} from '@/core/tenant/setup';
import type { SetupDraft, SetupPriceListDraft } from './types';

export const SETUP_STEPS = [
  'Identidad',
  'Comercio',
  'Listas',
  'Datos públicos',
  'Confirmación',
] as const;

export const SETUP_FEATURES: Array<{
  key: keyof SetupDraft['features'];
  label: string;
  description: string;
}> = [
  {
    key: 'showPrices',
    label: 'Mostrar precios',
    description: 'Expone la preferencia pública para que la web decida si presenta importes.',
  },
  {
    key: 'publicCatalog',
    label: 'Catálogo público',
    description: 'Permite que el SDK resuelva productos públicos del tenant.',
  },
  {
    key: 'orders',
    label: 'Pedidos',
    description: 'Habilita el flujo comercial de pedidos existente.',
  },
  {
    key: 'importer',
    label: 'Importador',
    description: 'Deja disponible la carga operativa del catálogo.',
  },
  {
    key: 'multiplePriceLists',
    label: 'Múltiples listas',
    description: 'Permite operar más de una lista comercial.',
  },
  {
    key: 'images',
    label: 'Imágenes',
    description: 'Activa soporte público para imágenes de productos.',
  },
  {
    key: 'wholesaleLogin',
    label: 'Login mayorista',
    description: 'Prepara acceso de cuentas comerciales; no crea usuarios.',
  },
];

export function createDefaultSetupDraft(): SetupDraft {
  return {
    name: '',
    slug: '',
    legalName: '',
    email: '',
    whatsapp: '',
    currency: 'ARS',
    locale: 'es-AR',
    status: 'active',
    minimumOrderAmount: '0',
    minimumPurchaseAmount: '0',
    logoUrl: '',
    primaryColor: '#14b8a6',
    secondaryColor: '#0f172a',
    features: { ...DEFAULT_COMMERCE_TENANT_SETUP_FEATURES },
    priceLists: DEFAULT_COMMERCE_TENANT_PRICE_LISTS.map((priceList, index) => ({
      clientId: `default-${index + 1}`,
      name: priceList.name,
      code: priceList.code,
      active: priceList.active,
      isDefault: priceList.isDefault,
      pricingMode: priceList.pricingMode,
      marginPercent: String(priceList.marginPercent),
    })),
  };
}

export function createEmptyPriceListDraft(index: number): SetupPriceListDraft {
  return {
    clientId: `custom-${Date.now()}-${index}`,
    name: '',
    code: '',
    active: true,
    isDefault: false,
    pricingMode: 'manual',
    marginPercent: '0',
  };
}
