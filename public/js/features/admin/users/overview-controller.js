/**
 * Controller logic for the admin users overview (event binding, view updates).
 */
import { apiFetch } from '../../../shared/api.js';
import { fetchAdminUserAccess } from '../../../shared/admin-access.js';
import { setModalSaveButtonState } from '../modal-save-helpers.js';
import { displayFieldErrors, clearFormErrors } from '../../../shared/form-validation.js';
import { escapeHtml, normalizeRole, loadAdminRoles } from './overview-helpers.js';
import {
  adminApiFetch,
  setButtonDisabledStyles,
  validateFormCheck,
  buildUserPayloadFromForm,
  isFormDirty,
  bindDirtyListeners,
} from './overview-shared.js';
import {
  renderAccessInspectorContent,
  renderAclInspectorModal,
  renderEditUserModal,
  renderUserRows,
  renderLoadingRows,
} from './overview-render.js';

/**
 * @param {object} ctx - Shared mutable overview context
 * @returns {{ bindRowActions, updateView, applySearchFilter, syncSearchClearState, syncPendingState, setPending, isPending, refreshAccessInspector }}
 */
export function createOverviewController(ctx) {
  const {
    container,
    data,
    actions,
    uiState,
    tbody,
    searchInput,
    clearSearchBtn,
    clearSearchContainer,
    totalCount,
    pageRange,
    pageLabel,
    prevButton,
    nextButton,
    pageSizeSelect,
  } = ctx;

  function getPendingKey(type, userId) {
    return `${type}:${userId}`;
  }

  function setPending(type, userId, value) {
    uiState.pending[getPendingKey(type, userId)] = value;
    syncPendingState();
  }

  function baseValueFor(key, user) {
    switch (key) {
      case 'primary_role':
        return normalizeRole(user.primary_role || 'member');
      case 'account_status':
        return String(user.account_status || 'active');
      case 'name':
        return String(user.name || '').trim();
      case 'email':
        return String(user.email || '').trim();
      default:
        return '';
    }
  }

  async function refreshAccessInspector(userId) {
    if (!userId) return;
    const modal = uiState.accessInspector.modalEl;
    const body = uiState.accessInspector.bodyEl;
    if (!modal || !body) return;
    const currentToken = String(Date.now());
    uiState.accessInspector.userId = userId;
    uiState.accessInspector.refreshToken = currentToken;
    body.innerHTML = '<div class="text-sm text-gray-600">Refreshing ACL inspector...</div>';
    try {
      const payload = await fetchAdminUserAccess(userId);
      if (uiState.accessInspector.refreshToken !== currentToken) return;
      uiState.accessInspector.payload = payload;
      body.innerHTML = renderAccessInspectorContent(payload, uiState.accessInspector.showDisabled);
    } catch (err) {
      if (uiState.accessInspector.refreshToken !== currentToken) return;
      body.innerHTML = `
        <div class="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          ${escapeHtml(err.message || 'Failed to inspect user access')}
        </div>
      `;
    } finally {
      if (uiState.accessInspector.refreshToken === currentToken) {
        uiState.accessInspector.refreshToken = null;
      }
    }
  }

  function isPending(type, userId) {
    return Boolean(uiState.pending[getPendingKey(type, userId)]);
  }

  function applySearchFilter() {
    const query = String(uiState.query || '').toLowerCase();
    tbody.querySelectorAll('tr').forEach((row) => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(query) ? '' : 'none';
    });
  }

  function syncSearchClearState() {
    if (!clearSearchContainer) return;
    if (String(uiState.query || '').trim()) {
      clearSearchContainer.classList.remove('hidden');
    } else {
      clearSearchContainer.classList.add('hidden');
    }
  }

  function syncPendingState() {
    [
      ['.btn-change-role', 'role'],
      ['.btn-inspect-user-access', 'access'],
      ['.btn-edit-user', 'edit'],
      ['.btn-delete-user', 'delete'],
    ].forEach(([sel, type]) => {
      tbody.querySelectorAll(sel).forEach((btn) => {
        setButtonDisabledStyles(btn, isPending(type, btn.dataset.userId));
      });
    });
  }

  function bindRowActions() {
    tbody.querySelectorAll('.btn-change-role').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const currentRole = normalizeRole(btn.dataset.userRole || 'member');
        const userName = btn.dataset.userName;
        const userEmail = btn.dataset.userEmail || '';
        const userStatus = btn.dataset.userAccountStatus || 'active';
        const nextRole = currentRole === 'admin' ? 'member' : 'admin';
        if (!window.confirm(`Change role for ${userName} to ${nextRole.toUpperCase()}?`)) return;
        try {
          const { json: responsePayload } = await adminApiFetch(
            `/api/admin/users/${btn.dataset.userId}`,
            {
              method: 'PUT',
              body: JSON.stringify({
                primary_role: nextRole,
                account_status: userStatus,
                name: userName,
                email: userEmail,
              }),
            }
          );
          actions.updateUser(responsePayload.user);
        } catch (err) {
          window.alert(err?.message || 'Failed to update user.');
        }
      });
    });

    tbody.querySelectorAll('.btn-delete-user').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const userName = btn.dataset.userName;
        if (
          !window.confirm(
            `Delete user ${userName}? This will permanently remove the account record.`
          )
        )
          return;
        try {
          await adminApiFetch(`/api/admin/users/${btn.dataset.userId}`, {
            method: 'DELETE',
          });
          actions.removeUser(btn.dataset.userId);
        } catch (err) {
          window.alert(err?.message || 'Failed to delete user.');
        }
      });
    });

    tbody.querySelectorAll('.btn-inspect-user-access').forEach((btn) => {
      btn.addEventListener('click', async () => {
        setPending('access', btn.dataset.userId, true);
        uiState.accessInspector.userId = btn.dataset.userId;
        uiState.accessInspector.refreshToken = null;
        uiState.accessInspector.payload = null;
        uiState.accessInspector.showDisabled = false;

        const shell = renderAclInspectorModal(
          {
            name: btn.dataset.userName || '',
            email: btn.dataset.userEmail || '',
            primary_role: String(btn.dataset.userRole || 'member').trim(),
            account_status: btn.dataset.userAccountStatus || 'active',
          },
          '<div class="text-sm text-gray-600">Loading ACL inspector...</div>',
          () => {
            uiState.accessInspector.userId = null;
            uiState.accessInspector.refreshToken = null;
            uiState.accessInspector.payload = null;
            uiState.accessInspector.modalEl = null;
            uiState.accessInspector.bodyEl = null;
          }
        );
        uiState.accessInspector.modalEl = shell.modal;
        uiState.accessInspector.bodyEl = shell.bodyEl;
        shell.modal.classList.add('user-access-modal-shell');

        shell.modal?.addEventListener('click', (e) => {
          if (e.target.closest('[data-toggle-disabled-rules]')) {
            uiState.accessInspector.showDisabled = !uiState.accessInspector.showDisabled;
            if (uiState.accessInspector.payload && uiState.accessInspector.bodyEl) {
              uiState.accessInspector.bodyEl.innerHTML = renderAccessInspectorContent(
                uiState.accessInspector.payload,
                uiState.accessInspector.showDisabled
              );
            }
          }
        });

        try {
          await refreshAccessInspector(btn.dataset.userId);
        } catch (err) {
          if (uiState.accessInspector.bodyEl) {
            uiState.accessInspector.bodyEl.innerHTML = `
              <div class="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                ${escapeHtml(err.message || 'Failed to inspect user access')}
              </div>
            `;
          }
        } finally {
          setPending('access', btn.dataset.userId, false);
        }
      });
    });

    tbody.querySelectorAll('.btn-edit-user').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const roles = await loadAdminRoles();
          const user = {
            id: btn.dataset.userId,
            name: btn.dataset.userName || '',
            email: btn.dataset.userEmail || '',
            primary_role: String(btn.dataset.userRole || 'member').trim(),
            account_status: btn.dataset.userAccountStatus || 'active',
          };

          document.body.insertAdjacentHTML('beforeend', renderEditUserModal(user, null, roles));
          const modal = document.getElementById('edit-user-modal');
          const form = document.getElementById('edit-user-form');
          const saveBtn = modal?.querySelector('#edit-user-save-btn');

          const fieldNames = ['primary_role', 'account_status', 'name', 'email', 'password'];
          const fields = Object.fromEntries(
            fieldNames.map((n) => [n, form?.querySelector(`[name="${n}"]`)])
          );
          const baseValueKeys = ['primary_role', 'account_status', 'name', 'email', 'password'];
          const baseValues = Object.fromEntries(
            baseValueKeys.map((k) => [k, baseValueFor(k, user)])
          );

          const close = () => {
            modal?.remove();
          };

          const syncDirty = () => {
            setModalSaveButtonState(saveBtn, {
              enabled: isFormDirty(fields, baseValues),
              saving: false,
            });
          };

          const saveEdit = async () => {
            displayFieldErrors(form);
            if (!validateFormCheck(form)) return;
            const payload = buildUserPayloadFromForm(form);

            clearFormErrors(form);
            try {
              const { json: responsePayload } = await adminApiFetch(`/api/admin/users/${user.id}`, {
                method: 'PUT',
                body: JSON.stringify(payload),
              });
              actions.updateUser(responsePayload.user);
              close();
            } catch (err) {
              window.alert(err?.message || 'Failed to update user.');
            }
          };

          modal?.addEventListener('click', (e) => {
            if (e.target === modal || e.target.closest('[data-close-edit-user]')) {
              close();
            }
          });
          saveBtn?.addEventListener('click', () => {
            saveEdit();
          });
          bindDirtyListeners(form, syncDirty);
          form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            saveEdit();
          });

          syncDirty();
        } catch (err) {
          window.alert(err.message);
        }
      });
    });
  }

  // fallow-ignore-next-line complexity
  function updateView() {
    const users = data.users || [];
    const total = data.total || users.length;
    const page = data.pagination?.page || 1;
    const pageSize = data.pagination?.pageSize || 20;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const pageStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const pageEnd = Math.min(page * pageSize, total);

    totalCount.textContent = String(total);
    const isTableLoading =
      data.loading && (data.loadingMode === 'table' || data.loadingMode === 'initial');
    tbody.innerHTML = isTableLoading
      ? renderLoadingRows(Math.min(pageSize, 10))
      : renderUserRows(users);
    pageRange.textContent = `${pageStart}-${pageEnd} of ${total}`;
    pageLabel.textContent = `Page ${page} / ${totalPages}`;
    prevButton.disabled = data.loading || page <= 1;
    nextButton.disabled = data.loading || page >= totalPages;
    pageSizeSelect.disabled = data.loading;
    pageSizeSelect.value = String(pageSize);
    searchInput.value = uiState.query;

    if (!isTableLoading) {
      bindRowActions();
      applySearchFilter();
      syncPendingState();
    }
  }

  return {
    bindRowActions,
    updateView,
    applySearchFilter,
    syncSearchClearState,
    syncPendingState,
    setPending,
    isPending,
    refreshAccessInspector,
  };
}
