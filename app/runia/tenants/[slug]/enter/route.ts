import { NextResponse } from 'next/server';
import { SELECTED_TENANT_COOKIE } from '@/lib/currentTenant';
import { tenantSlugExists } from '@/modules/tenants/queries';

type EnterTenantRouteProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function GET(request: Request, { params }: EnterTenantRouteProps) {
  const { slug } = await params;
  const tenant = await tenantSlugExists(slug);

  if (tenant.error || !tenant.exists) {
    const runiaUrl = new URL('/runia', request.url);
    runiaUrl.searchParams.set('error', 'tenant-not-found');
    return NextResponse.redirect(runiaUrl);
  }

  const response = NextResponse.redirect(new URL('/admin', request.url));
  response.cookies.set(SELECTED_TENANT_COOKIE, slug, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 8,
    path: '/',
  });

  return response;
}
