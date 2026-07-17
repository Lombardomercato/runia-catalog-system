'use client';

import { useState } from 'react';
import { usePublicCommerceAddProduct } from './PublicCommerceProvider';
import type { PublicCommerceProduct } from './types';

export function AddProductButton({
  product,
  className = 'public-commerce-add-button',
}: {
  product: PublicCommerceProduct;
  className?: string;
}) {
  const { addProduct, enabled, submitted } = usePublicCommerceAddProduct();
  const [pending, setPending] = useState(false);
  const unavailable = product.price === null;

  const add = async () => {
    setPending(true);
    try {
      await addProduct(product);
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      className={className}
      disabled={!enabled || pending || unavailable}
      onClick={() => void add()}
      type="button"
    >
      {submitted
        ? 'Pedido finalizado'
        : enabled
          ? (pending ? 'Agregando...' : 'Agregar al pedido')
          : 'Pedido no disponible'}
    </button>
  );
}
