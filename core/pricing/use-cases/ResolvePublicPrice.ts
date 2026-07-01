import type { PricingDomainError, PricingResult } from '../errors';
import type {
  PublicPriceResolver,
  ResolvedPublicPrice,
  ResolvedPublicPriceList,
  ResolvePublicPriceInput,
  ResolvePublicPriceListInput,
} from '../interfaces';

export class ResolvePublicPrice implements PublicPriceResolver {
  resolvePriceList(
    input: ResolvePublicPriceListInput,
  ): PricingResult<ResolvedPublicPriceList> {
    if (input.tenant.status !== 'active') {
      return pricingFailure('TENANT_INACTIVE', 'The tenant is inactive.');
    }

    const activeLists = input.priceLists.filter((priceList) => priceList.active);
    const priceList =
      activeLists.find((candidate) => candidate.id === input.tenant.defaultPriceListId) ??
      activeLists.find((candidate) => candidate.isDefault) ??
      activeLists.find((candidate) => candidate.code.toLowerCase() === 'minorista') ??
      activeLists[0] ??
      null;

    if (!priceList) {
      return pricingFailure(
        'PUBLIC_PRICE_LIST_NOT_FOUND',
        'No active public price list is available.',
      );
    }

    return {
      ok: true,
      value: { id: priceList.id, code: priceList.code, name: priceList.name },
    };
  }

  execute(input: ResolvePublicPriceInput): PricingResult<ResolvedPublicPrice> {
    const productId = input.productId.trim();
    if (!productId) {
      return pricingFailure('INVALID_INPUT', 'The product ID is required.');
    }

    const priceList = this.resolvePriceList(input);
    if (!priceList.ok) return priceList;

    const price = input.prices.find((candidate) => candidate.priceListId === priceList.value.id);
    const amount = price?.amount.trim() ?? '';
    const numericAmount = amount === '' ? Number.NaN : Number(amount);
    if (!price || !Number.isFinite(numericAmount) || numericAmount < 0) {
      return pricingFailure(
        'PUBLIC_PRICE_NOT_FOUND',
        'No valid public price is available for the product.',
      );
    }

    const currency = price.currency.trim() || input.tenant.currency.trim();
    if (!currency) {
      return pricingFailure('CURRENCY_UNAVAILABLE', 'The public price currency is unavailable.');
    }

    return {
      ok: true,
      value: {
        productId,
        priceList: priceList.value,
        unitPrice: { amount, currency },
        source:
          price.calculatedFromCost || price.pricingMode === 'cost_plus_percent'
            ? 'calculated'
            : 'manual',
      },
    };
  }
}

function pricingFailure(
  code: PricingDomainError['code'],
  message: string,
): PricingResult<never> {
  return { ok: false, error: { domain: 'pricing', code, message } };
}
