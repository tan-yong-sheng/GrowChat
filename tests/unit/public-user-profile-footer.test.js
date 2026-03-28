// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../../public/js/shared/store.js';

async function loadModules() {
  vi.resetModules();
  const { createUserProfileFooter } = await import('../../public/js/shared/components/user-profile-footer.js');
  return { createUserProfileFooter };
}

describe('user profile footer', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    localStorage.clear();
    state.permissions = [];
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
    expect(footer.querySelector('[data-action="resources"]')).toBeNull();
    footer.querySelector('[data-action="archived"]')?.click();
    expect(onArchived).toHaveBeenCalledTimes(1);

    footer.__cleanup?.();
    window.removeEventListener('growchat:open-archived', onArchived);
  });

  it('guards admin navigation before leaving a dirty admin page', async () => {
    localStorage.setItem('growchat_auth', JSON.stringify({
      user: { name: 'Sam', avatar_emoji: 'S', status: 'away' },
    }));

    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    const guardNavigation = vi.fn(async () => false);

    const { createUserProfileFooter } = await loadModules();
    const { state: currentState } = await import('../../public/js/shared/store.js');
    currentState.permissions = ['admin.rbac.admin'];

    const footer = await createUserProfileFooter({ guardNavigation });
    document.body.appendChild(footer);

    footer.querySelector('.user-profile-btn')?.click();
    footer.querySelector('[data-action="admin"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    expect(guardNavigation).toHaveBeenCalledTimes(1);
    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(window.location.pathname).not.toBe('/admin/users/overview');

    footer.__cleanup?.();
  });
});


