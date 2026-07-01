type AdminLoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const errorMessages: Record<string, string> = {
  invalid: 'La contraseña ingresada no es correcta.',
  config: 'Falta configurar ADMIN_PASSWORD en el entorno del servidor.',
};

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const error = readParam(resolvedSearchParams, 'error');
  const next = readParam(resolvedSearchParams, 'next') || '/admin';

  return (
    <main className="admin-login-page">
      <section className="admin-login-panel">
        <div className="admin-login-brand">
          <span className="admin-brand-mark">R</span>
          <div>
            <strong>Runia</strong>
            <span>Backoffice</span>
          </div>
        </div>

        <div>
          <p className="admin-kicker">Acceso administrador</p>
          <h1 className="admin-login-title">Ingresar</h1>
          <p className="admin-login-subtitle">Panel interno de Runia Catalog System.</p>
        </div>

        {error ? (
          <div className="admin-login-error">
            {errorMessages[error] ?? 'No se pudo iniciar sesion.'}
          </div>
        ) : null}

        <form action="/admin/login/session" className="admin-login-form" method="post">
          <input name="next" type="hidden" value={next} />
          <label>
            <span>Contraseña</span>
            <input
              autoComplete="current-password"
              autoFocus
              name="password"
              required
              type="password"
            />
          </label>

          <button type="submit">Entrar</button>
        </form>
      </section>
    </main>
  );
}

function readParam(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];

  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}
