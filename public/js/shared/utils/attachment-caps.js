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

export function cloneAttachmentCaps(caps = {}) {
  const next = {};
  Object.entries(caps || {}).forEach(([modelId, values]) => {
    if (!values || typeof values !== 'object') return;
    next[modelId] = { ...values };
  });
  return next;
}
