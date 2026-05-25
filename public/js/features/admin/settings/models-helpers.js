import {
  ATTACHMENT_CAP_TYPES,
  ATTACHMENT_CAP_TOOLTIPS,
  cloneAttachmentCaps,
} from '../../../shared/utils/attachment-caps.js';

export { ATTACHMENT_CAP_TYPES, ATTACHMENT_CAP_TOOLTIPS, cloneAttachmentCaps };

export function extractAttachmentCapsFromModels(models = []) {
  const caps = {};
  models.forEach((model) => {
    const attachments = model?.attachments;
    const filtered = {};
    ATTACHMENT_CAP_TYPES.forEach(({ key }) => {
      if (
        attachments &&
        typeof attachments === 'object' &&
        !Array.isArray(attachments) &&
        typeof attachments[key] === 'boolean'
      ) {
        filtered[key] = attachments[key];
      } else {
        filtered[key] = false;
      }
    });
    caps[model.id] = filtered;
  });
  return caps;
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
