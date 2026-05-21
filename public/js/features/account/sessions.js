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

function formatRelativeTime(timestamp) {
  if (!timestamp) return 'Unknown';
  const seconds = Math.floor((Date.now() / 1000) - timestamp);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

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

export function renderSessionsList(sessions, { onRevoke, onRevokeAll }) {
  const container = document.createElement('div');
  container.className = 'sessions-list';
  container.setAttribute('role', 'region');
  container.setAttribute('aria-label', 'Active sessions');

  const sessionList = Array.isArray(sessions) ? sessions : [];
  let html = '<h3 class="text-lg font-medium mb-4">Active Sessions</h3>';
  html += `
    <div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 mb-4">
      This list shows your active sessions. The current browser session isn’t yet mapped to a server session ID in this view, so every entry can be revoked here.
    </div>
  `;

  if (sessionList.length > 0) {
    html += `
      <h4 class="text-sm font-medium text-gray-700 mb-2" id="other-sessions-heading">
        Sessions (${sessionList.length})
      </h4>
      <div class="other-sessions" role="list" aria-labelledby="other-sessions-heading">
    `;

    sessionList.forEach((session) => {
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
    html += `
      <button class="revoke-all-btn btn-danger-outline mt-4 w-full" id="revoke-all-other">
        <i class="bi bi-x-lg mr-1"></i>
        Revoke all sessions shown here (${sessionList.length})
      </button>
    `;
  } else {
    html += `
      <div class="empty-state bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
        <i class="bi bi-check-circle text-3xl text-green-500 mb-2"></i>
        <p class="text-gray-700 font-medium">No sessions found</p>
        <p class="text-sm text-gray-500 mt-1">There are no active sessions to display.</p>
      </div>
    `;
  }

  container.innerHTML = html;

  container.querySelectorAll('.revoke-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sessionId = btn.dataset.sessionId;
      const card = btn.closest('.session-card');
      const deviceName = card?.querySelector('.font-medium')?.textContent || 'this device';

      if (confirm(`Are you sure you want to revoke the session from "${deviceName}"?`)) {
        btn.disabled = true;
        btn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full"></span>';

        try {
          await onRevoke(sessionId);
          card.style.transition = 'opacity 0.3s, transform 0.3s';
          card.style.opacity = '0';
          card.style.transform = 'translateX(-20px)';

          setTimeout(() => {
            card.remove();
            const remainingCards = container.querySelectorAll('.other-sessions .session-card');
            if (remainingCards.length === 0) {
              const otherSection = container.querySelector('.other-sessions');
              const revokeAllBtn = container.querySelector('#revoke-all-other');
              const heading = container.querySelector('#other-sessions-heading');
              if (otherSection) otherSection.remove();
              if (revokeAllBtn) revokeAllBtn.remove();
              if (heading) heading.remove();
              container.innerHTML = `
                <h3 class="text-lg font-medium mb-4">Active Sessions</h3>
                <div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 mb-4">
                  This list shows your active sessions. The current browser session isn’t yet mapped to a server session ID in this view, so every entry can be revoked here.
                </div>
                <div class="empty-state bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
                  <i class="bi bi-check-circle text-3xl text-green-500 mb-2"></i>
                  <p class="text-gray-700 font-medium">No sessions remain in this list</p>
                  <p class="text-sm text-gray-500 mt-1">This view does not distinguish the current browser session.</p>
                </div>
              `;
            } else {
              const heading = container.querySelector('#other-sessions-heading');
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

  const revokeAllBtn = container.querySelector('#revoke-all-other');
  if (revokeAllBtn) {
    revokeAllBtn.addEventListener('click', async () => {
      const count = sessionList.length;
      if (confirm(`Are you sure you want to revoke all ${count} sessions shown here?`)) {
        revokeAllBtn.disabled = true;
        revokeAllBtn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full mr-2"></span> Revoking...';

        try {
          await onRevokeAll();
          container.querySelectorAll('.other-sessions .session-card').forEach((card) => {
            card.style.transition = 'opacity 0.3s';
            card.style.opacity = '0';
          });

          setTimeout(() => {
            const otherSection = container.querySelector('.other-sessions');
            if (otherSection) otherSection.remove();
            revokeAllBtn.remove();
            const heading = container.querySelector('#other-sessions-heading');
            if (heading) heading.remove();
            container.innerHTML = `
              <h3 class="text-lg font-medium mb-4">Active Sessions</h3>
              <div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 mb-4">
                This list shows your active sessions. The current browser session isn’t yet mapped to a server session ID in this view, so every entry can be revoked here.
              </div>
              <div class="empty-state bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
                <i class="bi bi-check-circle text-3xl text-green-500 mb-2"></i>
                <p class="text-gray-700 font-medium">No sessions remain in this list</p>
                <p class="text-sm text-gray-500 mt-1">This view does not distinguish the current browser session.</p>
              </div>
            `;
          }, 300);
        } catch (err) {
          revokeAllBtn.disabled = false;
          revokeAllBtn.innerHTML = `<i class="bi bi-x-lg mr-1"></i> Revoke all sessions shown here (${count})`;
          throw err;
        }
      }
    });
  }

  return container;
}

export async function renderSessionsSection({ apiFetch, showToast }) {
  const container = document.createElement('div');
  container.className = 'sessions-section';

  container.innerHTML = `
    <h3 class="text-lg font-medium mb-4">Active Sessions</h3>
    ${renderSkeletonCards(3)}
  `;

  try {
    const res = await apiFetch('/api/user/sessions');
    if (!res.ok) {
      throw new Error('Failed to load sessions');
    }
    const data = await res.json();

    container.innerHTML = '';
    const listEl = renderSessionsList(data.sessions || [], {
      onRevoke: async (sessionId) => {
        const revokeRes = await apiFetch(`/api/user/sessions/${sessionId}`, {
          method: 'DELETE',
        });
        if (!revokeRes.ok) {
          const errData = await revokeRes.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to revoke session');
        }
        data.sessions = (data.sessions || []).filter((s) => s.id !== sessionId);
        showToast('Session revoked', 'success');
      },
      onRevokeAll: async () => {
        const sessions = (data.sessions || []);
        await Promise.all(sessions.map(async (session) => {
          const res = await apiFetch(`/api/user/sessions/${session.id}`, { method: 'DELETE' });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `Failed to revoke session ${session.id}`);
          }
        }));
        data.sessions = [];
        showToast('All sessions revoked', 'success');
      },
    });

    container.appendChild(listEl);
  } catch {
    container.innerHTML = `
      <div class="error-state text-center py-8">
        <i class="bi bi-exclamation-circle text-3xl text-red-500 mb-2"></i>
        <p class="text-gray-700">Failed to load sessions</p>
        <button class="btn-secondary mt-4" id="retry-sessions">Try again</button>
      </div>
    `;

    container.querySelector('#retry-sessions')?.addEventListener('click', async () => {
      const next = await renderSessionsSection({ apiFetch, showToast });
      container.replaceWith(next);
    });
  }

  return container;
}

export function renderSessionsLoading() {
  const container = document.createElement('div');
  container.className = 'sessions-section';
  container.innerHTML = `
    <h3 class="text-lg font-medium mb-4">Active Sessions</h3>
    ${renderSkeletonCards(3)}
  `;
  return container;
}
