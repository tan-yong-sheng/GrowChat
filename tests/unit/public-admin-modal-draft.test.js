// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bindAdminDraftHandlers,
  clearAdminDraft,
  getAdminDraft,
  setAdminDraft,
} from '../../public/js/features/admin/modal-draft.js';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('admin modal draft registry', () => {
  it('stores, reads, and clears staged drafts by scope', () => {
    const data = {};

    expect(getAdminDraft(data, 'users', 'overview')).toBeNull();

    setAdminDraft(data, 'users', 'overview', { kind: 'edit', payload: { name: 'Ada' } });
    expect(getAdminDraft(data, 'users', 'overview')).toEqual({ kind: 'edit', payload: { name: 'Ada' } });

    clearAdminDraft(data, 'users', 'overview');
    expect(getAdminDraft(data, 'users', 'overview')).toBeNull();
  });

  it('binds dirty/save/discard handlers and cleans them up', () => {
    const data = {};
    const requestFooterSync = vi.fn();
    const isDirty = vi.fn(() => true);
    const save = vi.fn();
    const discard = vi.fn();

    const dispose = bindAdminDraftHandlers(data, 'users', 'overview', {
      isDirty,
      save,
      discard,
      requestFooterSync,
    });

    expect(data.usersDirtyCheckers.overview()).toBe(true);
    expect(data.usersSaveHandlers.overview).toBe(save);
    expect(data.usersDiscardHandlers.overview).toBe(discard);
    expect(requestFooterSync).toHaveBeenCalled();

    dispose();

    expect(data.usersDirtyCheckers.overview).toBeUndefined();
    expect(data.usersSaveHandlers.overview).toBeUndefined();
    expect(data.usersDiscardHandlers.overview).toBeUndefined();
  });
});
