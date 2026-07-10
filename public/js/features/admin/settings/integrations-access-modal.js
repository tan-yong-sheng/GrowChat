/**
 * Tool server ACL access modal for the integrations settings view.
 *
 * fallow-ignore-file security-sink — The loadAccess body (loadAdminAclModalAccess
 * + cloneAclRules + buildRulesByGroup) duplicates connections-access-modal.js but
 * the onExecute callback is fundamentally different (short close vs full API save),
 * making extraction into a shared wrapper overkill for a 15-line / 53-token block.
 */

import { fetchAdminToolServerAccess } from '../../../shared/admin-access.js';
import { createAdminAclModalShell } from '../acl-modal.js';
import { broadcastToolServersInvalidation } from '../../../shared/utils/tool-server-sync.js';
import {
  bindAclModalBodyRender,
  buildAclSaveRules,
  buildRulesByGroup,
  cloneAclRules,
  createAclModalState,
  getAclRulesSignature,
  loadAdminAclModalAccess,
  queryAclModalElements,
  updateSaveButton,
  wrapAclSaveHandler,
} from './acl-modal-shared.js';

export async function openToolServerAccessModal(server, { onApply } = {}) {
  const { modal, close } = createAdminAclModalShell({
    idsPrefix: 'tool-server-acl',
    title: 'MCP Server Access',
    subtitle: server.name || server.id,
    closeAttr: 'data-close-tool-server-access',
  });

  const { listEl, errorEl, saveErrorEl, summaryEl, countEl, reasonEl, saveBtn } =
    queryAclModalElements(modal, 'tool-server-acl');
  let baseRules = [];

  const state = createAclModalState();

  // Single source of truth for the modal's body render. Called on load and
  // again whenever a rule effect changes so the summary/count text stays
  // in sync with rulesByGroup.
  const renderAll = bindAclModalBodyRender({
    state,
    summaryEl,
    countEl,
    reasonEl,
    listEl,
    errorEl,
    effectClass: 'tool-server-acl-effect',
    resourceLabel: 'MCP server',
  });

  const loadAccess = async () => {
    const result = await loadAdminAclModalAccess({
      fetchAccess: () => fetchAdminToolServerAccess(server.id),
      state,
      renderAll,
    });
    baseRules = cloneAclRules(result.rules || []);
    state.rulesByGroup = buildRulesByGroup(baseRules);
  };

  saveBtn?.addEventListener(
    'click',
    wrapAclSaveHandler({
      state,
      saveBtn,
      saveErrorEl,
      saveErrorMsg: 'Failed to save MCP server access',
      onExecute: async ({ rules }) => {
        const sameAsBase = getAclRulesSignature(rules) === getAclRulesSignature(baseRules);
        if (sameAsBase) {
          broadcastToolServersInvalidation();
          close();
          return;
        }
        if (typeof onApply === 'function') {
          await onApply(cloneAclRules(rules), server);
        }
        close();
      },
    })
  );

  document.body.appendChild(modal);
  renderAll();
  updateSaveButton(saveBtn, state);
  await loadAccess();
}
