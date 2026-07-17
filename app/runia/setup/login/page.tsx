import { hasRuniaInternalPassword } from '@/lib/runiaInternalAuth';

export const dynamic = 'force-dynamic';

const ERROR_MESSAGES: Record<string, string> = {
  invalid: 'La contraseña interna no es válida.',
  config: 'Falta configurar RUNIA_INTERNAL_PASSWORD en el servidor.',
};

export default async function RuniaSetupLoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const errorCode = singleValue(params.error);
  const nextPath = sanitizeNextPath(singleValue(params.next));
  const configMissing = !hasRuniaInternalPassword();
  const error = configMissing ? ERROR_MESSAGES.config : ERROR_MESSAGES[errorCode];

  return (
    <main className="setup-login-page">
      <section className="setup-login-panel">
        <p className="setup-eyebrow">Acceso restringido</p>
        <h1>Runia Setup Engine</h1>
        <p>
          Herramienta de provisión técnica para el equipo interno de Runia. Esta sesión es
          independiente del workspace de clientes.
        </p>
        {error ? <div className="setup-login-error">{error}</div> : null}
        <form action="/runia/setup/login/session" method="post">
          <input name="next" type="hidden" value={nextPath} />
          <label>
            <span>Contraseña interna</span>
            <input
              autoComplete="current-password"
              disabled={configMissing}
              name="password"
              required
              type="password"
            />
          </label>
          <button disabled={configMissing} type="submit">Ingresar a Setup</button>
        </form>
        <small>La contraseña nunca se almacena en el navegador ni en audit_logs.</small>
      </section>
    </main>
  );
}

function singleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function sanitizeNextPath(value: string) {
  return value.startsWith('/runia/setup') && !value.startsWith('/runia/setup/login')
    ? value
    : '/runia/setup';
}
