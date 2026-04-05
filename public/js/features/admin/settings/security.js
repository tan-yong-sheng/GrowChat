import { apiFetch } from '../../../shared/api.js';

export function renderSecuritySettings(container, data) {
  const isActiveTab = () => container?.dataset?.settingsTab === 'security';
  const settingsState = data.securitySettings || (data.securitySettings = {
    currentValues: {
      resendApiKey: '',
    },
    initialValues: {
      resendApiKey: '',
    },
    adminConfigLoaded: false,
  });

  // Flags to prevent race conditions
  let savingApiKey = false;
  let sendingTestEmail = false;

  // Set up handlers for admin shell controller (no-op for immediate-save pattern)
  data.settingsDirtyCheckers = data.settingsDirtyCheckers || {};
  data.settingsSaveHandlers = data.settingsSaveHandlers || {};
  data.settingsDirtyCheckers.security = () => false;
  data.settingsSaveHandlers.security = async () => false;

  const showFeedback = (message, isError = false) => {
    let feedback = container.querySelector('#settings-feedback');
    if (!feedback) {
      feedback = document.createElement('div');
      feedback.id = 'settings-feedback';
      const feedbackContainer = container.querySelector('.space-y-3');
      if (feedbackContainer) {
        feedbackContainer.appendChild(feedback);
      }
    }
    feedback.textContent = message;
    feedback.className = isError
      ? 'rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600'
      : 'rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-600';
    feedback.classList.remove('hidden');
    setTimeout(() => feedback.classList.add('hidden'), 3000);
  };

  const maskApiKey = (key) => {
    if (!key) return '';
    if (key.length <= 8) return '*'.repeat(key.length);
    return key.substring(0, 4) + '*'.repeat(key.length - 8) + key.substring(key.length - 4);
  };

  const render = () => {
    if (!isActiveTab()) return;

    container.innerHTML = `
      <div class="flex flex-col flex-1 min-h-0 animate-in fade-in duration-300 w-full">
        <div class="pt-0.5 pb-6 sticky top-0 z-10 bg-white">
          <div class="max-w-2xl mx-auto w-full flex justify-between items-center">
            <div class="flex items-center text-xl font-medium px-0.5 gap-2">
              <div class="flex-shrink-0 text-gray-900">Email</div>
            </div>
          </div>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto scrollbar-hidden">
          <div class="max-w-2xl mx-auto w-full space-y-3 pb-6">
            <section class="space-y-1">
              <hr class="border-gray-100/30 my-2" />

              <div class="py-2.5">
                <div class="text-xs font-medium mb-1">Resend API Key</div>
                <div class="relative rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm transition-colors focus-within:border-gray-300 focus-within:ring-1 focus-within:ring-gray-300">
                  <input
                    id="resend-api-key"
                    type="password"
                    value="${maskApiKey(settingsState.currentValues.resendApiKey)}"
                    placeholder="Enter your Resend API key"
                    class="w-full bg-transparent outline-none text-sm text-gray-900 placeholder-gray-500"
                  />
                </div>
                <div class="text-[10px] text-gray-600 mt-1">Your API key is masked for security. Enter a new key to update.</div>
              </div>

              <div class="py-2.5">
                <div class="text-xs font-medium mb-2">Send Test Email</div>
                <div class="flex gap-2">
                  <div class="relative flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm transition-colors focus-within:border-gray-300 focus-within:ring-1 focus-within:ring-gray-300">
                    <input
                      id="test-email"
                      type="email"
                      placeholder="test@example.com"
                      class="w-full bg-transparent outline-none text-sm text-gray-900 placeholder-gray-500"
                    />
                  </div>
                  <button
                    id="send-test-email"
                    class="px-4 py-2.5 rounded-xl bg-black text-white text-sm font-medium hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Send Test
                  </button>
                </div>
              </div>
            </section>

            <div id="settings-feedback" class="hidden mt-4 rounded-xl border px-4 py-3 text-sm"></div>
          </div>
        </div>
      </div>
    `;

    bindEvents();
  };

  const updateResendApiKey = async (newValue) => {
    // Prevent race conditions
    if (savingApiKey) return;
    savingApiKey = true;

    const prevValue = settingsState.currentValues.resendApiKey;
    settingsState.currentValues.resendApiKey = newValue;

    const apiKeyInput = container.querySelector('#resend-api-key');

    try {
      if (apiKeyInput) {
        apiKeyInput.disabled = true;
      }

      const res = await apiFetch('/api/admin/email-config', {
        method: 'PUT',
        body: JSON.stringify({ resend_api_key: newValue })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || err?.message || 'Failed to update Resend API key');
      }

      settingsState.initialValues.resendApiKey = newValue;
      showFeedback('Resend API key saved.');
      render();
    } catch (err) {
      settingsState.currentValues.resendApiKey = prevValue;
      showFeedback(err?.message || 'Failed to update Resend API key.', true);
      render();
    } finally {
      savingApiKey = false;
      if (apiKeyInput) {
        apiKeyInput.disabled = false;
      }
    }
  };

  const sendTestEmail = async (email) => {
    // Prevent race conditions
    if (sendingTestEmail) return;

    if (!email || !email.trim()) {
      showFeedback('Please enter a valid email address.', true);
      return;
    }

    sendingTestEmail = true;

    const sendTestBtn = container.querySelector('#send-test-email');
    const testEmailInput = container.querySelector('#test-email');

    try {
      if (sendTestBtn) {
        sendTestBtn.disabled = true;
        sendTestBtn.textContent = 'Sending...';
      }
      if (testEmailInput) {
        testEmailInput.disabled = true;
      }

      const res = await apiFetch('/api/admin/email-config/test', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || err?.message || 'Failed to send test email');
      }

      showFeedback('Test email sent successfully.');
    } catch (err) {
      showFeedback(err?.message || 'Failed to send test email.', true);
    } finally {
      sendingTestEmail = false;
      if (sendTestBtn) {
        sendTestBtn.disabled = false;
        sendTestBtn.textContent = 'Send Test';
      }
      if (testEmailInput) {
        testEmailInput.disabled = false;
      }
    }
  };

  const bindEvents = () => {
    const apiKeyInput = container.querySelector('#resend-api-key');
    const testEmailInput = container.querySelector('#test-email');
    const sendTestBtn = container.querySelector('#send-test-email');

    apiKeyInput?.addEventListener('blur', (e) => {
      const newValue = e.target.value.trim();
      if (newValue && newValue !== maskApiKey(settingsState.currentValues.resendApiKey)) {
        updateResendApiKey(newValue);
      }
    });

    sendTestBtn?.addEventListener('click', () => {
      const email = testEmailInput?.value || '';
      sendTestEmail(email);
    });

    testEmailInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const email = e.target.value || '';
        sendTestEmail(email);
      }
    });
  };

  const loadEmailConfig = async () => {
    if (settingsState.adminConfigLoaded) return;
    settingsState.adminConfigLoaded = true;
    try {
      const res = await apiFetch('/api/admin/email-config');
      if (res.ok) {
        const payload = await res.json();
        const apiKey = payload?.resend_api_key || '';
        settingsState.currentValues.resendApiKey = apiKey;
        settingsState.initialValues.resendApiKey = apiKey;

        if (isActiveTab()) render();
      }
    } catch (err) {
      console.warn('Failed to load email config', err);
    }
  };

  render();
  loadEmailConfig();
}
