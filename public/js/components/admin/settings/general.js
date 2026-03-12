import { apiFetch } from '../../../api.js';
import { setState } from '../../../store.js';

export function renderGeneralSettings(container, data) {
  const isActiveTab = () => container?.dataset?.settingsTab === 'general';
  const settingsState = data.generalSettings || (data.generalSettings = {
    loading: false,
    error: null,
    initialValues: {
      title: 'GrowChat',
      publicRegistration: true,
      defaultModelId: '',
    },
    currentValues: {
      title: 'GrowChat',
      publicRegistration: true,
      defaultModelId: '',
    },
    models: [],
    defaultModelLoaded: false,
    adminConfigLoaded: false,
    modelsInvalidateToken: null,
    dirtyFields: {
      title: false,
      publicRegistration: false,
      defaultModelId: false,
    },
  });

  if (data.modelsSettingsInvalidate && settingsState.modelsInvalidateToken !== data.modelsSettingsInvalidate) {
    settingsState.modelsInvalidateToken = data.modelsSettingsInvalidate;
    settingsState.models = [];
  }

  const isDirty = () => {
    return JSON.stringify(settingsState.initialValues) !== JSON.stringify(settingsState.currentValues);
  };

  const render = () => {
    if (!isActiveTab()) return;
    const dirty = isDirty();
    const isPublicRegOn = Boolean(settingsState.currentValues.publicRegistration);
    const knobTranslate = isPublicRegOn ? 'translateX(16px)' : 'translateX(0px)';

    container.innerHTML = `
      <div class="flex flex-col h-full min-h-0 animate-in fade-in duration-300 w-full">
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
              <div class="text-base font-medium text-gray-900 px-0.5">General</div>
              <hr class="border-gray-100/30 my-2" />
              
              <div class="py-2.5">
                <div class="text-xs font-medium mb-1">App Title</div>
                <input id="app-title" type="text" value="${settingsState.currentValues.title}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-400 placeholder-gray-400 cursor-not-allowed" placeholder="Set via deployment config" disabled>
                <div class="text-[10px] text-gray-400 mt-1">Managed in server configuration.</div>
              </div>

              <div class="py-2.5 flex items-center justify-between pr-2">
                <div class="text-xs font-medium">Public Registration</div>
                <button id="public-reg-toggle" aria-pressed="${isPublicRegOn}" class="relative inline-flex h-5 w-9 items-center shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isPublicRegOn ? 'bg-black' : 'bg-gray-200'}">
                  <span class="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out" style="transform: ${knobTranslate};"></span>
                </button>
              </div>
            </section>

            <section class="space-y-1 mt-6">
              <div class="text-base font-medium text-gray-900 px-0.5">Models</div>
              <hr class="border-gray-100/30 my-2" />
              
              <div class="py-2.5">
                <div class="text-xs font-medium mb-1">Default Model</div>
                <div class="relative">
                  <select id="default-model" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 appearance-none pr-8">
                    <option value="">Select a model</option>
                    ${settingsState.models.map((m) => `<option value="${m.id}" ${settingsState.currentValues.defaultModelId === m.id ? 'selected' : ''}>${m.name || m.id}</option>`).join('')}
                  </select>
                </div>
              </div>
            </section>

            <div id="settings-feedback" class="hidden mt-4 rounded-xl border px-4 py-3 text-sm"></div>
          </div>
        </div>

        <div class="shrink-0 flex items-center justify-between pt-4 pb-3 px-0.5 border-t border-gray-100 bg-white">
          ${dirty ? '<div class="text-xs text-amber-700 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-full">Unsaved changes</div>' : '<div></div>'}
          <button id="save-settings" class="px-5 py-1.5 text-sm font-medium transition rounded-full ${!dirty || settingsState.loading ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-black text-white hover:bg-gray-900'}" ${!dirty || settingsState.loading ? 'disabled' : ''}>
            ${settingsState.loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    `;

    bindEvents();
  };

  const bindEvents = () => {
    const regToggle = container.querySelector('#public-reg-toggle');
    const modelSelect = container.querySelector('#default-model');
    const saveBtn = container.querySelector('#save-settings');
    const feedback = container.querySelector('#settings-feedback');

    regToggle?.addEventListener('click', () => {
      settingsState.currentValues.publicRegistration = !settingsState.currentValues.publicRegistration;
      settingsState.dirtyFields.publicRegistration = true;
      render();
    });

    modelSelect?.addEventListener('change', (e) => {
      settingsState.currentValues.defaultModelId = e.target.value;
      settingsState.dirtyFields.defaultModelId = true;
      render();
    });

    saveBtn?.addEventListener('click', async () => {
      settingsState.loading = true;
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const nextDefault = settingsState.currentValues.defaultModelId || '';
      const prevDefault = settingsState.initialValues.defaultModelId || '';
      const shouldUpdateDefault = nextDefault !== prevDefault;

      const nextPublicReg = Boolean(settingsState.currentValues.publicRegistration);
      const prevPublicReg = Boolean(settingsState.initialValues.publicRegistration);
      const shouldUpdatePublicReg = nextPublicReg !== prevPublicReg;

      try {
        if (shouldUpdatePublicReg) {
          const res = await apiFetch('/api/admin/config', {
            method: 'PUT',
            body: JSON.stringify({ public_registration: nextPublicReg })
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.error || err?.message || 'Failed to update public registration');
          }

          settingsState.initialValues.publicRegistration = nextPublicReg;
          settingsState.dirtyFields.publicRegistration = false;
        }

        if (shouldUpdateDefault) {
          const res = await apiFetch('/api/users/me', {
            method: 'PUT',
            body: JSON.stringify({
              preferences: { defaultModelId: nextDefault || null }
            })
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.error || err?.message || 'Failed to save default model');
          }

          settingsState.initialValues.defaultModelId = nextDefault;
          settingsState.dirtyFields.defaultModelId = false;
          localStorage.setItem('defaultModelId', nextDefault);
          setState({ defaultModelId: nextDefault });
        }

        settingsState.loading = false;
        if (feedback) {
          if (shouldUpdateDefault && shouldUpdatePublicReg) {
            feedback.textContent = 'Settings saved successfully.';
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
        render();
      } catch (err) {
        settingsState.loading = false;
        if (feedback) {
          feedback.textContent = err?.message || 'Failed to save settings.';
          feedback.className = 'rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600';
          feedback.classList.remove('hidden');
          setTimeout(() => feedback.classList.add('hidden'), 3000);
        }
        render();
      }
    });
  };

  const updateButtons = () => {
    const dirty = isDirty();
    const saveBtn = container.querySelector('#save-settings');
    if (saveBtn) {
      saveBtn.disabled = !dirty || settingsState.loading;
    }
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
          if (isActiveTab()) render();
        }
      }
    } catch (err) {
      console.warn('Failed to load admin config', err);
    }
  };

  const loadDefaultModel = async () => {
    if (settingsState.defaultModelLoaded) return;
    settingsState.defaultModelLoaded = true;

    if (settingsState.dirtyFields.defaultModelId) return;

    const cached = localStorage.getItem('defaultModelId');
      if (cached) {
        if (settingsState.currentValues.defaultModelId !== cached) {
          settingsState.currentValues.defaultModelId = cached;
          settingsState.initialValues.defaultModelId = cached;
          if (isActiveTab()) render();
        }
        return;
      }

    try {
      const res = await apiFetch('/api/users/me');
      if (res.ok) {
        const data = await res.json();
        const defaultId = data?.user?.preferences?.defaultModelId || '';
        if (defaultId && settingsState.currentValues.defaultModelId !== defaultId) {
          settingsState.currentValues.defaultModelId = defaultId;
          settingsState.initialValues.defaultModelId = defaultId;
          localStorage.setItem('defaultModelId', defaultId);
          if (isActiveTab()) render();
        }
      }
    } catch (err) {
      console.warn('Failed to load default model for settings', err);
    }
  };

  render();
  loadModels();
  loadAdminConfig();
  loadDefaultModel();
}
