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
    const root = document.createElement('div');

    const form = document.createElement('form');
    form.id = 'auth-form';

    const nameWrap = document.createElement('div');
    nameWrap.id = 'name-wrap';
    nameWrap.className = 'hidden';
    const nameInput = document.createElement('input');
    nameInput.id = 'name';
    nameWrap.appendChild(nameInput);

    const emailInput = document.createElement('input');
    emailInput.id = 'email';
    const passwordInput = document.createElement('input');
    passwordInput.id = 'password';
    const authSubmit = document.createElement('button');
    authSubmit.id = 'auth-submit';
    authSubmit.type = 'submit';
    authSubmit.textContent = 'Sign in';

    form.append(nameWrap, emailInput, passwordInput, authSubmit);

    const toggleModeBtn = document.createElement('button');
    toggleModeBtn.id = 'toggle-mode';
    toggleModeBtn.type = 'button';
    toggleModeBtn.textContent = 'Sign up';
    const forgotPasswordBtn = document.createElement('button');
    forgotPasswordBtn.id = 'forgot-password';
    forgotPasswordBtn.type = 'button';
    forgotPasswordBtn.textContent = 'Forgot password';
    const toggleText = document.createElement('span');
    toggleText.id = 'toggle-text';
    const authTitle = document.createElement('h1');
    authTitle.id = 'auth-title';
    const authError = document.createElement('p');
    authError.id = 'auth-error';
    authError.className = 'hidden';
    const configWarning = document.createElement('div');
    configWarning.id = 'config-warning';
    configWarning.className = 'hidden';
    const configWarningText = document.createElement('p');
    configWarningText.id = 'config-warning-text';
    configWarning.appendChild(configWarningText);

    const forgotPasswordModal = document.createElement('div');
    forgotPasswordModal.id = 'forgot-password-modal';
    forgotPasswordModal.className = 'hidden';
    const modalClose = document.createElement('button');
    modalClose.id = 'modal-close';
    modalClose.type = 'button';
    modalClose.textContent = 'Close';
    const forgotPasswordForm = document.createElement('form');
    forgotPasswordForm.id = 'forgot-password-form';
    const forgotEmail = document.createElement('input');
    forgotEmail.id = 'forgot-email';
    const forgotSubmit = document.createElement('button');
    forgotSubmit.id = 'forgot-submit';
    forgotSubmit.type = 'submit';
    forgotSubmit.textContent = 'Send';
    const modalError = document.createElement('p');
    modalError.id = 'modal-error';
    modalError.className = 'hidden';
    const modalSuccess = document.createElement('p');
    modalSuccess.id = 'modal-success';
    modalSuccess.className = 'hidden';
    forgotPasswordForm.append(forgotEmail, forgotSubmit);
    forgotPasswordModal.append(modalClose, forgotPasswordForm, modalError, modalSuccess);

    const resetPasswordModal = document.createElement('div');
    resetPasswordModal.id = 'reset-password-modal';
    resetPasswordModal.className = 'hidden';
    const resetPasswordForm = document.createElement('form');
    resetPasswordForm.id = 'reset-password-form';
    const newPassword = document.createElement('input');
    newPassword.id = 'new-password';
    const confirmPassword = document.createElement('input');
    confirmPassword.id = 'confirm-password';
    const resetSubmit = document.createElement('button');
    resetSubmit.id = 'reset-submit';
    resetSubmit.type = 'submit';
    resetSubmit.textContent = 'Reset';
    const resetError = document.createElement('p');
    resetError.id = 'reset-error';
    resetError.className = 'hidden';
    const resetSuccess = document.createElement('p');
    resetSuccess.id = 'reset-success';
    resetSuccess.className = 'hidden';
    resetPasswordForm.append(newPassword, confirmPassword, resetSubmit);
    resetPasswordModal.append(resetPasswordForm, resetError, resetSuccess);

    root.append(
      form,
      toggleModeBtn,
      forgotPasswordBtn,
      toggleText,
      authTitle,
      authError,
      configWarning,
      forgotPasswordModal,
      resetPasswordModal
    );
    document.body.replaceChildren(root);
    mocks.setAuthState.mockReset();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to register mode on fresh workspace with no users', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.endsWith('/api/health')) {
          return new Response(
            JSON.stringify({
              initialized: false,
              authConfigured: true,
              emailConfigured: true,
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }
          );
        }
        return new Response(
          JSON.stringify({
            access_token: 'token',
            refresh_token: 'refresh',
            user: { id: 'u1', account_status: 'active', primary_role: 'admin' },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        );
      })
    );

    await loadModule();

    await vi.waitFor(() =>
      expect(document.getElementById('auth-title').textContent).toBe('Create an account')
    );
    expect(document.getElementById('auth-submit').textContent).toBe('Sign up');
    expect(document.getElementById('name-wrap').classList.contains('hidden')).toBe(false);
    // Config warning should be hidden when auth is configured
    expect(document.getElementById('config-warning').classList.contains('hidden')).toBe(true);
  });

  it('keeps login mode when workspace has users and public registration enabled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.endsWith('/api/health')) {
          return new Response(
            JSON.stringify({
              initialized: true,
              publicRegistrationEnabled: true,
              authConfigured: true,
              emailConfigured: true,
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }
          );
        }
        return new Response(
          JSON.stringify({
            access_token: 'token',
            refresh_token: 'refresh',
            user: {
              id: 'u1',
              account_status: 'active',
              primary_role: 'member',
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        );
      })
    );

    await loadModule();

    await vi.waitFor(() =>
      expect(document.getElementById('auth-title').textContent).toBe('Sign in to GrowChat')
    );
    expect(document.getElementById('auth-submit').textContent).toBe('Sign in');
    expect(document.getElementById('name-wrap').classList.contains('hidden')).toBe(true);
    // Config warning should be hidden when auth is configured
    expect(document.getElementById('config-warning').classList.contains('hidden')).toBe(true);
    // Forgot password should be visible
    expect(document.getElementById('forgot-password').classList.contains('hidden')).toBe(false);
    // Toggle mode should be visible
    expect(document.getElementById('toggle-mode').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('toggle-text').classList.contains('hidden')).toBe(false);
  });

  it('hides sign-up and shows login only when public registration is disabled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.endsWith('/api/health')) {
          return new Response(
            JSON.stringify({
              initialized: true,
              publicRegistrationEnabled: false,
              authConfigured: true,
              emailConfigured: true,
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }
          );
        }
        return new Response(
          JSON.stringify({
            access_token: 'token',
            refresh_token: 'refresh',
            user: {
              id: 'u1',
              account_status: 'active',
              primary_role: 'member',
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        );
      })
    );

    await loadModule();

    await vi.waitFor(() =>
      expect(document.getElementById('auth-title').textContent).toBe('Sign in to GrowChat')
    );
    expect(document.getElementById('auth-submit').textContent).toBe('Sign in');
    expect(document.getElementById('name-wrap').classList.contains('hidden')).toBe(true);
    // Forgot password should be visible (users exist)
    expect(document.getElementById('forgot-password').classList.contains('hidden')).toBe(false);
    // Toggle mode should be hidden (no point showing sign-up when it's disabled)
    expect(document.getElementById('toggle-mode').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('toggle-text').classList.contains('hidden')).toBe(true);
  });

  it('shows a pending approval message instead of logging in when registration does not return tokens', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.endsWith('/api/health')) {
          return new Response(JSON.stringify({ initialized: false }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(
          JSON.stringify({
            user: { id: 'u1', role: 'user', account_status: 'pending' },
            status: 'pending',
            message: 'Account pending approval.',
          }),
          {
            status: 201,
            headers: { 'content-type': 'application/json' },
          }
        );
      })
    );

    await loadModule();

    await vi.waitFor(() =>
      expect(document.getElementById('auth-title').textContent).toBe('Create an account')
    );
    document.getElementById('name').value = 'Pending User';
    document.getElementById('email').value = 'pending@example.com';
    document.getElementById('password').value = 'password123';
    document
      .getElementById('auth-form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() =>
      expect(document.getElementById('auth-error').textContent).toBe('Account pending approval.')
    );
    expect(mocks.setAuthState).not.toHaveBeenCalled();
    expect(document.getElementById('auth-error').classList.contains('text-green-600')).toBe(true);
  });
});
