'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { usePublicCommerce } from '../PublicCommerceProvider';
import type { DraftIdentityFormValues } from './types';

type DraftIdentityFormProps = {
  onBack(): void;
  onPrepared(): void;
};

export function DraftIdentityForm({ onBack, onPrepared }: DraftIdentityFormProps) {
  const { draft, pending, error, identityFieldErrors, prepareIdentity } = usePublicCommerce();
  const [values, setValues] = useState<DraftIdentityFormValues>(() => ({
    name: draft?.identity?.name ?? '',
    company: draft?.identity?.company ?? '',
    whatsapp: draft?.identity?.whatsapp ?? '',
    email: draft?.identity?.email ?? '',
    cuit: draft?.identity?.cuit ?? '',
    notes: draft?.identity?.notes ?? '',
  }));
  const [saved, setSaved] = useState(false);

  function update(field: keyof DraftIdentityFormValues, value: string) {
    setSaved(false);
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prepared = await prepareIdentity(values);
    setSaved(prepared);
    if (prepared) onPrepared();
  }

  return (
    <form className="public-commerce-identity-form" onSubmit={submit} noValidate>
      <p className="public-commerce-identity-intro">
        Completa tus datos para preparar el pedido. Todavia no se enviara ni se creara una cuenta.
      </p>

      <IdentityField label="Nombre" error={identityFieldErrors.name} required>
        <input autoComplete="name" maxLength={120} onChange={(event) => update('name', event.target.value)} value={values.name} />
      </IdentityField>

      <IdentityField label="Empresa" error={identityFieldErrors.company}>
        <input autoComplete="organization" maxLength={160} onChange={(event) => update('company', event.target.value)} value={values.company} />
      </IdentityField>

      <IdentityField label="WhatsApp" error={identityFieldErrors.whatsapp} required>
        <input autoComplete="tel" inputMode="tel" onChange={(event) => update('whatsapp', event.target.value)} placeholder="+54 341 123 4567" value={values.whatsapp} />
      </IdentityField>

      <IdentityField label="Email" error={identityFieldErrors.email}>
        <input autoComplete="email" inputMode="email" maxLength={254} onChange={(event) => update('email', event.target.value)} value={values.email} />
      </IdentityField>

      <IdentityField label="CUIT" error={identityFieldErrors.cuit}>
        <input inputMode="numeric" onChange={(event) => update('cuit', event.target.value)} placeholder="20-12345678-3" value={values.cuit} />
      </IdentityField>

      <IdentityField label="Observaciones" error={identityFieldErrors.notes}>
        <textarea maxLength={1000} onChange={(event) => update('notes', event.target.value)} rows={4} value={values.notes} />
      </IdentityField>

      {error ? <p className="public-commerce-error" role="alert">{error}</p> : null}
      {saved ? <p className="public-commerce-success" role="status">Datos guardados en este pedido.</p> : null}

      <div className="public-commerce-identity-actions">
        <button disabled={pending} onClick={onBack} type="button">Volver</button>
        <button className="public-commerce-continue" disabled={pending} type="submit">
          {pending ? 'Guardando...' : 'Guardar datos'}
        </button>
      </div>
    </form>
  );
}

function IdentityField({ label, error, required = false, children }: {
  label: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="public-commerce-identity-field">
      <span>{label}{required ? ' *' : ''}</span>
      {children}
      {error ? <small role="alert">{error}</small> : null}
    </label>
  );
}
