export const RUNIA_INTERNAL_SESSION_COOKIE = 'runia_internal_setup_session';
export const RUNIA_INTERNAL_SESSION_MAX_AGE_SECONDS = 60 * 60 * 4;

const SESSION_PAYLOAD = 'runia-setup-engine-internal-session-v0';
const PASSWORD_CHECK_PAYLOAD = 'runia-setup-engine-password-check-v0';

export function hasRuniaInternalPassword() {
  return Boolean(process.env.RUNIA_INTERNAL_PASSWORD);
}

export async function createRuniaInternalSessionValue(
  password = process.env.RUNIA_INTERNAL_PASSWORD,
) {
  if (!password) return null;
  const signature = await hmacSha256Hex(password, SESSION_PAYLOAD);
  return `v0.${signature}`;
}

export async function isValidRuniaInternalSession(value: string | null | undefined) {
  if (!value) return false;
  const expected = await createRuniaInternalSessionValue();
  return expected ? constantTimeEqual(value, expected) : false;
}

export async function isValidRuniaInternalPassword(candidate: string) {
  const expectedPassword = process.env.RUNIA_INTERNAL_PASSWORD;
  if (!expectedPassword || !candidate) return false;
  const [candidateSignature, expectedSignature] = await Promise.all([
    hmacSha256Hex(candidate, PASSWORD_CHECK_PAYLOAD),
    hmacSha256Hex(expectedPassword, PASSWORD_CHECK_PAYLOAD),
  ]);
  return constantTimeEqual(candidateSignature, expectedSignature);
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
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}
