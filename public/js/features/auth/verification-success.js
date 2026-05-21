/**
 * Email Verification Success/Error Pages
 * Shown when user clicks verification link in email
 */

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Render verification success page
 * @param {Object} options - Options
 * @param {Function} options.onContinue - Called when user clicks continue
 * @returns {HTMLElement} Container element
 */
export function renderVerificationSuccess({ onContinue }) {
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
      <h1 class="text-2xl font-semibold text-gray-900 mb-2" role="status" aria-live="polite">Email verified!</h1>
      <p class="text-gray-600 mb-6">Your account is now active.</p>
      <button id="continue-btn" class="btn-primary w-full">
        Continue to login
      </button>
    </div>
  `;

  container.querySelector('#continue-btn').addEventListener('click', onContinue);
  
  return container;
}

/**
 * Render verification error page
 * @param {Object} options - Options
 * @param {string} options.errorType - Type of error ('invalid', 'expired', 'already_verified')
 * @param {Function} options.onRetry - Called when user clicks retry
 * @returns {HTMLElement} Container element
 */
export function renderVerificationError({ errorType = 'invalid', onRetry }) {
  const container = document.createElement('div');
  container.className = 'min-h-screen flex items-center justify-center bg-gray-50';
  container.setAttribute('role', 'main');
  
  const errorConfig = {
    invalid: {
      icon: 'red',
      title: 'Invalid or expired link',
      message: 'This link is invalid or has expired. Please request a new one.',
      action: 'Request new verification',
    },
    expired: {
      icon: 'red',
      title: 'Link expired',
      message: 'This link is invalid or has expired. Please request a new one.',
      action: 'Request new verification',
    },
    already_verified: {
      icon: 'blue',
      title: 'No pending verifications',
      message: 'Your email is already verified. You can sign in to your account.',
      action: 'Continue to login',
    },
  };
  
  const config = errorConfig[errorType] || errorConfig.invalid;
  const iconBg = config.icon === 'red' ? 'bg-red-100' : 'bg-blue-100';
  const iconColor = config.icon === 'red' ? 'text-red-600' : 'text-blue-600';
  const iconPath = config.icon === 'red' 
    ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>'
    : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>';
  
  container.innerHTML = `
    <div class="max-w-md w-full bg-white rounded-lg shadow-sm p-8 text-center">
      <div class="w-16 h-16 mx-auto mb-4 ${iconBg} rounded-full flex items-center justify-center" role="img" aria-label="${config.icon === 'red' ? 'Error' : 'Info'}">
        <svg class="w-8 h-8 ${iconColor}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          ${iconPath}
        </svg>
      </div>
      <h1 class="text-2xl font-semibold text-gray-900 mb-2" role="alert" aria-live="assertive">${escapeHtml(config.title)}</h1>
      <p class="text-gray-600 mb-6">${escapeHtml(config.message)}</p>
      <button id="retry-btn" class="btn-primary w-full">
        ${escapeHtml(config.action)}
      </button>
    </div>
  `;

  container.querySelector('#retry-btn').addEventListener('click', onRetry);
  
  return container;
}

/**
 * Render verification loading state
 * @returns {HTMLElement} Container element
 */
export function renderVerificationLoading() {
  const container = document.createElement('div');
  container.className = 'min-h-screen flex items-center justify-center bg-gray-50';
  container.setAttribute('role', 'main');
  container.setAttribute('aria-busy', 'true');
  
  container.innerHTML = `
    <div class="max-w-md w-full bg-white rounded-lg shadow-sm p-8 text-center">
      <div class="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
        <svg class="w-8 h-8 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
      <h1 class="text-2xl font-semibold text-gray-900 mb-2">Verifying your email...</h1>
      <p class="text-gray-600">Please wait while we verify your email address.</p>
    </div>
  `;
  
  return container;
}

/**
 * Render verification page with API integration
 * Handles the full verification flow: loading -> success/error
 * @param {string} token - Verification token from URL
 * @param {Object} api - API helpers
 * @param {Function} api.apiFetch - Fetch wrapper
 * @param {HTMLElement} container - Container element to render into
 */
export async function renderVerificationPage(token, { apiFetch }, container = document.body) {
  // Show loading state
  container.innerHTML = '';
  container.appendChild(renderVerificationLoading());
  
  try {
    const res = await apiFetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
    const data = await res.json().catch(() => ({}));
    
    container.innerHTML = '';
    
    if (res.ok) {
      container.appendChild(renderVerificationSuccess({
        onContinue: () => {
          window.location.href = '/login?verified=true';
        },
      }));
    } else if (data.error?.toLowerCase().includes('expired')) {
      container.appendChild(renderVerificationError({
        errorType: 'expired',
        onRetry: () => {
          window.location.href = '/login?action=request_verification';
        },
      }));
    } else if (data.error?.toLowerCase().includes('already')) {
      container.appendChild(renderVerificationError({
        errorType: 'already_verified',
        onRetry: () => {
          window.location.href = '/login';
        },
      }));
    } else {
      container.appendChild(renderVerificationError({
        errorType: 'invalid',
        onRetry: () => {
          window.location.href = '/login?action=request_verification';
        },
      }));
    }
  } catch {
    container.innerHTML = '';
    container.appendChild(renderVerificationError({
      errorType: 'invalid',
      onRetry: () => {
        window.location.href = '/login?action=request_verification';
      },
    }));
  }
}
