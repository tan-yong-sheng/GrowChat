const MODEL_ID_SEPARATOR = ':';

export function formatModelId(providerId, modelId) {
  const safeProvider = String(providerId || '').trim();
  const safeModel = String(modelId || '').trim();
  if (!safeProvider || !safeModel) {
    throw new Error('Both providerId and modelId are required');
  }
  return `${safeProvider}${MODEL_ID_SEPARATOR}${safeModel}`;
}

export function parseModelId(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const idx = raw.indexOf(MODEL_ID_SEPARATOR);
  if (idx <= 0 || idx === raw.length - 1) return null;
  return {
    providerId: raw.slice(0, idx),
    modelId: raw.slice(idx + 1),
  };
}

export function parseProviderId(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.startsWith('openai/')) {
    return { providerType: 'openai', connectionId: raw.slice('openai/'.length) || null };
  }
  if (raw.startsWith('oc/')) {
    return { providerType: 'openai-compatible', connectionId: raw.slice('oc/'.length) || null };
  }
  return null;
}

export function buildProviderId(connection) {
  const providerType = String(connection?.providerType || 'openai-compatible').toLowerCase();
  const prefix = providerType === 'openai' ? 'openai' : 'oc';
  const id = String(connection?.id || '').trim();
  if (!id) {
    return prefix;
  }
  return `${prefix}/${id}`;
}

