function safeString(value) {
  return String(value || '');
}

function buildPersistedContent(fullText, reasoningSuffix) {
  if (!reasoningSuffix) return safeString(fullText);
  const prefix = fullText ? `${fullText}\n\n` : '';
  return `${prefix}<thinking>${reasoningSuffix}</thinking>`;
}

export function buildPersistedAssistantContent(fullText, fullReasoning) {
  const reasoningSuffix = safeString(fullReasoning).trim();
  return buildPersistedContent(fullText, reasoningSuffix);
}

function calculateContentSize(fullText, fullReasoning) {
  return safeString(fullText).length + safeString(fullReasoning).length;
}

function hasGrownEnough(currentSize, lastPersistSize, minGrowth) {
  return currentSize - lastPersistSize >= minGrowth;
}

function hasEnoughTimePassed(now, lastPersistAt, minIntervalMs) {
  return now - lastPersistAt >= minIntervalMs;
}

const PERSIST_DEFAULTS = Object.freeze({
  now: Date.now,
  lastPersistAt: 0,
  lastPersistSize: 0,
  fullText: '',
  fullReasoning: '',
  force: false,
  minIntervalMs: 1200,
  minGrowth: 200,
});

function resolvePersistOptions(options) {
  const resolved = {};
  for (const key of Object.keys(PERSIST_DEFAULTS)) {
    const raw = options[key];
    resolved[key] =
      raw !== undefined && raw !== null
        ? raw
        : typeof PERSIST_DEFAULTS[key] === 'function'
          ? PERSIST_DEFAULTS[key]()
          : PERSIST_DEFAULTS[key];
  }
  return resolved;
}

export function shouldPersistAssistantContent(options = {}) {
  const {
    now,
    lastPersistAt,
    lastPersistSize,
    fullText,
    fullReasoning,
    force,
    minIntervalMs,
    minGrowth,
  } = resolvePersistOptions(options);
  if (force) return true;
  const size = calculateContentSize(fullText, fullReasoning);
  const enoughTime = hasEnoughTimePassed(now, lastPersistAt, minIntervalMs);
  const enoughGrowth = hasGrownEnough(size, lastPersistSize, minGrowth);
  return enoughTime || enoughGrowth;
}

export function isStreamCancelledRow(row) {
  const status = safeString(row?.status).toLowerCase();
  const code = safeString(row?.error_code).toLowerCase();
  return status === 'cancelled' || status === 'cancel_requested' || code === 'cancelled';
}
