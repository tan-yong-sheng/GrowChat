/**
 * Admin users overview page renderer.
 */
import { apiFetch } from '../../../shared/api.js';
import { setModalSaveButtonState } from '../modal-save-helpers.js';
import { escapeHtml, normalizeRole, getActionError, loadAdminRoles } from './overview-helpers.js';
import {
  adminApiFetch,
  setButtonDisabledStyles,
  validateFormCheck,
  buildUserPayloadFromForm,
  isFormDirty,
  bindDirtyListeners,
} from './overview-shared.js';
import { renderAddUserModal } from './overview-render.js';
import { createOverviewController } from './overview-controller.js';

export function renderUserOverview(container, data, actions) {
  const uiState =
    data.userOverviewUi ||
    (data.userOverviewUi = {
      query: '',
      pending: {},
      accessInspector: {
        userId: null,
        refreshToken: null,
        payload: null,
        showDisabled: false,
        modalEl: null,
        bodyEl: null,
      },
    });

  container.innerHTML = `
    <div class="flex flex-col min-h-0 animate-in fade-in duration-300">
      <div class="pt-0.5 pb-2.5 flex justify-between items-center bg-white">
        <div class="flex items-center text-xl font-medium px-0.5 gap-2">
          <h1 class="flex-shrink-0 text-gray-900">Users</h1>
          <div class="text-gray-500 font-normal ml-0.5" id="users-total-count"></div>
        </div>
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-1.5 bg-gray-50/50 px-3 py-1.5 rounded-md border border-gray-100/30 w-64">
            <div class="flex-shrink-0 text-gray-600">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
                <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
              </svg>
            </div>
            <input class="w-full text-sm outline-none bg-transparent text-gray-700 placeholder-gray-400" placeholder="Search users" id="user-search-input">
            <div id="clear-search-container" class="hidden ml-1.5">
              <button id="clear-search-btn" class="p-0.5 rounded-full hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20 transition">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="size-5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <button id="open-add-user-modal" class="w-10 h-10 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20 flex items-center justify-center" title="Add User">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>
          </button>
        </div>
      </div>
      <div class="relative w-full rounded-lg border border-gray-100 bg-white">
        <div class="min-w-[1120px]">
          <table class="w-full text-sm text-left text-gray-500 table-fixed">
            <thead class="text-label-sm text-gray-900 font-bold uppercase bg-gray-50/50">
              <tr class="border-b border-gray-100">
                <th scope="col" class="px-3 py-3 w-24">Role</th>
                <th scope="col" class="px-3 py-3 w-1/4">Name</th>
                <th scope="col" class="px-3 py-3 w-24">Status</th>
                <th scope="col" class="px-3 py-3 w-1/3">Email</th>
                <th scope="col" class="px-3 py-3 w-24">Last Active</th>
                <th scope="col" class="px-3 py-3 w-28">Created At</th>
                <th scope="col" class="px-3 py-3 w-24 text-right"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody id="users-table-body" class="divide-y divide-gray-50/50"></tbody>
          </table>
        </div>
      </div>
      <div class="flex items-center justify-between gap-4 py-4 px-0.5 text-sm text-gray-500">
        <div class="flex items-center gap-3">
          <span>Show</span>
          <select id="users-page-size" aria-label="Users per page" class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:ring-1 focus:ring-gray-300">
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
          <span>per page</span>
        </div>
        <div class="flex items-center gap-4">
          <div class="text-xs text-gray-600" id="users-page-range"></div>
          <div class="flex items-center gap-2">
            <button id="users-page-prev" class="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20 transition disabled:opacity-50">Prev</button>
            <div class="text-sm text-gray-600" id="users-page-label"></div>
            <button id="users-page-next" class="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20 transition disabled:opacity-50">Next</button>
          </div>
        </div>
      </div>
      <div class="text-gray-600 text-label-sm flex items-center justify-end gap-1.5 px-0.5">
        <span>ⓘ</span>
        <span>Admins are listed first, then all users are sorted alphabetically.</span>
      </div>
    </div>
  `;

  const searchInput = container.querySelector('#user-search-input');
  const clearSearchBtn = container.querySelector('#clear-search-btn');
  const clearSearchContainer = container.querySelector('#clear-search-container');
  const tbody = container.querySelector('#users-table-body');
  const totalCount = container.querySelector('#users-total-count');
  const pageRange = container.querySelector('#users-page-range');
  const pageLabel = container.querySelector('#users-page-label');
  const prevButton = container.querySelector('#users-page-prev');
  const nextButton = container.querySelector('#users-page-next');
  const pageSizeSelect = container.querySelector('#users-page-size');

  const ctrl = createOverviewController({
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
  });

  // Access inspector invalidation listeners
  if (!uiState.accessInspectorListenersBound) {
    if (typeof window.__growchatAccessInspectorCleanup === 'function') {
      window.__growchatAccessInspectorCleanup();
    }
    uiState.accessInspectorListenersBound = true;
    const handleAccessInvalidation = () => {
      if (uiState.accessInspector?.userId && uiState.accessInspector.modalEl) {
        ctrl.refreshAccessInspector(uiState.accessInspector.userId);
      }
    };
    window.addEventListener('growchat:models-invalidated', handleAccessInvalidation);
    window.addEventListener('growchat:connections-invalidated', handleAccessInvalidation);
    window.addEventListener('growchat:tool-servers-invalidated', handleAccessInvalidation);
    uiState.accessInspectorCleanup = () => {
      window.removeEventListener('growchat:models-invalidated', handleAccessInvalidation);
      window.removeEventListener('growchat:connections-invalidated', handleAccessInvalidation);
      window.removeEventListener('growchat:tool-servers-invalidated', handleAccessInvalidation);
      uiState.accessInspectorListenersBound = false;
    };
    window.__growchatAccessInspectorCleanup = uiState.accessInspectorCleanup;
  }

  // Search events
  searchInput?.addEventListener('input', (e) => {
    uiState.query = String(e.target.value || '');
    ctrl.syncSearchClearState();
    ctrl.applySearchFilter();
  });

  clearSearchBtn?.addEventListener('click', () => {
    if (!searchInput) return;
    uiState.query = '';
    searchInput.value = '';
    ctrl.syncSearchClearState();
    searchInput.focus();
    ctrl.applySearchFilter();
  });

  // Pagination events
  pageSizeSelect?.addEventListener('change', async (e) => {
    data.pagination.pageSize = parseInt(e.target.value, 10);
    data.pagination.page = 1;
    await actions.reload({ preserveContent: true });
  });

  prevButton?.addEventListener('click', async () => {
    if (data.pagination.page <= 1) return;
    data.pagination.page -= 1;
    await actions.reload({ preserveContent: true });
  });

  const computeTotalPages = () =>
    Math.max(1, Math.ceil((data.total || 0) / (data.pagination?.pageSize || 20)));

  nextButton?.addEventListener('click', async () => {
    const totalPages = computeTotalPages();
    if (data.pagination.page >= totalPages) return;
    data.pagination.page += 1;
    await actions.reload({ preserveContent: true });
  });

  // Add user modal
  container.querySelector('#open-add-user-modal')?.addEventListener('click', async () => {
    const roles = await loadAdminRoles();
    document.body.insertAdjacentHTML(
      'beforeend',
      renderAddUserModal(
        {
          primary_role: 'member',
          account_status: 'active',
          name: '',
          email: '',
          password: '',
          csv: '',
          tab: 'form',
        },
        roles
      )
    );
    const modal = document.getElementById('add-user-modal');
    const form = document.getElementById('add-user-form');
    const csvForm = document.getElementById('add-user-csv-form');
    const formTab = modal?.querySelector('[data-add-user-tab="form"]');
    const csvTab = modal?.querySelector('[data-add-user-tab="csv"]');
    const saveBtn = modal?.querySelector('#add-user-save-btn');
    const fields = {
      primary_role: form?.querySelector('[name="primary_role"]'),
      account_status: form?.querySelector('[name="account_status"]'),
      name: form?.querySelector('[name="name"]'),
      email: form?.querySelector('[name="email"]'),
      password: form?.querySelector('[name="password"]'),
      csv: csvForm?.querySelector('[name="csv"]'),
    };
    const modalState = { activeTab: 'form', dirty: false };
    const baseValues = {
      primary_role: 'member',
      account_status: 'active',
      name: '',
      email: '',
      password: '',
      csv: '',
    };
    const syncDirty = () => {
      modalState.dirty = isFormDirty(fields, baseValues);
      setModalSaveButtonState(saveBtn, { enabled: modalState.dirty, saving: false });
    };
    const close = () => {
      modal?.remove();
    };
    const applyAddUserTabClasses = (tabEl, active) => {
      if (!tabEl) return;
      tabEl.setAttribute('aria-pressed', String(active));
      const classes = [
        ['text-gray-900', active],
        ['border-gray-900', active],
        ['text-gray-600', !active],
        ['border-transparent', !active],
      ];
      for (const [cls, condition] of classes) {
        tabEl.classList.toggle(cls, condition);
      }
    };

    const setTab = (tab) => {
      const isForm = tab === 'form';
      modalState.activeTab = tab;
      form?.classList.toggle('hidden', !isForm);
      csvForm?.classList.toggle('hidden', isForm);
      applyAddUserTabClasses(formTab, isForm);
      applyAddUserTabClasses(csvTab, !isForm);
      syncDirty();
    };
    formTab?.addEventListener('click', () => setTab('form'));
    csvTab?.addEventListener('click', () => setTab('csv'));
    modal?.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('[data-close-add-user]')) {
        close();
      }
    });
    const saveCurrent = () => {
      void (async () => {
        try {
          if (modalState.activeTab === 'csv') {
            if (!validateFormCheck(csvForm)) return;
            const { json: responsePayload } = await adminApiFetch('/api/admin/users/import', {
              method: 'POST',
              body: JSON.stringify({
                csv: String(csvForm.querySelector('[name="csv"]').value || '').trim(),
              }),
            });
            actions.invalidateCache?.();
            await actions.reload?.({ preserveContent: true });
          } else {
            if (!validateFormCheck(form)) return;
            const payload = buildUserPayloadFromForm(form);
            const { json: responsePayload } = await adminApiFetch('/api/admin/users', {
              method: 'POST',
              body: JSON.stringify(payload),
            });
            actions.prependUser(responsePayload.user);
          }
          close();
        } catch (err) {
          const errorEl = modal?.querySelector('#add-user-error');
          if (errorEl) {
            errorEl.textContent = err?.message || 'Failed to save user.';
            errorEl.classList.remove('hidden');
          }
        }
      })();
    };
    saveBtn?.addEventListener('click', () => {
      saveCurrent();
    });
    bindDirtyListeners(form, syncDirty);
    bindDirtyListeners(csvForm, syncDirty);
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      saveCurrent();
    });
    csvForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      saveCurrent();
    });
    setTab(modalState.activeTab);
  });

  ctrl.updateView();
  ctrl.syncSearchClearState();
}
