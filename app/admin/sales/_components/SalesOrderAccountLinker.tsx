'use client';

import { FormEvent, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { AccountLinkOption } from '@/modules/accounts/types';
import {
  createAccountFromSalesOrder,
  linkSalesOrderAccount,
} from '@/modules/sales/commands';
import type { SalesCommandResult, SalesOrderDetail } from '@/modules/sales/types';

type SalesOrderAccountLinkerProps = {
  order: SalesOrderDetail;
  tenantSlug: string;
  accounts: AccountLinkOption[];
  accountsError: string | null;
};

type Mode = 'idle' | 'create' | 'link';

export function SalesOrderAccountLinker({
  order,
  tenantSlug,
  accounts,
  accountsError,
}: SalesOrderAccountLinkerProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('idle');
  const [query, setQuery] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [result, setResult] = useState<SalesCommandResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState(() => ({
    name: order.accountName,
    legalName: order.customerCompany ?? '',
    whatsapp: order.accountWhatsapp ?? '',
    email: order.customerEmail ?? '',
    taxId: order.customerTaxId ?? '',
    notes: order.notes ?? '',
  }));
  const filteredAccounts = useMemo(() => {
    const search = normalizeSearch(query);
    if (!search) return accounts.slice(0, 8);
    return accounts.filter((account) => [
      account.name,
      account.legalName,
      account.whatsapp,
      account.email,
    ].filter(Boolean).join(' ').toLowerCase().includes(search)).slice(0, 8);
  }, [accounts, query]);

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setResult(null);
  }

  function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    startTransition(async () => {
      const commandResult = await createAccountFromSalesOrder({
        tenantSlug,
        orderId: order.id,
        name: draft.name,
        legalName: draft.legalName,
        whatsapp: draft.whatsapp,
        email: draft.email,
        taxId: draft.taxId,
        notes: draft.notes,
      });
      setResult(commandResult);
      if (commandResult.ok) router.refresh();
    });
  }

  function linkAccount() {
    if (!selectedAccountId) return;
    setResult(null);
    startTransition(async () => {
      const commandResult = await linkSalesOrderAccount({
        tenantSlug,
        orderId: order.id,
        accountId: selectedAccountId,
      });
      setResult(commandResult);
      if (commandResult.ok) router.refresh();
    });
  }

  return (
    <section className="product-edit-panel sales-account-linker">
      <div className="product-edit-panel-header">
        <span>Cliente no vinculado</span>
      </div>
      <p className="sales-account-linker-intro">
        Este pedido conserva una identidad publica, pero todavia no pertenece a una Account.
      </p>

      {mode === 'idle' ? (
        <div className="sales-account-linker-actions">
          <button className="product-edit-primary-button" onClick={() => changeMode('create')} type="button">
            Crear Account desde este pedido
          </button>
          <button className="products-muted-button" onClick={() => changeMode('link')} type="button">
            Vincular a Account existente
          </button>
        </div>
      ) : null}

      {mode === 'create' ? (
        <form className="sales-account-create-form" onSubmit={createAccount}>
          <div className="product-edit-field-grid">
            <AccountField error={result?.fieldErrors.name} label="Nombre" required value={draft.name} onChange={(name) => setDraft((current) => ({ ...current, name }))} />
            <AccountField label="Empresa / razon social" value={draft.legalName} onChange={(legalName) => setDraft((current) => ({ ...current, legalName }))} />
            <AccountField error={result?.fieldErrors.whatsapp} label="WhatsApp" value={draft.whatsapp} onChange={(whatsapp) => setDraft((current) => ({ ...current, whatsapp }))} />
            <AccountField error={result?.fieldErrors.email} label="Email" type="email" value={draft.email} onChange={(email) => setDraft((current) => ({ ...current, email }))} />
            <AccountField error={result?.fieldErrors.taxId} label="CUIT" value={draft.taxId} onChange={(taxId) => setDraft((current) => ({ ...current, taxId }))} />
            <label className="product-edit-field">
              <span>Lista de precios</span>
              <input readOnly value={order.priceListName} />
            </label>
          </div>
          <label className="product-edit-field">
            <span>Observaciones</span>
            <textarea onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} rows={3} value={draft.notes} />
          </label>
          <div className="sales-account-linker-actions">
            <button className="product-edit-primary-button" disabled={isPending} type="submit">
              {isPending ? 'Creando y vinculando' : 'Crear y vincular'}
            </button>
            <button className="products-muted-button" disabled={isPending} onClick={() => changeMode('idle')} type="button">Cancelar</button>
          </div>
        </form>
      ) : null}

      {mode === 'link' ? (
        <div className="sales-account-search">
          <label className="products-search">
            <span>Buscar Account</span>
            <input onChange={(event) => setQuery(event.target.value)} placeholder="Nombre, empresa, WhatsApp o email" type="search" value={query} />
          </label>
          {accountsError ? <p className="sales-field-error">{accountsError}</p> : null}
          <div className="sales-account-search-results">
            {filteredAccounts.map((account) => (
              <button
                data-selected={selectedAccountId === account.id}
                key={account.id}
                onClick={() => setSelectedAccountId(account.id)}
                type="button"
              >
                <strong>{account.name}</strong>
                <span>{[account.legalName, account.whatsapp, account.email].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</span>
              </button>
            ))}
            {!accountsError && filteredAccounts.length === 0 ? <p>No se encontraron Accounts.</p> : null}
          </div>
          <div className="sales-account-linker-actions">
            <button className="product-edit-primary-button" disabled={isPending || !selectedAccountId} onClick={linkAccount} type="button">
              {isPending ? 'Vinculando' : 'Vincular Account'}
            </button>
            <button className="products-muted-button" disabled={isPending} onClick={() => changeMode('idle')} type="button">Cancelar</button>
          </div>
        </div>
      ) : null}

      {result?.error ? <p className="product-edit-feedback product-edit-feedback-error" role="alert">{result.error}</p> : null}
    </section>
  );
}

function AccountField({ label, value, onChange, error, required = false, type = 'text' }: {
  label: string;
  value: string;
  onChange(value: string): void;
  error?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="product-edit-field">
      <span>{label}</span>
      <input aria-invalid={Boolean(error)} onChange={(event) => onChange(event.target.value)} required={required} type={type} value={value} />
      {error ? <small>{error}</small> : null}
    </label>
  );
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}
