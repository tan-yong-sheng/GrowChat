export function cloneAttachmentCaps(caps = {}) {
  const next = {};
  Object.entries(caps || {}).forEach(([modelId, values]) => {
    if (!values || typeof values !== 'object') return;
    next[modelId] = { ...values };
  });
  return next;
}
