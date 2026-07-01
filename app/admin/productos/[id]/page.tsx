import Link from 'next/link';
import { getProductById, getProductFilterOptions } from '@/modules/products/queries';
import { getCurrentTenantSlug } from '@/lib/currentTenant';
import { ProductEditForm } from './_components/ProductEditForm';

export const dynamic = 'force-dynamic';

type ProductEditPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AdminProductEditPage({ params }: ProductEditPageProps) {
  const tenantSlug = await getCurrentTenantSlug();
  const { id } = await params;
  const [productResult, filters] = await Promise.all([
    getProductById(tenantSlug, id),
    getProductFilterOptions(tenantSlug),
  ]);

  if (productResult.error || !productResult.product) {
    return (
      <main className="product-edit-page">
        <header className="admin-header product-edit-header">
          <p className="admin-kicker">Producto</p>
          <h1 className="admin-title">No encontrado</h1>
        </header>

        <section className="products-state products-state-error">
          <strong>No se pudo cargar el producto.</strong>
          <p>{productResult.error}</p>
          <Link className="product-edit-secondary-link" href="/admin/productos">
            Volver al listado
          </Link>
        </section>
      </main>
    );
  }

  return (
    <ProductEditForm
      categories={filters.categories}
      filtersError={filters.error}
      brands={filters.brands}
      product={productResult.product}
      tenantSlug={tenantSlug}
    />
  );
}
