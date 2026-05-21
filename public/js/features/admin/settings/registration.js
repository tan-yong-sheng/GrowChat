import { apiFetch } from '../../../shared/api.js';
import { broadcastModelsInvalidation } from '../../../shared/utils/model-sync.js';

const escapeHtml = (text) => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

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

  const showFeedback = (message, isError = false) => {
    const feedback = container.querySelector('#settings-feedback');
    if (!feedback) return;
    feedback.textContent = message;
    feedback.className = isError
      ? 'rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600'
      : 'rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-600';
    feedback.classList.remove('hidden');
    setTimeout(() => feedback.classList.add('hidden'), 3000);
  };

  const getToggleState = (isOn) => ({
    isOn: Boolean(isOn),
    ariaPressed: String(isOn),
    statusText: isOn ? 'On' : 'Off',
    toggleClass: isOn ? 'bg-black' : 'bg-gray-200',
  });

  const updatePublicRegToggle = () => {
    const regToggle = container.querySelector('#public-reg-toggle');
    if (!regToggle) return;
    const toggleState = getToggleState(settingsState.publicRegistration);
    regToggle.setAttribute('aria-pressed', toggleState.ariaPressed);
    regToggle.classList.toggle('bg-black', toggleState.isOn);
    regToggle.classList.toggle('bg-gray-200', !toggleState.isOn);
    const knob = regToggle.querySelector('span');
    if (knob) {
      knob.classList.toggle('translate-x-4', toggleState.isOn);
      knob.classList.toggle('translate-x-0', !toggleState.isOn);
    }
    const status = container.querySelector('#public-reg-status');
    if (status) status.textContent = toggleState.statusText;
    updateRegistrationStatusVisibility();
  };

  const updateRegistrationStatusVisibility = () => {
    const statusWrap = container.querySelector('#registration-status-wrap');
    if (!statusWrap) return;
    statusWrap.classList.toggle('hidden', !settingsState.publicRegistration);
  };

  const renderSelectBox = (id, optionsHtml, { ariaLabel } = {}) => `
		<div class="relative rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm transition-colors focus-within:border-gray-300 focus-within:ring-1 focus-within:ring-gray-300">
			<select id="${id}" aria-label="${ariaLabel || id}" class="w-full appearance-none bg-transparent pr-8 text-sm text-gray-900 outline-none">
				${optionsHtml}
			</select>
			<svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" class="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-gray-500">
				<path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.942l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z" clip-rule="evenodd" />
			</svg>
		</div>
	`;

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
    settingsState.publicRegistration = newValue;
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
      settingsState._initialPublicRegistration = newValue;
      showFeedback('Public registration updated.');
    } catch (err) {
      settingsState.publicRegistration = prevValue;
      updatePublicRegToggle();
      showFeedback(err?.message || 'Failed to update public registration.', true);
    }
  };

  const updateRegistrationStatus = async (newValue) => {
    const prevValue = settingsState.registrationStatus;
    settingsState.registrationStatus = newValue;
    updateHighlights();
    try {
      const res = await apiFetch('/api/admin/config', {
        method: 'PUT',
        body: JSON.stringify({ public_registration_status: newValue }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || err?.message || 'Failed to update registration status');
      }
      settingsState._initialRegistrationStatus = newValue;
      showFeedback('Registration status saved.');
    } catch (err) {
      settingsState.registrationStatus = prevValue;
      updateHighlights();
      showFeedback(err?.message || 'Failed to update registration status.', true);
    }
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
