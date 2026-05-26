/**
 * Constants and helper functions for session bootstrap.
 */

export const INITIAL_CHAT_LIMIT = 30;

export const FALLBACK_PERMISSIONS = {
  admin: [
    'chat.read',
    'chat.write',
    'chat.delete',
    'chat.share',
    'user.settings.profile.write',
    'user.settings.preferences.write',
    'user.settings.connections.write',
    'user.settings.integrations.write',
    'user.settings.tool-servers.write',
    'admin.settings.read',
    'admin.settings.write',
    'admin.settings.general.write',
    'admin.settings.connections.write',
    'admin.settings.integrations.write',
    'admin.settings.policies.write',
    'admin.settings.models.write',
    'connection.use',
    'connection.manage',
    'connection.admin',
    'model.use',
    'model.admin',
    'file.upload',
    'file.delete',
    'admin.user.read',
    'admin.user.write',
    'admin.audit.read',
    'admin.rbac.admin',
    'tool-server.use',
    'tool-server.manage',
    'tool-server.admin',
    'integration.use',
    'integration.manage',
    'integration.admin',
  ],
  member: [
    'chat.read',
    'chat.write',
    'user.settings.profile.write',
    'user.settings.preferences.write',
    'user.settings.connections.write',
    'user.settings.integrations.write',
    'user.settings.tool-servers.write',
    'connection.use',
    'connection.manage',
    'model.use',
    'model.manage',
    'tool-server.use',
    'tool-server.manage',
    'integration.use',
    'integration.manage',
    'file.upload',
  ],
};

const AUTOFILL_OVERLAY_ERROR_MESSAGE = "Cannot read properties of null (reading 'includes')";
const AUTOFILL_OVERLAY_SOURCE = 'bootstrap-autofill-overlay.js';

export function normalizePublicRole(role) {
  const value = String(role || '')
    .trim()
    .toLowerCase();
  return value === 'admin' ? 'admin' : 'member';
}

export function isKnownAutofillOverlayError(error) {
  const message = String(error?.message || error?.reason?.message || error?.reason || '');
  const source = String(error?.filename || error?.sourceURL || error?.stack || '');
  return (
    message.includes(AUTOFILL_OVERLAY_ERROR_MESSAGE) || source.includes(AUTOFILL_OVERLAY_SOURCE)
  );
}

export function installKnownErrorSuppressors() {
  const suppress = (event) => {
    if (!isKnownAutofillOverlayError(event)) return;
    event.preventDefault();
  };
  window.addEventListener('error', suppress);
  window.addEventListener('unhandledrejection', suppress);
}

export function isAccessTokenNearExpiry(token, thresholdSeconds = 300) {
  const parts = String(token || '').split('.');
  if (parts.length < 2) return true;
  const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
  try {
    const decoded = JSON.parse(atob(padded));
    const exp = Number(decoded?.exp || 0);
    if (!Number.isFinite(exp)) return true;
    return exp <= Math.floor(Date.now() / 1000) + thresholdSeconds;
  } catch {
    return true;
  }
}

let shortcutsInitialized = false;

export function ensureShortcuts() {
  if (shortcutsInitialized) return;
  import('../shared/shortcuts.js').then(({ initShortcuts }) => initShortcuts()).catch(() => {});
  shortcutsInitialized = true;
}

let realtimeStarted = false;

export function ensureRealtime() {
  if (realtimeStarted) return;
  realtimeStarted = true;
  import('../shared/realtime.js')
    .then(({ shouldStartRealtimeSync, startRealtimeSync }) => {
      if (shouldStartRealtimeSync())
        startRealtimeSync({
          onEvent: (event) => {
            window.dispatchEvent(new CustomEvent('growchat:realtime', { detail: event }));
          },
        });
    })
    .catch(() => {});
}

export function scheduleDeferredTask(task, timeout = 3000) {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(task, { timeout });
    return;
  }
  setTimeout(task, timeout);
}
