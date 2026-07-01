'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState, useTransition } from 'react';
import { createTenant } from '@/modules/tenants/commands';
import type { TenantCommandResult } from '@/modules/tenants/types';
import { suggestTenantSlug } from '@/modules/tenants/validators';

type TenantDraft = {
  name: string;
  slug: string;
  primaryColor: string;
  secondaryColor: string;
};

const initialDraft: TenantDraft = {
  name: '',
  slug: '',
  primaryColor: '#14b8a6',
  secondaryColor: '#0f172a',
};

export function RuniaTenantCreateForm() {
  const router = useRouter();
  const [draft, setDraft] = useState<TenantDraft>(initialDraft);
  const [slugTouched, setSlugTouched] = useState(false);
  const [result, setResult] = useState<TenantCommandResult | null>(null);
  const [isSaving, startSaving] = useTransition();
  const fieldErrors = result?.fieldErrors ?? {};

  useEffect(() => {
    if (!slugTouched) {
      setDraft((current) => ({
        ...current,
        slug: suggestTenantSlug(current.name),
      }));
    }
  }, [draft.name, slugTouched]);

  function updateDraft<Key extends keyof TenantDraft>(key: Key, value: TenantDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);

    startSaving(async () => {
      const commandResult = await createTenant(draft);
      setResult(commandResult);

      if (commandResult.ok && commandResult.tenantSlug) {
        router.push(`/runia/tenants/${commandResult.tenantSlug}/enter`);
      }
    });
  }

  return (
    <main className="runia-page runia-form-page">
      <header className="runia-hero">
        <div>
          <p className="runia-kicker">Nuevo cliente</p>
          <h1>Nuevo Tenant</h1>
          <p>Alta inicial para dejar un distribuidor listo para importar su catalogo.</p>
        </div>
        <Link className="runia-secondary-link" href="/runia">
          Volver
        </Link>
      </header>

      <form className="runia-create-grid" onSubmit={handleSubmit}>
        <section className="runia-form-panel">
          <div className="runia-panel-title">Empresa</div>

          <label className="runia-field">
            <span>Nombre</span>
            <input
              aria-invalid={Boolean(fieldErrors.name)}
              onChange={(event) => updateDraft('name', event.target.value)}
              required
              value={draft.name}
            />
            {fieldErrors.name ? <small>{fieldErrors.name}</small> : null}
          </label>

          <label className="runia-field">
            <span>Slug</span>
            <input
              aria-invalid={Boolean(fieldErrors.slug)}
              onChange={(event) => {
                setSlugTouched(true);
                updateDraft('slug', suggestTenantSlug(event.target.value));
              }}
              required
              value={draft.slug}
            />
            {fieldErrors.slug ? <small>{fieldErrors.slug}</small> : null}
          </label>

          <div className="runia-logo-placeholder">
            <span>Logo</span>
            <strong>{draft.name ? draft.name.slice(0, 1).toUpperCase() : 'R'}</strong>
            <p>Placeholder. La subida real de logo queda para una etapa posterior.</p>
          </div>
        </section>

        <aside className="runia-form-panel">
          <div className="runia-panel-title">Branding inicial</div>

          <label className="runia-field">
            <span>Color principal</span>
            <input
              aria-invalid={Boolean(fieldErrors.primaryColor)}
              onChange={(event) => updateDraft('primaryColor', event.target.value)}
              type="text"
              value={draft.primaryColor}
            />
            {fieldErrors.primaryColor ? <small>{fieldErrors.primaryColor}</small> : null}
          </label>

          <label className="runia-field">
            <span>Color secundario</span>
            <input
              aria-invalid={Boolean(fieldErrors.secondaryColor)}
              onChange={(event) => updateDraft('secondaryColor', event.target.value)}
              type="text"
              value={draft.secondaryColor}
            />
            {fieldErrors.secondaryColor ? <small>{fieldErrors.secondaryColor}</small> : null}
          </label>

          <div className="runia-color-preview">
            <span style={{ background: draft.primaryColor }} />
            <span style={{ background: draft.secondaryColor }} />
          </div>

          <div className="runia-ready-card">
            <span>Se crea automaticamente</span>
            <strong>Minorista, Mayorista, settings y feature flags base</strong>
            <p>El tenant queda preparado para cargar catalogo desde el importador.</p>
          </div>
        </aside>

        {result?.error ? (
          <section className="runia-feedback runia-feedback-error">{result.error}</section>
        ) : null}

        {result?.ok ? (
          <section className="runia-feedback runia-feedback-success">{result.message}</section>
        ) : null}

        <footer className="runia-form-actions">
          <Link className="runia-secondary-link" href="/runia">
            Cancelar
          </Link>
          <button className="runia-primary-button" disabled={isSaving} type="submit">
            {isSaving ? 'Creando' : 'Crear'}
          </button>
        </footer>
      </form>
    </main>
  );
}
