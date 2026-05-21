/**
 * Audit Logs Admin UI
 * Displays audit log entries with filtering and export
 * Located in Admin Settings > Audit (full-page workspace)
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
 * Format absolute timestamp
 * @param {number} timestamp - Unix timestamp (seconds)
 * @returns {string} Formatted datetime string
 */
function formatTimestamp(timestamp) {
  if (!timestamp) return 'Unknown';
  return new Date(timestamp * 1000).toLocaleString();
}

/**
 * Get action badge class based on action type
 * @param {string} action - Action type
 * @returns {string} Badge class
 */
function getActionBadgeClass(action) {
  const a = String(action || '').toLowerCase();
  if (a.includes('delete') || a.includes('revoke')) {
    return 'bg-neutral-900 text-white';
  }
  return 'bg-neutral-100 text-neutral-900';
}

/**
 * Render table skeleton loading state
 * @param {number} rows - Number of skeleton rows
 * @returns {string} HTML string
 */
function renderTableSkeleton(rows = 5) {
  let html = `
    <table class="audit-table w-full">
      <thead>
        <tr class="border-b">
          <th class="text-left p-2 w-40">Timestamp</th>
          <th class="text-left p-2 w-32">User</th>
          <th class="text-left p-2 w-32">Action</th>
          <th class="text-left p-2">Resource</th>
          <th class="text-left p-2 w-32">IP Address</th>
        </tr>
      </thead>
      <tbody>
  `;
  for (let i = 0; i < rows; i++) {
    html += `
      <tr class="border-b animate-pulse">
        <td class="p-2"><div class="h-4 bg-gray-200 rounded w-32"></div></td>
        <td class="p-2"><div class="h-4 bg-gray-200 rounded w-24"></div></td>
        <td class="p-2"><div class="h-4 bg-gray-200 rounded w-20"></div></td>
        <td class="p-2"><div class="h-4 bg-gray-200 rounded w-40"></div></td>
        <td class="p-2"><div class="h-4 bg-gray-200 rounded w-24"></div></td>
      </tr>
    `;
  }
  html += '</tbody></table>';
  return html;
}

/**
 * Render audit logs table
 * @param {Array} logs - Array of audit log entries
 * @returns {string} HTML string
 */
function renderAuditTable(logs) {
  if (!logs || logs.length === 0) {
    return `
      <div class="empty-state text-center py-8 bg-gray-50 rounded-lg">
        <i class="bi bi-clipboard-data text-3xl text-gray-300 mb-2"></i>
        <p class="text-gray-700">No audit logs yet</p>
        <p class="text-sm text-gray-500 mt-1">Activity will appear here as users interact with the system.</p>
      </div>
    `;
  }

  return `
    <table class="audit-table w-full" role="table" aria-label="Audit log entries">
      <thead>
        <tr class="border-b bg-gray-50">
          <th class="text-left p-3 text-xs font-semibold text-gray-500 uppercase tracking-wide" scope="col">Timestamp</th>
          <th class="text-left p-3 text-xs font-semibold text-gray-500 uppercase tracking-wide" scope="col">User</th>
          <th class="text-left p-3 text-xs font-semibold text-gray-500 uppercase tracking-wide" scope="col">Action</th>
          <th class="text-left p-3 text-xs font-semibold text-gray-500 uppercase tracking-wide" scope="col">Resource</th>
          <th class="text-left p-3 text-xs font-semibold text-gray-500 uppercase tracking-wide" scope="col">IP Address</th>
        </tr>
      </thead>
      <tbody>
        ${logs.map(log => `
          <tr class="border-b hover:bg-gray-50 transition-colors">
            <td class="p-3 text-sm text-gray-600 whitespace-nowrap">${formatTimestamp(log.created_at)}</td>
            <td class="p-3 text-sm text-gray-900">${escapeHtml(log.user_email || log.user_id || 'System')}</td>
            <td class="p-3">
              <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getActionBadgeClass(log.action)}">
                ${escapeHtml(log.action)}
              </span>
            </td>
            <td class="p-3 text-sm text-gray-600">
              ${log.resource_type ? `${escapeHtml(log.resource_type)}` : ''}
              ${log.resource_id ? `<span class="text-gray-400">#${escapeHtml(log.resource_id.slice(0, 8))}</span>` : ''}
            </td>
            <td class="p-3 text-sm text-gray-500 font-mono">${escapeHtml(log.ip_address || '—')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

/**
 * Render pagination controls
 * @param {number} currentPage - Current page (1-indexed)
 * @param {number} totalPages - Total pages
 * @param {Function} onPageChange - Page change callback
 * @returns {HTMLElement} Pagination element
 */
function renderPagination(currentPage, totalPages, onPageChange) {
  const container = document.createElement('div');
  container.className = 'pagination flex items-center justify-between mt-4';

  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;

  container.innerHTML = `
    <div class="text-sm text-gray-500">
      Page ${currentPage} of ${totalPages}
    </div>
    <div class="flex gap-2">
      <button class="prev-btn btn-secondary btn-sm" ${!canPrev ? 'disabled' : ''} aria-label="Previous page">
        <i class="bi bi-chevron-left"></i> Previous
      </button>
      <button class="next-btn btn-secondary btn-sm" ${!canNext ? 'disabled' : ''} aria-label="Next page">
        Next <i class="bi bi-chevron-right"></i>
      </button>
    </div>
  `;

  container.querySelector('.prev-btn')?.addEventListener('click', () => {
    if (canPrev) onPageChange(currentPage - 1);
  });

  container.querySelector('.next-btn')?.addEventListener('click', () => {
    if (canNext) onPageChange(currentPage + 1);
  });

  return container;
}

/**
 * Render audit logs section with API integration
 * @param {Object} api - API helpers
 * @param {Function} api.apiFetch - Fetch wrapper
 * @param {Function} api.showToast - Toast notification helper
 * @returns {Promise<HTMLElement>} Container element
 */
export async function renderAuditLogsSection({ apiFetch, showToast }) {
  const container = document.createElement('div');
  container.className = 'audit-logs-section';

  let page = 1;
  const limit = 50;
  let filters = { userId: '', action: '' };

  async function loadLogs() {
    const params = new URLSearchParams({ limit, offset: (page - 1) * limit });
    if (filters.userId) params.append('userId', filters.userId);
    if (filters.action) params.append('action', filters.action);

    const res = await apiFetch(`/api/admin/audit-logs?${params}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to load audit logs');
    }
    return res.json();
  }

  function render() {
    const filterHtml = `
      <div class="audit-filters flex flex-wrap gap-3 mb-4 p-4 bg-gray-50 rounded-lg">
        <div class="flex-1 min-w-[200px]">
          <label class="block text-xs font-medium text-gray-500 mb-1" for="filter-user">Filter by user</label>
          <input type="text" id="filter-user"
                 class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                 placeholder="User ID or email"
                 value="${escapeHtml(filters.userId)}">
        </div>
        <div class="w-48">
          <label class="block text-xs font-medium text-gray-500 mb-1" for="filter-action">Action type</label>
          <select id="filter-action"
                  class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
            <option value="">All actions</option>
            <option value="auth" ${filters.action === 'auth' ? 'selected' : ''}>Authentication</option>
            <option value="user" ${filters.action === 'user' ? 'selected' : ''}>User changes</option>
            <option value="admin" ${filters.action === 'admin' ? 'selected' : ''}>Admin actions</option>
            <option value="chat" ${filters.action === 'chat' ? 'selected' : ''}>Chat actions</option>
          </select>
        </div>
        <div class="flex items-end gap-2">
          <button id="apply-filters" class="btn-primary">
            <i class="bi bi-funnel"></i> Apply
          </button>
          <button id="clear-filters" class="btn-secondary">
            Clear
          </button>
        </div>
        <div class="flex items-end ml-auto">
          <button id="export-csv" class="btn-secondary">
            <i class="bi bi-download"></i> Export CSV
          </button>
        </div>
      </div>
    `;

    container.innerHTML = `
      <div class="audit-header mb-4">
        <h2 class="text-xl font-semibold text-gray-900">Audit Logs</h2>
        <p class="text-sm text-gray-500 mt-1">System activity and security events</p>
      </div>
      ${filterHtml}
      <div class="audit-content">
        ${renderTableSkeleton(5)}
      </div>
    `;

    // Bind filter handlers
    container.querySelector('#apply-filters')?.addEventListener('click', async () => {
      const userInput = container.querySelector('#filter-user');
      const actionSelect = container.querySelector('#filter-action');

      filters.userId = userInput?.value?.trim() || '';
      filters.action = actionSelect?.value || '';
      page = 1;

      try {
        const data = await loadLogs();
        const contentEl = container.querySelector('.audit-content');
        if (contentEl) {
          contentEl.innerHTML = renderAuditTable(data.logs);

          // Add pagination if we have more than limit
          if (data.logs.length === limit || page > 1) {
            const paginationEl = renderPagination(page, Math.ceil(data.total / limit) || 1, async (newPage) => {
              page = newPage;
              await refreshContent();
            });
            contentEl.appendChild(paginationEl);
          }
        }
      } catch (err) {
        showToast?.(err.message, 'error');
      }
    });

    container.querySelector('#clear-filters')?.addEventListener('click', async () => {
      filters = { userId: '', action: '' };
      page = 1;

      const userInput = container.querySelector('#filter-user');
      const actionSelect = container.querySelector('#filter-action');
      if (userInput) userInput.value = '';
      if (actionSelect) actionSelect.value = '';

      await refreshContent();
    });

    container.querySelector('#export-csv')?.addEventListener('click', async () => {
      const btn = container.querySelector('#export-csv');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="bi bi-arrow-repeat animate-spin"></i> Exporting...';
      }

      try {
        const data = await loadLogs();
        const csvContent = generateCsv(data.logs);
        downloadCsv(csvContent, `audit-logs-${new Date().toISOString().split('T')[0]}.csv`);
        showToast?.('Audit logs exported', 'success');
      } catch (err) {
        showToast?.(err.message, 'error');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="bi bi-download"></i> Export CSV';
        }
      }
    });

    async function refreshContent() {
      const contentEl = container.querySelector('.audit-content');
      if (contentEl) {
        contentEl.innerHTML = renderTableSkeleton(5);
      }

      try {
        const data = await loadLogs();
        if (contentEl) {
          contentEl.innerHTML = renderAuditTable(data.logs);

          if (data.logs.length === limit || page > 1) {
            const paginationEl = renderPagination(page, Math.ceil(data.total / limit) || 1, async (newPage) => {
              page = newPage;
              await refreshContent();
            });
            contentEl.appendChild(paginationEl);
          }
        }
      } catch {
        if (contentEl) {
          contentEl.innerHTML = `
            <div class="error-state text-center py-8 bg-red-50 rounded-lg">
              <i class="bi bi-exclamation-triangle text-3xl text-red-400 mb-2"></i>
              <p class="text-red-700">Failed to load audit logs</p>
              <button class="btn-secondary mt-4" id="retry-load">Try again</button>
            </div>
          `;

          container.querySelector('#retry-load')?.addEventListener('click', refreshContent);
        }
      }
    }

    // Initial load
    refreshContent();
  }

  render();
  return container;
}

/**
 * Generate CSV content from audit logs
 * @param {Array} logs - Audit log entries
 * @returns {string} CSV content
 */
function generateCsv(logs) {
  const headers = ['Timestamp', 'User', 'Action', 'Resource Type', 'Resource ID', 'IP Address', 'Details'];
  const rows = logs.map(log => [
    formatTimestamp(log.created_at),
    log.user_email || log.user_id || 'System',
    log.action,
    log.resource_type || '',
    log.resource_id || '',
    log.ip_address || '',
    log.details ? JSON.stringify(log.details) : '',
  ]);

  return [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');
}

/**
 * Download CSV file
 * @param {string} content - CSV content
 * @param {string} filename - Download filename
 */
function downloadCsv(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
