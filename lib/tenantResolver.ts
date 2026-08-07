import 'server-only';

export type TenantResolutionSurface = 'public' | 'internal';

type ResolveTenantSlugInput = {
  hostname: string | null;
  surface: TenantResolutionSurface;
  selectedTenantSlug?: string | null;
  fallbackTenantSlug?: string | null;
  nodeEnv?: string;
};

export async function resolveTenantSlug(input: ResolveTenantSlugInput) {
  const hostname = normalizeHostname(input.hostname);
  const fallback = normalizeSlug(input.fallbackTenantSlug);
  const selected = normalizeSlug(input.selectedTenantSlug);
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  const allowCookie = input.surface === 'internal' || input.nodeEnv !== 'production' || isLocal;

  if (allowCookie && selected) return selected;

  if (hostname && !isLocal) {
    const domain = await findActiveTenantDomain(hostname);
    if (domain) return domain;
  }

  if (fallback) return fallback;

  throw new Error(
    input.surface === 'public'
      ? `No se pudo resolver un tenant para el hostname "${hostname ?? 'desconocido'}".`
      : 'Falta configurar un tenant interno.',
  );
}

export function normalizeHostname(value: string | null | undefined) {
  const first = value?.split(',')[0]?.trim().toLowerCase();
  if (!first) return null;
  if (first.startsWith('[')) {
    const closingBracket = first.indexOf(']');
    return closingBracket >= 0 ? first.slice(0, closingBracket + 1) : first;
  }
  return first.split(':')[0] || null;
}

async function findActiveTenantDomain(hostname: string) {
  const { supabaseServer } = await import('@/lib/supabaseServer');
  const { data, error } = await supabaseServer
    .from('tenant_domains')
    .select('tenants!inner(slug, status)')
    .eq('hostname', hostname)
    .eq('is_active', true)
    .eq('tenants.status', 'active')
    .maybeSingle();

  if (error) {
    // Compatibility path until migration 011 is explicitly applied. Production
    // deployments can continue using the per-deployment fallback tenant slug.
    if (isMissingTenantDomainsTable(error.message)) return null;
    throw new Error(`No se pudo resolver el dominio del tenant: ${error.message}`);
  }

  const tenant = Array.isArray(data?.tenants) ? data.tenants[0] : data?.tenants;
  return tenant?.slug ? String(tenant.slug) : null;
}

function normalizeSlug(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || null;
}

function isMissingTenantDomainsTable(message: string) {
  return /tenant_domains|schema cache/i.test(message) &&
    /does not exist|could not find|schema cache/i.test(message);
}
