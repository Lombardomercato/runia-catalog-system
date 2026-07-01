import type { TenantExecutionContext } from '../tenant/interfaces';
import type { PricingResult } from './errors';
import type {
  PriceList,
  RecalculatePricesInput,
  RecalculatePricesResult,
  ResolvedPrice,
  ResolvedPublicPrice,
  ResolvePublicPriceInput,
  ResolvePriceInput,
  SetManualPriceInput,
} from './interfaces';

export interface PricingService {
  resolvePublic(input: ResolvePublicPriceInput): Promise<PricingResult<ResolvedPublicPrice>>;
  resolve(
    context: TenantExecutionContext,
    input: ResolvePriceInput,
  ): Promise<PricingResult<ResolvedPrice | null>>;
  listPriceLists(context: TenantExecutionContext): Promise<PricingResult<PriceList[]>>;
  setManualPrice(
    context: TenantExecutionContext,
    input: SetManualPriceInput,
  ): Promise<PricingResult<ResolvedPrice>>;
  recalculate(
    context: TenantExecutionContext,
    input: RecalculatePricesInput,
  ): Promise<PricingResult<RecalculatePricesResult>>;
}
