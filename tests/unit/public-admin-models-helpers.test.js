import { describe, expect, it } from 'vitest';
import {
  ATTACHMENT_CAP_TYPES,
  cloneAttachmentCaps,
  extractAttachmentCapsFromModels,
  getAttachmentCapTooltip,
  getAttachmentCapValue,
} from '../../public/js/features/admin/settings/models-helpers.js';

describe('admin model helpers', () => {
  it('extracts attachment caps from models', () => {
    const caps = extractAttachmentCapsFromModels([
      { id: 'm1', attachments: { image: true, pdf: false } },
      { id: 'm2', attachments: { image: false } },
    ]);

    expect(caps).toEqual({
      m1: { image: true, pdf: false },
      m2: { image: false, pdf: false },
    });
  });

  it('clones attachment caps without sharing references', () => {
    const original = { m1: { image: true, pdf: false } };
    const clone = cloneAttachmentCaps(original);

    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);
    expect(clone.m1).not.toBe(original.m1);
  });

  it('reads cap values and tooltips', () => {
    expect(getAttachmentCapValue({ m1: { image: true } }, 'm1', 'image')).toBe(true);
    expect(getAttachmentCapValue({ m1: { image: true } }, 'm1', 'pdf')).toBe(false);
    expect(getAttachmentCapTooltip('Image', 'image', 'allowed')).toContain('Image: allowed');
    expect(ATTACHMENT_CAP_TYPES).toHaveLength(2);
  });
});


