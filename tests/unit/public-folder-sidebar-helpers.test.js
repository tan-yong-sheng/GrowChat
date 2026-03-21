import { describe, expect, it } from 'vitest';
import { renderFolderListMarkup } from '../../public/js/features/chat/folder-sidebar-helpers.js';

describe('folder sidebar helpers', () => {
  it('renders folder list markup with expanded state', () => {
    const html = renderFolderListMarkup([
      { id: 'f1', name: '<Work>', icon: '📁', chatCount: 3 },
    ], { f1: true });
    expect(html).toContain('&lt;Work&gt;');
    expect(html).toContain('rotate-90');
    expect(html).toContain('data-folder-id="f1"');
  });
});


