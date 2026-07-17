'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { createCommerceTenantFromSetup } from '@/modules/setup/commands';
import {
  SETUP_FEATURES,
  SETUP_STEPS,
  createDefaultSetupDraft,
  createEmptyPriceListDraft,
} from '@/modules/setup/defaults';
import type {
  SetupCommandResult,
  SetupDraft,
  SetupPriceListDraft,
} from '@/modules/setup/types';
import { suggestSetupSlug } from '@/modules/setup/validators';

export function SetupWizard() {
  const [draft, setDraft] = useState<SetupDraft>(() => createDefaultSetupDraft());
  const [step, setStep] = useState(0);
  const [slugTouched, setSlugTouched] = useState(false);
  const [result, setResult] = useState<SetupCommandResult | null>(null);
  const [isPending, startTransition] = useTransition();

  if (result?.ok && result.setup) {
    return (
      <SetupCompleted
        onRestart={() => {
          setDraft(createDefaultSetupDraft());
          setSlugTouched(false);
          setResult(null);
          setStep(0);
        }}
        result={result}
      />
    );
  }

  function updateDraft<Key extends keyof SetupDraft>(key: Key, value: SetupDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setResult(null);
  }

  function updateName(name: string) {
    setDraft((current) => ({
      ...current,
      name,
      slug: slugTouched ? current.slug : suggestSetupSlug(name),
    }));
    setResult(null);
  }

  function updateFeature(key: keyof SetupDraft['features'], value: boolean) {
    setDraft((current) => ({
      ...current,
      features: { ...current.features, [key]: value },
    }));
    setResult(null);
  }

  function updatePriceList<Key extends keyof SetupPriceListDraft>(
    clientId: string,
    key: Key,
    value: SetupPriceListDraft[Key],
  ) {
    setDraft((current) => ({
      ...current,
      priceLists: current.priceLists.map((priceList) =>
        priceList.clientId === clientId ? { ...priceList, [key]: value } : priceList,
      ),
    }));
    setResult(null);
  }

  function selectDefaultPriceList(clientId: string) {
    setDraft((current) => ({
      ...current,
      priceLists: current.priceLists.map((priceList) => ({
        ...priceList,
        active: priceList.clientId === clientId ? true : priceList.active,
        isDefault: priceList.clientId === clientId,
      })),
    }));
    setResult(null);
  }

  function removePriceList(clientId: string) {
    setDraft((current) => {
      if (current.priceLists.length === 1) return current;
      const removed = current.priceLists.find((priceList) => priceList.clientId === clientId);
      const remaining = current.priceLists.filter((priceList) => priceList.clientId !== clientId);
      if (removed?.isDefault && remaining[0]) {
        remaining[0] = { ...remaining[0], active: true, isDefault: true };
      }
      return { ...current, priceLists: remaining };
    });
    setResult(null);
  }

  function createTenant() {
    setResult(null);
    startTransition(async () => {
      const commandResult = await createCommerceTenantFromSetup(draft);
      setResult(commandResult);
    });
  }

  return (
    <main className="setup-page">
      <header className="setup-header">
        <div>
          <p className="setup-eyebrow">Runia Internal · Setup Engine v0</p>
          <h1>Preparar un motor Commerce</h1>
          <p>
            Configura el tenant, sus reglas iniciales y listas. La identidad y composición de
            la web continúan siendo responsabilidad de Runia Web.
          </p>
        </div>
        <div className="setup-header-actions">
          <Link href="/runia">Ver tenants</Link>
          <form action="/runia/setup/logout" method="post">
            <button type="submit">Cerrar sesión interna</button>
          </form>
        </div>
      </header>

      <ol className="setup-progress" aria-label="Progreso del Setup">
        {SETUP_STEPS.map((label, index) => (
          <li aria-current={index === step ? 'step' : undefined} data-state={stepState(index, step)} key={label}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{label}</strong>
          </li>
        ))}
      </ol>

      <section className="setup-workspace">
        <div className="setup-step-copy">
          <span>Paso {step + 1} de {SETUP_STEPS.length}</span>
          <h2>{STEP_COPY[step].title}</h2>
          <p>{STEP_COPY[step].description}</p>
        </div>

        <div className="setup-step-panel">
          {step === 0 ? (
            <IdentityStep
              draft={draft}
              fieldErrors={result?.fieldErrors ?? {}}
              onName={updateName}
              onSlug={(slug) => {
                setSlugTouched(true);
                updateDraft('slug', suggestSetupSlug(slug));
              }}
              update={updateDraft}
            />
          ) : null}
          {step === 1 ? (
            <CommerceStep
              draft={draft}
              update={updateDraft}
              updateFeature={updateFeature}
            />
          ) : null}
          {step === 2 ? (
            <PriceListsStep
              draft={draft}
              fieldErrors={result?.fieldErrors ?? {}}
              onAdd={() => {
                if (draft.priceLists.length >= 10) return;
                updateDraft('priceLists', [
                  ...draft.priceLists,
                  createEmptyPriceListDraft(draft.priceLists.length + 1),
                ]);
              }}
              onDefault={selectDefaultPriceList}
              onRemove={removePriceList}
              update={updatePriceList}
            />
          ) : null}
          {step === 3 ? <PublicDataStep draft={draft} update={updateDraft} /> : null}
          {step === 4 ? <ConfirmationStep draft={draft} /> : null}
        </div>

        {result?.error ? (
          <div className="setup-command-error" role="alert">
            <strong>{result.code === 'TENANT_ALREADY_EXISTS' ? 'Slug ya utilizado' : 'No se pudo completar'}</strong>
            <p>{result.error}</p>
            {Object.keys(result.fieldErrors).length > 0 ? (
              <ul>
                {Object.entries(result.fieldErrors).map(([field, error]) => (
                  <li key={field}>{error}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <footer className="setup-navigation">
          <button
            className="setup-button-secondary"
            disabled={step === 0 || isPending}
            onClick={() => setStep((current) => Math.max(0, current - 1))}
            type="button"
          >
            Anterior
          </button>
          <span>Los datos no se escriben hasta confirmar.</span>
          {step < SETUP_STEPS.length - 1 ? (
            <button
              className="setup-button-primary"
              onClick={() => setStep((current) => Math.min(SETUP_STEPS.length - 1, current + 1))}
              type="button"
            >
              Continuar
            </button>
          ) : (
            <button
              className="setup-button-primary"
              disabled={isPending}
              onClick={createTenant}
              type="button"
            >
              {isPending ? 'Creando transacción…' : 'Crear comercio'}
            </button>
          )}
        </footer>
      </section>
    </main>
  );
}

const STEP_COPY = [
  {
    title: 'Identidad del comercio',
    description: 'Datos operativos que identifican el tenant y su contexto regional.',
  },
  {
    title: 'Configuración comercial',
    description: 'Mínimos y capacidades existentes del motor; no son decisiones visuales.',
  },
  {
    title: 'Listas de precios iniciales',
    description: 'Una lista activa debe ser la única predeterminada y pública.',
  },
  {
    title: 'Datos públicos básicos',
    description: 'Valores opcionales consumibles por el SDK, sin crear themes o layouts.',
  },
  {
    title: 'Revisión antes de crear',
    description: 'La confirmación ejecutará una única operación transaccional e idempotente por slug.',
  },
] as const;

type DraftUpdate = <Key extends keyof SetupDraft>(key: Key, value: SetupDraft[Key]) => void;

function IdentityStep({
  draft,
  fieldErrors,
  onName,
  onSlug,
  update,
}: {
  draft: SetupDraft;
  fieldErrors: Record<string, string>;
  onName: (value: string) => void;
  onSlug: (value: string) => void;
  update: DraftUpdate;
}) {
  return (
    <div className="setup-form-grid">
      <SetupField error={fieldErrors.name} label="Nombre comercial" required>
        <input onChange={(event) => onName(event.target.value)} value={draft.name} />
      </SetupField>
      <SetupField error={fieldErrors.slug} label="Slug" required>
        <input onChange={(event) => onSlug(event.target.value)} value={draft.slug} />
      </SetupField>
      <SetupField label="Razón social">
        <input onChange={(event) => update('legalName', event.target.value)} value={draft.legalName} />
      </SetupField>
      <SetupField error={fieldErrors.email} label="Email de contacto">
        <input onChange={(event) => update('email', event.target.value)} type="email" value={draft.email} />
      </SetupField>
      <SetupField error={fieldErrors.whatsapp} label="WhatsApp con código de país">
        <input onChange={(event) => update('whatsapp', event.target.value)} placeholder="+54 9 11…" value={draft.whatsapp} />
      </SetupField>
      <SetupField label="Moneda">
        <input maxLength={3} onChange={(event) => update('currency', event.target.value.toUpperCase())} value={draft.currency} />
      </SetupField>
      <SetupField label="Locale">
        <input onChange={(event) => update('locale', event.target.value)} placeholder="es-AR" value={draft.locale} />
      </SetupField>
      <SetupField label="Estado inicial">
        <select onChange={(event) => update('status', event.target.value === 'setup' ? 'setup' : 'active')} value={draft.status}>
          <option value="active">active · resoluble por SDK</option>
          <option value="setup">setup · aún no público</option>
        </select>
      </SetupField>
    </div>
  );
}

function CommerceStep({
  draft,
  update,
  updateFeature,
}: {
  draft: SetupDraft;
  update: DraftUpdate;
  updateFeature: (key: keyof SetupDraft['features'], value: boolean) => void;
}) {
  return (
    <div className="setup-commerce-stack">
      <div className="setup-form-grid setup-form-grid-compact">
        <SetupField label="Pedido mínimo">
          <input min="0" onChange={(event) => update('minimumOrderAmount', event.target.value)} type="number" value={draft.minimumOrderAmount} />
        </SetupField>
        <SetupField label="Compra mínima">
          <input min="0" onChange={(event) => update('minimumPurchaseAmount', event.target.value)} type="number" value={draft.minimumPurchaseAmount} />
        </SetupField>
      </div>
      <div className="setup-feature-grid">
        {SETUP_FEATURES.map((feature) => (
          <label className="setup-feature" key={feature.key}>
            <input
              checked={draft.features[feature.key]}
              onChange={(event) => updateFeature(feature.key, event.target.checked)}
              type="checkbox"
            />
            <span>
              <strong>{feature.label}</strong>
              <small>{feature.description}</small>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function PriceListsStep({
  draft,
  fieldErrors,
  onAdd,
  onDefault,
  onRemove,
  update,
}: {
  draft: SetupDraft;
  fieldErrors: Record<string, string>;
  onAdd: () => void;
  onDefault: (clientId: string) => void;
  onRemove: (clientId: string) => void;
  update: <Key extends keyof SetupPriceListDraft>(
    clientId: string,
    key: Key,
    value: SetupPriceListDraft[Key],
  ) => void;
}) {
  return (
    <div className="setup-price-lists">
      {fieldErrors.priceLists ? <p className="setup-inline-error">{fieldErrors.priceLists}</p> : null}
      {draft.priceLists.map((priceList, index) => (
        <article className="setup-price-list" key={priceList.clientId}>
          <header>
            <div>
              <span>Lista {index + 1}</span>
              <strong>{priceList.name || 'Sin nombre'}</strong>
            </div>
            <button disabled={draft.priceLists.length === 1} onClick={() => onRemove(priceList.clientId)} type="button">Quitar</button>
          </header>
          <div className="setup-price-list-fields">
            <SetupField error={fieldErrors[`priceLists.${index}.name`]} label="Nombre">
              <input onChange={(event) => update(priceList.clientId, 'name', event.target.value)} value={priceList.name} />
            </SetupField>
            <SetupField error={fieldErrors[`priceLists.${index}.code`]} label="Código">
              <input onChange={(event) => update(priceList.clientId, 'code', suggestSetupSlug(event.target.value))} value={priceList.code} />
            </SetupField>
            <SetupField label="Pricing mode">
              <select onChange={(event) => update(priceList.clientId, 'pricingMode', event.target.value === 'cost_plus_percent' ? 'cost_plus_percent' : 'manual')} value={priceList.pricingMode}>
                <option value="manual">Manual</option>
                <option value="cost_plus_percent">Costo + margen</option>
              </select>
            </SetupField>
            <SetupField error={fieldErrors[`priceLists.${index}.marginPercent`]} label="Margen inicial %">
              <input max="500" min="-100" onChange={(event) => update(priceList.clientId, 'marginPercent', event.target.value)} type="number" value={priceList.marginPercent} />
            </SetupField>
          </div>
          <footer>
            <label>
              <input checked={priceList.active} disabled={priceList.isDefault} onChange={(event) => update(priceList.clientId, 'active', event.target.checked)} type="checkbox" />
              Activa
            </label>
            <label>
              <input checked={priceList.isDefault} name="default-price-list" onChange={() => onDefault(priceList.clientId)} type="radio" />
              Lista pública predeterminada
            </label>
          </footer>
        </article>
      ))}
      <button className="setup-add-list" disabled={draft.priceLists.length >= 10} onClick={onAdd} type="button">+ Agregar lista</button>
    </div>
  );
}

function PublicDataStep({ draft, update }: { draft: SetupDraft; update: DraftUpdate }) {
  return (
    <div className="setup-public-data">
      <div className="setup-form-grid">
        <SetupField label="Logo URL">
          <input onChange={(event) => update('logoUrl', event.target.value)} placeholder="https://…" type="url" value={draft.logoUrl} />
        </SetupField>
        <div className="setup-color-preview" style={{ background: `linear-gradient(135deg, ${draft.primaryColor}, ${draft.secondaryColor})` }}>
          <span>Datos públicos</span>
          <strong>{draft.name.slice(0, 1).toUpperCase() || 'R'}</strong>
        </div>
        <SetupField label="Color principal">
          <div className="setup-color-field"><input onChange={(event) => update('primaryColor', event.target.value)} type="color" value={safeColor(draft.primaryColor, '#14b8a6')} /><input onChange={(event) => update('primaryColor', event.target.value)} value={draft.primaryColor} /></div>
        </SetupField>
        <SetupField label="Color secundario">
          <div className="setup-color-field"><input onChange={(event) => update('secondaryColor', event.target.value)} type="color" value={safeColor(draft.secondaryColor, '#0f172a')} /><input onChange={(event) => update('secondaryColor', event.target.value)} value={draft.secondaryColor} /></div>
        </SetupField>
      </div>
      <aside className="setup-boundary-note">
        <strong>Esto no diseña la web.</strong>
        <p>El SDK entrega estos datos básicos. Cada implementación puede usarlos, transformarlos o ignorarlos.</p>
        <ul><li>Sin themes</li><li>Sin layouts</li><li>Sin cards</li><li>Sin plantillas</li></ul>
      </aside>
    </div>
  );
}

function ConfirmationStep({ draft }: { draft: SetupDraft }) {
  const defaultList = draft.priceLists.find((priceList) => priceList.isDefault);
  return (
    <div className="setup-confirmation">
      <SummaryBlock title="Tenant">
        <SummaryRow label="Nombre" value={draft.name || '—'} />
        <SummaryRow label="Slug" value={draft.slug || '—'} />
        <SummaryRow label="Estado" value={draft.status} />
        <SummaryRow label="Contacto" value={[draft.email, draft.whatsapp].filter(Boolean).join(' · ') || 'Sin contacto'} />
        <SummaryRow label="Moneda / locale" value={`${draft.currency} · ${draft.locale}`} />
      </SummaryBlock>
      <SummaryBlock title="Comercio">
        <SummaryRow label="Lista pública" value={defaultList?.name || 'No definida'} />
        <SummaryRow label="Pedido mínimo" value={draft.minimumOrderAmount || '0'} />
        <SummaryRow label="Compra mínima" value={draft.minimumPurchaseAmount || '0'} />
        <div className="setup-feature-summary">
          {SETUP_FEATURES.map((feature) => <span data-active={draft.features[feature.key]} key={feature.key}>{feature.label}</span>)}
        </div>
      </SummaryBlock>
      <SummaryBlock title={`Listas (${draft.priceLists.length})`}>
        {draft.priceLists.map((priceList) => (
          <SummaryRow key={priceList.clientId} label={priceList.code || 'sin-codigo'} value={`${priceList.name || 'Sin nombre'} · ${priceList.pricingMode}${priceList.isDefault ? ' · default' : ''}${priceList.active ? '' : ' · inactiva'}`} />
        ))}
      </SummaryBlock>
      <SummaryBlock title="Configuración pública">
        <SummaryRow label="Logo" value={draft.logoUrl || 'Sin logo'} />
        <SummaryRow label="Color principal" value={draft.primaryColor} />
        <SummaryRow label="Color secundario" value={draft.secondaryColor} />
      </SummaryBlock>
      <div className="setup-transaction-note"><strong>Una sola transacción</strong><p>Tenant, listas, lista default, “Sin marca” y cuatro eventos de auditoría se confirman juntos. Ante un error, no queda configuración parcial.</p></div>
    </div>
  );
}

function SetupCompleted({ result, onRestart }: { result: SetupCommandResult; onRestart: () => void }) {
  const setup = result.setup!;
  const snippet = `const commerce = createCommerceClient({\n  tenantSlug: "${setup.slug}"\n});`;
  return (
    <main className="setup-page setup-completed-page">
      <header className="setup-completed-hero">
        <p className="setup-eyebrow">Setup completado</p>
        <h1>{setup.name}</h1>
        <p>El motor comercial quedó creado de forma transaccional y preparado para la siguiente fase.</p>
      </header>
      <section className="setup-result-grid">
        <article className="setup-result-card setup-result-primary">
          <span>Tenant</span><strong>{setup.slug}</strong><dl><div><dt>ID interno</dt><dd>{setup.tenantId}</dd></div><div><dt>Estado</dt><dd>{setup.status}</dd></div><div><dt>Moneda</dt><dd>{setup.currency} · {setup.locale}</dd></div></dl>
        </article>
        <article className="setup-result-card"><span>Listas creadas</span>{setup.priceLists.map((priceList) => <div className="setup-created-list" key={priceList.id}><strong>{priceList.name}</strong><small>{priceList.code}{priceList.isDefault ? ' · default pública' : ''}</small></div>)}</article>
        <article className="setup-result-card"><span>Funcionalidades</span><div className="setup-feature-summary">{SETUP_FEATURES.map((feature) => <span data-active={setup.features[feature.key]} key={feature.key}>{feature.label}</span>)}</div></article>
      </section>
      <section className="setup-sdk-result"><div><p className="setup-eyebrow">Conexión SDK</p><h2>Snippet de integración</h2><p>{setup.status === 'active' ? 'El tenant ya puede resolverse desde el SDK.' : 'El tenant debe pasar a active antes de exponerse públicamente.'}</p></div><pre><code>{snippet}</code></pre></section>
      <section className="setup-next-steps"><p className="setup-eyebrow">Próximos pasos</p><ol><li><strong>Importar catálogo</strong><span>Cargar categorías, marcas, productos y precios.</span></li><li><strong>Configurar costos y precios</strong><span>Revisar pricing mode y márgenes.</span></li><li><strong>Desarrollar la web personalizada</strong><span>Runia Web define identidad y composición.</span></li><li><strong>Conectar mediante SDK</strong><span>Usar el slug generado en servidor.</span></li><li><strong>Ejecutar QA</strong><span>Validar datos, aislamiento y performance.</span></li><li><strong>Publicar</strong><span>Activar el tenant y desplegar la experiencia.</span></li></ol></section>
      <footer className="setup-result-actions"><button className="setup-button-secondary" onClick={onRestart} type="button">Configurar otro comercio</button><Link className="setup-button-primary" href="/runia">Ver todos los tenants</Link></footer>
    </main>
  );
}

function SetupField({ children, error, label, required = false }: { children: React.ReactNode; error?: string; label: string; required?: boolean }) {
  return <label className="setup-field"><span>{label}{required ? ' *' : ''}</span>{children}{error ? <small>{error}</small> : null}</label>;
}

function SummaryBlock({ children, title }: { children: React.ReactNode; title: string }) {
  return <article className="setup-summary-block"><h3>{title}</h3><div>{children}</div></article>;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="setup-summary-row"><span>{label}</span><strong>{value}</strong></div>;
}

function stepState(index: number, current: number) {
  if (index < current) return 'complete';
  if (index === current) return 'current';
  return 'pending';
}

function safeColor(value: string, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}
