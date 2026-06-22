import { apiFetch } from '../../../shared/api.js';
import {
  showSettingsFeedback,
  renderSettingsSelectBox,
  updateSettingsToggle,
  getSettingsToggleState,
  updateAdminConfig,
} from '../../../shared/utils/admin-settings-helpers.js';

export function renderRegistrationSettings(container, data) {
  const isActiveTab = () => container?.dataset?.settingsTab === 'registration';

  const settingsState =
    data.registrationSettings ||
    (data.registrationSettings = {
      publicRegistration: true,
      registrationStatus: 'pending',
      requireEmailVerification: false,
      adminConfigLoaded: false,
    });

  const showFeedback = (message, isError = false) =>
    showSettingsFeedback(container, message, isError);

  const getToggleState = getSettingsToggleState;

  const updatePublicRegToggle = () =>
    updateSettingsToggle({
      container,
      toggleId: 'public-reg-toggle',
      statusId: 'public-reg-status',
      isOn: settingsState.publicRegistration,
      updateVisibility: updateRegistrationStatusVisibility,
    });

  const updateRegistrationStatusVisibility = () => {
    const statusWrap = container.querySelector('#registration-status-wrap');
    if (!statusWrap) return;
    statusWrap.classList.toggle('hidden', !settingsState.publicRegistration);
  };

  const renderSelectBox = (id, optionsHtml, opts) => renderSettingsSelectBox(id, optionsHtml, opts);

  const render = () => {
    if (!isActiveTab()) return;

    const regToggleState = getToggleState(settingsState.publicRegistration);
    const verifyToggleState = getToggleState(settingsState.requireEmailVerification);

    container.innerHTML = `
			<div class="flex flex-col flex-1 min-h-0 animate-in fade-in duration-300 w-full">
				<div class="pt-0.5 pb-6 bg-white">
					<div class="max-w-2xl mx-auto w-full flex justify-between items-center">
						<div class="flex items-center text-xl font-medium px-0.5 gap-2">
							<div class="flex-shrink-0 text-gray-900">Registration</div>
						</div>
					</div>
				</div>
				<div class="flex-1 min-h-0">
					<div class="max-w-2xl mx-auto w-full space-y-3 pb-6">
						<section class="space-y-1">
							<hr class="border-gray-100/30 my-2" />
							<div class="text-base font-medium text-gray-900 py-2">Public Registration</div>
							<div class="py-2.5 flex items-center justify-between pr-2">
								<div class="flex flex-col">
									<div class="text-xs font-medium">Allow New Signups</div>
									<div id="public-reg-status" class="text-[10px] text-gray-700">${regToggleState.statusText}</div>
								</div>
								<button id="public-reg-toggle" aria-pressed="${regToggleState.ariaPressed}" class="relative inline-flex h-6 w-11 sm:h-5 sm:w-9 items-center shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${regToggleState.toggleClass}">
									<span class="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${regToggleState.isOn ? 'translate-x-4' : 'translate-x-0'}"></span>
								</button>
							</div>
							<div id="registration-status-wrap" class="py-2.5 ${regToggleState.isOn ? '' : 'hidden'}">
								<div class="text-xs font-medium mb-1">Registration Status</div>
								${renderSelectBox(
                  'registration-status',
                  `
									<option value="active" ${settingsState.registrationStatus === 'active' ? 'selected' : ''}>Active — immediate access</option>
									<option value="pending" ${settingsState.registrationStatus !== 'active' ? 'selected' : ''}>Pending — admin approval required</option>
								`,
                  { ariaLabel: 'Registration Status' }
                )}
								<div class="text-[10px] text-gray-700 mt-1">Active lets users sign in immediately. Pending requires admin approval.</div>
							</div>
						</section>
						<section class="space-y-1 mt-6">
							<hr class="border-gray-100/30 my-2" />
							<div class="text-base font-medium text-gray-900 py-2">Authentication</div>
							<div class="py-2">
								<div class="text-xs font-medium mb-2">Email Verification</div>
								<div class="flex items-center gap-3">
									<button id="require-email-verification" type="button" role="switch" aria-pressed="${verifyToggleState.ariaPressed}" class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${verifyToggleState.toggleClass}">
										<span class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${verifyToggleState.isOn ? 'translate-x-5' : 'translate-x-0'}"></span>
									</button>
									<span class="text-sm text-gray-700">Require email verification</span>
								</div>
								<div class="text-[10px] text-gray-600 mt-1">New users must verify their email before accessing the app. Requires Resend.</div>
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
    const prevValue = settingsState.publicRegistration;
    await updateAdminConfig({
      apiFetch,
      payload: { public_registration: newValue },
      successMessage: 'Public registration updated.',
      errorPrefix: 'public registration',
      showFeedback,
      onOptimisticUpdate: () => {
        settingsState.publicRegistration = newValue;
        updatePublicRegToggle();
      },
      onRollback: () => {
        settingsState.publicRegistration = prevValue;
        updatePublicRegToggle();
      },
      onCommit: () => {
        settingsState._initialPublicRegistration = newValue;
      },
    });
  };

  const updateRegistrationStatus = async (newValue) => {
    const prevValue = settingsState.registrationStatus;
    await updateAdminConfig({
      apiFetch,
      payload: { public_registration_status: newValue },
      successMessage: 'Registration status saved.',
      errorPrefix: 'registration status',
      showFeedback,
      onOptimisticUpdate: () => {
        settingsState.registrationStatus = newValue;
        updateHighlights();
      },
      onRollback: () => {
        settingsState.registrationStatus = prevValue;
        updateHighlights();
      },
      onCommit: () => {
        settingsState._initialRegistrationStatus = newValue;
      },
    });
  };

  const updateEmailVerification = async (newValue) => {
    const prevValue = settingsState.requireEmailVerification;
    settingsState.requireEmailVerification = newValue;
    render();
    try {
      const res = await apiFetch('/api/admin/config', {
        method: 'PUT',
        body: JSON.stringify({ require_email_verification: newValue }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || err?.message || 'Failed to update email verification');
      }
      settingsState._initialRequireEmailVerification = newValue;
      showFeedback('Email verification setting saved.');
    } catch (err) {
      settingsState.requireEmailVerification = prevValue;
      render();
      showFeedback(err?.message || 'Failed to update email verification.', true);
    }
  };

  const updateHighlights = () => {
    const registrationStatusSelect = container.querySelector('#registration-status');
    const registrationStatusDirty =
      settingsState.registrationStatus !== settingsState._initialRegistrationStatus;
    if (registrationStatusSelect) {
      registrationStatusSelect.classList.toggle('bg-amber-50', registrationStatusDirty);
      registrationStatusSelect.classList.toggle('text-amber-700', registrationStatusDirty);
    }
  };

  const bindEvents = () => {
    const regToggle = container.querySelector('#public-reg-toggle');
    const registrationStatusSelect = container.querySelector('#registration-status');
    const verifyToggle = container.querySelector('#require-email-verification');

    regToggle?.addEventListener('click', () => {
      updatePublicRegistration(!settingsState.publicRegistration);
    });

    registrationStatusSelect?.addEventListener('change', (e) => {
      updateRegistrationStatus(e.target.value);
    });

    verifyToggle?.addEventListener('click', () => {
      const isOn = verifyToggle.getAttribute('aria-pressed') === 'true';
      updateEmailVerification(!isOn);
    });
  };

  const loadConfig = async () => {
    if (settingsState.adminConfigLoaded) return;
    settingsState.adminConfigLoaded = true;
    try {
      const res = await apiFetch('/api/admin/config');
      if (res.ok) {
        const payload = await res.json();
        settingsState.publicRegistration = Boolean(payload?.public_registration);
        settingsState._initialPublicRegistration = settingsState.publicRegistration;

        const registrationStatusRaw = String(payload?.public_registration_status || 'pending')
          .trim()
          .toLowerCase();
        settingsState.registrationStatus =
          registrationStatusRaw === 'active' ? 'active' : 'pending';
        settingsState._initialRegistrationStatus = settingsState.registrationStatus;

        settingsState.requireEmailVerification = Boolean(payload?.require_email_verification);
        settingsState._initialRequireEmailVerification = settingsState.requireEmailVerification;

        if (isActiveTab()) render();
      }
    } catch (err) {
      console.warn('Failed to load registration config', err);
    }
  };

  render();
  loadConfig();
}
