import { apiFetch } from '../../shared/api.js';
import { renderButton } from '../../shared/components/button.js';

export function renderAccountSecuritySection(
  container,
  _state = {},
  { onRefresh: _onRefresh, routeCache: _routeCache } = {}
) {
  const PASSWORD_MIN_LENGTH = 8;
  let saving = false;

  const showFeedback = (message, isError = false) => {
    let feedback = container.querySelector('#password-change-feedback');
    if (!feedback) {
      feedback = document.createElement('div');
      feedback.id = 'password-change-feedback';
      container.appendChild(feedback);
    }
    feedback.textContent = message;
    feedback.className = isError
      ? 'rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600'
      : 'rounded-md border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-600';
    feedback.classList.remove('hidden');
  };

  function clearPasswordFeedback() {
    const feedback = container.querySelector('#password-change-feedback');
    if (feedback) feedback.classList.add('hidden');
  }

  function validatePasswordForm(newPassword, confirmNewPassword) {
    if (newPassword !== confirmNewPassword) {
      return 'New passwords do not match. Please re-enter the same password.';
    }
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      return 'New password must be at least ' + PASSWORD_MIN_LENGTH + ' characters.';
    }
    return null;
  }

  function postPasswordChange(currentPassword, newPassword, confirmNewPassword) {
    return apiFetch('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword, confirmNewPassword }),
    });
  }

  async function handlePasswordResponse(res, form) {
    if (res.ok) {
      showFeedback('Password changed successfully.', false);
      form.querySelector('#current-password').value = '';
      form.querySelector('#new-password').value = '';
      form.querySelector('#confirm-password').value = '';
      return;
    }
    const data = await res.json().catch(() => ({}));
    showFeedback(data?.error || 'Failed to change password.', true);
  }

  function handlePasswordError(err) {
    showFeedback(err?.message || 'Network error. Please try again.', true);
  }

  const render = () => {
    container.innerHTML = `
      <div class="grid gap-4">
        <section class="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
          <div class="text-xs font-semibold uppercase tracking-wide text-gray-400">Security</div>
          <div class="mt-3">
            <div class="text-base font-semibold text-gray-900">Change Password</div>
            <div class="text-sm text-gray-500">Update your account password.</div>
          </div>

          <form id="change-password-form" class="mt-4 space-y-4">
            <div>
              <label for="current-password" class="block text-sm font-medium text-gray-700">Current Password</label>
              <input
                type="password"
                id="current-password"
                name="currentPassword"
                required
                class="mt-1 block w-full rounded-md border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition-colors focus-within:border-gray-300 focus-within:ring-1 focus-within:ring-gray-300"
              />
            </div>

            <div>
              <label for="new-password" class="block text-sm font-medium text-gray-700">New Password</label>
              <input
                type="password"
                id="new-password"
                name="newPassword"
                required
                minlength="8"
                class="mt-1 block w-full rounded-md border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition-colors focus-within:border-gray-300 focus-within:ring-1 focus-within:ring-gray-300"
              />
            </div>

            <div>
              <label for="confirm-password" class="block text-sm font-medium text-gray-700">Confirm New Password</label>
              <input
                type="password"
                id="confirm-password"
                name="confirmNewPassword"
                required
                class="mt-1 block w-full rounded-md border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition-colors focus-within:border-gray-300 focus-within:ring-1 focus-within:ring-gray-300"
              />
            </div>

            <div class="flex justify-end">
              ${renderButton({ label: 'Change Password', type: 'submit', className: 'bg-[#0066cc]' })}
            </div>
          </form>

          <div id="change-password-result" class="mt-4"></div>
        </section>
      </div>
    `;

    const form = container.querySelector('#change-password-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (saving) return;
        saving = true;

        const currentPassword = form.querySelector('#current-password').value;
        const newPassword = form.querySelector('#new-password').value;
        const confirmNewPassword = form.querySelector('#confirm-password').value;

        clearPasswordFeedback();

        const validationError = validatePasswordForm(newPassword, confirmNewPassword);
        if (validationError) {
          showFeedback(validationError, true);
          saving = false;
          return;
        }

        try {
          const res = await postPasswordChange(currentPassword, newPassword, confirmNewPassword);
          await handlePasswordResponse(res, form);
        } catch (err) {
          handlePasswordError(err);
        } finally {
          saving = false;
        }
      });
    }
  };

  render();
}
