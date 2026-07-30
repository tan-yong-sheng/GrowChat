import { apiFetch } from '../api.js';

export async function saveUserPreferences(preferences, { errorMessage } = {}) {
  const res = await apiFetch('/api/users/me', {
    method: 'PUT',
    body: JSON.stringify({ preferences }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || errorMessage || 'Failed to save preferences');
  }
  const payload = await res.json().catch(() => ({}));
  return payload?.user?.preferences || preferences;
}
