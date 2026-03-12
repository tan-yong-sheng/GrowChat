function splitEnvList(value) {
  if (!value) return [];
  return String(value)
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeUrl(url) {
  if (!url) return '';
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function labelFromUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return url || 'OpenAI';
  }
}

export function buildEnvOpenAIConnections(env) {
  const baseUrlsRaw = env.OPENAI_API_BASE_URLS || env.OPENAI_BASE_URL || '';
  const keysRaw = env.OPENAI_API_KEYS || env.OPENAI_API_KEY || '';

  const baseUrls = splitEnvList(baseUrlsRaw);
  const keys = splitEnvList(keysRaw);

  if (baseUrls.length === 0 && keys.length === 0) {
    return [];
  }

  if (baseUrls.length === 0 && keys.length > 0) {
    baseUrls.push('https://api.openai.com/v1');
  }

  if (baseUrls.length === 1 && keys.length > 1) {
    while (baseUrls.length < keys.length) {
      baseUrls.push(baseUrls[0]);
    }
  }

  if (keys.length === 1 && baseUrls.length > 1) {
    while (keys.length < baseUrls.length) {
      keys.push(keys[0]);
    }
  }

  const max = Math.max(baseUrls.length, keys.length, 1);
  const connections = [];

  for (let i = 0; i < max; i += 1) {
    const url = normalizeUrl(baseUrls[i] || baseUrls[0] || 'https://api.openai.com/v1');
    const key = keys[i] || keys[0] || '';
    connections.push({
      id: `env-${i}`,
      name: `OpenAI (${labelFromUrl(url)})`,
      url,
      keyMasked: key ? `••••${key.slice(-4)}` : '',
      hasKey: Boolean(key),
      headers: '',
      providerType: 'openai',
      apiType: 'chat-completions',
      readOnly: true,
      source: 'env',
      enabled: true,
    });
  }

  return connections;
}
