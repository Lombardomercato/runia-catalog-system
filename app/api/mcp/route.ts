import { createMcpHandler } from '@modelcontextprotocol/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { createMcpBearerGate, validateMcpRequest } from '@/modules/mcp/auth';
import { RuniaSalesCatalog } from '@/modules/mcp/runiaSalesCatalog';
import { createRuniaSalesMcpServer } from '@/modules/mcp/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

let mcpRuntimeInstance: {
  handler: ReturnType<typeof createMcpHandler>;
  authenticate: ReturnType<typeof createMcpBearerGate>;
} | null = null;

async function serve(request: Request) {
  const rejected = validateMcpRequest(request, allowedOrigins(), allowedHosts(request));
  if (rejected) return rejected;
  let mcpRuntime: NonNullable<typeof mcpRuntimeInstance>;
  try {
    mcpRuntime = getMcpRuntime();
  } catch (error) {
    console.error('[runia-mcp] unavailable', {
      reason: error instanceof Error ? error.message : 'UNKNOWN_CONFIGURATION_ERROR',
    });
    return new Response('Service Unavailable', { status: 503 });
  }
  const auth = await mcpRuntime.authenticate(request);
  if (auth instanceof Response) return auth;
  return mcpRuntime.handler.fetch(request, { authInfo: auth });
}

export const GET = serve;
export const POST = serve;
export const DELETE = serve;

function getMcpRuntime() {
  if (mcpRuntimeInstance) return mcpRuntimeInstance;

  const tenantSlug = process.env.RUNIA_MCP_TENANT_SLUG?.trim() || 'lombardo';
  const supabaseUrl = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/$/, '');
  const lombardoPublicUrl = process.env.LOMBARDO_PUBLIC_URL?.trim() || 'https://www.lombardomercato.com';
  const accessToken = process.env.RUNIA_MCP_ACCESS_TOKEN?.trim();
  if (!supabaseUrl) throw new Error('RUNIA_MCP_SUPABASE_URL_MISSING');
  if (!accessToken) throw new Error('RUNIA_MCP_ACCESS_TOKEN_MISSING');

  const catalog = new RuniaSalesCatalog(supabaseServer, tenantSlug, supabaseUrl, lombardoPublicUrl);
  mcpRuntimeInstance = {
    handler: createMcpHandler(
      () => createRuniaSalesMcpServer(catalog),
      { legacy: 'stateless', responseMode: 'json' },
    ),
    authenticate: createMcpBearerGate(accessToken),
  };
  return mcpRuntimeInstance;
}

function allowedOrigins() {
  return (process.env.RUNIA_MCP_ALLOWED_ORIGINS || 'https://www.lombardomercato.com')
    .split(',').map((value) => value.trim()).filter(Boolean);
}

function allowedHosts(request: Request) {
  const configured = (process.env.RUNIA_MCP_ALLOWED_HOSTS || '')
    .split(',').map((value) => value.trim().toLocaleLowerCase('en-US')).filter(Boolean);
  const vercelHost = process.env.VERCEL_URL?.trim().toLocaleLowerCase('en-US');
  const requestHost = process.env.NODE_ENV === 'development'
    ? request.headers.get('host')?.split(':')[0]?.toLocaleLowerCase('en-US')
    : null;
  return [...new Set([
    ...configured,
    'runia-catalog-system-94x9.vercel.app',
    vercelHost,
    requestHost,
  ].filter((value): value is string => Boolean(value)))];
}
