// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setAuthState: vi.fn(),
}));

vi.mock('../../public/js/shared/api.js', () => ({
  setAuthState: (...args) => mocks.setAuthState(...args),
}));

async function loadModule() {
  vi.resetModules();
  return import('../../public/js/bootstrap/auth.js');
}

describe('public auth bootstrap', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div>
        <form id="auth-form">
          <div id="name-wrap" class="hidden"><input id="name" /></div>
          <input id="email" />
          <input id="password" />
          <button id="auth-submit" type="submit">Sign in</button>
        </form>
        <button id="toggle-mode" type="button">Sign up</button>
        <span id="toggle-text"></span>
        <h1 id="auth-title"></h1>
        <p id="auth-error" class="hidden"></p>
      </div>
    `;
    mocks.setAuthState.mockReset();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a pending approval message instead of logging in when registration does not return tokens', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      user: { id: 'u1', role: 'inactive' },
      status: 'pending',
      message: 'Account pending approval.',
    }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    })));

    await loadModule();

    document.getElementById('toggle-mode').click();
    document.getElementById('name').value = 'Pending User';
    document.getElementById('email').value = 'pending@example.com';
    document.getElementById('password').value = 'password123';
    document.getElementById('auth-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(document.getElementById('auth-error').textContent).toBe('Account pending approval.'));
    expect(mocks.setAuthState).not.toHaveBeenCalled();
    expect(document.getElementById('auth-error').classList.contains('text-green-600')).toBe(true);
  });
});
