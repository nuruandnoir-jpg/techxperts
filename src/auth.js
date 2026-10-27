// Password hashing and login tokens using Web Crypto, which works on Cloudflare
// Workers and in Node.

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
// Workers caps PBKDF2 at 100,000 iterations. The count is stored with each hash,
// so it can be changed later without breaking existing passwords.
export const DEFAULT_ITERATIONS = 100_000;

const enc = new TextEncoder();
const toB64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromB64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
const b64url = (bytes) => toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (str) => fromB64(str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4));

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

/** Returns "pbkdf2$<iterations>$<salt>$<hash>". */
export async function hashPassword(password, iterations = DEFAULT_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, iterations);
  return `pbkdf2$${iterations}$${toB64(salt)}$${toB64(hash)}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, iterations, salt, hash] = String(stored).split('$');
  if (scheme !== 'pbkdf2' || !hash) return false;
  const actual = new Uint8Array(await pbkdf2(password, fromB64(salt), Number(iterations)));
  const expected = fromB64(hash);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

const hmacKey = (secret) =>
  crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

/** Issues a compact HMAC-signed token: base64url(payload).signature */
export async function createToken(user, secret) {
  const payload = { sub: user.id, role: user.role, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function verifyToken(token, secret) {
  if (typeof token !== 'string') return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  try {
    // crypto.subtle.verify compares in constant time.
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64url(signature), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body)));
    return payload.exp >= Math.floor(Date.now() / 1000) ? payload : null;
  } catch {
    return null;
  }
}
