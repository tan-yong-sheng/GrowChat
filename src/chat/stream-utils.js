export function buildPersistedAssistantContent(fullText, fullReasoning) {
  const reasoningSuffix = String(fullReasoning || '').trim();
  return reasoningSuffix
    ? `${fullText ? `${fullText}\n\n` : ''}<thinking>${reasoningSuffix}</thinking>`
    : String(fullText || '');
}

export function shouldPersistAssistantContent({
  now = Date.now(),
  lastPersistAt = 0,
  lastPersistSize = 0,
  fullText = '',
  fullReasoning = '',
  force = false,
  minIntervalMs = 1200,
  minGrowth = 200,
} = {}) {
  if (force) return true;
  const size = String(fullText || '').length + String(fullReasoning || '').length;
  return now - lastPersistAt >= minIntervalMs || size - lastPersistSize >= minGrowth;
}

export function isStreamCancelledRow(row) {
  const status = String(row?.status || '').toLowerCase();
  const code = String(row?.error_code || '').toLowerCase();
  return status === 'cancelled' || status === 'cancel_requested' || code === 'cancelled';
}
