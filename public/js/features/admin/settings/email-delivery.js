import { apiFetch } from '../../../shared/api.js';
import {
  escapeHtml,
  showFeedback,
  sendTestEmail as sharedSendTestEmail,
} from './security-shared.js';

const PROVIDERS = [
  {
    id: 'resend',
    label: 'Resend',
    helperText: 'Enter your Resend API key (re_xxx).',
    domainField: false,
  },
  {
    id: 'sendgrid',
    label: 'SendGrid',
    helperText: 'Enter your SendGrid API key (SG.xxx).',
    domainField: false,
  },
  {
    id: 'mailgun',
    label: 'Mailgun',
    helperText: 'Enter your Mailgun API key and sending domain.',
    domainField: true,
  },
];

export function renderEmailDeliverySettings(container) {
  const isActiveTab = () => container?.dataset?.settingsTab === 'email';

  const settingsState = {
    provider: 'resend',
    apiKeyConfigured: false,
    fromEmail: '',
    mailgunDomain: '',
    configLoaded: false,
  };

  let saving = false;
  let sendingTestEmail = false;

  const getApiKeyHint = () => {
    const p = PROVIDERS.find((x) => x.id === settingsState.provider);
    if (settingsState.apiKeyConfigured) return buildConfiguredHint(p);
    return buildDefaultHint(p);
  };

  function buildConfiguredHint(p) {
    return `An API key is configured for ${p?.label || settingsState.provider}. Enter a new key to replace it.`;
  }

  function buildDefaultHint(p) {
    return p?.helperText || 'Enter your API key.';
  }

  function maskedApiKeyValue() {
    return settingsState.apiKeyConfigured ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : '';
  }

  function findCurrentProvider() {
    return PROVIDERS.find((x) => x.id === settingsState.provider);
  }

  function buildProviderOptions() {
    return PROVIDERS.map(
      (p) =>
        `<option value="${p.id}"${p.id === settingsState.provider ? ' selected' : ''}>${escapeHtml(p.label)}</option>`
    ).join('');
  }

  const render = () => {
    if (!isActiveTab()) return;

    const escapedMaskedValue = escapeHtml(maskedApiKeyValue());
    const apiKeyHint = escapeHtml(getApiKeyHint());
    const escapedFromEmail = escapeHtml(settingsState.fromEmail);
    const escapedDomain = escapeHtml(settingsState.mailgunDomain);
    const currentProvider = findCurrentProvider();

    const providerOptions = buildProviderOptions();

    container.innerHTML = `
      <div class="flex flex-col flex-1 min-h-0 animate-in fade-in duration-300 w-full">
        <div class="pt-0.5 pb-6 bg-white">
          <div class="max-w-2xl mx-auto w-full flex justify-between items-center">
            <div class="flex items-center text-xl font-medium px-0.5 gap-2">
              <div class="flex-shrink-0 text-gray-900">Email Delivery</div>
            </div>
          </div>
        </div>

        <div class="flex-1 min-h-0">
          <div class="max-w-2xl mx-auto w-full space-y-3 pb-6">

            <section class="space-y-1">
              <hr class="border-gray-100/30 my-2" />

              <div class="text-base font-medium text-gray-900 py-2">Provider</div>

              <div class="py-2">
                <div class="text-xs font-medium mb-1">Email Provider</div>
                <div class="relative rounded-md border border-gray-200 bg-white px-3 py-2 shadow-sm transition-colors focus-within:border-gray-300 focus-within:ring-1 focus-within:ring-gray-300">
                  <select id="email-provider-select" class="w-full appearance-none bg-transparent pr-8 text-sm text-gray-900 outline-none">
                    ${providerOptions}
                  </select>
                  <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" class="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-gray-500"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.942l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z" clip-rule="evenodd" /></svg>
                </div>
                <div class="text-label-sm text-gray-600 mt-1">The service used to send transactional emails.</div>
              </div>
            </section>

            <section class="space-y-1">
              <hr class="border-gray-100/30 my-2" />
              <div class="text-base font-medium text-gray-900 py-2">${escapeHtml(currentProvider?.label || 'Provider')} Configuration</div>

              <div class="py-2">
                <div class="text-xs font-medium mb-1">API Key</div>
                <div class="relative rounded-md border border-gray-200 bg-white px-3 py-2 shadow-sm transition-colors focus-within:border-gray-300 focus-within:ring-1 focus-within:ring-gray-300">
                  <input id="email-api-key" type="password" value="${escapedMaskedValue}" placeholder="Enter your API key" class="w-full bg-transparent outline-none text-sm text-gray-900 placeholder-gray-500" />
                </div>
                <div class="text-label-sm text-gray-600 mt-1">${apiKeyHint}</div>
              </div>

              ${
                settingsState.provider === 'mailgun'
                  ? `
              <div class="py-2">
                <div class="text-xs font-medium mb-1">Sending Domain</div>
                <div class="relative rounded-md border border-gray-200 bg-white px-3 py-2 shadow-sm transition-colors focus-within:border-gray-300 focus-within:ring-1 focus-within:ring-gray-300">
                  <input id="mailgun-domain" type="text" value="${escapedDomain}" placeholder="mg.yourdomain.com" class="w-full bg-transparent outline-none text-sm text-gray-900 placeholder-gray-500" />
                </div>
                <div class="text-label-sm text-gray-600 mt-1">The domain configured in Mailgun for sending.</div>
              </div>
              `
                  : ''
              }
            </section>

            <section class="space-y-1">
              <hr class="border-gray-100/30 my-2" />
              <div class="text-base font-medium text-gray-900 py-2">From Address</div>

              <div class="py-2">
                <div class="text-xs font-medium mb-1">From Email</div>
                <div class="relative rounded-md border border-gray-200 bg-white px-3 py-2 shadow-sm transition-colors focus-within:border-gray-300 focus-within:ring-1 focus-within:ring-gray-300">
                  <input id="email-from" type="email" value="${escapedFromEmail}" placeholder="noreply@yourdomain.com" class="w-full bg-transparent outline-none text-sm text-gray-900 placeholder-gray-500" />
                </div>
                <div class="text-label-sm text-gray-600 mt-1">The email address shown as the sender. Must be verified with your provider.</div>
              </div>
            </section>

            <section class="space-y-1">
              <hr class="border-gray-100/30 my-2" />
              <div class="text-base font-medium text-gray-900 py-2">Test</div>

              <div class="py-2">
                <div class="text-xs font-medium mb-2">Send Test Email</div>
                <div class="flex gap-2">
                  <div class="relative flex-1 rounded-md border border-gray-200 bg-white px-3 py-2 shadow-sm transition-colors focus-within:border-gray-300 focus-within:ring-1 focus-within:ring-gray-300">
                    <input id="test-email" type="email" placeholder="test@example.com" class="w-full bg-transparent outline-none text-sm text-gray-900 placeholder-gray-500" />
                  </div>
                  <button id="send-test-email" class="px-4 py-2 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20">
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

  function buildProviderPayload(newProvider) {
    return JSON.stringify({ email_provider: newProvider });
  }

  function parseProviderErrorResponse(err) {
    return err?.error || err?.message || 'Failed to update provider';
  }

  function updateProviderState(state, newProvider) {
    const prev = state.provider;
    state.provider = newProvider;
    state.apiKeyConfigured = false;
    return prev;
  }

  function revertProviderState(state, prev) {
    state.provider = prev;
  }

  function formatProviderError(err) {
    return err?.message || 'Failed to update provider.';
  }

  async function applyEmailProviderUpdate(newProvider) {
    const res = await apiFetch('/api/admin/email-config', {
      method: 'PUT',
      body: buildProviderPayload(newProvider),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(parseProviderErrorResponse(err));
    }
  }

  const saveProvider = async (newProvider) => {
    if (saving) return;
    saving = true;
    const prev = updateProviderState(settingsState, newProvider);
    try {
      await applyEmailProviderUpdate(newProvider);
      render();
    } catch (err) {
      revertProviderState(settingsState, prev);
      render();
      showFeedback(container, formatProviderError(err), true);
    } finally {
      saving = false;
    }
  };

  function isMaskedApiKeyValue(value) {
    return value.includes('\u2022');
  }

  function disableEmailApiKeyInput() {
    const input = container.querySelector('#email-api-key');
    if (input) input.disabled = true;
  }

  function formatApiKeyError(err) {
    return err?.message || 'Failed to update API key.';
  }

  async function extractApiKeyErrorMessage(res) {
    const err = await res.json().catch(() => ({}));
    return err?.error || err?.message || 'Failed to update API key';
  }

  async function applyEmailApiKeyUpdate(newValue) {
    const res = await apiFetch('/api/admin/email-config', {
      method: 'PUT',
      body: JSON.stringify({ email_api_key: newValue }),
    });
    if (!res.ok) {
      throw new Error(await extractApiKeyErrorMessage(res));
    }
  }

  const saveApiKey = async (newValue) => {
    if (isMaskedApiKeyValue(newValue)) {
      showFeedback(container, 'Invalid API key format.', true);
      render();
      return;
    }
    if (saving) return;
    saving = true;
    const prevConfigured = settingsState.apiKeyConfigured;
    try {
      disableEmailApiKeyInput();
      await applyEmailApiKeyUpdate(newValue);
      settingsState.apiKeyConfigured = true;
      render();
      showFeedback(container, 'API key saved.');
    } catch (err) {
      settingsState.apiKeyConfigured = prevConfigured;
      render();
      showFeedback(container, formatApiKeyError(err), true);
    } finally {
      saving = false;
    }
  };

  function updateSimpleEmailState(state, key, value) {
    const prev = state[key];
    state[key] = value;
    return prev;
  }

  function revertSimpleEmailState(state, key, prev) {
    state[key] = prev;
  }

  function buildSimplePayload(fieldName, value) {
    return JSON.stringify({ [fieldName]: value });
  }

  function parseSimpleEmailErrorResponse(err, label) {
    return err?.error || err?.message || `Failed to update ${label}`;
  }

  function formatSimpleEmailError(err, label) {
    return err?.message || `Failed to update ${label}.`;
  }

  async function applySimpleEmailUpdate(fieldName, value, label) {
    const res = await apiFetch('/api/admin/email-config', {
      method: 'PUT',
      body: buildSimplePayload(fieldName, value),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(parseSimpleEmailErrorResponse(err, label));
    }
  }

  const saveFromEmail = async (newFromEmail) => {
    if (saving) return;
    saving = true;
    const prev = updateSimpleEmailState(settingsState, 'fromEmail', newFromEmail);
    try {
      await applySimpleEmailUpdate('email_from', newFromEmail, 'from email');
      showFeedback(container, 'From email saved.');
    } catch (err) {
      revertSimpleEmailState(settingsState, 'fromEmail', prev);
      showFeedback(container, formatSimpleEmailError(err, 'from email'), true);
    } finally {
      saving = false;
    }
  };

  const saveMailgunDomain = async (newDomain) => {
    if (saving) return;
    saving = true;
    const prev = updateSimpleEmailState(settingsState, 'mailgunDomain', newDomain);
    try {
      await applySimpleEmailUpdate('mailgun_domain', newDomain, 'Mailgun domain');
      showFeedback(container, 'Mailgun domain saved.');
    } catch (err) {
      revertSimpleEmailState(settingsState, 'mailgunDomain', prev);
      showFeedback(container, formatSimpleEmailError(err, 'Mailgun domain'), true);
    } finally {
      saving = false;
    }
  };

  const sendTestEmail = async (email) => {
    await sharedSendTestEmail(container, email);
  };

  const bindEvents = () => {
    const providerSelect = container.querySelector('#email-provider-select');
    const apiKeyInput = container.querySelector('#email-api-key');
    const fromEmailInput = container.querySelector('#email-from');
    const mailgunDomainInput = container.querySelector('#mailgun-domain');
    const testEmailInput = container.querySelector('#test-email');
    const sendTestBtn = container.querySelector('#send-test-email');

    providerSelect?.addEventListener('change', (e) => {
      saveProvider(e.target.value);
    });

    apiKeyInput?.addEventListener('focus', (e) => {
      if (e.target.value.includes('\u2022')) e.target.value = '';
    });
    apiKeyInput?.addEventListener('blur', (e) => {
      const val = e.target.value.trim();
      if (val && !val.includes('\u2022')) saveApiKey(val);
    });

    fromEmailInput?.addEventListener('blur', (e) => {
      const val = e.target.value.trim();
      if (val !== settingsState.fromEmail) saveFromEmail(val);
    });

    mailgunDomainInput?.addEventListener('blur', (e) => {
      const val = e.target.value.trim();
      if (val !== settingsState.mailgunDomain) saveMailgunDomain(val);
    });

    sendTestBtn?.addEventListener('click', () => {
      sendTestEmail(testEmailInput?.value || '');
    });
    testEmailInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendTestEmail(e.target.value || '');
    });
  };

  function resolveEmailProvider(payload) {
    return payload?.email_provider || 'resend';
  }

  function resolveApiKeyConfigured(payload) {
    return payload?.email_api_key_configured || payload?.resend_api_key_configured || false;
  }

  function resolveFromEmail(payload) {
    return payload?.email_from || payload?.resend_from_email || '';
  }

  function resolveMailgunDomain(payload) {
    return payload?.mailgun_domain || '';
  }

  function applyEmailConfig(payload) {
    settingsState.provider = resolveEmailProvider(payload);
    settingsState.apiKeyConfigured = resolveApiKeyConfigured(payload);
    settingsState.fromEmail = resolveFromEmail(payload);
    settingsState.mailgunDomain = resolveMailgunDomain(payload);
  }

  function handleLoadConfigError(err) {
    console.warn('Failed to load email config', err);
  }

  const loadConfig = async () => {
    if (settingsState.configLoaded) return;
    settingsState.configLoaded = true;
    try {
      const res = await apiFetch('/api/admin/email-config');
      if (!res.ok) return;
      const payload = await res.json();
      applyEmailConfig(payload);
      if (isActiveTab()) render();
    } catch (err) {
      handleLoadConfigError(err);
    }
  };

  render();
  loadConfig();
}
