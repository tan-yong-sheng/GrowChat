/**
 * Constants and helper functions for session bootstrap.
 */
import { decodeJwtPayload } from '../shared/api/auth.js';

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
  const decoded = decodeJwtPayload(token);
  if (!decoded || typeof decoded !== 'object') return true;
  const exp = Number(decoded.exp || 0);
  if (!Number.isFinite(exp)) return true;
  return exp <= Math.floor(Date.now() / 1000) + thresholdSeconds;
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
  import('../shared/realtime.js')
    .then(({ startRealtimeSync, stopRealtimeSync }) => {
      if (typeof window === 'undefined') return;
      startRealtimeSync({
        onEvent: (event) => {
          window.dispatchEvent(new CustomEvent('growchat:realtime', { detail: event }));
        },
      });
      window.addEventListener('beforeunload', stopRealtimeSync, { once: true });
      realtimeStarted = true;
    })
    .catch(() => {
      /* ignored - will retry on next call */
    });
}

export function scheduleDeferredTask(task, timeout = 3000) {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(task, { timeout });
    return;
  }
  setTimeout(task, timeout);
}
