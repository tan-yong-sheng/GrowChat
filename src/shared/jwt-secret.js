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
  // FIX: Require JWT_SECRET for production
  if (env?.JWT_SECRET) {
    const secret = String(env.JWT_SECRET).trim();
    if (!secret || secret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 bytes');
    }
    return secret;
  }

  // Handle missing request object (test environments)
  if (!req) {
    if (!devJwtSecret) {
      devJwtSecret = generateSecret();
      console.warn('JWT_SECRET not set. Using ephemeral dev-only secret.');
    }
    return devJwtSecret;
  }

  const hostname = getRequestHostname(req);

  // FIX: Reject production hostnames without JWT_SECRET
  if (!isLocalHost(hostname)) {
    throw new Error(
      'JWT_SECRET environment variable is required for non-localhost deployments. Set it in your Cloudflare Workers secrets.'
    );
  }

  // Dev-only: generate ephemeral secret
  if (!devJwtSecret) {
    devJwtSecret = generateSecret();
    console.warn('JWT_SECRET not set. Using ephemeral dev-only secret for localhost.');
  }
  return devJwtSecret;
}
