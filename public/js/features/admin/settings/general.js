import { apiFetch } from '../../../shared/api.js';
import { setState } from '../../../shared/store.js';
import {
  createGeneralSettingsState,
  getGeneralSettingsToggleState,
  isGeneralSettingsDirty,
} from './general-helpers.js';

export function renderGeneralSettings(container, data) {
  const isActiveTab = () => container?.dataset?.settingsTab === 'general';
  const settingsState = data.generalSettings || (data.generalSettings = createGeneralSettingsState());
  data.settingsDirtyCheckers = data.settingsDirtyCheckers || {};
  data.settingsSaveHandlers = data.settingsSaveHandlers || {};
  data.settingsDiscardHandlers = data.settingsDiscardHandlers || {};

  if (data.modelsSettingsInvalidate && settingsState.modelsInvalidateToken !== data.modelsSettingsInvalidate) {
    settingsState.modelsInvalidateToken = data.modelsSettingsInvalidate;
    settingsState.models = [];
  }

  const isDirty = () => isGeneralSettingsDirty(settingsState);
  data.settingsDirtyCheckers.general = isDirty;
  let registrationStatusBox = null;
  let modelBox = null;

  const updatePublicRegToggle = () => {
    const regToggle = container.querySelector('#public-reg-toggle');
    if (!regToggle) return;
    const toggleState = getGeneralSettingsToggleState(settingsState.currentValues.publicRegistration);
    regToggle.setAttribute('aria-pressed', toggleState.ariaPressed);
    regToggle.classList.toggle('bg-black', toggleState.isOn);
    regToggle.classList.toggle('bg-gray-200', !toggleState.isOn);
    const knob = regToggle.querySelector('span');
    if (knob) {
      knob.style.transform = toggleState.knobTransform;
    }
    const status = container.querySelector('#public-reg-status');
    if (status) status.textContent = toggleState.statusText;
    updateRegistrationStatusVisibility();
    updateButtons();
  };

  const updateRegistrationStatusVisibility = () => {
    const statusWrap = container.querySelector('#registration-status-wrap');
    if (!statusWrap) return;
    statusWrap.classList.toggle('hidden', !settingsState.currentValues.publicRegistration);
  };

  const renderSelectBox = (id, optionsHtml, { ariaLabel } = {}) => `
    <div class="relative rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm transition-colors focus-within:border-gray-300 focus-within:ring-1 focus-within:ring-gray-300">
      <select id="${id}" aria-label="${ariaLabel || id}" class="w-full appearance-none bg-transparent pr-8 text-sm text-gray-900 outline-none">
        ${optionsHtml}
      </select>
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" class="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-gray-400">
        <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.942l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z" clip-rule="evenodd" />
      </svg>
    </div>
  `;

  const render = () => {
    if (!isActiveTab()) return;
    const dirty = isDirty();
    const toggleState = getGeneralSettingsToggleState(settingsState.currentValues.publicRegistration);
    const useSharedActionFooter = Boolean(data.sharedActionFooter);

    container.innerHTML = `
        <div class="flex flex-col flex-1 min-h-0 animate-in fade-in duration-300 w-full">
        <div class="pt-0.5 pb-6 sticky top-0 z-10 bg-white">
          <div class="max-w-2xl mx-auto w-full flex justify-between items-center">
            <div class="flex items-center text-xl font-medium px-0.5 gap-2">
              <div class="flex-shrink-0 text-gray-900">General</div>
            </div>
          </div>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto scrollbar-hidden">
          <div class="max-w-2xl mx-auto w-full space-y-3 pb-6">
            <section class="space-y-1">
              <hr class="border-gray-100/30 my-2" />
              
              <div class="py-2.5">
                <div class="text-xs font-medium mb-1">App Title</div>
                <input id="app-title" type="text" value="${settingsState.currentValues.title}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-400 placeholder-gray-400 cursor-not-allowed" placeholder="Set via deployment config" disabled>
                <div class="text-[10px] text-gray-400 mt-1">Managed in server configuration.</div>
              </div>

              <div class="py-2.5 flex items-center justify-between pr-2">
                <div class="flex flex-col">
                  <div class="text-xs font-medium">Public Registration</div>
                  <div id="public-reg-status" class="text-[10px] text-gray-400">${toggleState.statusText}</div>
                </div>
                <button id="public-reg-toggle" aria-pressed="${toggleState.ariaPressed}" class="relative inline-flex h-5 w-9 items-center shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${toggleState.toggleClass}">
                  <span class="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out" style="transform: ${toggleState.knobTransform};"></span>
                </button>
              </div>

              <div id="registration-status-wrap" class="py-2.5 ${toggleState.isOn ? '' : 'hidden'}">
                <div class="text-xs font-medium mb-1">Registration Status</div>
                ${renderSelectBox('registration-status', `
                  <option value="active" ${settingsState.currentValues.registrationStatus === 'active' ? 'selected' : ''}>Active</option>
                  <option value="pending" ${settingsState.currentValues.registrationStatus !== 'active' ? 'selected' : ''}>Pending</option>
                `, { ariaLabel: 'Registration Status' })}
                <div id="registration-status-hint" class="text-[10px] text-gray-400 mt-1">Active lets users sign in immediately. Pending requires admin approval.</div>
              </div>
            </section>

            <section class="space-y-1 mt-6">
              <div class="text-base font-medium text-gray-900 px-0.5">Models</div>
              <hr class="border-gray-100/30 my-2" />
              
              <div class="py-2.5">
                <div class="text-xs font-medium mb-1">Global Default Model</div>
                ${renderSelectBox('default-model', `
                  <option value="">Select a model</option>
                  ${settingsState.models.map((m) => `<option value="${m.id}" ${settingsState.currentValues.defaultModelId === m.id ? 'selected' : ''}>${m.name || m.id}</option>`).join('')}
                `, { ariaLabel: 'Global Default Model' })}
                <div id="default-model-hint" class="text-[10px] text-amber-600 mt-1 hidden">Unsaved change</div>
              </div>
            </section>

            <div id="settings-feedback" class="hidden mt-4 rounded-xl border px-4 py-3 text-sm"></div>
          </div>
        </div>

        ${useSharedActionFooter ? '' : `
        <div class="shrink-0 flex items-center justify-between pt-4 pb-3 px-0.5 border-t border-gray-100 bg-white sticky bottom-0 z-10">
          <div id="settings-dirty" class="text-xs text-amber-700 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-full ${dirty ? '' : 'invisible'}">Unsaved changes</div>
          <button id="save-settings" class="ml-auto px-5 py-1.5 text-sm font-medium transition rounded-full ${!dirty || settingsState.loading ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-black text-white hover:bg-gray-900'}" ${!dirty || settingsState.loading ? 'disabled' : ''}>
            ${settingsState.loading ? 'Saving...' : 'Save'}
          </button>
        </div>`}
      </div>
    `;

    bindEvents();
  };

  const saveSettings = async () => {
    if (settingsState.loading) return;
    settingsState.loading = true;
    updateButtons();
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const feedback = container.querySelector('#settings-feedback');
    const nextDefault = settingsState.currentValues.defaultModelId || '';
    const prevDefault = settingsState.initialValues.defaultModelId || '';
    const shouldUpdateDefault = nextDefault !== prevDefault;

    const nextRegistrationStatus = settingsState.currentValues.registrationStatus || 'pending';
    const prevRegistrationStatus = settingsState.initialValues.registrationStatus || 'pending';
    const shouldUpdateRegistrationStatus = nextRegistrationStatus !== prevRegistrationStatus;

    const nextPublicReg = Boolean(settingsState.currentValues.publicRegistration);
    const prevPublicReg = Boolean(settingsState.initialValues.publicRegistration);
    const shouldUpdatePublicReg = nextPublicReg !== prevPublicReg;

    try {
      if (shouldUpdatePublicReg || shouldUpdateDefault || shouldUpdateRegistrationStatus) {
        const adminUpdates = {};
        if (shouldUpdatePublicReg) adminUpdates.public_registration = nextPublicReg;
        if (shouldUpdateRegistrationStatus) adminUpdates.public_registration_status = nextRegistrationStatus;
        if (shouldUpdateDefault) adminUpdates.default_model_id = nextDefault || null;

        const res = await apiFetch('/api/admin/config', {
          method: 'PUT',
          body: JSON.stringify(adminUpdates)
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || err?.message || 'Failed to update settings');
        }

        if (shouldUpdatePublicReg) {
          settingsState.initialValues.publicRegistration = nextPublicReg;
          settingsState.dirtyFields.publicRegistration = false;
        }

        if (shouldUpdateRegistrationStatus) {
          settingsState.initialValues.registrationStatus = nextRegistrationStatus;
          settingsState.dirtyFields.registrationStatus = false;
        }

        if (shouldUpdateDefault) {
          settingsState.initialValues.defaultModelId = nextDefault;
          settingsState.dirtyFields.defaultModelId = false;
          setState({ globalDefaultModelId: nextDefault || null });
        }
      }

      settingsState.loading = false;
      if (feedback) {
        if ((shouldUpdateDefault && shouldUpdatePublicReg) || shouldUpdateRegistrationStatus && (shouldUpdateDefault || shouldUpdatePublicReg)) {
          feedback.textContent = 'Settings saved successfully.';
        } else if (shouldUpdateRegistrationStatus) {
          feedback.textContent = 'Registration status saved.';
        } else if (shouldUpdateDefault) {
          feedback.textContent = 'Default model saved.';
        } else if (shouldUpdatePublicReg) {
          feedback.textContent = 'Public registration updated.';
        } else {
          feedback.textContent = 'No changes to save.';
        }
        feedback.className = 'rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-600';
        feedback.classList.remove('hidden');
        setTimeout(() => feedback.classList.add('hidden'), 3000);
      }
      updateButtons();
    } catch (err) {
      settingsState.loading = false;
      if (feedback) {
        feedback.textContent = err?.message || 'Failed to save settings.';
        feedback.className = 'rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600';
        feedback.classList.remove('hidden');
        setTimeout(() => feedback.classList.add('hidden'), 3000);
      }
      updateButtons();
      throw err;
    }
  };

  data.settingsSaveHandlers.general = saveSettings;
  data.settingsDiscardHandlers.general = () => {
    settingsState.currentValues = { ...settingsState.initialValues };
    settingsState.dirtyFields = {
      title: false,
      publicRegistration: false,
      registrationStatus: false,
      defaultModelId: false,
    };
    if (isActiveTab()) render();
  };

  const bindEvents = () => {
    const regToggle = container.querySelector('#public-reg-toggle');
    const registrationStatusSelect = container.querySelector('#registration-status');
    const modelSelect = container.querySelector('#default-model');
    const saveBtn = container.querySelector('#save-settings');
    const feedback = container.querySelector('#settings-feedback');
    registrationStatusBox = container.querySelector('#registration-status')?.parentElement;
    modelBox = container.querySelector('#default-model')?.parentElement;

    regToggle?.addEventListener('click', () => {
      settingsState.currentValues.publicRegistration = !settingsState.currentValues.publicRegistration;
      settingsState.dirtyFields.publicRegistration = true;
      updatePublicRegToggle();
      updateButtons();
    });

    modelSelect?.addEventListener('change', (e) => {
      settingsState.currentValues.defaultModelId = e.target.value;
      settingsState.dirtyFields.defaultModelId = true;
      updateButtons();
    });

    registrationStatusSelect?.addEventListener('change', (e) => {
      settingsState.currentValues.registrationStatus = e.target.value;
      settingsState.dirtyFields.registrationStatus = true;
      updateButtons();
    });

    saveBtn?.addEventListener('click', async () => {
      await saveSettings();
    });
  };

  const updateButtons = () => {
    const dirty = isDirty();
    const dirtyBadge = container.querySelector('#settings-dirty');
    const saveBtn = container.querySelector('#save-settings');
    const registrationStatusSelect = container.querySelector('#registration-status');
    const registrationStatusHint = container.querySelector('#registration-status-hint');
    const modelSelect = container.querySelector('#default-model');
    const modelHint = container.querySelector('#default-model-hint');
    const modelDirty = settingsState.currentValues.defaultModelId !== settingsState.initialValues.defaultModelId;
    const registrationStatusDirty = settingsState.currentValues.registrationStatus !== settingsState.initialValues.registrationStatus;
    if (dirtyBadge) {
      dirtyBadge.classList.toggle('invisible', !dirty);
    }
    if (registrationStatusSelect) {
      registrationStatusSelect.classList.toggle('bg-amber-50', registrationStatusDirty);
      registrationStatusSelect.classList.toggle('text-amber-700', registrationStatusDirty);
    }
    if (registrationStatusBox) {
      registrationStatusBox.classList.toggle('border-amber-200', registrationStatusDirty);
      registrationStatusBox.classList.toggle('bg-amber-50/60', registrationStatusDirty);
    }
    if (registrationStatusHint) {
      registrationStatusHint.classList.toggle('text-amber-600', registrationStatusDirty);
    }
    if (modelSelect) {
      modelSelect.classList.toggle('bg-amber-50', modelDirty);
      modelSelect.classList.toggle('text-amber-700', modelDirty);
    }
    if (modelBox) {
      modelBox.classList.toggle('border-amber-200', modelDirty);
      modelBox.classList.toggle('bg-amber-50/60', modelDirty);
    }
    if (modelHint) {
      modelHint.classList.toggle('hidden', !modelDirty);
    }
    if (saveBtn) {
      saveBtn.disabled = !dirty || settingsState.loading;
      saveBtn.classList.toggle('bg-gray-200', !dirty || settingsState.loading);
      saveBtn.classList.toggle('text-gray-400', !dirty || settingsState.loading);
      saveBtn.classList.toggle('cursor-not-allowed', !dirty || settingsState.loading);
      saveBtn.classList.toggle('bg-black', dirty && !settingsState.loading);
      saveBtn.classList.toggle('text-white', dirty && !settingsState.loading);
      saveBtn.classList.toggle('hover:bg-gray-900', dirty && !settingsState.loading);
      saveBtn.textContent = settingsState.loading ? 'Saving...' : 'Save';
    }
    data.requestSettingsFooterSync?.();
  };

  const loadModels = async () => {
    if (settingsState.models.length > 0) return;
    try {
      const res = await apiFetch('/api/models');
      if (res.ok) {
        const payload = await res.json();
        settingsState.models = (payload.models || []).slice().sort((a, b) => {
          const aLabel = String(a?.name || a?.id || '').toLowerCase();
          const bLabel = String(b?.name || b?.id || '').toLowerCase();
          return aLabel.localeCompare(bLabel);
        });
        if (isActiveTab()) render();
      }
    } catch (err) {
      console.warn('Failed to load models for settings', err);
    }
  };

  const loadAdminConfig = async () => {
    if (settingsState.adminConfigLoaded) return;
    settingsState.adminConfigLoaded = true;
    try {
      const res = await apiFetch('/api/admin/config');
      if (res.ok) {
        const payload = await res.json();
        const next = Boolean(payload?.public_registration);
        if (!settingsState.dirtyFields.publicRegistration) {
          settingsState.currentValues.publicRegistration = next;
          settingsState.initialValues.publicRegistration = next;
        }
        const registrationStatusRaw = String(payload?.public_registration_status || 'pending').trim().toLowerCase();
        const registrationStatus = registrationStatusRaw === 'active' ? 'active' : 'pending';
        if (!settingsState.dirtyFields.registrationStatus) {
          settingsState.currentValues.registrationStatus = registrationStatus;
          settingsState.initialValues.registrationStatus = registrationStatus;
        }
        const defaultId = payload?.default_model_id || '';
        if (!settingsState.dirtyFields.defaultModelId) {
          settingsState.currentValues.defaultModelId = defaultId;
          settingsState.initialValues.defaultModelId = defaultId;
        }
        if (isActiveTab()) render();
      }
    } catch (err) {
      console.warn('Failed to load admin config', err);
    }
  };

  render();
  loadModels();
  loadAdminConfig();
}
