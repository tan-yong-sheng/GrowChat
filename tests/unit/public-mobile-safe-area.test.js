import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readText(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('mobile safe-area shell', () => {
  it('reserves the mobile safe area in the public viewport', () => {
    const html = readText('../../public/index.html');

    expect(html).toContain('viewport-fit=cover');
  });

  it('uses the dynamic viewport and safe-area footer padding in the chat shell', () => {
    const chat = readText('../../public/js/features/chat/chat.js');

    expect(chat).toContain('h-[100dvh] md:h-[100dvh]');
    expect(chat).toContain('pb-[calc(1rem+env(safe-area-inset-bottom))]');
  });

  it('uses the dynamic viewport and safe-area footer padding in the admin shell', () => {
    const shell = readText('../../public/js/shared/components/workspace-shell.js');
    const sidebar = readText('../../public/js/shared/components/workspace-sidebar.js');

    expect(shell).toContain('h-[100dvh] w-full bg-white overflow-hidden');
    expect(sidebar).toContain('padding-bottom: calc(1rem + env(safe-area-inset-bottom));');
  });
});
