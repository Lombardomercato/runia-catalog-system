import type {
  PublicPriceListSnapshot,
  PublicPriceResolver,
  ResolvedPublicPriceList,
} from '../pricing/interfaces';
import type { TenantResult } from './errors';

export type DomainActorType = 'anonymous' | 'account' | 'admin' | 'system';

export interface DomainActor {
  type: DomainActorType;
  id: string | null;
  displayName: string | null;
}

export interface TenantExecutionContext {
  tenantId: string;
  actor: DomainActor;
  requestId: string | null;
}

export interface TenantResolutionInput {
  slug?: string;
  hostname?: string;
  publicKey?: string;
}

export interface TenantBranding {
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
}

export interface TenantFeatureFlags {
  showPrices: boolean;
  publicCatalog: boolean;
  orders: boolean;
  accountLogin: boolean;
  multiplePriceLists: boolean;
  importer: boolean;
  images: boolean;
  stock: boolean;
  invoicing: boolean;
}

export interface TenantPublicConfig {
  id: string;
  slug: string;
  commercialName: string;
  websiteUrl: string | null;
  whatsapp: string | null;
  email: string | null;
  currency: string;
  locale: string;
  defaultPriceListId: string | null;
  priceList: ResolvedPublicPriceList;
  branding: TenantBranding;
  features: TenantFeatureFlags;
}

export interface TenantSettings extends TenantPublicConfig {
  id: string;
  slug: string;
  legalName: string | null;
  contactEmail: string | null;
  address: string | null;
  minimumOrderAmount: string;
  minimumPurchaseAmount: string;
  status: 'active' | 'inactive';
  updatedAt: string;
}

export interface UpdateTenantSettingsInput {
  commercialName: string;
  legalName: string | null;
  contactEmail: string | null;
  whatsapp: string | null;
  address: string | null;
  websiteUrl: string | null;
  currency: string;
  defaultPriceListId: string | null;
  branding: TenantBranding;
  features: TenantFeatureFlags;
}

export interface GetPublicTenantConfigInput {
  slug: string;
}

export interface PublicTenantSnapshot {
  id: string;
  slug: string;
  status: 'active' | 'inactive';
  commercialName: string;
  websiteUrl: string | null;
  whatsapp: string | null;
  email: string | null;
  currency: string;
  locale: string | null;
  defaultPriceListId: string | null;
  branding: TenantBranding;
  features: TenantFeatureFlags;
  priceLists: PublicPriceListSnapshot[];
}

export interface PublicTenantRepository {
  loadPublicTenantSnapshot(slug: string): Promise<PublicTenantSnapshot | null>;
}

export interface PublicTenantConfigResolver {
  execute(input: GetPublicTenantConfigInput): Promise<TenantResult<TenantPublicConfig>>;
}

export type PublicTenantPriceResolver = Pick<PublicPriceResolver, 'resolvePriceList'>;
