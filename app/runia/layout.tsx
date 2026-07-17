import Link from 'next/link';
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

export default function RuniaLayout({ children }: { children: ReactNode }) {
  return (
    <div className="runia-shell">
      <header className="runia-topbar">
        <Link className="runia-brand" href="/runia">
          <span>R</span>
          <div>
            <strong>Runia</strong>
            <small>SaaS Console</small>
          </div>
        </Link>

        <nav className="runia-topnav" aria-label="Runia">
          <Link href="/runia">Tenants</Link>
          <Link href="/runia/setup">Setup Engine</Link>
          <Link href="/admin">Workspace</Link>
          <form action="/admin/logout" method="post">
            <button type="submit">Salir</button>
          </form>
        </nav>
      </header>

      {children}
    </div>
  );
}
