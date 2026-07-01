'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState, useTransition } from 'react';
import { updateProduct } from '@/modules/products/commands';
import type {
  ProductCommandResult,
  ProductDetail,
  ProductFilterOption,
} from '@/modules/products/types';

type ProductEditFormProps = {
  tenantSlug: string;
  product: ProductDetail;
  categories: ProductFilterOption[];
  brands: ProductFilterOption[];
  filtersError: string | null;
};

type ProductEditDraft = {
  name: string;
  productLine: string;
  brandId: string;
  categoryId: string;
  variant: string;
  description: string;
  isActive: boolean;
  minoristaPrice: string;
  mayoristaPrice: string;
};

export function ProductEditForm({
  tenantSlug,
  product,
  categories,
  brands,
  filtersError,
}: ProductEditFormProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<ProductEditDraft>(() => toDraft(product));
  const [result, setResult] = useState<ProductCommandResult | null>(null);
  const [isSaving, startSaving] = useTransition();
  const canEditMayorista = Boolean(product.prices.mayorista?.exists);
  const fieldErrors = result?.fieldErrors ?? {};
  const formattedUpdatedAt = useMemo(() => formatDateTime(product.updatedAt), [product.updatedAt]);

  useEffect(() => {
    setDraft(toDraft(product));
  }, [product]);

  function updateDraft<Key extends keyof ProductEditDraft>(
    key: Key,
    value: ProductEditDraft[Key],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function resetDraft() {
    setDraft(toDraft(product));
    setResult(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);

    startSaving(async () => {
      const commandResult = await updateProduct({
        tenantSlug,
        productId: product.id,
        sku: product.sku,
        name: draft.name,
        productLine: draft.productLine,
        brandId: draft.brandId,
        categoryId: draft.categoryId,
        variant: draft.variant,
        description: draft.description,
        isActive: draft.isActive,
        minoristaPrice: draft.minoristaPrice,
        mayoristaPrice: canEditMayorista ? draft.mayoristaPrice : null,
        shouldUpdateMayoristaPrice: canEditMayorista,
      });

      setResult(commandResult);

      if (commandResult.ok) {
        router.refresh();
      }
    });
  }

  return (
    <main className="product-edit-page">
      <header className="admin-header product-edit-header">
        <p className="admin-kicker">Producto</p>
        <div className="admin-header-row">
          <div>
            <h1 className="admin-title">{product.name}</h1>
            <p className="admin-subtitle">Editar datos comerciales y precios publicados.</p>
          </div>
          <Link className="product-edit-secondary-link" href="/admin/productos">
            Volver al listado
          </Link>
        </div>
      </header>

      {filtersError ? (
        <section className="products-state products-state-error">
          <strong>No se pudieron cargar todos los filtros.</strong>
          <p>{filtersError}</p>
        </section>
      ) : null}

      <form className="product-edit-form" onSubmit={handleSubmit}>
        <section className="product-edit-grid">
          <div className="product-edit-panel">
            <div className="product-edit-panel-header">
              <span>Informacion principal</span>
            </div>

            <label className="product-edit-field">
              <span>Nombre</span>
              <input
                aria-invalid={Boolean(fieldErrors.name)}
                onChange={(event) => updateDraft('name', event.target.value)}
                required
                value={draft.name}
              />
              {fieldErrors.name ? <small>{fieldErrors.name}</small> : null}
            </label>

            <label className="product-edit-field">
              <span>Linea</span>
              <input
                onChange={(event) => updateDraft('productLine', event.target.value)}
                value={draft.productLine}
              />
            </label>

            <div className="product-edit-field-grid">
              <label className="product-edit-field">
                <span>Marca</span>
                <select
                  aria-invalid={Boolean(fieldErrors.brandId)}
                  onChange={(event) => updateDraft('brandId', event.target.value)}
                  required
                  value={draft.brandId}
                >
                  <option value="">Seleccionar</option>
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>
                {fieldErrors.brandId ? <small>{fieldErrors.brandId}</small> : null}
              </label>

              <label className="product-edit-field">
                <span>Categoria</span>
                <select
                  aria-invalid={Boolean(fieldErrors.categoryId)}
                  onChange={(event) => updateDraft('categoryId', event.target.value)}
                  required
                  value={draft.categoryId}
                >
                  <option value="">Seleccionar</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                {fieldErrors.categoryId ? <small>{fieldErrors.categoryId}</small> : null}
              </label>
            </div>

            <label className="product-edit-field">
              <span>Variante</span>
              <input
                onChange={(event) => updateDraft('variant', event.target.value)}
                value={draft.variant}
              />
            </label>

            <label className="product-edit-field">
              <span>Descripcion</span>
              <textarea
                onChange={(event) => updateDraft('description', event.target.value)}
                rows={7}
                value={draft.description}
              />
            </label>
          </div>

          <aside className="product-edit-panel product-edit-side">
            <div className="product-edit-panel-header">
              <span>Publicacion y precio</span>
            </div>

            <label className="product-edit-field">
              <span>SKU</span>
              <input readOnly value={product.sku} />
              {fieldErrors.sku ? <small>{fieldErrors.sku}</small> : null}
            </label>

            <label className="product-edit-field">
              <span>Estado</span>
              <select
                onChange={(event) => updateDraft('isActive', event.target.value === 'active')}
                value={draft.isActive ? 'active' : 'inactive'}
              >
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
              </select>
              {fieldErrors.isActive ? <small>{fieldErrors.isActive}</small> : null}
            </label>

            <label className="product-edit-field">
              <span>Precio Minorista</span>
              <input
                aria-invalid={Boolean(fieldErrors.minoristaPrice)}
                min="0"
                onChange={(event) => updateDraft('minoristaPrice', event.target.value)}
                required
                step="0.01"
                type="number"
                value={draft.minoristaPrice}
              />
              {fieldErrors.minoristaPrice ? <small>{fieldErrors.minoristaPrice}</small> : null}
            </label>

            {canEditMayorista ? (
              <label className="product-edit-field">
                <span>Precio Mayorista</span>
                <input
                  aria-invalid={Boolean(fieldErrors.mayoristaPrice)}
                  min="0"
                  onChange={(event) => updateDraft('mayoristaPrice', event.target.value)}
                  step="0.01"
                  type="number"
                  value={draft.mayoristaPrice}
                />
                {fieldErrors.mayoristaPrice ? <small>{fieldErrors.mayoristaPrice}</small> : null}
              </label>
            ) : (
              <div className="product-edit-readonly">
                <span>Precio Mayorista</span>
                <strong>No configurado</strong>
              </div>
            )}

            <div className="product-edit-readonly">
              <span>Ultima actualizacion</span>
              <strong>{formattedUpdatedAt}</strong>
            </div>
          </aside>
        </section>

        <section className="product-edit-images">
          <span>Imagenes</span>
          <strong>Proximamente</strong>
        </section>

        {result?.error ? (
          <section className="product-edit-feedback product-edit-feedback-error">
            {result.error}
          </section>
        ) : null}

        {result?.ok ? (
          <section className="product-edit-feedback product-edit-feedback-success">
            {result.message}
          </section>
        ) : null}

        <footer className="product-edit-actions">
          <button className="products-muted-button" onClick={resetDraft} type="button">
            Cancelar
          </button>
          <button className="product-edit-primary-button" disabled={isSaving} type="submit">
            {isSaving ? 'Guardando' : 'Guardar cambios'}
          </button>
        </footer>
      </form>
    </main>
  );
}

function toDraft(product: ProductDetail): ProductEditDraft {
  return {
    name: product.name,
    productLine: product.productLine ?? '',
    brandId: product.brandId,
    categoryId: product.categoryId,
    variant: product.variant ?? '',
    description: product.description ?? '',
    isActive: product.isActive,
    minoristaPrice: formatInputPrice(product.prices.minorista.price),
    mayoristaPrice: formatInputPrice(product.prices.mayorista?.price ?? null),
  };
}

function formatInputPrice(value: number | null) {
  return value === null ? '' : String(value);
}

function formatDateTime(value: string) {
  if (!value) {
    return 'Sin datos';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Sin datos';
  }

  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
