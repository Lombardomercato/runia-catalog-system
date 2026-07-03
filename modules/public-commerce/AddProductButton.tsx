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
  const { addProduct, draft, pending, tenant } = usePublicCommerce();
  if (!tenant?.enabled) return null;
  const unavailable = product.price === null;

  return (
    <button
      className={className}
      disabled={pending || unavailable || draft?.status === 'submitted'}
      onClick={() => void addProduct(product)}
      type="button"
    >
      {draft?.status === 'submitted' ? 'Pedido finalizado' : 'Agregar al pedido'}
    </button>
  );
}
