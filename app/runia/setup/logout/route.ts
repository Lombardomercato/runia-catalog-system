import { NextResponse } from 'next/server';
import { RUNIA_INTERNAL_SESSION_COOKIE } from '@/lib/runiaInternalAuth';

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL('/runia/setup/login', request.url));
  response.cookies.set(RUNIA_INTERNAL_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    expires: new Date(0),
    path: '/runia/setup',
  });
  return response;
}
