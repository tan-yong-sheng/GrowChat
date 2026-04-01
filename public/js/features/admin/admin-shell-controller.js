import { discardAdminDraft, isAdminDraftDirty, saveAdminDraft } from './admin-draft-state.js';
import { createAdminModalShell } from './modal-shell.js';

export function getAdminSharedActionFooterConfig(mainTab, subTab) {
  if (mainTab === 'users' && subTab !== 'policies') {
    return {
      footerId: 'users-action-footer',
      dirtyId: 'users-dirty',
      saveId: 'save-users',
      buttonLabel: 'Save',
      dirtyLabel: 'Unsaved changes',
    };
  }

  if ((mainTab === 'settings' || mainTab === 'system') && subTab !== 'policies') {
    if (subTab === 'general') {
      return {
        footerId: mainTab === 'system' ? 'system-action-footer' : 'settings-action-footer',
        dirtyId: mainTab === 'system' ? 'system-dirty' : 'settings-dirty',
        saveId: mainTab === 'system' ? 'save-system' : 'save-settings',
        buttonLabel: 'Save',
        dirtyLabel: 'Unsaved changes',
      };
    }

    if (subTab === 'connections') {
      return {
        footerId: 'connections-action-footer',
        dirtyId: 'connections-dirty',
        saveId: 'save-connections',
        buttonLabel: 'Save',
        dirtyLabel: 'Unsaved changes',
      };
    }

    if (subTab === 'models') {
      return {
        footerId: 'models-action-footer',
        dirtyId: 'models-dirty',
        saveId: 'save-models-top',
        buttonLabel: 'Save',
        dirtyLabel: 'Unsaved changes',
      };
    }

    if (subTab === 'integrations') {
      return {
        footerId: 'integrations-action-footer',
        dirtyId: 'integrations-dirty',
        saveId: 'save-integrations',
        buttonLabel: 'Save',
        dirtyLabel: 'Unsaved changes',
      };
    }
  }

  return null;
}

function createUnsavedChangesPrompt() {
  return () => new Promise((resolve) => {
    const existing = document.querySelector('#admin-unsaved-modal');
    if (existing) existing.remove();

    let resolved = false;
    const finish = (value) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
    };

    const { modal, close } = createAdminModalShell({
      preset: 'standard',
      title: 'Unsaved changes',
      subtitle: 'You have unsaved changes. Save them before leaving this page?',
      body: '<div class="h-1"></div>',
      footer: `
        <button id="unsaved-cancel" class="px-4 py-2 rounded-full text-sm text-gray-500 hover:bg-gray-50">Cancel</button>
        <button id="unsaved-discard" class="px-4 py-2 rounded-full text-sm text-gray-600 hover:bg-gray-100">Discard</button>
        <button id="unsaved-save" class="px-4 py-2 rounded-full text-sm text-white bg-black hover:bg-gray-900">Save</button>
      `,
      closeClass: 'hidden',
      shellClass: 'relative z-10 w-full max-w-md rounded-3xl bg-white shadow-xl border border-gray-100 overflow-hidden flex flex-col',
      headerClass: 'px-6 pt-6 pb-3 shrink-0',
      bodyClass: 'px-6 pb-2',
      footerClass: 'px-6 pb-6 flex items-center justify-end gap-2',
      overlayClass: 'absolute inset-0 bg-black/30 backdrop-blur-sm z-0',
      zIndex: 200,
      rootAttrs: 'id="admin-unsaved-modal"',
      onClose: (reason) => {
        if (reason === 'dismiss') {
          finish('cancel');
        }
      },
    });

    modal.querySelector('#unsaved-cancel')?.addEventListener('click', () => {
      close('cancel');
      finish('cancel');
    });
    modal.querySelector('#unsaved-discard')?.addEventListener('click', () => {
      close('discard');
      finish('discard');
    });
    modal.querySelector('#unsaved-save')?.addEventListener('click', () => {
      close('save');
      finish('save');
    });
  });
}

export function createAdminShellController({
  container,
  data,
  getMainTab,
  getSubTab,
  promptUnsavedChanges = createUnsavedChangesPrompt(),
  isDraftDirty = isAdminDraftDirty,
  saveDraft = saveAdminDraft,
  discardDraft = discardAdminDraft,
  getFooterConfig = getAdminSharedActionFooterConfig,
} = {}) {
  const hasUnsavedChanges = () => isDraftDirty(data, getMainTab(), getSubTab());

  const guardNavigation = async () => {
    const mainTab = getMainTab();
    if (mainTab !== 'settings' && mainTab !== 'users') return true;
    if (!hasUnsavedChanges()) return true;

    const action = await promptUnsavedChanges();
    if (action === 'cancel') return false;
    if (action === 'discard') {
      discardDraft(data, getMainTab(), getSubTab());
      return true;
    }
    if (action === 'save') {
      try {
        const stillDirty = await saveDraft(data, getMainTab(), getSubTab());
        return !stillDirty;
      } catch {
        return false;
      }
    }
    return true;
  };

  const flushOpenModalDraft = async () => {
    const modalSelectors = [
      '#edit-connection-modal:not(.hidden) #save-modal',
      '#connection-acl-modal:not(.hidden) #connection-acl-save-btn',
      '#model-acl-modal:not(.hidden) #model-acl-save-btn',
      '#tool-server-acl-modal:not(.hidden) #tool-server-acl-save-btn',
    ];
    const modalSaveBtn = document.querySelector(modalSelectors.join(', '));
    if (!modalSaveBtn || modalSaveBtn.disabled) return true;

    modalSaveBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    const stillOpenModal = document.querySelector([
      '#edit-connection-modal:not(.hidden)',
      '#connection-acl-modal:not(.hidden)',
      '#model-acl-modal:not(.hidden)',
      '#tool-server-acl-modal:not(.hidden)',
    ].join(', '));
    return !stillOpenModal;
  };

  const handleBeforeUnload = (event) => {
    if (!hasUnsavedChanges()) return;
    event.preventDefault();
    event.returnValue = '';
    return '';
  };

  const renderSharedActionFooter = () => {
    const footerHostEl = container.querySelector('#admin-main-action-footer-host');
    if (!footerHostEl) return;

    const existing = footerHostEl.querySelector('[data-admin-main-action-footer]');
    if (existing) existing.remove();

    const mainTab = getMainTab();
    const subTab = getSubTab();
    const config = getFooterConfig(mainTab, subTab);
    if (!config) return;

    const dirtyFn = mainTab === 'settings' || mainTab === 'system'
      ? data.settingsDirtyCheckers?.[subTab]
      : data.usersDirtyCheckers?.[subTab];
    const saveFn = mainTab === 'settings' || mainTab === 'system'
      ? data.settingsSaveHandlers?.[subTab]
      : data.usersSaveHandlers?.[subTab];
    const dirty = typeof dirtyFn === 'function' ? dirtyFn() : false;
    const saving = mainTab === 'settings' || mainTab === 'system'
      ? Boolean(
        (subTab === 'general' && data.generalSettings?.loading)
        || (subTab === 'connections' && data.connectionsSettings?.saving)
        || (subTab === 'models' && data.modelsSettings?.saving)
        || (subTab === 'integrations' && data.integrationsSettings?.saving)
      )
      : false;
    const canSave = dirty && typeof saveFn === 'function' && !saving;

    const footer = document.createElement('div');
    footer.dataset.adminMainActionFooter = config.footerId;
    footer.className = 'flex w-full items-center justify-between pt-4 pb-3 px-0.5 border-t border-gray-100 bg-white sticky bottom-0 z-10';
    footer.style.zIndex = '190';
    footer.innerHTML = `
      <div id="${config.dirtyId}" class="text-xs text-amber-700 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-full ${dirty ? '' : 'invisible'}">${config.dirtyLabel}</div>
      <button id="${config.saveId}" class="ml-auto px-5 py-1.5 text-sm font-medium transition rounded-full ${canSave ? 'bg-black text-white hover:bg-gray-900' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}" ${canSave ? '' : 'disabled'}>
        ${saving ? 'Saving...' : 'Save'}
      </button>
    `;

    footerHostEl.appendChild(footer);
  };

  const updateSharedActionFooter = () => {
    const mainTab = getMainTab();
    const subTab = getSubTab();
    const config = getFooterConfig(mainTab, subTab);
    const footer = container.querySelector('#admin-main-action-footer-host [data-admin-main-action-footer]');
    if (!config) {
      if (footer) footer.remove();
      return;
    }

    if (!footer) {
      renderSharedActionFooter();
      return;
    }

    const dirtyFn = mainTab === 'settings' || mainTab === 'system'
      ? data.settingsDirtyCheckers?.[subTab]
      : data.usersDirtyCheckers?.[subTab];
    const saveFn = mainTab === 'settings' || mainTab === 'system'
      ? data.settingsSaveHandlers?.[subTab]
      : data.usersSaveHandlers?.[subTab];
    const dirty = typeof dirtyFn === 'function' ? dirtyFn() : false;
    const saving = mainTab === 'settings' || mainTab === 'system'
      ? Boolean(
        (subTab === 'general' && data.generalSettings?.loading)
        || (subTab === 'connections' && data.connectionsSettings?.saving)
        || (subTab === 'models' && data.modelsSettings?.saving)
        || (subTab === 'integrations' && data.integrationsSettings?.saving)
      )
      : false;
    const canSave = dirty && typeof saveFn === 'function' && !saving;

    footer.id = config.footerId;
    footer.dataset.adminMainActionFooter = config.footerId;
    footer.innerHTML = `
      <div id="${config.dirtyId}" class="text-xs text-amber-700 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-full ${dirty ? '' : 'invisible'}">${config.dirtyLabel}</div>
      <button id="${config.saveId}" class="ml-auto px-5 py-1.5 text-sm font-medium transition rounded-full ${canSave ? 'bg-black text-white hover:bg-gray-900' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}" ${canSave ? '' : 'disabled'}>
        ${saving ? 'Saving...' : 'Save'}
      </button>
    `;
  };

  const handleSharedActionSave = async () => {
    const mainTab = getMainTab();
    const subTab = getSubTab();
    const saveFn = mainTab === 'settings' || mainTab === 'system'
      ? data.settingsSaveHandlers?.[subTab]
      : data.usersSaveHandlers?.[subTab];
    if (typeof saveFn !== 'function') return false;
    const modalCommitted = await flushOpenModalDraft();
    if (!modalCommitted) return false;
    await saveDraft(data, mainTab, subTab);
    updateSharedActionFooter();
    return true;
  };

  return {
    hasUnsavedChanges,
    guardNavigation,
    handleBeforeUnload,
    renderSharedActionFooter,
    updateSharedActionFooter,
    handleSharedActionSave,
  };
}
