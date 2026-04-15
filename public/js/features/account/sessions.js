/**
 * Session Management UI
 * Displays active sessions with revoke functionality
 * Located in My Settings > Security (drawer)
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
 * Format relative time
 * @param {number} timestamp - Unix timestamp (seconds)
 * @returns {string} Human-readable relative time
 */
function formatRelativeTime(timestamp) {
  if (!timestamp) return 'Unknown';
  const seconds = Math.floor((Date.now() / 1000) - timestamp);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

/**
 * Get device icon based on device string
 * @param {string} device - Device name
 * @returns {string} Icon class
 */
function getDeviceIcon(device) {
  const d = String(device || '').toLowerCase();
  if (d.includes('iphone') || d.includes('android') || d.includes('mobile')) {
    return 'bi-phone';
  }
  if (d.includes('ipad') || d.includes('tablet')) {
    return 'bi-tablet';
  }
  if (d.includes('mac') || d.includes('windows') || d.includes('linux')) {
    return 'bi-laptop';
  }
  return 'bi-display';
}

/**
 * Render skeleton loading state
 * @param {number} count - Number of skeleton cards
 * @returns {string} HTML string
 */
function renderSkeletonCards(count = 3) {
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `
      <div class="session-card bg-gray-50 border rounded-lg p-4 mb-2 animate-pulse">
        <div class="flex items-center justify-between">
          <div class="flex-1">
            <div class="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
            <div class="h-3 bg-gray-200 rounded w-1/2"></div>
          </div>
          <div class="h-8 w-16 bg-gray-200 rounded"></div>
        </div>
      </div>
    `;
  }
  return html;
}

/**
 * Render sessions list
 * @param {Array} sessions - Array of session objects
 * @param {Object} options - Options
 * @param {string} options.currentSessionId - Current session ID
 * @param {Function} options.onRevoke - Called when revoking (sessionId) => Promise<void>
 * @param {Function} options.onRevokeAll - Called when revoking all other sessions () => Promise<void>
 * @returns {HTMLElement} Container element
 */
export function renderSessionsList(sessions, { currentSessionId, onRevoke, onRevokeAll }) {
  const container = document.createElement('div');
  container.className = 'sessions-list';
  container.setAttribute('role', 'region');
  container.setAttribute('aria-label', 'Active sessions');

  const currentSession = sessions.find(s => s.id === currentSessionId);
  const otherSessions = sessions.filter(s => s.id !== currentSessionId);

  let html = '<h3 class="text-lg font-medium mb-4">Active Sessions</h3>';

  // Current session (highlighted)
  if (currentSession) {
    html += `
      <div class="session-card current-session bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4" 
           data-current="true" 
           data-session-id="${escapeHtml(currentSession.id)}"
           aria-label="Current session: ${escapeHtml(currentSession.device)}">
        <div class="flex items-center gap-3">
          <i class="bi ${getDeviceIcon(currentSession.device)} text-xl text-blue-600"></i>
          <div class="flex-1">
            <div class="flex items-center gap-2">
              <span class="font-medium text-gray-900">${escapeHtml(currentSession.device)}</span>
              <span class="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">This device</span>
            </div>
            <p class="text-sm text-gray-500">${escapeHtml(currentSession.ip || 'Unknown location')}</p>
          </div>
        </div>
      </div>
    `;
  }

  // Other sessions
  if (otherSessions.length > 0) {
    html += `
      <h4 class="text-sm font-medium text-gray-700 mb-2" id="other-sessions-heading">
        Other sessions (${otherSessions.length})
      </h4>
      <div class="other-sessions" role="list" aria-labelledby="other-sessions-heading">
    `;

    otherSessions.forEach(session => {
      html += `
        <div class="session-card bg-white border rounded-lg p-4 mb-2 hover:border-gray-300 transition-colors"
             data-session-id="${escapeHtml(session.id)}"
             role="listitem"
             aria-label="Session: ${escapeHtml(session.device)}">
          <div class="flex items-center gap-3">
            <i class="bi ${getDeviceIcon(session.device)} text-xl text-gray-400"></i>
            <div class="flex-1 min-w-0">
              <span class="font-medium text-gray-900 truncate block">${escapeHtml(session.device)}</span>
              <p class="text-sm text-gray-500 truncate">${escapeHtml(session.ip || 'Unknown location')}</p>
              <p class="text-xs text-gray-400">Last active: ${formatRelativeTime(session.lastActive)}</p>
            </div>
            <button class="revoke-btn btn-danger btn-sm flex-shrink-0"
                    data-session-id="${escapeHtml(session.id)}"
                    aria-label="Revoke session from ${escapeHtml(session.device)}">
              Revoke
            </button>
          </div>
        </div>
      `;
    });

    html += '</div>';

    // Revoke all button
    html += `
      <button class="revoke-all-btn btn-danger-outline mt-4 w-full" id="revoke-all-other">
        <i class="bi bi-x-lg mr-1"></i>
        Revoke all other sessions (${otherSessions.length})
      </button>
    `;
  } else {
    // Empty state - warm and reassuring
    html += `
      <div class="empty-state bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
        <i class="bi bi-check-circle text-3xl text-green-500 mb-2"></i>
        <p class="text-gray-700 font-medium">No other sessions</p>
        <p class="text-sm text-gray-500 mt-1">You're only logged in on this device.</p>
      </div>
    `;
  }

  container.innerHTML = html;

  // Wire up revoke buttons
  container.querySelectorAll('.revoke-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const sessionId = btn.dataset.sessionId;
      const card = btn.closest('.session-card');
      const deviceName = card?.querySelector('.font-medium')?.textContent || 'this device';

      if (confirm(`Are you sure you want to revoke the session from "${deviceName}"?`)) {
        btn.disabled = true;
        btn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full"></span>';

        try {
          await onRevoke(sessionId);

          // Animate card out
          card.style.transition = 'opacity 0.3s, transform 0.3s';
          card.style.opacity = '0';
          card.style.transform = 'translateX(-20px)';

          setTimeout(() => {
            card.remove();

            // Update count and check for empty state
            const remainingCards = container.querySelectorAll('.other-sessions .session-card');
            if (remainingCards.length === 0) {
              // Replace with empty state
              const otherSection = container.querySelector('.other-sessions');
              const revokeAllBtn = container.querySelector('#revoke-all-other');
              const heading = container.querySelector('#other-sessions-heading');

              if (otherSection) otherSection.remove();
              if (revokeAllBtn) revokeAllBtn.remove();
              if (heading) heading.remove();

              // Add empty state
              container.querySelector('.session-card[data-current="true"]')?.insertAdjacentHTML('afterend', `
                <div class="empty-state bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
                  <i class="bi bi-check-circle text-3xl text-green-500 mb-2"></i>
                  <p class="text-gray-700 font-medium">No other sessions</p>
                  <p class="text-sm text-gray-500 mt-1">You're only logged in on this device.</p>
                </div>
              `);
            } else {
              // Update count
              const countMatch = heading?.textContent?.match(/\(\d+\)/);
              if (countMatch && heading) {
                heading.textContent = heading.textContent.replace(/\(\d+\)/, `(${remainingCards.length})`);
              }
            }
          }, 300);
        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'Revoke';
          throw err;
        }
      }
    });
  });

  // Revoke all button
  const revokeAllBtn = container.querySelector('#revoke-all-other');
  if (revokeAllBtn) {
    revokeAllBtn.addEventListener('click', async () => {
      const count = otherSessions.length;
      if (confirm(`Are you sure you want to revoke all ${count} other sessions?`)) {
        revokeAllBtn.disabled = true;
        revokeAllBtn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full mr-2"></span> Revoking...';

        try {
          await onRevokeAll();

          // Remove all other session cards
          container.querySelectorAll('.other-sessions .session-card').forEach(card => {
            card.style.transition = 'opacity 0.3s';
            card.style.opacity = '0';
          });

          setTimeout(() => {
            const otherSection = container.querySelector('.other-sessions');
            if (otherSection) otherSection.remove();
            revokeAllBtn.remove();

            const heading = container.querySelector('#other-sessions-heading');
            if (heading) heading.remove();

            // Add empty state
            container.querySelector('.session-card[data-current="true"]')?.insertAdjacentHTML('afterend', `
              <div class="empty-state bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
                <i class="bi bi-check-circle text-3xl text-green-500 mb-2"></i>
                <p class="text-gray-700 font-medium">No other sessions</p>
                <p class="text-sm text-gray-500 mt-1">You're only logged in on this device.</p>
              </div>
            `);
          }, 300);
        } catch (err) {
          revokeAllBtn.disabled = false;
          revokeAllBtn.innerHTML = `<i class="bi bi-x-lg mr-1"></i> Revoke all other sessions (${count})`;
          throw err;
        }
      }
    });
  }

  return container;
}

/**
 * Render sessions section with API integration
 * @param {Object} api - API helpers
 * @param {Function} api.apiFetch - Fetch wrapper
 * @param {Function} api.showToast - Toast notification helper
 * @param {string} api.currentSessionId - Current session ID
 * @returns {Promise<HTMLElement>} Container element
 */
export async function renderSessionsSection({ apiFetch, showToast, currentSessionId }) {
  const container = document.createElement('div');
  container.className = 'sessions-section';

  // Show loading state
  container.innerHTML = `
    <h3 class="text-lg font-medium mb-4">Active Sessions</h3>
    ${renderSkeletonCards(3)}
  `;

  try {
    // Fetch sessions
    const res = await apiFetch('/api/user/sessions');
    if (!res.ok) {
      throw new Error('Failed to load sessions');
    }
    const data = await res.json();

    // Clear loading state
    container.innerHTML = '';

    // Render sessions list
    const listEl = renderSessionsList(data.sessions || [], {
      currentSessionId,
      onRevoke: async (sessionId) => {
        const revokeRes = await apiFetch(`/api/user/sessions/${sessionId}`, {
          method: 'DELETE',
        });
        if (!revokeRes.ok) {
          const errData = await revokeRes.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to revoke session');
        }
        showToast('Session revoked', 'success');
      },
      onRevokeAll: async () => {
        // Revoke all other sessions
        const otherSessions = (data.sessions || []).filter(s => s.id !== currentSessionId);
        await Promise.all(
          otherSessions.map(s =>
            apiFetch(`/api/user/sessions/${s.id}`, { method: 'DELETE' })
          )
        );
        showToast('All other sessions revoked', 'success');
      },
    });

    container.appendChild(listEl);
  } catch (err) {
    container.innerHTML = `
      <div class="error-state text-center py-8">
        <i class="bi bi-exclamation-circle text-3xl text-red-500 mb-2"></i>
        <p class="text-gray-700">Failed to load sessions</p>
        <button class="btn-secondary mt-4" id="retry-sessions">Try again</button>
      </div>
    `;

    container.querySelector('#retry-sessions')?.addEventListener('click', () => {
      // Re-render
      return renderSessionsSection({ apiFetch, showToast, currentSessionId });
    });
  }

  return container;
}

/**
 * Render loading skeleton
 * @returns {HTMLElement} Container with skeleton
 */
export function renderSessionsLoading() {
  const container = document.createElement('div');
  container.className = 'sessions-section';
  container.innerHTML = `
    <h3 class="text-lg font-medium mb-4">Active Sessions</h3>
    ${renderSkeletonCards(3)}
  `;
  return container;
}
