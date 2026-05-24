import { apiFetch } from '../../../shared/api.js';
import { escapeHtml } from '../../../shared/utils.js';
import {
  showSettingsFeedback,
  renderSettingsSelectBox,
  updateSettingsToggle,
} from '../../../shared/utils/admin-settings-helpers.js';
import { setState } from '../../../shared/store.js';
import { broadcastModelsInvalidation } from '../../../shared/utils/model-sync.js';
import { createGeneralSettingsState, getGeneralSettingsToggleState } from './general-helpers.js';

export function renderGeneralSettings(container, data) {
  const isActiveTab = () => container?.dataset?.settingsTab === 'general';
  const settingsState =
    data.generalSettings || (data.generalSettings = createGeneralSettingsState());

  if (
    data.modelsSettingsInvalidate &&
    settingsState.modelsInvalidateToken !== data.modelsSettingsInvalidate
  ) {
    settingsState.modelsInvalidateToken = data.modelsSettingsInvalidate;
    settingsState.models = [];
  }

  let registrationStatusBox = null;
  let modelBox = null;

  const showFeedback = (message, isError = false) =>
    showSettingsFeedback(container, message, isError);

  const updatePublicRegToggle = () =>
    updateSettingsToggle(
      container,
      'public-reg-toggle',
      'public-reg-status',
      settingsState.currentValues.publicRegistration,
      updateRegistrationStatusVisibility
    );

  const updateRegistrationStatusVisibility = () => {
    const statusWrap = container.querySelector('#registration-status-wrap');
    if (!statusWrap) return;
    statusWrap.classList.toggle('hidden', !settingsState.currentValues.publicRegistration);
  };

  const renderSelectBox = (id, optionsHtml, opts) => renderSettingsSelectBox(id, optionsHtml, opts);

  const render = () => {
    if (!isActiveTab()) return;
    const toggleState = getGeneralSettingsToggleState(
      settingsState.currentValues.publicRegistration
    );

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
                <input id="app-title" type="text" value="${settingsState.currentValues.title}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-700 placeholder-gray-700 cursor-not-allowed" placeholder="Set via deployment config" disabled>
                <div class="text-[10px] text-gray-700 mt-1">Managed in server configuration.</div>
              </div>

              <div class="py-2.5 flex items-center justify-between pr-2">
                <div class="flex flex-col">
                  <div class="text-xs font-medium">Public Registration</div>
                  <div id="public-reg-status" class="text-[10px] text-gray-700">${toggleState.statusText}</div>
                </div>
                <button id="public-reg-toggle" aria-pressed="${toggleState.ariaPressed}" class="relative inline-flex h-6 w-11 sm:h-5 sm:w-9 items-center shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${toggleState.toggleClass}">
                  <span class="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${toggleState.knobClass}"></span>
                </button>
              </div>

              <div id="registration-status-wrap" class="py-2.5 ${toggleState.isOn ? '' : 'hidden'}">
                <div class="text-xs font-medium mb-1">Registration Status</div>
                ${renderSelectBox(
                  'registration-status',
                  `
                  <option value="active" ${settingsState.currentValues.registrationStatus === 'active' ? 'selected' : ''}>Active</option>
                  <option value="pending" ${settingsState.currentValues.registrationStatus !== 'active' ? 'selected' : ''}>Pending</option>
                `,
                  { ariaLabel: 'Registration Status' }
                )}
                <div id="registration-status-hint" class="text-[10px] text-gray-700 mt-1">Active lets users sign in immediately. Pending requires admin approval.</div>
              </div>
            </section>

            <section class="space-y-1 mt-6">
              <div class="text-base font-medium text-gray-900 px-0.5">Models</div>
              <hr class="border-gray-100/30 my-2" />

              <div class="py-2.5">
                <div class="text-xs font-medium mb-1">Global Default Model</div>
                ${renderSelectBox(
                  'default-model',
                  `
                  <option value="">Select a model</option>
                  ${settingsState.models.map((m) => `<option value="${m.id}" ${settingsState.currentValues.defaultModelId === m.id ? 'selected' : ''}>${escapeHtml(m.name || m.id)}</option>`).join('')}
                `,
                  { ariaLabel: 'Global Default Model' }
                )}
              </div>
            </section>

            <div id="settings-feedback" class="hidden mt-4 rounded-xl border px-4 py-3 text-sm"></div>
          </div>
        </div>
      </div>
    `;

    bindEvents();
  };

  const updatePublicRegistration = async (newValue) => {
    const prevValue = settingsState.currentValues.publicRegistration;
    settingsState.currentValues.publicRegistration = newValue;
    updatePublicRegToggle();

    try {
      const res = await apiFetch('/api/admin/config', {
        method: 'PUT',
        body: JSON.stringify({ public_registration: newValue }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || err?.message || 'Failed to update public registration');
      }

      settingsState.initialValues.publicRegistration = newValue;
      showFeedback('Public registration updated.');
    } catch (err) {
      settingsState.currentValues.publicRegistration = prevValue;
      updatePublicRegToggle();
      showFeedback(err?.message || 'Failed to update public registration.', true);
    }
  };

  const updateRegistrationStatus = async (newValue) => {
    const prevValue = settingsState.currentValues.registrationStatus;
    settingsState.currentValues.registrationStatus = newValue;
    updateModelAndRegistrationHighlight();

    try {
      const res = await apiFetch('/api/admin/config', {
        method: 'PUT',
        body: JSON.stringify({ public_registration_status: newValue }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || err?.message || 'Failed to update registration status');
      }

      settingsState.initialValues.registrationStatus = newValue;
      showFeedback('Registration status saved.');
    } catch (err) {
      settingsState.currentValues.registrationStatus = prevValue;
      updateModelAndRegistrationHighlight();
      showFeedback(err?.message || 'Failed to update registration status.', true);
    }
  };

  const updateDefaultModel = async (newValue) => {
    const prevValue = settingsState.currentValues.defaultModelId;
    settingsState.currentValues.defaultModelId = newValue;
    updateModelAndRegistrationHighlight();

    try {
      const res = await apiFetch('/api/admin/config', {
        method: 'PUT',
        body: JSON.stringify({ default_model_id: newValue || null }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || err?.message || 'Failed to update default model');
      }

      settingsState.initialValues.defaultModelId = newValue;
      setState({ globalDefaultModelId: newValue || null });
      broadcastModelsInvalidation();
      showFeedback('Default model saved.');
    } catch (err) {
      settingsState.currentValues.defaultModelId = prevValue;
      updateModelAndRegistrationHighlight();
      showFeedback(err?.message || 'Failed to update default model.', true);
    }
  };

  const updateModelAndRegistrationHighlight = () => {
    const registrationStatusSelect = container.querySelector('#registration-status');
    const modelSelect = container.querySelector('#default-model');
    const modelDirty =
      settingsState.currentValues.defaultModelId !== settingsState.initialValues.defaultModelId;
    const registrationStatusDirty =
      settingsState.currentValues.registrationStatus !==
      settingsState.initialValues.registrationStatus;

    if (registrationStatusSelect) {
      registrationStatusSelect.classList.toggle('bg-amber-50', registrationStatusDirty);
      registrationStatusSelect.classList.toggle('text-amber-700', registrationStatusDirty);
    }
    if (registrationStatusBox) {
      registrationStatusBox.classList.toggle('border-amber-200', registrationStatusDirty);
      registrationStatusBox.classList.toggle('bg-amber-50/60', registrationStatusDirty);
    }
    if (modelSelect) {
      modelSelect.classList.toggle('bg-amber-50', modelDirty);
      modelSelect.classList.toggle('text-amber-700', modelDirty);
    }
    if (modelBox) {
      modelBox.classList.toggle('border-amber-200', modelDirty);
      modelBox.classList.toggle('bg-amber-50/60', modelDirty);
    }
  };

  const bindEvents = () => {
    const regToggle = container.querySelector('#public-reg-toggle');
    const registrationStatusSelect = container.querySelector('#registration-status');
    const modelSelect = container.querySelector('#default-model');
    registrationStatusBox = container.querySelector('#registration-status')?.parentElement;
    modelBox = container.querySelector('#default-model')?.parentElement;

    regToggle?.addEventListener('click', () => {
      updatePublicRegistration(!settingsState.currentValues.publicRegistration);
    });

    modelSelect?.addEventListener('change', (e) => {
      updateDefaultModel(e.target.value);
    });

    registrationStatusSelect?.addEventListener('change', (e) => {
      updateRegistrationStatus(e.target.value);
    });
  };

  const loadModels = async () => {
    if (settingsState.models.length > 0) return;
    try {
      const res = await apiFetch('/api/models?scope=global');
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
        settingsState.currentValues.publicRegistration = next;
        settingsState.initialValues.publicRegistration = next;

        const registrationStatusRaw = String(payload?.public_registration_status || 'pending')
          .trim()
          .toLowerCase();
        const registrationStatus = registrationStatusRaw === 'active' ? 'active' : 'pending';
        settingsState.currentValues.registrationStatus = registrationStatus;
        settingsState.initialValues.registrationStatus = registrationStatus;

        const defaultId = payload?.default_model_id || '';
        settingsState.currentValues.defaultModelId = defaultId;
        settingsState.initialValues.defaultModelId = defaultId;

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
