import { isTempMessageId } from '../../shared/utils/chat-cache.js';

/**
 * UI toggle and copy action bindings for chat messages.
 */

export function bindChatMessageUiActions(deps) {
  const {
    messagesList,
    projectedMessages,
    state,
    apiFetch,
    chatId,
    errorExpandedByMessageId,
    roundsByMessageId,
    branchSelectionByChat,
    resolveTempMessageId,
    setState,
    drawMessages,
    messages,
    showToast,
    waitForResolvedMessageId,
    getMessageById,
    currentLeafByChatId,
    setBranchSelection,
    loadMessages,
  } = deps;

  function onRoundSwitch(targetMsgId, direction) {
    const resolvedId = resolveTempMessageId(chatId, targetMsgId);
    const rounds = roundsByMessageId.get(String(resolvedId));
    if (!rounds) return;
    const nextId = direction === 'next' ? rounds.nextId : rounds.prevId;
    if (!nextId) return;
    const chatMap = branchSelectionByChat.get(chatId) || new Map();
    chatMap.set(String(rounds.parentKey), String(nextId));
    branchSelectionByChat.set(chatId, chatMap);
    currentLeafByChatId.set(chatId, String(nextId));
    drawMessages(messages);
  }

  messagesList.querySelectorAll('[data-error-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-error-toggle');
      if (!id) return;
      const isExpanded = errorExpandedByMessageId.get(String(id)) ?? false;
      const next = !isExpanded;
      errorExpandedByMessageId.set(String(id), next);

      const body = messagesList.querySelector(`[data-error-body="${id}"]`);
      const overlay = messagesList.querySelector(`[data-error-overlay="${id}"]`);
      if (body) {
        body.classList.toggle('max-h-24', !next);
        body.classList.toggle('overflow-hidden', !next);
      }
      if (overlay) {
        overlay.classList.toggle('hidden', next);
      }
      btn.textContent = next ? 'Less' : 'More';
    });
  });

  messagesList.querySelectorAll('[data-copy-message]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const idx = Number(btn.getAttribute('data-copy-message'));
      const text = projectedMessages[idx]?.content || '';
      try {
        await navigator.clipboard.writeText(text);
        showToast('Message copied');
      } catch {
        window.prompt('Copy message', text);
      }
    });
  });

  messagesList.querySelectorAll('[data-markdown-code-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const shell = btn.closest('[data-markdown-code-block]');
      const code = shell?.querySelector('[data-markdown-code-body] code');
      const text = code?.textContent || '';
      try {
        await navigator.clipboard.writeText(text);
        showToast('Code copied');
      } catch {
        window.prompt('Copy code', text);
      }
    });
  });

  messagesList.querySelectorAll('[data-markdown-code-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const shell = btn.closest('[data-markdown-code-block]');
      const body = shell?.querySelector('[data-markdown-code-body]');
      if (!body) return;
      const collapsed = !body.classList.contains('hidden');
      body.classList.toggle('hidden', collapsed);
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      const label = btn.querySelector('span');
      if (label) label.textContent = collapsed ? 'Expand' : 'Collapse';
    });
  });

  messagesList.querySelectorAll('[data-edit-message]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-edit-message');
      const m = projectedMessages.find((msg) => String(msg.id) === String(id));
      const content = m?.content || '';
      const newEditing = { ...state.ui.editingMessages, [id]: content };
      setState({ ui: { ...state.ui, editingMessages: newEditing } });
      drawMessages(messages);
    });
  });

  messagesList.querySelectorAll('[data-round-prev]').forEach((btn) => {
    btn.addEventListener('click', () => onRoundSwitch(btn.dataset.roundPrev, 'prev'));
  });
  messagesList.querySelectorAll('[data-round-next]').forEach((btn) => {
    btn.addEventListener('click', () => onRoundSwitch(btn.dataset.roundNext, 'next'));
  });

  messagesList.querySelectorAll('.cancel-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-message-id');
      const newEditing = { ...state.ui.editingMessages };
      delete newEditing[id];
      setState({ ui: { ...state.ui, editingMessages: newEditing } });
      drawMessages(messages);
    });
  });

  messagesList.querySelectorAll('.save-copy-btn').forEach((btn) => {
    // fallow-ignore-next-line complexity
    btn.addEventListener('click', async () => {
      const originalId = btn.getAttribute('data-message-id');
      let id = originalId;
      const textarea = messagesList.querySelector(
        `.edit-message-textarea[data-message-id="${originalId}"]`
      );
      const newContent = textarea?.value.trim() || '';
      if (isTempMessageId(id)) {
        const resolved = await waitForResolvedMessageId(state.activeChatId, id);
        if (!resolved) {
          showToast('Message still saving. Please wait.');
          return;
        }
        id = resolved;
      }
      if (!newContent) return;

      const sourceMsg =
        getMessageById(chatId, originalId) ||
        projectedMessages.find((msg) => String(msg.id) === String(originalId));

      try {
        const res = await apiFetch(`/api/chats/${chatId}/messages/${id}/branch`, {
          method: 'POST',
          body: JSON.stringify({
            content: newContent,
            role: 'assistant',
            no_reply: true,
          }),
        });

        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          const newEditing = { ...state.ui.editingMessages };
          delete newEditing[originalId];
          delete newEditing[id];
          setState({ ui: { ...state.ui, editingMessages: newEditing } });
          if (data?.message?.id) {
            currentLeafByChatId.set(chatId, String(data.message.id));
            setBranchSelection(chatId, sourceMsg?.parent_id || null, data.message.id);
          }
          await loadMessages(chatId);
        } else {
          const err = await res.json().catch(() => ({}));
          const message =
            err?.details?.message || err.error || err.message || 'Failed to copy message';
          alert(message);
        }
      } catch (e) {
        console.error('Copy failed', e);
        alert('An error occurred while copying the message.');
      }
    });
  });
}
