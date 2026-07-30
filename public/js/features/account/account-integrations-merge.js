import { normalizeServer } from './account-integrations-helpers.js';

// Source order matches original behavior: id/headers skip 'payload'; name/url use
// saved → payload → existing; auth fields use saved → payload → existing.
const FIELD_SOURCE_ORDERS = {
  id: ['saved', 'existing'],
  name: ['saved', 'payload', 'existing'],
  url: ['saved', 'payload', 'existing'],
  headers: ['saved', 'existing', 'payload'],
  auth_type: ['saved', 'payload', 'existing'],
  auth_bearer_token: ['saved', 'payload', 'existing'],
  auth_basic_username: ['saved', 'payload', 'existing'],
  auth_basic_password: ['saved', 'payload', 'existing'],
  oauth_client_name: ['saved', 'payload', 'existing'],
  oauth_scope: ['saved', 'payload', 'existing'],
  oauth_client_id: ['saved', 'payload', 'existing'],
  oauth_client_secret: ['saved', 'payload', 'existing'],
  oauth_token_auth_method: ['saved', 'payload', 'existing'],
};

const FIELD_FALLBACKS = {
  id: '',
  name: '',
  url: '',
  headers: '',
  auth_type: 'none',
  auth_bearer_token: '',
  auth_basic_username: '',
  auth_basic_password: '',
  oauth_client_name: '',
  oauth_scope: '',
  oauth_client_id: '',
  oauth_client_secret: '',
  oauth_token_auth_method: '',
};

function firstTruthy(...candidates) {
  for (const candidate of candidates) {
    if (candidate) return candidate;
  }
  return null;
}

function pickFirstTruthyFromOrder({ key, sourceOrder, payload, savedServer, existingServer }) {
  const values = sourceOrder.map((src) => {
    if (src === 'saved') return savedServer?.[key];
    if (src === 'payload') return payload?.[key];
    return existingServer?.[key];
  });
  return firstTruthy(...values);
}

function applyFieldSourceOrders(merged, payload, savedServer, existingServer) {
  for (const [field, sourceOrder] of Object.entries(FIELD_SOURCE_ORDERS)) {
    const value = pickFirstTruthyFromOrder({
      key: field,
      sourceOrder,
      payload,
      savedServer,
      existingServer,
    });
    merged[field] = value || FIELD_FALLBACKS[field];
  }
  return merged;
}

function pickMergedTools(payload, savedServer, existingServer) {
  if (Array.isArray(savedServer?.tools)) return savedServer.tools;
  if (Array.isArray(payload?.tools)) return payload.tools;
  if (Array.isArray(existingServer?.tools)) return existingServer.tools;
  return [];
}

function pickMergedEnabled(payload, savedServer, existingServer) {
  if (typeof savedServer?.enabled === 'boolean') return savedServer.enabled;
  return payload?.enabled ?? existingServer?.enabled;
}

/**
 * Merge a saved server payload with the existing server, applying field source
 * orders and falling back to defaults for any missing fields.
 *
 * @param {object} payload - The payload from the server (may be partial)
 * @param {object} savedServer - The server saved in the form
 * @param {object} [existingServer] - The existing server in state (optional)
 * @returns {object} Normalized merged server
 */
function buildMergedServer(payload, savedServer, existingServer = null) {
  const merged = {
    ...existingServer,
    ...payload,
    ...savedServer,
    enabled: pickMergedEnabled(payload, savedServer, existingServer),
    tools: pickMergedTools(payload, savedServer, existingServer),
    toolsExpanded: Boolean(savedServer?.toolsExpanded ?? existingServer?.toolsExpanded),
    toolsError: String(savedServer?.toolsError || existingServer?.toolsError || '').trim(),
  };
  applyFieldSourceOrders(merged, payload, savedServer, existingServer);
  return normalizeServer(merged);
}

export { buildMergedServer };
