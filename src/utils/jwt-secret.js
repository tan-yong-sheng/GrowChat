let devJwtSecret = null;

function isLocalHost(hostname) {
  if (!hostname) return false;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
}

function getRequestHostname(req) {
  try {
    return new URL(req.url).hostname;
  } catch {
    return '';
  }
}

function generateSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function getJwtSecret(env, req) {
  if (env?.JWT_SECRET) return env.JWT_SECRET;
  const hostname = getRequestHostname(req);
  if (!isLocalHost(hostname)) return null;
  if (!devJwtSecret) {
    devJwtSecret = generateSecret();
    console.warn('JWT_SECRET not set. Using ephemeral dev-only secret for localhost.');
  }
  return devJwtSecret;
}
