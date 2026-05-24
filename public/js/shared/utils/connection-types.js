/**
 * Shared connection type utilities
 *
 * Provides provider type normalization and API type details
 * for connection management across admin settings and modals.
 */

export function normalizeProviderType(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
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
