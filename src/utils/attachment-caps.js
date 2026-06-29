/**
 * Shared parser/normalizer for the model_attachment_caps_v1 config blob.
 *
 * Issue #126: legacy entries were written with millisecond `updated_at`
 * values, but the rest of the codebase standardizes on Unix seconds. This
 * helper normalizes on read so any consumer (chat, admin, models) sees a
 * consistent unit.
 */
export function loadAttachmentCapsFromRaw(raw = '{}') {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  for (const [key, entry] of Object.entries(parsed)) {
    if (isLegacyMsEntry(entry)) {
      parsed[key] = { ...entry, updated_at: Math.floor(entry.updated_at / 1000) };
    }
  }
  return parsed;
}

function isLegacyMsEntry(entry) {
  return (
    entry &&
    typeof entry === 'object' &&
    typeof entry.updated_at === 'number' &&
    entry.updated_at > 1e12
  );
}
