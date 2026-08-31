import 'server-only';

import { timingSafeEqual } from 'node:crypto';
import {
  OAuthError,
  OAuthErrorCode,
  requireBearerAuth,
  type AuthInfo,
} from '@modelcontextprotocol/server';

const REQUIRED_SCOPES = ['catalog:read', 'pricing:read', 'guides:read'];

export function createMcpBearerGate(expectedToken: string) {
  if (expectedToken.length < 32) throw new Error('RUNIA_MCP_ACCESS_TOKEN_INVALID');
  return requireBearerAuth({
    requiredScopes: REQUIRED_SCOPES,
    verifier: {
      async verifyAccessToken(token): Promise<AuthInfo> {
        if (!constantTimeEqual(token, expectedToken)) {
          throw new OAuthError(OAuthErrorCode.InvalidToken, 'Invalid access token');
        }
        return {
          token,
          clientId: 'lombardo-production',
          scopes: REQUIRED_SCOPES,
          expiresAt: Math.floor(Date.now() / 1000) + 3_600,
        };
      },
    },
  });
}

export function validateMcpRequest(request: Request, allowedOrigins: string[], allowedHosts: string[]) {
  const host = request.headers.get('host')?.split(':')[0]?.toLocaleLowerCase('en-US');
  if (!host || !allowedHosts.includes(host)) {
    return new Response('Forbidden', { status: 403 });
  }
  const origin = request.headers.get('origin');
  if (origin && !allowedOrigins.includes(origin)) {
    return new Response('Forbidden', { status: 403 });
  }
  if (request.method === 'POST' && !request.headers.get('content-type')?.toLocaleLowerCase('en-US').startsWith('application/json')) {
    return new Response('Unsupported Media Type', { status: 415 });
  }
  return null;
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
