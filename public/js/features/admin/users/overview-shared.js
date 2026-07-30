/**
 * Shared utilities for admin users overview (controller + renderer).
 * Extracted from duplicated patterns across overview-controller.js and overview.js.
 */

import { apiFetch } from '../../../shared/api.js';
import { setModalSaveButtonState } from '../modal-save-helpers.js';
import { getActionError } from './overview-helpers.js';

// ─── Third-party ────────────────────────────────────────────────

/**
 * Check form dirty state and update save button.
 * Replaces: const isDirty = () => ...; const syncDirty = () => { ... };
 *
 * @param {HTMLElement} saveBtn
 * @param {object} fields - DOM elements with .value
 * @param {object} baseValues - target values
 * @param {string[]} [checkKeys] - optional keys to check
 * @returns {boolean} true if any field is dirty
 */
export function syncFormDirtyState(saveBtn, fields, baseValues, checkKeys) {
  const isDirty = isFormDirty(fields, baseValues, checkKeys);
  setModalSaveButtonState(saveBtn, { enabled: isDirty, saving: false });
  return isDirty;
}

// ─── API Call Wrapper ───────────────────────────────────────────────

/**
 * Wrap apiFetch with JSON parse + error handling for admin users API.
 * Replaces: const res = await apiFetch(...); const responsePayload = await res.json().catch(() => ({}));
 *   if (!res.ok) throw new Error(getActionError(responsePayload, fallback));
 *
 * @param {string|URL} url
 * @param {RequestInit} [opts={}]
 * @returns {{ json: object, ok: boolean }}
 * @throws {Error} on HTTP error status
 */
export async function adminApiFetch(url, opts = {}) {
  const res = await apiFetch(url, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(getActionError(json, `API error (${res.status})`));
  }
  return { json, ok: true, status: res.status };
}

// ─── Button State Helpers ────────────────────────────────────────────

/**
 * Update button disabled state with opacity + pointer-events toggle.
 * Replaces: btn.disabled = X; btn.classList.toggle('opacity-50', X); btn.classList.toggle('pointer-events-none', X);
 *
 * @param {HTMLElement} btn
 * @param {boolean} disabled
 */
export function setButtonDisabledStyles(btn, disabled) {
  btn.disabled = disabled;
  btn.classList.toggle('opacity-50', disabled);
  btn.classList.toggle('pointer-events-none', disabled);
}

// ─── Form Dirty / Validation Helpers ──────────────────────────────────

/**
 * Validate that a form element exists and has reportValidity available.
 * Replaces: typeof form?.reportValidity === 'function' && !form.reportValidity()
 *
 * @param {HTMLFormElement} form
 * @returns {boolean} true if valid, false if invalid
 */
export function validateFormCheck(form) {
  return typeof form?.reportValidity === 'function' ? form.reportValidity() : true;
}

/**
 * Build a standard user payload from form data (used by add/edit forms).
 * Replaces: const fd = new FormData(form); const payload = { primary_role: String(...) ... }
 *
 * @param {HTMLFormElement} form
 * @returns {object}
 */
export function buildUserPayloadFromForm(form) {
  const fd = new FormData(form);
  return {
    primary_role: String(fd.get('primary_role') || 'member').trim(),
    account_status: String(fd.get('account_status') || 'active'),
    name: String(fd.get('name') || '').trim(),
    email: String(fd.get('email') || '').trim(),
    password: String(fd.get('password') || ''),
  };
}

// ─── Form Dirty Check ─────────────────────────────────────────────

/**
 * Check if a set of form fields has changed from their base values.
 * Replaces: isDirty = () => String(fields.primaryRole?.value || 'member') !== baseValues.primary_role || ...
 *
 * @param {object} fields - { fieldName: string|undefined }
 * @param {object} baseValues - { fieldName: string }
 * @param {string[]} [keys] - optional subset of keys to check
 * @returns {boolean}
 */
export function isFormDirty(fields, baseValues, keys) {
  const checkKeys = keys || Object.keys(baseValues);
  for (const key of checkKeys) {
    const current = String(fields[key]?.value || '').trim();
    const base = String(baseValues[key] || '').trim();
    if (current !== base) return true;
  }
  return false;
}

// ─── Event Binding ──────────────────────────────────────────────────

/**
 * Bind input/change dirty listeners to form fields.
 * Replaces: form?.querySelectorAll('input, select, textarea').forEach((el) => { el.addEventListener('input', fn); el.addEventListener('change', fn); });
 *
 * @param {HTMLFormElement} form
 * @param {function} fn
 */
export function bindDirtyListeners(form, fn) {
  if (!form) return;
  form.querySelectorAll('input, select, textarea').forEach((el) => {
    el.addEventListener('input', fn);
    el.addEventListener('change', fn);
  });
}

// ─── Modal Error ────────────────────────────────────────────────────

/**
 * Show error in a modal error element.
 * Replaces: const errorEl = modal?.querySelector('#...'); if (errorEl) { errorEl.textContent = msg; errorEl.classList.remove('hidden'); }
 *
 * @param {HTMLElement} modal
 * @param {string} errorSelector
 * @param {string} message
 */
export function showModalError(modal, errorSelector, message) {
  const errorEl = modal?.querySelector(errorSelector);
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  }
}
