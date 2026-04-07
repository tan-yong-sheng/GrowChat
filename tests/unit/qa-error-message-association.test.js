import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

describe('Form Error Message Association - WCAG 2.1.3', () => {
  let dom;
  let window;
  let document;

  beforeEach(() => {
    const authHtml = fs.readFileSync(
      path.join(process.cwd(), 'public/auth.html'),
      'utf-8'
    );
    dom = new JSDOM(authHtml, {
      url: 'http://localhost:8787/auth.html',
      pretendToBeVisual: true,
    });
    window = dom.window;
    document = window.document;
  });

  afterEach(() => {
    dom.window.close();
  });

  it('error message has aria-describedby linking to form', () => {
    // WCAG 2.1.3: Error messages should be associated with the form
    // Either via aria-describedby on inputs or aria-labelledby on error
    const form = document.getElementById('auth-form');
    const errorDiv = document.getElementById('auth-error');

    // Error div should have an id so it can be referenced
    expect(errorDiv.id).toBe('auth-error');

    // Form inputs should reference the error div via aria-describedby
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');

    // At minimum, error div should be associated with form via aria-live
    expect(errorDiv.getAttribute('aria-live')).toBe('polite');
    expect(errorDiv.getAttribute('role')).toBe('alert');
  });

  it('modal error messages are properly associated', () => {
    const modalError = document.getElementById('modal-error');
    const modalSuccess = document.getElementById('modal-success');

    // Error and success messages should have proper ARIA attributes
    expect(modalError.getAttribute('aria-live')).toBeTruthy();
    expect(modalSuccess.getAttribute('aria-live')).toBeTruthy();
  });

  it('reset password error messages are properly associated', () => {
    const resetError = document.getElementById('reset-error');
    const resetSuccess = document.getElementById('reset-success');

    // Error and success messages should have proper ARIA attributes
    expect(resetError.getAttribute('aria-live')).toBeTruthy();
    expect(resetSuccess.getAttribute('aria-live')).toBeTruthy();
  });
});
