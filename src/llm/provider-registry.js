const MODEL_ID_SEPARATOR = ':';
const PROVIDER_FAMILY_ALIASES = new Map([
  ['openai', 'openai'],
  ['openai-compatible', 'openai'],
  ['google', 'google'],
  ['gemini', 'google'],
  ['gemini-compatible', 'google'],
  ['anthropic', 'anthropic'],
  ['claude', 'anthropic'],
  ['claude-compatible', 'anthropic'],
]);

const PROVIDER_PREFIX_TO_FAMILY = new Map([
  ['openai', 'openai'],
  ['google', 'google'],
  ['gemini', 'google'],
  ['anthropic', 'anthropic'],
  ['claude', 'anthropic'],
]);

export function normalizeProviderFamily(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  return PROVIDER_FAMILY_ALIASES.get(raw) || null;
}

export function formatModelId(providerId, modelId) {
  const safeProvider = String(providerId || '').trim();
  const safeModel = String(modelId || '').trim();
  if (!safeProvider || !safeModel) {
    throw new Error('Both providerId and modelId are required');
  }
  return `${safeProvider}${MODEL_ID_SEPARATOR}${safeModel}`;
}

export function normalizeConnectionModelId(providerId, modelId) {
  const safeProvider = String(providerId || '').trim();
  let raw = String(modelId || '').trim();
  if (!raw) return '';
  if (raw.startsWith('models/')) {
    raw = raw.slice('models/'.length);
  }
  if (!safeProvider) {
    return raw;
  }
  let next = raw;
  while (next.startsWith(`${safeProvider}${MODEL_ID_SEPARATOR}`)) {
    next = next.slice(safeProvider.length + 1);
  }
  return next;
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
  const idx = raw.indexOf('/');
  if (idx <= 0 || idx === raw.length - 1) return null;
  const prefix = raw.slice(0, idx).toLowerCase();
  const providerFamily = PROVIDER_PREFIX_TO_FAMILY.get(prefix);
  if (!providerFamily) {
    return null;
  }
  return {
    providerFamily,
    providerType: providerFamily,
    connectionId: raw.slice(idx + 1) || null,
  };
}

export function buildProviderId(connection) {
  const providerType = String(connection?.providerType || '')
    .trim()
    .toLowerCase();
  const providerFamily =
    normalizeProviderFamily(connection?.providerFamily || providerType) || 'openai';
  let prefix = providerFamily;
  if (providerType === 'openai-compatible') {
    prefix = 'openai';
  } else if (providerType === 'gemini-compatible') {
    prefix = 'google';
  } else if (providerType === 'claude-compatible') {
    prefix = 'anthropic';
  } else if (
    providerType === 'google' ||
    providerType === 'anthropic' ||
    providerType === 'openai'
  ) {
    prefix = providerType;
  }
  const id = String(connection?.id || '').trim();
  if (!id) {
    return prefix;
  }
  return `${prefix}/${id}`;
}

export function getConnectionProviderFamily(connection) {
  return (
    normalizeProviderFamily(connection?.providerType || connection?.providerFamily) || 'openai'
  );
}
