/**
 * Email Verification Pending Screen
 * Shown after successful registration when email verification is required
 */

const COOLDOWN_SECONDS = 60;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Render the "Check Your Email" verification pending screen
 * @param {string} email - User's email address
 * @param {Object} options - Callback options
 * @param {Function} options.onResend - Called when user clicks resend
 * @param {Function} options.onContinue - Called when user clicks "I've verified"
 * @returns {HTMLElement} Container element
 */
export function renderVerificationPending(email, { onResend, onContinue }) {
  const container = document.createElement('div');
  container.className = 'min-h-screen flex items-center justify-center bg-gray-50';
  container.setAttribute('role', 'main');

  container.innerHTML = `
    <div class="max-w-md w-full bg-white rounded-lg shadow-sm p-8 text-center">
      <div class="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center" role="img" aria-label="Success">
        <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
        </svg>
      </div>
      <h1 class="text-2xl font-semibold text-gray-900 mb-2" role="status" aria-live="polite">Check your email</h1>
      <p class="text-gray-600 mb-6">
        We sent a verification link to <strong class="text-gray-900">${escapeHtml(email)}</strong>
      </p>
      <button id="resend-btn" class="btn-secondary mb-4" disabled aria-describedby="cooldown-text">
        Resend email
      </button>
      <p id="cooldown-text" class="text-sm text-gray-500 mb-4" aria-live="polite">
        Resend available in <span id="cooldown">${COOLDOWN_SECONDS}</span>s
      </p>
      <button id="continue-btn" class="btn-primary w-full">
        I've verified my email
      </button>
    </div>
  `;

  const cooldownEl = container.querySelector('#cooldown');
  const resendBtn = container.querySelector('#resend-btn');
  const cooldownText = container.querySelector('#cooldown-text');
  const continueBtn = container.querySelector('#continue-btn');

  let cooldown = COOLDOWN_SECONDS;
  let _resendAttempts = 0;

  // Countdown timer
  const interval = setInterval(() => {
    cooldown--;

    // Update every second visually, but only announce every 10 seconds for a11y
    if (cooldown % 10 === 0 || cooldown <= 10) {
      cooldownEl.textContent = cooldown;
    } else {
      cooldownEl.textContent = cooldown;
    }

    if (cooldown <= 0) {
      clearInterval(interval);
      resendBtn.disabled = false;
      resendBtn.textContent = 'Resend email';
      resendBtn.focus(); // Focus on enable per a11y spec
      cooldownText.style.display = 'none';
    }
  }, 1000);

  // Resend button handler
  resendBtn.addEventListener('click', async () => {
    if (resendBtn.disabled) return;

    resendBtn.disabled = true;
    resendBtn.innerHTML = '<span class="spinner"></span> Sending...';

    try {
      await onResend();

      // Success - restart cooldown
      cooldown = COOLDOWN_SECONDS;
      cooldownText.style.display = '';
      resendBtn.textContent = 'Resend email';
      _resendAttempts++;

      // Show success toast (caller handles toast)
    } catch (err) {
      // Error - re-enable button for retry
      resendBtn.disabled = false;
      resendBtn.textContent = 'Resend email';
      cooldownText.style.display = 'none';

      // Show error toast (caller handles toast)
      throw err;
    }
  });

  // Continue button handler
  continueBtn.addEventListener('click', () => {
    clearInterval(interval);
    onContinue();
  });

  // Cleanup method for unmounting
  container.cleanup = () => {
    clearInterval(interval);
  };

  return container;
}

/**
 * Render verification pending screen with API integration
 * @param {string} email - User's email address
 * @param {Object} api - API helpers
 * @param {Function} api.apiFetch - Fetch wrapper
 * @param {Function} api.showToast - Toast notification helper
 * @returns {HTMLElement} Container element
 */
export function renderVerificationPendingWithApi(email, { apiFetch, showToast }) {
  return renderVerificationPending(email, {
    onResend: async () => {
      const res = await apiFetch('/api/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to resend verification email');
      }

      showToast('Email sent! Check your inbox.', 'success');
    },
    onContinue: () => {
      window.location.href = '/login';
    },
  });
}
