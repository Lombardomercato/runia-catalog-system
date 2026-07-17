import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, isValidAdminSession } from '@/lib/adminAuth';
import {
  RUNIA_INTERNAL_SESSION_COOKIE,
  isValidRuniaInternalSession,
} from '@/lib/runiaInternalAuth';

const PUBLIC_ADMIN_PATHS = new Set(['/admin/login', '/admin/login/session']);
const PUBLIC_SETUP_PATHS = new Set([
  '/runia/setup/login',
  '/runia/setup/login/session',
]);

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith('/runia/setup')) {
    if (PUBLIC_SETUP_PATHS.has(pathname)) {
      return NextResponse.next();
    }

    const internalCookie = request.cookies.get(RUNIA_INTERNAL_SESSION_COOKIE)?.value;
    if (await isValidRuniaInternalSession(internalCookie)) {
      return NextResponse.next();
    }

    const setupLoginUrl = request.nextUrl.clone();
    setupLoginUrl.pathname = '/runia/setup/login';
    setupLoginUrl.search = '';
    setupLoginUrl.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(setupLoginUrl);
  }

  if (PUBLIC_ADMIN_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const cookieValue = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const isAuthenticated = await isValidAdminSession(cookieValue);

  if (isAuthenticated) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/admin/login';
  loginUrl.search = '';
  loginUrl.searchParams.set('next', `${pathname}${search}`);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/admin/:path*', '/runia/:path*'],
};
