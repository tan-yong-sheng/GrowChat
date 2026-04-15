// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { updateSubmitButtonState } from '../../public/js/shared/form-validation.js';

describe('Auth Form Validation', () => {
  let form;
  let emailInput;
  let passwordInput;
  let submitBtn;

  beforeEach(() => {
    document.body.innerHTML = `
      <form id="auth-form">
        <input id="email" type="email" required />
        <input id="password" type="password" required />
        <button id="auth-submit" type="submit">Sign in</button>
      </form>
    `;

    form = document.getElementById('auth-form');
    emailInput = document.getElementById('email');
    passwordInput = document.getElementById('password');
    submitBtn = document.getElementById('auth-submit');

    // Initialize button state
    updateSubmitButtonState(form, submitBtn);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('disables submit button when form is empty', () => {
    expect(submitBtn.disabled).toBe(true);
  });

  it('disables submit button when only email is filled', () => {
    emailInput.value = 'test@example.com';
    updateSubmitButtonState(form, submitBtn);

    expect(submitBtn.disabled).toBe(true);
  });

  it('disables submit button when only password is filled', () => {
    passwordInput.value = 'password123';
    updateSubmitButtonState(form, submitBtn);

    expect(submitBtn.disabled).toBe(true);
  });

  it('enables submit button when both email and password are filled', () => {
    emailInput.value = 'test@example.com';
    passwordInput.value = 'password123';
    updateSubmitButtonState(form, submitBtn);

    expect(submitBtn.disabled).toBe(false);
  });

  it('disables submit button when email is cleared', () => {
    emailInput.value = 'test@example.com';
    passwordInput.value = 'password123';
    updateSubmitButtonState(form, submitBtn);

    emailInput.value = '';
    updateSubmitButtonState(form, submitBtn);

    expect(submitBtn.disabled).toBe(true);
  });

  it('disables submit button when password is cleared', () => {
    emailInput.value = 'test@example.com';
    passwordInput.value = 'password123';
    updateSubmitButtonState(form, submitBtn);

    passwordInput.value = '';
    updateSubmitButtonState(form, submitBtn);

    expect(submitBtn.disabled).toBe(true);
  });
});
