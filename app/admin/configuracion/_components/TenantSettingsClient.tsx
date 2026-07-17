'use client';

import { FormEvent, useEffect, useState, useTransition } from 'react';
import type { ReactNode } from 'react';
import {
  updateBranding,
  updateCommercialSettings,
  updateFeatureFlags,
  updateTenant,
} from '@/modules/tenant/commands';
import type {
  TenantCommandResult,
  TenantFeatureFlags,
  TenantSettings,
} from '@/modules/tenant/types';

type TenantSettingsClientProps = {
  tenantSlug: string;
  tenant: TenantSettings;
};

type CompanyDraft = {
  commercialName: string;
  legalName: string;
  email: string;
  whatsapp: string;
  address: string;
  website: string;
};

type BrandingDraft = {
  primaryColor: string;
  secondaryColor: string;
};

type CommercialDraft = {
  currency: string;
  minimumOrderAmount: string;
  minimumPurchaseAmount: string;
  defaultPriceListId: string;
};

type ResultKey = 'company' | 'branding' | 'commercial' | 'features';

const featureLabels: Array<{
  key: keyof TenantFeatureFlags;
  label: string;
  description: string;
}> = [
  {
    key: 'showPrices',
    label: 'Mostrar precios',
    description: 'Expone al SDK la preferencia publica de presentar importes.',
  },
  {
    key: 'publicCatalog',
    label: 'Catalogo publico',
    description: 'Permite mostrar productos activos sin login.',
  },
  {
    key: 'orders',
    label: 'Pedidos',
    description: 'Habilita flujo de pedidos cuando el checkout este disponible.',
  },
  {
    key: 'wholesaleLogin',
    label: 'Login mayoristas',
    description: 'Prepara acceso para clientes con lista mayorista.',
  },
  {
    key: 'multiplePriceLists',
    label: 'Multiples listas',
    description: 'Permite operar Minorista, Mayorista y futuras listas.',
  },
  {
    key: 'importer',
    label: 'Importador',
    description: 'Habilita herramientas de carga desde Excel o Google Sheets.',
  },
  {
    key: 'images',
    label: 'Imagenes',
    description: 'Prepara soporte de fotos de producto.',
  },
  {
    key: 'stock',
    label: 'Stock',
    description: 'Reserva funcionalidad para inventario futuro.',
  },
  {
    key: 'invoicing',
    label: 'Facturacion',
    description: 'Reserva funcionalidad para facturacion futura.',
  },
];

export function TenantSettingsClient({ tenantSlug, tenant }: TenantSettingsClientProps) {
  const [company, setCompany] = useState<CompanyDraft>(() => toCompanyDraft(tenant));
  const [branding, setBranding] = useState<BrandingDraft>(() => toBrandingDraft(tenant));
  const [commercial, setCommercial] = useState<CommercialDraft>(() => toCommercialDraft(tenant));
  const [features, setFeatures] = useState<TenantFeatureFlags>(tenant.features);
  const [results, setResults] = useState<Partial<Record<ResultKey, TenantCommandResult>>>({});
  const [savingSection, setSavingSection] = useState<ResultKey | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setCompany(toCompanyDraft(tenant));
    setBranding(toBrandingDraft(tenant));
    setCommercial(toCommercialDraft(tenant));
    setFeatures(tenant.features);
  }, [tenant]);

  function saveCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runCommand('company', () =>
      updateTenant({
        tenantSlug,
        commercialName: company.commercialName,
        legalName: company.legalName,
        email: company.email,
        whatsapp: company.whatsapp,
        address: company.address,
        website: company.website,
      }),
    );
  }

  function saveBranding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runCommand('branding', () =>
      updateBranding({
        tenantSlug,
        primaryColor: branding.primaryColor,
        secondaryColor: branding.secondaryColor,
      }),
    );
  }

  function saveCommercial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runCommand('commercial', () =>
      updateCommercialSettings({
        tenantSlug,
        currency: commercial.currency,
        minimumOrderAmount: commercial.minimumOrderAmount,
        minimumPurchaseAmount: commercial.minimumPurchaseAmount,
        defaultPriceListId: commercial.defaultPriceListId || null,
      }),
    );
  }

  function saveFeatures(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runCommand('features', () =>
      updateFeatureFlags({
        tenantSlug,
        features,
      }),
    );
  }

  function runCommand(key: ResultKey, command: () => Promise<TenantCommandResult>) {
    setSavingSection(key);

    startTransition(async () => {
      const result = await command();
      setResults((current) => ({ ...current, [key]: result }));
      setSavingSection(null);
    });
  }

  return (
    <main className="tenant-settings-page">
      <header className="admin-header tenant-settings-header">
        <p className="admin-kicker">SaaS</p>
        <div className="admin-header-row">
          <div>
            <h1 className="admin-title">Configuracion</h1>
            <p className="admin-subtitle">Ajustes administrables para operar este tenant.</p>
          </div>
          <span className="admin-status">{tenant.slug}</span>
        </div>
      </header>

      <section className="tenant-settings-grid">
        <form className="tenant-settings-panel" onSubmit={saveCompany}>
          <PanelHeader title="Empresa" />
          <SettingsField
            error={results.company?.fieldErrors.commercialName}
            label="Nombre comercial"
          >
            <input
              aria-invalid={Boolean(results.company?.fieldErrors.commercialName)}
              onChange={(event) =>
                setCompany((current) => ({ ...current, commercialName: event.target.value }))
              }
              required
              value={company.commercialName}
            />
          </SettingsField>

          <SettingsField label="Razon social">
            <input
              onChange={(event) =>
                setCompany((current) => ({ ...current, legalName: event.target.value }))
              }
              value={company.legalName}
            />
          </SettingsField>

          <div className="tenant-settings-field-grid">
            <SettingsField error={results.company?.fieldErrors.email} label="Email">
              <input
                aria-invalid={Boolean(results.company?.fieldErrors.email)}
                onChange={(event) =>
                  setCompany((current) => ({ ...current, email: event.target.value }))
                }
                type="email"
                value={company.email}
              />
            </SettingsField>

            <SettingsField error={results.company?.fieldErrors.whatsapp} label="WhatsApp">
              <input
                aria-invalid={Boolean(results.company?.fieldErrors.whatsapp)}
                onChange={(event) =>
                  setCompany((current) => ({ ...current, whatsapp: event.target.value }))
                }
                value={company.whatsapp}
              />
            </SettingsField>
          </div>

          <SettingsField label="Direccion">
            <input
              onChange={(event) =>
                setCompany((current) => ({ ...current, address: event.target.value }))
              }
              value={company.address}
            />
          </SettingsField>

          <SettingsField error={results.company?.fieldErrors.website} label="Sitio web">
            <input
              aria-invalid={Boolean(results.company?.fieldErrors.website)}
              onChange={(event) =>
                setCompany((current) => ({ ...current, website: event.target.value }))
              }
              value={company.website}
            />
          </SettingsField>

          <SectionFooter result={results.company} saving={isSaving('company')} />
        </form>

        <form className="tenant-settings-panel" onSubmit={saveBranding}>
          <PanelHeader title="Branding" />
          <div className="tenant-logo-placeholder">
            <span>Logo</span>
            <strong>Proximamente</strong>
          </div>

          <div className="tenant-settings-field-grid">
            <SettingsField error={results.branding?.fieldErrors.primaryColor} label="Color principal">
              <input
                aria-invalid={Boolean(results.branding?.fieldErrors.primaryColor)}
                onChange={(event) =>
                  setBranding((current) => ({ ...current, primaryColor: event.target.value }))
                }
                value={branding.primaryColor}
              />
            </SettingsField>

            <SettingsField
              error={results.branding?.fieldErrors.secondaryColor}
              label="Color secundario"
            >
              <input
                aria-invalid={Boolean(results.branding?.fieldErrors.secondaryColor)}
                onChange={(event) =>
                  setBranding((current) => ({ ...current, secondaryColor: event.target.value }))
                }
                value={branding.secondaryColor}
              />
            </SettingsField>
          </div>

          <div className="tenant-color-preview">
            <span style={{ background: branding.primaryColor }} />
            <span style={{ background: branding.secondaryColor }} />
          </div>

          <SectionFooter result={results.branding} saving={isSaving('branding')} />
        </form>

        <form className="tenant-settings-panel" onSubmit={saveCommercial}>
          <PanelHeader title="Configuracion comercial" />
          <div className="tenant-settings-field-grid">
            <SettingsField error={results.commercial?.fieldErrors.currency} label="Moneda">
              <input
                aria-invalid={Boolean(results.commercial?.fieldErrors.currency)}
                maxLength={3}
                onChange={(event) =>
                  setCommercial((current) => ({ ...current, currency: event.target.value }))
                }
                value={commercial.currency}
              />
            </SettingsField>

            <SettingsField
              error={results.commercial?.fieldErrors.defaultPriceListId}
              label="Lista por defecto"
            >
              <select
                aria-invalid={Boolean(results.commercial?.fieldErrors.defaultPriceListId)}
                onChange={(event) =>
                  setCommercial((current) => ({
                    ...current,
                    defaultPriceListId: event.target.value,
                  }))
                }
                value={commercial.defaultPriceListId}
              >
                <option value="">Sin definir</option>
                {tenant.priceLists.map((priceList) => (
                  <option key={priceList.id} value={priceList.id}>
                    {priceList.name}
                  </option>
                ))}
              </select>
            </SettingsField>
          </div>

          <div className="tenant-settings-field-grid">
            <SettingsField
              error={results.commercial?.fieldErrors.minimumOrderAmount}
              label="Pedido minimo"
            >
              <input
                aria-invalid={Boolean(results.commercial?.fieldErrors.minimumOrderAmount)}
                min="0"
                onChange={(event) =>
                  setCommercial((current) => ({
                    ...current,
                    minimumOrderAmount: event.target.value,
                  }))
                }
                step="0.01"
                type="number"
                value={commercial.minimumOrderAmount}
              />
            </SettingsField>

            <SettingsField
              error={results.commercial?.fieldErrors.minimumPurchaseAmount}
              label="Compra minima"
            >
              <input
                aria-invalid={Boolean(results.commercial?.fieldErrors.minimumPurchaseAmount)}
                min="0"
                onChange={(event) =>
                  setCommercial((current) => ({
                    ...current,
                    minimumPurchaseAmount: event.target.value,
                  }))
                }
                step="0.01"
                type="number"
                value={commercial.minimumPurchaseAmount}
              />
            </SettingsField>
          </div>

          <SectionFooter result={results.commercial} saving={isSaving('commercial')} />
        </form>

        <form className="tenant-settings-panel" onSubmit={saveFeatures}>
          <PanelHeader title="Funcionalidades" />
          <div className="tenant-feature-grid">
            {featureLabels.map((feature) => (
              <label className="tenant-feature-toggle" key={feature.key}>
                <input
                  checked={features[feature.key]}
                  onChange={(event) =>
                    setFeatures((current) => ({
                      ...current,
                      [feature.key]: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                <span>
                  <strong>{feature.label}</strong>
                  <small>{feature.description}</small>
                </span>
              </label>
            ))}
          </div>

          <SectionFooter result={results.features} saving={isSaving('features')} />
        </form>
      </section>
    </main>
  );

  function isSaving(key: ResultKey) {
    return isPending && savingSection === key;
  }
}

function PanelHeader({ title }: { title: string }) {
  return (
    <div className="tenant-settings-panel-header">
      <span>{title}</span>
    </div>
  );
}

function SettingsField({
  children,
  error,
  label,
}: {
  children: ReactNode;
  error?: string;
  label: string;
}) {
  return (
    <label className="tenant-settings-field">
      <span>{label}</span>
      {children}
      {error ? <small>{error}</small> : null}
    </label>
  );
}

function SectionFooter({
  result,
  saving,
}: {
  result: TenantCommandResult | undefined;
  saving: boolean;
}) {
  return (
    <footer className="tenant-settings-actions">
      {result?.error ? <span className="tenant-settings-feedback error">{result.error}</span> : null}
      {result?.ok ? <span className="tenant-settings-feedback success">{result.message}</span> : null}
      <button className="product-edit-primary-button" disabled={saving} type="submit">
        {saving ? 'Guardando' : 'Guardar cambios'}
      </button>
    </footer>
  );
}

function toCompanyDraft(tenant: TenantSettings): CompanyDraft {
  return {
    commercialName: tenant.company.commercialName,
    legalName: tenant.company.legalName ?? '',
    email: tenant.company.email ?? '',
    whatsapp: tenant.company.whatsapp ?? '',
    address: tenant.company.address ?? '',
    website: tenant.company.website ?? '',
  };
}

function toBrandingDraft(tenant: TenantSettings): BrandingDraft {
  return {
    primaryColor: tenant.branding.primaryColor,
    secondaryColor: tenant.branding.secondaryColor,
  };
}

function toCommercialDraft(tenant: TenantSettings): CommercialDraft {
  return {
    currency: tenant.commercial.currency,
    minimumOrderAmount: String(tenant.commercial.minimumOrderAmount),
    minimumPurchaseAmount: String(tenant.commercial.minimumPurchaseAmount),
    defaultPriceListId: tenant.commercial.defaultPriceListId ?? '',
  };
}
