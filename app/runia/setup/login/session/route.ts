import { NextResponse } from 'next/server';
import {
  RUNIA_INTERNAL_SESSION_COOKIE,
  RUNIA_INTERNAL_SESSION_MAX_AGE_SECONDS,
  createRuniaInternalSessionValue,
  hasRuniaInternalPassword,
  isValidRuniaInternalPassword,
} from '@/lib/runiaInternalAuth';

export async function POST(request: Request) {
  const formData = await request.formData();
  const password = String(formData.get('password') ?? '');
  const nextPath = sanitizeNextPath(String(formData.get('next') ?? '/runia/setup'));

  if (!hasRuniaInternalPassword()) return redirectToLogin(request, 'config', nextPath);
  if (!(await isValidRuniaInternalPassword(password))) {
    return redirectToLogin(request, 'invalid', nextPath);
  }

  const session = await createRuniaInternalSessionValue();
  if (!session) return redirectToLogin(request, 'config', nextPath);

  const response = NextResponse.redirect(new URL(nextPath, request.url));
  response.cookies.set(RUNIA_INTERNAL_SESSION_COOKIE, session, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: RUNIA_INTERNAL_SESSION_MAX_AGE_SECONDS,
    path: '/runia/setup',
  });
  return response;
}

function redirectToLogin(request: Request, error: string, nextPath: string) {
  const url = new URL('/runia/setup/login', request.url);
  url.searchParams.set('error', error);
  url.searchParams.set('next', nextPath);
  return NextResponse.redirect(url);
}

function sanitizeNextPath(value: string) {
  return value.startsWith('/runia/setup') && !value.startsWith('/runia/setup/login')
    ? value
    : '/runia/setup';
}
