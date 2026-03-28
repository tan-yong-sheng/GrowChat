// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAdminShellController,
  getAdminSharedActionFooterConfig,
} from '../../public/js/features/admin/admin-shell-controller.js';

describe('admin shell controller', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('maps shared footer config for users and settings routes', () => {
    expect(getAdminSharedActionFooterConfig('users', 'overview')).toEqual({
      footerId: 'users-action-footer',
      dirtyId: 'users-dirty',
      saveId: 'save-users',
      buttonLabel: 'Save',
      dirtyLabel: 'Unsaved changes',
    });
    expect(getAdminSharedActionFooterConfig('settings', 'general')).toEqual({
      footerId: 'settings-action-footer',
      dirtyId: 'settings-dirty',
      saveId: 'save-settings',
      buttonLabel: 'Save',
      dirtyLabel: 'Unsaved changes',
    });
    expect(getAdminSharedActionFooterConfig('settings', 'policies')).toBeNull();
    expect(getAdminSharedActionFooterConfig('users', 'policies')).toBeNull();
  });

  it('renders and refreshes the shared footer for a dirty draft', async () => {
    document.body.innerHTML = '<div id="app"><div id="admin-main-action-footer-host"></div></div>';
    const data = {
      usersDirtyCheckers: {
        overview: () => true,
      },
      usersSaveHandlers: {
        overview: vi.fn(async () => {
          data.usersDirtyCheckers.overview = () => false;
        }),
      },
      usersDiscardHandlers: {
        overview: vi.fn(() => {
          data.usersDirtyCheckers.overview = () => false;
        }),
      },
    };

    const controller = createAdminShellController({
      container: document.getElementById('app'),
      data,
      getMainTab: () => 'users',
      getSubTab: () => 'overview',
      promptUnsavedChanges: vi.fn(async () => 'save'),
    });

    controller.renderSharedActionFooter();

    const footer = document.querySelector('[data-admin-main-action-footer="users-action-footer"]');
    expect(footer).not.toBeNull();
    expect(document.querySelector('#save-users')).not.toBeNull();
    expect(document.querySelector('#save-users')?.disabled).toBe(false);
    expect(document.querySelector('#users-dirty')?.classList.contains('invisible')).toBe(false);

    await controller.handleSharedActionSave();
    controller.updateSharedActionFooter();

    expect(data.usersSaveHandlers.overview).toHaveBeenCalledTimes(1);
    expect(document.querySelector('#save-users')?.disabled).toBe(true);
    expect(document.querySelector('#users-dirty')?.classList.contains('invisible')).toBe(true);
  });

  it('prompts, discards, and blocks unload using the dirty draft state', async () => {
    document.body.innerHTML = '<div id="app"><div id="admin-main-action-footer-host"></div></div>';
    const discardSpy = vi.fn(() => {
      data.settingsDirtyCheckers.general = () => false;
    });
    const saveSpy = vi.fn(async () => {
      data.settingsDirtyCheckers.general = () => false;
    });
    const data = {
      settingsDirtyCheckers: {
        general: () => true,
      },
      settingsSaveHandlers: {
        general: saveSpy,
      },
      settingsDiscardHandlers: {
        general: discardSpy,
      },
    };
    const promptUnsavedChanges = vi.fn(async () => 'discard');
    const controller = createAdminShellController({
      container: document.getElementById('app'),
      data,
      getMainTab: () => 'settings',
      getSubTab: () => 'general',
      promptUnsavedChanges,
    });

    expect(controller.hasUnsavedChanges()).toBe(true);

    controller.renderSharedActionFooter();
    const event = {
      preventDefault: vi.fn(),
      returnValue: undefined,
    };
    controller.handleBeforeUnload(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.returnValue).toBe('');

    expect(await controller.guardNavigation()).toBe(true);
    expect(promptUnsavedChanges).toHaveBeenCalledTimes(1);
    expect(discardSpy).toHaveBeenCalledTimes(1);

    await controller.handleSharedActionSave();
    controller.updateSharedActionFooter();

    expect(saveSpy).toHaveBeenCalledTimes(1);
  });
});
