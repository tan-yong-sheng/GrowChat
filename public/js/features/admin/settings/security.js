import { apiFetch } from '../../../shared/api.js';

const escapeHtml = (text) => {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
};

export function renderSecuritySettings(container, data) {
  const isActiveTab = () => container?.dataset?.settingsTab === 'security';
  const settingsState =
    data.securitySettings ||
    (data.securitySettings = {
      resendApiKeyConfigured: false,
      adminConfigLoaded: false,
    });

  let savingApiKey = false;
  let sendingTestEmail = false;

  const showFeedback = (message, isError = false) => {
    let feedback = container.querySelector('#settings-feedback');
    if (!feedback) {
      feedback = document.createElement('div');
      feedback.id = 'settings-feedback';
      const feedbackContainer = container.querySelector('.space-y-3');
      if (feedbackContainer) {
        feedbackContainer.appendChild(feedback);
      } else {
        console.warn('Feedback container (.space-y-3) not found, appending to container');
        container.appendChild(feedback);
      }
    }
    feedback.textContent = message;
    feedback.className = isError
      ? 'rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600'
      : 'rounded-md border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-600';
    feedback.classList.remove('hidden');
    setTimeout(() => feedback.classList.add('hidden'), 3000);
  };

  const getHintText = () => {
    if (settingsState.resendApiKeyConfigured) {
      return 'An API key is configured. Enter a new key to replace it.';
    }
    return 'No API key configured. Enter your Resend API key.';
  };

  const render = () => {
    if (!isActiveTab()) return;

    const maskedValue = settingsState.resendApiKeyConfigured ? '••••••••' : '';
    const escapedMaskedValue = escapeHtml(maskedValue);
    const hintText = escapeHtml(getHintText());

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
                <div class="relative rounded-md border border-gray-200 bg-white px-3 py-2.5 shadow-sm transition-colors focus-within:border-gray-300 focus-within:ring-1 focus-within:ring-gray-300">
                  <input
                    id="resend-api-key"
                    type="password"
                    value="${escapedMaskedValue}"
                    placeholder="Enter your Resend API key"
                    class="w-full bg-transparent outline-none text-sm text-gray-900 placeholder-gray-500"
                  />
                </div>
                <div class="text-label-sm text-gray-600 mt-1">${hintText}</div>
              </div>

              <div class="py-2.5">
                <div class="text-xs font-medium mb-2">Send Test Email</div>
                <div class="flex gap-2">
                  <div class="relative flex-1 rounded-md border border-gray-200 bg-white px-3 py-2.5 shadow-sm transition-colors focus-within:border-gray-300 focus-within:ring-1 focus-within:ring-gray-300">
                    <input
                      id="test-email"
                      type="email"
                      placeholder="test@example.com"
                      class="w-full bg-transparent outline-none text-sm text-gray-900 placeholder-gray-500"
                    />
                  </div>
                  <button
                    id="send-test-email"
                    class="px-4 py-2.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20"
                  >
                    Send Test
                  </button>
                </div>
              </div>
            </section>

            <div id="settings-feedback" class="hidden mt-4 rounded-md border px-4 py-3 text-sm"></div>
          </div>
        </div>
      </div>
    `;

    bindEvents();
  };

  const updateResendApiKey = async (newValue) => {
    // Validate: reject input containing asterisks (which indicate user didn't actually enter a new key)
    if (newValue.includes('*')) {
      showFeedback('Invalid API key format.', true);
      render();
      return;
    }

    // Prevent race conditions
    if (savingApiKey) return;
    savingApiKey = true;

    const prevConfigured = settingsState.resendApiKeyConfigured;
    const apiKeyInput = container.querySelector('#resend-api-key');

    try {
      if (apiKeyInput) {
        apiKeyInput.disabled = true;
      }

      const res = await apiFetch('/api/admin/email-config', {
        method: 'PUT',
        body: JSON.stringify({ resend_api_key: newValue }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || err?.message || 'Failed to update Resend API key');
      }

      // Never store the actual key, only mark it as configured
      settingsState.resendApiKeyConfigured = true;

      render();
      showFeedback('Resend API key saved.');
    } catch (err) {
      settingsState.resendApiKeyConfigured = prevConfigured;
      render();
      showFeedback(err?.message || 'Failed to update Resend API key.', true);
    } finally {
      savingApiKey = false;
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
        body: JSON.stringify({ email: email.trim() }),
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

    apiKeyInput?.addEventListener('focus', (e) => {
      // Clear masked placeholder on focus so user can enter new key
      if (e.target.value === '••••••••') {
        e.target.value = '';
      }
    });

    apiKeyInput?.addEventListener('blur', (e) => {
      const newValue = e.target.value.trim();
      // Only update if user entered a non-empty value that isn't the masked placeholder
      if (newValue && newValue !== '••••••••') {
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
        // Check if API key is configured, but never store the actual key in state
        settingsState.resendApiKeyConfigured = payload?.resend_api_key_configured || false;

        if (isActiveTab()) render();
      }
    } catch (err) {
      console.warn('Failed to load email config', err);
    }
  };

  render();
  loadEmailConfig();
}
