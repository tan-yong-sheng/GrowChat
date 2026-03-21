export const ATTACHMENT_CAP_TYPES = [
  { key: 'image', label: 'Image', short: 'Img' },
  { key: 'pdf', label: 'PDF', short: 'PDF' },
];

export const ATTACHMENT_CAP_TOOLTIPS = {
  image: {
    exts: '.png .jpg .jpeg .webp .gif',
    mimes: 'image/*',
  },
  pdf: {
    exts: '.pdf',
    mimes: 'application/pdf',
  },
};

export function extractAttachmentCapsFromModels(models = []) {
  const caps = {};
  models.forEach((model) => {
    const attachments = model?.attachments;
    const filtered = {};
    ATTACHMENT_CAP_TYPES.forEach(({ key }) => {
      if (attachments && typeof attachments === 'object' && !Array.isArray(attachments) && typeof attachments[key] === 'boolean') {
        filtered[key] = attachments[key];
      } else {
        filtered[key] = false;
      }
    });
    caps[model.id] = filtered;
  });
  return caps;
}

export function cloneAttachmentCaps(caps = {}) {
  const next = {};
  Object.entries(caps || {}).forEach(([modelId, values]) => {
    if (!values || typeof values !== 'object') return;
    next[modelId] = { ...values };
  });
  return next;
}

export function getAttachmentCapValue(capsMap, modelId, kind) {
  return Boolean(capsMap?.[modelId]?.[kind]);
}

export function getAttachmentCapTooltip(label, kind, state) {
  const info = ATTACHMENT_CAP_TOOLTIPS[kind] || {};
  const lines = [`${label}: ${state}`];
  if (info.exts) lines.push(`Ext: ${info.exts}`);
  if (info.mimes) lines.push(`MIME: ${info.mimes}`);
  if (info.note) lines.push(`Note: ${info.note}`);
  return lines.join('\n');
}
