import { NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminSessionValue,
} from '@/lib/adminAuth';

export async function POST(request: Request) {
  const formData = await request.formData();
  const password = String(formData.get('password') ?? '');
  const nextPath = sanitizeNextPath(String(formData.get('next') ?? '/admin'));
  const expectedPassword = process.env.ADMIN_PASSWORD;

  if (!expectedPassword) {
    return redirectToLogin(request, 'config', nextPath);
  }

  if (password !== expectedPassword) {
    return redirectToLogin(request, 'invalid', nextPath);
  }

  const sessionValue = await createAdminSessionValue(expectedPassword);

  if (!sessionValue) {
    return redirectToLogin(request, 'config', nextPath);
  }

  const response = NextResponse.redirect(new URL(nextPath, request.url));
  response.cookies.set(ADMIN_SESSION_COOKIE, sessionValue, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
    path: '/',
  });

  return response;
}

function redirectToLogin(request: Request, error: string, nextPath: string) {
  const loginUrl = new URL('/admin/login', request.url);
  loginUrl.searchParams.set('error', error);
  loginUrl.searchParams.set('next', nextPath);

  return NextResponse.redirect(loginUrl);
}

function sanitizeNextPath(value: string) {
  const isAdminPath = value.startsWith('/admin') && !value.startsWith('/admin/login');
  const isRuniaPath = value.startsWith('/runia');

  if (!isAdminPath && !isRuniaPath) {
    return '/admin';
  }

  return value;
}
