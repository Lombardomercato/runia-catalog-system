export const ADMIN_SESSION_COOKIE = 'runia_admin_session';
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

const SESSION_PAYLOAD = 'runia-catalog-system-admin-session-v1';

export function hasAdminPassword() {
  return Boolean(process.env.ADMIN_PASSWORD);
}

export async function createAdminSessionValue(password = process.env.ADMIN_PASSWORD) {
  if (!password) {
    return null;
  }

  const signature = await hmacSha256Hex(password, SESSION_PAYLOAD);

  return `v1.${signature}`;
}

export async function isValidAdminSession(value: string | undefined | null) {
  if (!value) {
    return false;
  }

  const expected = await createAdminSessionValue();

  if (!expected) {
    return false;
  }

  return constantTimeEqual(value, expected);
}

async function hmacSha256Hex(secret: string, payload: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));

  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;

  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return result === 0;
}
