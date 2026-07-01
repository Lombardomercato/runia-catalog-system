'use client';

import { usePublicCommerce } from './PublicCommerceProvider';
import type { PublicCommerceProduct } from './types';

export function AddProductButton({
  product,
  className = 'public-commerce-add-button',
}: {
  product: PublicCommerceProduct;
  className?: string;
}) {
  const { addProduct, pending, tenant } = usePublicCommerce();
  if (!tenant?.enabled) return null;
  const unavailable = product.price === null;

  return (
    <button
      className={className}
      disabled={pending || unavailable}
      onClick={() => void addProduct(product)}
      type="button"
    >
      Agregar al pedido
    </button>
  );
}
