'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState, useTransition } from 'react';
import { createAccount, updateAccount } from '@/modules/accounts/commands';
import type {
  AccountCommandResult,
  AccountDetail,
  AccountPriceListOption,
} from '@/modules/accounts/types';

type AccountFormProps = {
  tenantSlug: string;
  account: AccountDetail | null;
  priceLists: AccountPriceListOption[];
  filtersError: string | null;
  mode: 'create' | 'edit';
};

type AccountDraft = {
  name: string;
  legalName: string;
  taxId: string;
  whatsapp: string;
  email: string;
  address: string;
  priceListId: string;
  discountPercent: string;
  isActive: boolean;
};

export function AccountForm({
  tenantSlug,
  account,
  priceLists,
  filtersError,
  mode,
}: AccountFormProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<AccountDraft>(() => toDraft(account));
  const [result, setResult] = useState<AccountCommandResult | null>(null);
  const [isSaving, startSaving] = useTransition();
  const fieldErrors = result?.fieldErrors ?? {};
  const formattedUpdatedAt = useMemo(
    () => formatDateTime(account?.updatedAt ?? ''),
    [account?.updatedAt],
  );
  const isCreate = mode === 'create';

  useEffect(() => {
    setDraft(toDraft(account));
  }, [account]);

  function updateDraft<Key extends keyof AccountDraft>(key: Key, value: AccountDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function resetDraft() {
    setDraft(toDraft(account));
    setResult(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);

    startSaving(async () => {
      const payload = {
        tenantSlug,
        name: draft.name,
        legalName: draft.legalName,
        taxId: draft.taxId,
        whatsapp: draft.whatsapp,
        email: draft.email,
        address: draft.address,
        priceListId: draft.priceListId || null,
        discountPercent: draft.discountPercent,
        isActive: draft.isActive,
      };

      const commandResult =
        isCreate || !account
          ? await createAccount(payload)
          : await updateAccount({
              ...payload,
              accountId: account.id,
            });

      setResult(commandResult);

      if (commandResult.ok) {
        if (isCreate && commandResult.accountId) {
          router.push(`/admin/accounts/${commandResult.accountId}`);
          return;
        }

        router.refresh();
      }
    });
  }

  return (
    <main className="account-edit-page">
      <header className="admin-header product-edit-header">
        <p className="admin-kicker">Account</p>
        <div className="admin-header-row">
          <div>
            <h1 className="admin-title">{isCreate ? 'Nueva account' : account?.name}</h1>
            <p className="admin-subtitle">
              Datos comerciales, lista de precios y estado operativo.
            </p>
          </div>
          <Link className="product-edit-secondary-link" href="/admin/accounts">
            Volver al listado
          </Link>
        </div>
      </header>

      {filtersError ? (
        <section className="products-state products-state-error">
          <strong>No se pudieron cargar las listas de precios.</strong>
          <p>{filtersError}</p>
        </section>
      ) : null}

      <form className="product-edit-form" onSubmit={handleSubmit}>
        <section className="product-edit-grid">
          <div className="product-edit-panel">
            <div className="product-edit-panel-header">
              <span>Datos comerciales</span>
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
              <span>Razon social</span>
              <input
                onChange={(event) => updateDraft('legalName', event.target.value)}
                value={draft.legalName}
              />
            </label>

            <div className="product-edit-field-grid">
              <label className="product-edit-field">
                <span>CUIT</span>
                <input
                  aria-invalid={Boolean(fieldErrors.taxId)}
                  onChange={(event) => updateDraft('taxId', event.target.value)}
                  value={draft.taxId}
                />
                {fieldErrors.taxId ? <small>{fieldErrors.taxId}</small> : null}
              </label>

              <label className="product-edit-field">
                <span>WhatsApp</span>
                <input
                  aria-invalid={Boolean(fieldErrors.whatsapp)}
                  onChange={(event) => updateDraft('whatsapp', event.target.value)}
                  value={draft.whatsapp}
                />
                {fieldErrors.whatsapp ? <small>{fieldErrors.whatsapp}</small> : null}
              </label>
            </div>

            <label className="product-edit-field">
              <span>Email</span>
              <input
                aria-invalid={Boolean(fieldErrors.email)}
                onChange={(event) => updateDraft('email', event.target.value)}
                type="email"
                value={draft.email}
              />
              {fieldErrors.email ? <small>{fieldErrors.email}</small> : null}
            </label>

            <label className="product-edit-field">
              <span>Direccion</span>
              <textarea
                onChange={(event) => updateDraft('address', event.target.value)}
                rows={5}
                value={draft.address}
              />
            </label>
          </div>

          <aside className="product-edit-panel product-edit-side">
            <div className="product-edit-panel-header">
              <span>Condiciones</span>
            </div>

            <label className="product-edit-field">
              <span>Lista de precios</span>
              <select
                aria-invalid={Boolean(fieldErrors.priceListId)}
                onChange={(event) => updateDraft('priceListId', event.target.value)}
                value={draft.priceListId}
              >
                <option value="">Sin definir</option>
                {priceLists.map((priceList) => (
                  <option key={priceList.id} value={priceList.id}>
                    {priceList.name}
                  </option>
                ))}
              </select>
              {fieldErrors.priceListId ? <small>{fieldErrors.priceListId}</small> : null}
            </label>

            <label className="product-edit-field">
              <span>Descuento</span>
              <input
                aria-invalid={Boolean(fieldErrors.discountPercent)}
                max="100"
                min="0"
                onChange={(event) => updateDraft('discountPercent', event.target.value)}
                step="0.01"
                type="number"
                value={draft.discountPercent}
              />
              {fieldErrors.discountPercent ? <small>{fieldErrors.discountPercent}</small> : null}
            </label>

            <label className="account-active-toggle">
              <input
                checked={draft.isActive}
                onChange={(event) => updateDraft('isActive', event.target.checked)}
                type="checkbox"
              />
              <span>
                <strong>Activo</strong>
                <small>Disponible para operaciones comerciales futuras.</small>
              </span>
            </label>

            <div className="product-edit-readonly">
              <span>Ultima actualizacion</span>
              <strong>{isCreate ? 'Sin guardar' : formattedUpdatedAt}</strong>
            </div>
          </aside>
        </section>

        <section className="account-future-panel">
          <div>
            <span>Preparado para proximas etapas</span>
            <strong>Contactos, direcciones, credito y condiciones comerciales</strong>
          </div>
          <p>La estructura queda reservada en base de datos, sin UI operativa todavia.</p>
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
          {isCreate ? (
            <Link className="products-muted-button account-cancel-link" href="/admin/accounts">
              Cancelar
            </Link>
          ) : (
            <button className="products-muted-button" onClick={resetDraft} type="button">
              Cancelar
            </button>
          )}
          <button className="product-edit-primary-button" disabled={isSaving} type="submit">
            {isSaving ? 'Guardando' : 'Guardar'}
          </button>
        </footer>
      </form>
    </main>
  );
}

function toDraft(account: AccountDetail | null): AccountDraft {
  return {
    name: account?.name ?? '',
    legalName: account?.legalName ?? '',
    taxId: account?.taxId ?? '',
    whatsapp: account?.whatsapp ?? '',
    email: account?.email ?? '',
    address: account?.address ?? '',
    priceListId: account?.priceListId ?? '',
    discountPercent: String(account?.discountPercent ?? 0),
    isActive: account?.isActive ?? true,
  };
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
