// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import {
  discardAdminDraft,
  getAdminDraftHandlers,
  isAdminDraftDirty,
  saveAdminDraft,
} from '../../public/js/features/admin/admin-draft-state.js';

describe('admin draft state helper', () => {
  it('resolves the correct handlers for the active users scope', () => {
    const data = {
      usersDirtyCheckers: {
        overview: () => true,
      },
      usersSaveHandlers: {
        overview: vi.fn(),
      },
      usersDiscardHandlers: {
        overview: vi.fn(),
      },
    };

    const handlers = getAdminDraftHandlers(data, 'users', 'overview');

    expect(handlers.dirtyFn).toBe(data.usersDirtyCheckers.overview);
    expect(handlers.saveFn).toBe(data.usersSaveHandlers.overview);
    expect(handlers.discardFn).toBe(data.usersDiscardHandlers.overview);
  });

  it('reports dirty only when the active draft checker returns true', () => {
    const data = {
      settingsDirtyCheckers: {
        general: () => true,
      },
    };

    expect(isAdminDraftDirty(data, 'settings', 'general')).toBe(true);
    expect(isAdminDraftDirty(data, 'settings', 'models')).toBe(false);
    expect(isAdminDraftDirty(data, 'users', 'overview')).toBe(false);
  });

  it('awaits the active save handler and rechecks dirty state afterwards', async () => {
    const data = {
      settingsDirtyCheckers: {
        general: () => true,
      },
      settingsSaveHandlers: {
        general: vi.fn(async () => {
          data.settingsDirtyCheckers.general = () => false;
        }),
      },
    };

    const stillDirty = await saveAdminDraft(data, 'settings', 'general');

    expect(data.settingsSaveHandlers.general).toHaveBeenCalledTimes(1);
    expect(stillDirty).toBe(false);
  });

  it('invokes the active discard handler when present', () => {
    const discard = vi.fn(() => {
      // no-op
    });
    const data = {
      usersDiscardHandlers: {
        roles: discard,
      },
    };

    discardAdminDraft(data, 'users', 'roles');

    expect(discard).toHaveBeenCalledTimes(1);
  });
});
