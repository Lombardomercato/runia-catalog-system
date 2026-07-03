import type {
  DraftOrder,
  DraftOrderItem,
  DraftOrderProductResolver,
  DraftOrderSummary,
  ResolvedDraftOrderProduct,
} from './interfaces';
import type { OrdersDomainError, OrdersResult } from './errors';

type Decimal = {
  units: bigint;
  scale: number;
};

export function createDraftOrderItem(
  product: ResolvedDraftOrderProduct,
  quantity: number,
): DraftOrderItem | null {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) return null;

  const productId = product.productSnapshot.productId.trim();
  const sku = product.productSnapshot.sku.trim();
  const name = product.productSnapshot.name.trim();
  const currency = normalizeCurrency(product.publicPrice.currency);
  const price = parseDecimal(product.publicPrice.amount);
  if (!productId || !sku || !name || !currency || !price) return null;

  return {
    productId,
    sku,
    name,
    variant: nullableText(product.productSnapshot.variant),
    quantity,
    resolvedPrice: { amount: formatDecimal(price), currency },
    subtotal: { amount: formatDecimal(multiplyDecimal(price, quantity)), currency },
    productSnapshot: {
      productId,
      sku,
      name,
      variant: nullableText(product.productSnapshot.variant),
      line: nullableText(product.productSnapshot.line),
      brandName: nullableText(product.productSnapshot.brandName),
      categoryName: nullableText(product.productSnapshot.categoryName),
    },
  };
}

export function calculateDraftOrderSummary(
  items: DraftOrderItem[],
  currencyInput: string,
  discountAmount = '0',
): DraftOrderSummary | null {
  const currency = normalizeCurrency(currencyInput);
  const discount = parseDecimal(discountAmount);
  if (!currency || !discount) return null;

  let subtotal: Decimal = { units: 0n, scale: 0 };
  let totalQuantity = 0;
  for (const item of items) {
    if (
      normalizeCurrency(item.resolvedPrice.currency) !== currency ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      return null;
    }
    const unitPrice = parseDecimal(item.resolvedPrice.amount);
    if (!unitPrice) return null;
    const itemSubtotal = multiplyDecimal(unitPrice, item.quantity);
    subtotal = addDecimals(subtotal, itemSubtotal);
    totalQuantity += item.quantity;
    if (!Number.isSafeInteger(totalQuantity)) return null;
  }

  const total = subtractDecimals(subtotal, discount);
  if (!total) return null;

  return {
    totalQuantity,
    subtotal: { amount: formatDecimal(subtotal), currency },
    discount: { amount: formatDecimal(discount), currency },
    total: { amount: formatDecimal(total), currency },
  };
}

export function consolidateDraftOrderItems(
  inputs: Array<{ productId: string; quantity: number }>,
  allowZero: boolean,
): OrdersResult<Map<string, number>> {
  if (!inputs.length) {
    return ordersFailure('INVALID_INPUT', 'At least one draft order item change is required.');
  }

  const quantities = new Map<string, number>();
  for (const [index, input] of inputs.entries()) {
    const productId = input.productId.trim();
    if (!productId) {
      return ordersFailure('PRODUCT_NOT_FOUND', 'A draft order product is invalid.', {
        [`items.${index}.productId`]: 'Product ID is required.',
      });
    }
    const validQuantity =
      Number.isSafeInteger(input.quantity) && (allowZero ? input.quantity >= 0 : input.quantity > 0);
    if (!validQuantity) {
      return ordersFailure(
        'INVALID_QUANTITY',
        allowZero
          ? 'Product quantity cannot be negative.'
          : 'Product quantity must be greater than zero.',
        {
          [`items.${index}.quantity`]: allowZero
            ? 'Quantity must be zero or a positive integer.'
            : 'Quantity must be a positive integer.',
        },
      );
    }
    const quantity = (quantities.get(productId) ?? 0) + input.quantity;
    if (!Number.isSafeInteger(quantity)) {
      return ordersFailure('INVALID_QUANTITY', 'The combined product quantity is invalid.');
    }
    quantities.set(productId, quantity);
  }
  return { ok: true, value: quantities };
}

export async function resolveDraftOrderItems(
  tenantId: string,
  currency: string,
  quantities: Map<string, number>,
  products: DraftOrderProductResolver,
): Promise<OrdersResult<DraftOrderItem[]>> {
  const productIds = [...quantities.keys()].filter((productId) => quantities.get(productId)! > 0);
  let resolutions;
  try {
    resolutions = await Promise.all(
      productIds.map((productId) => products.resolvePublicProduct(tenantId, productId)),
    );
  } catch {
    return ordersFailure('REPOSITORY_FAILURE', 'Products could not be resolved.');
  }

  const items: DraftOrderItem[] = [];
  for (const [index, productId] of productIds.entries()) {
    const resolution = resolutions[index];
    if (resolution.status === 'product_not_found') {
      return ordersFailure('PRODUCT_NOT_FOUND', `Product "${productId}" was not found.`);
    }
    if (resolution.status === 'price_unavailable') {
      return ordersFailure('PRICE_UNAVAILABLE', `Product "${productId}" has no public price.`);
    }
    if (resolution.product.productSnapshot.productId.trim() !== productId) {
      return ordersFailure('PRODUCT_NOT_FOUND', `Product "${productId}" could not be resolved.`);
    }
    if (resolution.product.publicPrice.currency.trim().toUpperCase() !== currency) {
      return ordersFailure(
        'CURRENCY_MISMATCH',
        `Product "${productId}" uses a different currency.`,
      );
    }
    const item = createDraftOrderItem(resolution.product, quantities.get(productId)!);
    if (!item) {
      return ordersFailure('PRICE_UNAVAILABLE', `Product "${productId}" has an invalid price.`);
    }
    items.push(item);
  }
  return { ok: true, value: items };
}

export function changeDraftOrderItemQuantity(item: DraftOrderItem, quantity: number) {
  return createDraftOrderItem(
    { productSnapshot: item.productSnapshot, publicPrice: item.resolvedPrice },
    quantity,
  );
}

export function rebuildDraftOrder(
  draftOrder: DraftOrder,
  items: DraftOrderItem[],
  updatedAt: string,
): DraftOrder | null {
  if (draftOrder.summary.discount.currency.trim().toUpperCase() !== draftOrder.currency) return null;
  const normalizedItems: DraftOrderItem[] = [];
  for (const item of items) {
    const normalized = changeDraftOrderItemQuantity(item, item.quantity);
    if (!normalized || normalized.resolvedPrice.currency !== draftOrder.currency) return null;
    normalizedItems.push(normalized);
  }
  const summary = calculateDraftOrderSummary(
    normalizedItems,
    draftOrder.currency,
    draftOrder.summary.discount.amount,
  );
  if (!summary || !updatedAt.trim()) return null;
  return { ...draftOrder, items: normalizedItems, summary, updatedAt };
}

export function ordersFailure(
  code: OrdersDomainError['code'],
  message: string,
  fieldErrors?: Record<string, string>,
): OrdersResult<never> {
  return {
    ok: false,
    error: { domain: 'orders', code, message, ...(fieldErrors ? { fieldErrors } : {}) },
  };
}

export function isPositiveMoneyAmount(value: string) {
  const amount = parseDecimal(value);
  return amount !== null && amount.units > 0n;
}

function parseDecimal(value: string): Decimal | null {
  const normalized = value.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) return null;
  const fraction = match[2] ?? '';
  return normalizeDecimal({
    units: BigInt(`${match[1]}${fraction}`),
    scale: fraction.length,
  });
}

function multiplyDecimal(value: Decimal, multiplier: number): Decimal {
  return normalizeDecimal({ units: value.units * BigInt(multiplier), scale: value.scale });
}

function addDecimals(left: Decimal, right: Decimal): Decimal {
  const scale = Math.max(left.scale, right.scale);
  return normalizeDecimal({
    units: scaleUnits(left, scale) + scaleUnits(right, scale),
    scale,
  });
}

function subtractDecimals(left: Decimal, right: Decimal): Decimal | null {
  const scale = Math.max(left.scale, right.scale);
  const units = scaleUnits(left, scale) - scaleUnits(right, scale);
  return units < 0n ? null : normalizeDecimal({ units, scale });
}

function scaleUnits(value: Decimal, scale: number) {
  return value.units * 10n ** BigInt(scale - value.scale);
}

function normalizeDecimal(value: Decimal): Decimal {
  let { units, scale } = value;
  while (scale > 0 && units % 10n === 0n) {
    units /= 10n;
    scale -= 1;
  }
  return { units, scale };
}

function formatDecimal(value: Decimal) {
  if (value.scale === 0) return value.units.toString();
  const digits = value.units.toString().padStart(value.scale + 1, '0');
  const split = digits.length - value.scale;
  return `${digits.slice(0, split)}.${digits.slice(split)}`;
}

function normalizeCurrency(value: string) {
  const currency = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function nullableText(value: string | null) {
  const normalized = value?.trim() ?? '';
  return normalized || null;
}
