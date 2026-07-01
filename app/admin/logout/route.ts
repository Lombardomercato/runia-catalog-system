import { NextResponse } from 'next/server';
import { SELECTED_TENANT_COOKIE } from '@/lib/currentTenant';
import { ADMIN_SESSION_COOKIE } from '@/lib/adminAuth';

export async function POST(request: Request) {
  return logout(request);
}

export async function GET(request: Request) {
  return logout(request);
}

function logout(request: Request) {
  const loginUrl = new URL('/admin/login', request.url);
  const response = NextResponse.redirect(loginUrl);

  response.cookies.set(ADMIN_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/',
  });

  response.cookies.set(ADMIN_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/admin',
  });

  response.cookies.set(SELECTED_TENANT_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/',
  });

  return response;
}
