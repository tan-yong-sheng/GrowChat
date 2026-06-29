import { apiFetch } from '../../../shared/api.js';

import { escapeHtml } from '../../../shared/utils/dom-escape.js';

function renderSettingRow(label, value) {
  return `<div class="flex items-center justify-between py-2 border-b border-gray-50">
		<span class="text-sm text-gray-700">${escapeHtml(label)}</span>
		<span class="text-sm font-mono text-gray-900">${escapeHtml(String(value))}</span>
	</div>`;
}

function renderRows(rows) {
  return rows.map((row) => renderSettingRow(row.label, row.value)).join('');
}

export function renderSecurityOverview(container) {
  const isActiveTab = () => container?.dataset?.settingsTab === 'security';

  const securityState = {
    rateLimits: null,
    tokenTtls: null,
    loaded: false,
  };

  const render = () => {
    if (!isActiveTab()) return;

    const limits = securityState.rateLimits || {};
    const ttls = securityState.tokenTtls || {};

    const limitRows = [
      {
        label: 'Chat messages per minute',
        value: limits.chat_messages_per_minute ?? '—',
      },
      {
        label: 'Login attempts per 10 min',
        value: limits.login_attempts_per_10min ?? '—',
      },
      {
        label: 'Registrations per 10 min',
        value: limits.registrations_per_10min ?? '—',
      },
      {
        label: 'File uploads per hour',
        value: limits.file_uploads_per_hour ?? '—',
      },
    ];

    const ttlRows = [
      { label: 'Access Token TTL', value: ttls.access_token_display || '—' },
      { label: 'Refresh Token TTL', value: ttls.refresh_token_display || '—' },
    ];

    const futureItems = ['Allowed CORS Origins', 'Force HTTPS', 'Password Policy'];

    container.innerHTML = `
      <div class="flex flex-col flex-1 min-h-0 animate-in fade-in duration-300 w-full">
        <div class="pt-0.5 pb-6 bg-white">
          <div class="max-w-2xl mx-auto w-full flex justify-between items-center">
            <div class="flex items-center text-xl font-medium px-0.5 gap-2">
              <div class="flex-shrink-0 text-gray-900">Security Info</div>
            </div>
          </div>
        </div>
        <div class="flex-1 min-h-0">
          <div class="max-w-2xl mx-auto w-full space-y-3 pb-6">

            <section class="space-y-1">
              <hr class="border-gray-100/30 my-2" />
              <div class="text-base font-medium text-gray-900 py-2">Rate Limits</div>
              ${renderRows(limitRows)}
              <div class="flex items-start gap-2 py-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4 text-gray-400 mt-0.5 shrink-0">
                  <path fill-rule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm.75-10.25a.75.75 0 0 0-1.5 0v3.5c0 .199.079.39.22.53l2 2a.75.75 0 1 0 1.06-1.06L8.75 7.94V4.75Z" clip-rule="evenodd" />
                </svg>
                <span class="text-label-sm text-gray-600">Rate limits are configured in deployment config and cannot be changed here.</span>
              </div>
            </section>

            <section class="space-y-1">
              <hr class="border-gray-100/30 my-2" />
              <div class="text-base font-medium text-gray-900 py-2">Authentication</div>
              ${renderRows(ttlRows)}
              <div class="flex items-start gap-2 py-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4 text-gray-400 mt-0.5 shrink-0">
                  <path fill-rule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm.75-10.25a.75.75 0 0 0-1.5 0v3.5c0 .199.079.39.22.53l2 2a.75.75 0 1 0 1.06-1.06L8.75 7.94V4.75Z" clip-rule="evenodd" />
                </svg>
                <span class="text-label-sm text-gray-600">Token TTLs are configured in deployment config and cannot be changed here.</span>
              </div>
            </section>

            <section class="space-y-1">
              <hr class="border-gray-100/30 my-2" />
              <div class="text-base font-medium text-gray-900 py-2">Future</div>
              ${futureItems
                .map(
                  (item) => `
                <div class="flex items-center justify-between py-2 border-b border-gray-50">
                  <span class="text-sm text-gray-400">${escapeHtml(item)}</span>
                  <span class="text-sm text-gray-300">🔒</span>
                </div>
              `
                )
                .join('')}
              <div class="text-label-sm text-gray-600 py-2">These settings will be configurable in a future update.</div>
            </section>

          </div>
        </div>
      </div>
    `;
  };

  const loadSecurityConfig = async () => {
    if (securityState.loaded) return;
    securityState.loaded = true;
    try {
      const res = await apiFetch('/api/admin/security-config');
      if (res.ok) {
        const payload = await res.json();
        securityState.rateLimits = payload.rate_limits || {};
        securityState.tokenTtls = payload.token_ttls || {};
        if (isActiveTab()) render();
      }
    } catch (err) {
      console.warn('Failed to load security config', err);
    }
  };

  render();
  loadSecurityConfig();
}
