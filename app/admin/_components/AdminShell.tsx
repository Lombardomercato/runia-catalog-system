'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import type { WorkspaceSidebarIndicators } from '@/modules/workspace/types';

type AdminShellProps = {
  children: ReactNode;
  indicators: WorkspaceSidebarIndicators;
};

const navItems = [
  { label: 'Dashboard', href: '/admin' },
  { label: 'Productos', href: '/admin/productos', indicatorKey: 'products' },
  { label: 'Precios', href: '/admin/precios' },
  { label: 'Accounts', href: '/admin/accounts', indicatorKey: 'accounts' },
  { label: 'Pedidos', href: '/admin/sales', indicatorKey: 'sales' },
  { label: 'Categorias', href: '/admin/categorias' },
  { label: 'Marcas', href: '/admin/marcas' },
  { label: 'Importador', href: '/admin/importador' },
  { label: 'Configuracion', href: '/admin/configuracion' },
] as const;

export function AdminShell({ children, indicators }: AdminShellProps) {
  const pathname = usePathname();

  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="admin-brand-mark">R</span>
          <div>
            <strong>Runia</strong>
            <span>Backoffice</span>
          </div>
        </div>

        <nav className="admin-nav" aria-label="Admin">
          {navItems.map((item) => {
            const isActive =
              item.href === '/admin' ? pathname === item.href : pathname.startsWith(item.href);
            const indicator =
              'indicatorKey' in item ? indicators[item.indicatorKey] : null;

            return (
              <Link
                key={item.href}
                className="admin-nav-link"
                data-active={isActive}
                href={item.href}
              >
                <span>{item.label}</span>
                {typeof indicator === 'number' && indicator > 0 ? (
                  <span className="admin-nav-badge" aria-label={`${indicator} pendientes`}>
                    {indicator}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <form action="/admin/logout" className="admin-logout-form" method="post">
          <button type="submit">Salir</button>
        </form>
      </aside>

      <section className="admin-main">{children}</section>
    </div>
  );
}
