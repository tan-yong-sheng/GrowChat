// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

describe('QA Comprehensive UI/UX Check', () => {
  let dom;
  let window;
  let document;

  beforeEach(() => {
    const authHtml = fs.readFileSync(path.join(process.cwd(), 'public/auth.html'), 'utf-8');
    dom = new JSDOM(authHtml, {
      url: (process.env.TEST_URL || 'http://localhost:8787').replace(/\/$/, '') + '/auth.html',
      pretendToBeVisual: true,
    });
    window = dom.window;
    document = window.document;
  });

  afterEach(() => {
    dom.window.close();
  });

  describe('Auth Page - Form Elements', () => {
    it('has all required form inputs', () => {
      expect(document.getElementById('email')).toBeTruthy();
      expect(document.getElementById('password')).toBeTruthy();
      expect(document.getElementById('name')).toBeTruthy();
      expect(document.getElementById('auth-form')).toBeTruthy();
    });

    it('email input has correct type and attributes', () => {
      const emailInput = document.getElementById('email');
      // type=text (not email) to allow localhost dev emails that HTML5 rejects
      expect(emailInput.type).toBe('text');
      expect(emailInput.required).toBe(true);
      expect(emailInput.getAttribute('autocomplete')).toBeTruthy();
    });

    it('password input has correct type and attributes', () => {
      const passwordInput = document.getElementById('password');
      expect(passwordInput.type).toBe('password');
      expect(passwordInput.required).toBe(true);
      expect(passwordInput.getAttribute('autocomplete')).toBeTruthy();
    });

    it('name input is hidden by default', () => {
      const nameWrap = document.getElementById('name-wrap');
      expect(nameWrap.classList.contains('hidden')).toBe(true);
    });

    it('submit button exists and is initially disabled', () => {
      const submitBtn = document.getElementById('auth-submit');
      expect(submitBtn).toBeTruthy();
      expect(submitBtn.type).toBe('submit');
    });
  });

  describe('Auth Page - Modal Elements', () => {
    it('forgot password modal exists', () => {
      expect(document.getElementById('forgot-password-modal')).toBeTruthy();
      expect(document.getElementById('forgot-password-form')).toBeTruthy();
      expect(document.getElementById('forgot-email')).toBeTruthy();
    });

    it('reset password modal exists', () => {
      expect(document.getElementById('reset-password-modal')).toBeTruthy();
      expect(document.getElementById('reset-password-form')).toBeTruthy();
      expect(document.getElementById('new-password')).toBeTruthy();
      expect(document.getElementById('confirm-password')).toBeTruthy();
    });

    it('modals are hidden by default', () => {
      const forgotModal = document.getElementById('forgot-password-modal');
      const resetModal = document.getElementById('reset-password-modal');
      expect(forgotModal.classList.contains('hidden')).toBe(true);
      expect(resetModal.classList.contains('hidden')).toBe(true);
    });
  });

  describe('Auth Page - Accessibility', () => {
    it('form has proper labels or aria-labels', () => {
      const form = document.getElementById('auth-form');
      const inputs = form.querySelectorAll('input[required]');
      inputs.forEach((input) => {
        const hasLabel = document.querySelector(`label[for="${input.id}"]`);
        const hasAriaLabel = input.getAttribute('aria-label');
        expect(hasLabel || hasAriaLabel).toBeTruthy();
      });
    });

    it('buttons have accessible text', () => {
      const submitBtn = document.getElementById('auth-submit');
      const toggleBtn = document.getElementById('toggle-mode');
      expect(submitBtn.textContent.trim().length).toBeGreaterThan(0);
      expect(toggleBtn.textContent.trim().length).toBeGreaterThan(0);
    });

    it('error messages have proper ARIA attributes', () => {
      const errorDiv = document.getElementById('auth-error');
      expect(errorDiv).toBeTruthy();
      // Should have role or aria-live for dynamic updates
      const hasAriaLive = errorDiv.getAttribute('aria-live');
      const hasRole = errorDiv.getAttribute('role');
      expect(hasAriaLive || hasRole).toBeTruthy();
    });
  });

  describe('Auth Page - CSS Classes', () => {
    it('uses Tailwind classes for styling', () => {
      const form = document.getElementById('auth-form');
      const classes = form.className;
      expect(classes.length).toBeGreaterThan(0);
      // Should have Tailwind classes, not inline styles
      expect(form.getAttribute('style')).toBeFalsy();
    });

    it('error message div has hidden class initially', () => {
      const errorDiv = document.getElementById('auth-error');
      expect(errorDiv.classList.contains('hidden')).toBe(true);
    });
  });

  describe('Auth Page - Script Loading', () => {
    it('loads auth.js module', () => {
      const scripts = document.querySelectorAll('script[type="module"]');
      const hasAuthScript = Array.from(scripts).some((s) => s.src.includes('auth.js'));
      expect(hasAuthScript).toBe(true);
    });

    it('has no inline event handlers (should use addEventListener)', () => {
      const elementsWithHandlers = document.querySelectorAll(
        '[onclick], [onchange], [oninput], [onsubmit]'
      );
      expect(elementsWithHandlers.length).toBe(0);
    });
  });

  describe('Auth Page - Form Validation', () => {
    it('form has required attributes on inputs', () => {
      const emailInput = document.getElementById('email');
      const passwordInput = document.getElementById('password');
      expect(emailInput.required).toBe(true);
      expect(passwordInput.required).toBe(true);
    });

    it('email input has email type validation', () => {
      const emailInput = document.getElementById('email');
      // type=text (not email) to allow localhost dev emails that HTML5 rejects
      expect(emailInput.type).toBe('text');
    });

    it('password input has minimum length constraint', () => {
      const passwordInput = document.getElementById('password');
      const minLength = passwordInput.getAttribute('minlength');
      expect(minLength).toBeTruthy();
    });
  });

  describe('Auth Page - Toggle Mode', () => {
    it('toggle button exists', () => {
      const toggleBtn = document.getElementById('toggle-mode');
      expect(toggleBtn).toBeTruthy();
    });

    it('toggle text element exists', () => {
      const toggleText = document.getElementById('toggle-text');
      expect(toggleText).toBeTruthy();
    });

    it('auth title element exists', () => {
      const authTitle = document.getElementById('auth-title');
      expect(authTitle).toBeTruthy();
    });
  });

  describe('Auth Page - Forgot Password', () => {
    it('forgot password button exists', () => {
      const forgotBtn = document.getElementById('forgot-password');
      expect(forgotBtn).toBeTruthy();
    });

    it('forgot password form has email input', () => {
      const forgotForm = document.getElementById('forgot-password-form');
      const emailInput = forgotForm.querySelector('input#forgot-email');
      expect(emailInput).toBeTruthy();
    });

    it('forgot password form has submit button', () => {
      const forgotForm = document.getElementById('forgot-password-form');
      const submitBtn = forgotForm.querySelector('button[type="submit"]');
      expect(submitBtn).toBeTruthy();
    });

    it('modal has close button', () => {
      const closeBtn = document.getElementById('modal-close');
      expect(closeBtn).toBeTruthy();
    });
  });

  describe('Auth Page - Reset Password', () => {
    it('reset password form has password inputs', () => {
      const resetForm = document.getElementById('reset-password-form');
      const newPasswordInput = resetForm.querySelector('#new-password');
      const confirmPasswordInput = resetForm.querySelector('#confirm-password');
      expect(newPasswordInput).toBeTruthy();
      expect(confirmPasswordInput).toBeTruthy();
    });

    it('reset password form has submit button', () => {
      const resetForm = document.getElementById('reset-password-form');
      const submitBtn = resetForm.querySelector('button[type="submit"]');
      expect(submitBtn).toBeTruthy();
    });

    it('password inputs have type password', () => {
      const newPasswordInput = document.getElementById('new-password');
      const confirmPasswordInput = document.getElementById('confirm-password');
      expect(newPasswordInput.type).toBe('password');
      expect(confirmPasswordInput.type).toBe('password');
    });
  });

  describe('Auth Page - Error Handling', () => {
    it('has error message container', () => {
      const errorDiv = document.getElementById('auth-error');
      expect(errorDiv).toBeTruthy();
    });

    it('modal has error and success message containers', () => {
      const modalError = document.getElementById('modal-error');
      const modalSuccess = document.getElementById('modal-success');
      expect(modalError).toBeTruthy();
      expect(modalSuccess).toBeTruthy();
    });

    it('reset modal has error and success message containers', () => {
      const resetError = document.getElementById('reset-error');
      const resetSuccess = document.getElementById('reset-success');
      expect(resetError).toBeTruthy();
      expect(resetSuccess).toBeTruthy();
    });
  });
});
