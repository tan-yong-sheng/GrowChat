/**
 * Utility functions for the connection modal.
 */

export function normalizeProviderType(value) {
  return (
    String(value || '')
      .trim()
      .toLowerCase() || 'openai'
  );
}

export function isCompatibleProviderType(providerType) {
  const raw = normalizeProviderType(providerType);
  return raw === 'openai-compatible' || raw === 'gemini-compatible' || raw === 'claude-compatible';
}

export function providerLabel(providerType) {
  switch (normalizeProviderType(providerType)) {
    case 'google':
    case 'gemini-compatible':
      return 'Gemini';
    case 'anthropic':
    case 'claude-compatible':
      return 'Claude';
    case 'openai-compatible':
      return 'OpenAI Compatible';
    case 'openai':
    default:
      return 'OpenAI';
  }
}

export function providerDisplayLabel(providerType) {
  const raw = normalizeProviderType(providerType);
  if (raw === 'openai-compatible') return 'OpenAI Compatible';
  if (raw === 'gemini-compatible') return 'Gemini Compatible';
  if (raw === 'claude-compatible') return 'Claude Compatible';
  return providerLabel(raw);
}

export function providerUrlPlaceholder(providerType) {
  switch (normalizeProviderType(providerType)) {
    case 'google':
    case 'gemini-compatible':
      return 'https://generativelanguage.googleapis.com/v1beta';
    case 'anthropic':
    case 'claude-compatible':
      return 'https://api.anthropic.com/v1';
    default:
      return 'https://api.openai.com/v1';
  }
}

export function resolveUrlLabel(providerType) {
  return `URL${isCompatibleProviderType(providerType) ? ' *' : ''}`;
}

export function resolveKeyLabel() {
  return 'API Key';
}

export function connectionApiTypeDetails(providerType) {
  switch (normalizeProviderType(providerType)) {
    case 'google':
    case 'gemini-compatible':
      return {
        value: 'stream-generate-content',
        label: 'Gemini Stream Generate Content',
        endpoint: 'Uses /v1beta/models/:model:streamGenerateContent?alt=sse',
      };
    case 'anthropic':
    case 'claude-compatible':
      return {
        value: 'messages',
        label: 'Messages',
        endpoint: 'Uses /v1/messages',
      };
    default:
      return {
        value: 'chat-completions',
        label: 'Chat Completions',
        endpoint: 'Uses /v1/chat/completions',
      };
  }
}

export const STANDARD_MODAL_PRESET = {
  outerClass: 'fixed inset-0 flex items-start justify-center overflow-y-auto p-3 sm:p-4',
  overlayClass: 'absolute inset-0 bg-primary/25 backdrop-blur-sm z-0',
  zIndex: 150,
};

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatHeadersValue(headers) {
  if (
    !headers ||
    typeof headers !== 'object' ||
    Array.isArray(headers) ||
    !Object.keys(headers).length
  ) {
    return String(headers || '').trim();
  }
  try {
    return JSON.stringify(headers, null, 2);
  } catch {
    return '';
  }
}
