import { describe, expect, it } from 'vitest';
import { getModelAccessPresentation } from '../../public/js/shared/utils/model-access-presentation.js';

describe('getModelAccessPresentation', () => {
  it('returns personal style for personal access', () => {
    const result = getModelAccessPresentation({ access_variant: 'personal' });
    expect(result).toEqual({
      label: 'Personal',
      className: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    });
  });

  it('returns shared style by default for shared access', () => {
    const result = getModelAccessPresentation({ access_variant: 'shared' });
    expect(result).toEqual({
      label: 'Shared',
      className: 'border-gray-200 bg-gray-50 text-gray-600',
    });
  });

  it('supports account override mapping shared to admin style', () => {
    const result = getModelAccessPresentation(
      { access_variant: 'shared' },
      {
        sharedLabel: 'Admin',
        sharedClassName: 'border-sky-100 bg-sky-50 text-sky-700',
      }
    );
    expect(result).toEqual({
      label: 'Admin',
      className: 'border-sky-100 bg-sky-50 text-sky-700',
    });
  });

  it('falls back to access_label or Admin', () => {
    expect(getModelAccessPresentation({ access_label: 'Partner' })).toEqual({
      label: 'Partner',
      className: 'border-sky-100 bg-sky-50 text-sky-700',
    });
    expect(getModelAccessPresentation({})).toEqual({
      label: 'Admin',
      className: 'border-sky-100 bg-sky-50 text-sky-700',
    });
  });
});
