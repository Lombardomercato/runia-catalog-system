'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { CommerceBrand, CommerceCategory, CommerceProductSort } from '@/sdk/server/types';
import type { CatalogListParams } from '../catalogSearchParams';

type CatalogControlsProps = {
  params: CatalogListParams;
  categories: CommerceCategory[];
  brands: CommerceBrand[];
  filteredCount: number;
  totalCount: number;
};

const sortOptions: Array<{ value: CommerceProductSort; label: string }> = [
  { value: 'name_asc', label: 'Nombre A-Z' },
  { value: 'name_desc', label: 'Nombre Z-A' },
  { value: 'price_asc', label: 'Menor precio' },
  { value: 'price_desc', label: 'Mayor precio' },
  { value: 'sku_asc', label: 'SKU' },
];

export function CatalogControls({ params, categories, brands, filteredCount, totalCount }: CatalogControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(params.search);
  const [isPending, startTransition] = useTransition();

  const updateParams = useCallback((changes: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(changes).forEach(([key, value]) => {
      if (!value || value === 'all' || (key === 'sort' && value === 'name_asc')) next.delete(key);
      else next.set(key, value);
    });
    const queryString = next.toString();
    startTransition(() => router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false }));
  }, [pathname, router, searchParams]);

  useEffect(() => setQuery(params.search), [params.search]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (query !== params.search) updateParams({ q: query.trim() || null });
    }, 240);
    return () => window.clearTimeout(timer);
  }, [params.search, query, updateParams]);

  function resetFilters() {
    setQuery('');
    startTransition(() => router.replace(pathname, { scroll: false }));
  }

  return (
    <section className="catalog-controls" aria-label="Buscar y filtrar productos">
      <form id="catalog-reset-form" onSubmit={(event) => { event.preventDefault(); resetFilters(); }}>
        <label className="catalog-search"><span>Buscar</span><input autoComplete="off" onChange={(event) => setQuery(event.target.value)} placeholder="Producto, SKU, marca o variante" type="search" value={query} /></label>
        <div className="catalog-filter-row">
          <FilterSelect label="Categoria" onChange={(value) => updateParams({ category: value })} options={categories} value={params.categoryId} />
          <FilterSelect label="Marca" onChange={(value) => updateParams({ brand: value })} options={brands} value={params.brandId} />
          <label className="catalog-select"><span>Ordenar</span><select onChange={(event) => updateParams({ sort: event.target.value })} value={params.sort}>{sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <button className="catalog-clear-button" disabled={!params.search && params.categoryId === 'all' && params.brandId === 'all' && params.sort === 'name_asc'} type="submit">Limpiar</button>
        </div>
      </form>
      <div className="catalog-result-count" aria-live="polite"><span>{isPending ? 'Actualizando' : `Mostrando ${filteredCount} de ${totalCount}`}</span></div>
    </section>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: Array<CommerceCategory | CommerceBrand>; onChange: (value: string) => void }) {
  return <label className="catalog-select"><span>{label}</span><select onChange={(event) => onChange(event.target.value)} value={value}><option value="all">Todas</option>{options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>;
}
