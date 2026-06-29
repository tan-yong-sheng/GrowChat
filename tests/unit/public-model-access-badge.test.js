import { describe, expect, it } from 'vitest';
import {
  renderModelAccessBadge,
  renderModelAccessBadgeForModel,
} from '../../public/js/shared/components/model-access-badge.js';

describe('model-access-badge component', () => {
  it('renders escaped label and model access attribute', () => {
    const html = renderModelAccessBadge({
      label: '<Admin>',
      className: 'border-sky-100 bg-sky-50 text-sky-700',
      modelId: 'abc"<id>',
    });

    expect(html).toContain('data-model-access="abc&quot;&lt;id&gt;"');
    expect(html).toContain('&lt;Admin&gt;');
    expect(html).toContain(
      'class="inline-flex items-center rounded-full border px-2 py-0.5 text-label-sm font-semibold uppercase tracking-wide border-sky-100 bg-sky-50 text-sky-700"'
    );
  });

  it('renders model badge from shared presentation logic', () => {
    const html = renderModelAccessBadgeForModel({
      id: 'model-1',
      access_variant: 'shared',
    });

    expect(html).toContain('data-model-access="model-1"');
    expect(html).toContain('>\n      Shared\n    </span>');
    expect(html).toContain('border-gray-200 bg-gray-50 text-gray-600');
  });

  it('supports account semantics override for shared access', () => {
    const html = renderModelAccessBadgeForModel(
      {
        id: 'model-2',
        access_variant: 'shared',
      },
      {
        sharedLabel: 'Admin',
        sharedClassName: 'border-sky-100 bg-sky-50 text-sky-700',
      }
    );

    expect(html).toContain('>\n      Admin\n    </span>');
    expect(html).toContain('border-sky-100 bg-sky-50 text-sky-700');
  });
});
