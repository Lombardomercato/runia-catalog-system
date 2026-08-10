import { createClient } from '@supabase/supabase-js';

const projectRef = requiredEnv('RUNIA_DEV_PROJECT_REF');
const supabaseUrl = requiredEnv('RUNIA_DEV_SUPABASE_URL').replace(/\/+$/, '');
const secretKey = requiredEnv('RUNIA_DEV_SUPABASE_SECRET_KEY');
const tenantSlug = requiredEnv('RUNIA_DEV_TENANT_SLUG');
const expectedUrl = `https://${projectRef}.supabase.co`;

if (!/^[a-z0-9]{8,40}$/.test(projectRef)) {
  throw new Error('RUNIA_DEV_PROJECT_REF tiene un formato inesperado.');
}
if (supabaseUrl !== expectedUrl) {
  throw new Error(`RUNIA_DEV_SUPABASE_URL no coincide exactamente con RUNIA_DEV_PROJECT_REF (${projectRef}).`);
}
if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(tenantSlug)) {
  throw new Error('RUNIA_DEV_TENANT_SLUG debe ser un slug explicito en minusculas.');
}

const supabase = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
});

const { error: adminError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
if (adminError) {
  throw new Error(`RUNIA_DEV_SECRET_KEY_NOT_PRIVILEGED: ${adminError.message}`);
}

const { data: tenants, error: tenantError } = await supabase
  .from('tenants')
  .select('id, slug, status')
  .eq('slug', tenantSlug)
  .limit(2);
if (tenantError) throw new Error(`RUNIA_DEV_TENANT_READ_FAILED: ${tenantError.message}`);
if (!tenants || tenants.length !== 1) {
  throw new Error(`RUNIA_DEV_TENANT_NOT_UNIQUE: se esperaba exactamente un tenant ${tenantSlug}.`);
}
if (tenants[0].status !== 'active') {
  throw new Error(`RUNIA_DEV_TENANT_NOT_ACTIVE: ${tenantSlug} esta ${String(tenants[0].status)}.`);
}

console.log(`API preflight: PASS project_ref=${projectRef} tenant=${tenantSlug} service_role=valid`);

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable de entorno ${name}.`);
  return value;
}
