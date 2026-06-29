import { setState, state } from '../store.js';
import { apiFetch } from '../api.js';

const DEFAULT_PREFERENCES = {
  temperature: 0.7,
  top_p: 1.0,
  max_tokens: 2048,
};

function buildControlsHtml(preferences) {
  return `
    <div class="chat-controls p-4 space-y-6 bg-gray-50 dark:bg-gray-800/50 rounded-md border border-gray-200 dark:border-gray-700">
      <h3 class="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Chat Settings</h3>
      
      <div class="space-y-4">
        <div class="control-group">
          <div class="flex justify-between mb-2">
            <label class="text-xs font-semibold text-gray-600 dark:text-gray-400">Temperature</label>
            <span class="text-xs font-mono text-blue-600 dark:text-neutral-400">${preferences.temperature}</span>
          </div>
          <input type="range" min="0" max="2" step="0.1" value="${preferences.temperature}" 
                 class="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                 data-setting="temperature">
          <p class="text-label-sm text-gray-500 mt-1">Controls randomness: Lower is more focused, higher is more creative.</p>
        </div>

        <div class="control-group">
          <div class="flex justify-between mb-2">
            <label class="text-xs font-semibold text-gray-600 dark:text-gray-400">Top P</label>
            <span class="text-xs font-mono text-blue-600 dark:text-neutral-400">${preferences.top_p}</span>
          </div>
          <input type="range" min="0" max="1" step="0.05" value="${preferences.top_p}" 
                 class="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                 data-setting="top_p">
          <p class="text-label-sm text-gray-500 mt-1">Nucleus sampling: Lower limits vocabulary to top tokens.</p>
        </div>

        <div class="control-group">
          <label class="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Default Model</label>
          <select class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-primary/20" data-setting="default_model">
            ${(state.models || []).map((m) => `<option value="${m.id}" ${state.activeModelId === m.id ? 'selected' : ''}>${m.name}</option>`).join('')}
          </select>
        </div>
      </div>
      
      <button class="reset-defaults w-full py-2 text-xs font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
        Reset to Defaults
      </button>
    </div>
  `;
}

async function handleSettingChange(e, updateUI) {
  const setting = e.target.dataset.setting;
  const value = e.target.type === 'range' ? parseFloat(e.target.value) : e.target.value;

  const updates = {
    preferences: {
      ...(state.userProfile?.preferences || {}),
      [setting]: value,
    },
  };

  try {
    await apiFetch('/api/users/me', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    const newUserProfile = { ...state.userProfile, ...updates };
    setState({ userProfile: newUserProfile });
    updateUI();
  } catch (err) {
    console.error('Failed to update preference:', err);
  }
}

function attachEventListeners(container, updateUI) {
  container.querySelectorAll('input[type="range"], select').forEach((input) => {
    input.addEventListener('change', (e) => handleSettingChange(e, updateUI));
  });

  container.querySelector('.reset-defaults').addEventListener('click', async () => {
    await apiFetch('/api/users/me', {
      method: 'PUT',
      body: JSON.stringify({ preferences: DEFAULT_PREFERENCES }),
    });
    window.location.reload();
  });
}

export function renderChatControlsPanel(container) {
  const updateUI = () => {
    const preferences = state.userProfile?.preferences || DEFAULT_PREFERENCES;
    container.innerHTML = buildControlsHtml(preferences);
    attachEventListeners(container, updateUI);
  };

  updateUI();
}
