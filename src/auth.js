const JWT_TTL_SECONDS = 60 * 15;

function toBase64Url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(input) {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4 || 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function encodeJson(obj) {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(obj)));
}

function decodeJson(base64url) {
  return JSON.parse(new TextDecoder().decode(fromBase64Url(base64url)));
}

async function hmacSign(input, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input));
  return toBase64Url(new Uint8Array(sig));
}

export async function signJWT(payload, secret, ttlSeconds = JWT_TTL_SECONDS) {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJson({ alg: 'HS256', typ: 'JWT' });
  const body = encodeJson({ ...payload, iat: now, exp: now + ttlSeconds });
  const sig = await hmacSign(`${header}.${body}`, secret);
  return `${header}.${body}.${sig}`;
}

export async function verifyJWT(token, secret) {
  const parts = token?.split('.') || [];
  if (parts.length !== 3) throw new Error('Invalid token');

  const [header, body, signature] = parts;
  const expected = await hmacSign(`${header}.${body}`, secret);
  if (signature !== expected) throw new Error('Invalid signature');

  const payload = decodeJson(body);
  if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }
  return payload;
}

function constantTimeEquals(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function bytesToHex(bytes) {
  return [...bytes].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  return new Uint8Array(hex.match(/.{2}/g).map((h) => parseInt(h, 16)));
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 },
    keyMaterial,
    256
  );

  return `pbkdf2:${bytesToHex(salt)}:${bytesToHex(new Uint8Array(derived))}`;
}

export async function verifyPassword(password, stored) {
  const [algo, saltHex, expectedHex] = stored.split(':');
  if (algo !== 'pbkdf2' || !saltHex || !expectedHex) return false;

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations: 100_000 },
    keyMaterial,
    256
  );

  const actualHex = bytesToHex(new Uint8Array(derived));
  return constantTimeEquals(actualHex, expectedHex);
}
