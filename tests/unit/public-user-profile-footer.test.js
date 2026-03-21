// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

async function loadModules() {
  vi.resetModules();
  const { createUserProfileFooter } = await import('../../public/js/shared/components/user-profile-footer.js');
  return { createUserProfileFooter };
}

describe('user profile footer', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders user info and emits the archived event', async () => {
    localStorage.setItem('growchat_auth', JSON.stringify({
      user: { name: 'Sam', avatar_emoji: 'S', status: 'away' },
    }));

    const { createUserProfileFooter } = await loadModules();
    const onArchived = vi.fn();
    window.addEventListener('growchat:open-archived', onArchived);

    const footer = await createUserProfileFooter();
    document.body.appendChild(footer);

    expect(footer.textContent).toContain('Sam');
    footer.querySelector('[data-action="archived"]')?.click();
    expect(onArchived).toHaveBeenCalledTimes(1);

    footer.__cleanup?.();
    window.removeEventListener('growchat:open-archived', onArchived);
  });
});


