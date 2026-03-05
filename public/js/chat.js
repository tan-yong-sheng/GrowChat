import { apiFetch } from './api.js';

export function renderChat(container, state) {
  container.innerHTML = `
    <div class="h-full grid grid-cols-[280px_1fr]">
      <aside class="border-r bg-white p-4 overflow-y-auto">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-semibold">Chats</h2>
          <button id="new-chat" class="px-3 py-1 rounded bg-black text-white text-sm">New</button>
        </div>
        <ul id="chat-list" class="space-y-2"></ul>
      </aside>
      <section class="flex flex-col">
        <header class="px-4 py-3 border-b bg-white">
          <h2 id="chat-title" class="font-semibold">Select a chat</h2>
        </header>
        <main id="messages" class="flex-1 p-4 overflow-y-auto space-y-3"></main>
        <form id="composer" class="p-4 bg-white border-t flex gap-2">
          <input id="message-input" class="flex-1 border rounded px-3 py-2" placeholder="Type a message..." />
          <button class="px-4 py-2 rounded bg-black text-white">Send</button>
        </form>
      </section>
    </div>
  `;

  wireChat(container, state);
}

function wireChat(root, state) {
  const chatList = root.querySelector('#chat-list');
  const messagesEl = root.querySelector('#messages');
  const titleEl = root.querySelector('#chat-title');
  const composer = root.querySelector('#composer');
  const input = root.querySelector('#message-input');
  const newChatBtn = root.querySelector('#new-chat');

  function drawChats() {
    chatList.innerHTML = state.chats.map((c) => `
      <li>
        <button data-chat="${c.id}" class="w-full text-left px-3 py-2 rounded ${state.activeChatId === c.id ? 'bg-gray-200' : 'hover:bg-gray-100'}">${escapeHtml(c.title)}</button>
      </li>
    `).join('');

    chatList.querySelectorAll('[data-chat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activeChatId = btn.getAttribute('data-chat');
        drawChats();
        loadMessages(state.activeChatId);
      });
    });
  }

  function drawMessages(messages) {
    messagesEl.innerHTML = messages.map((m) => `
      <div class="${m.role === 'user' ? 'text-right' : 'text-left'}">
        <div class="inline-block rounded px-3 py-2 ${m.role === 'user' ? 'bg-black text-white' : 'bg-white border'}">${escapeHtml(m.content)}</div>
      </div>
    `).join('');
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function loadMessages(chatId) {
    if (!chatId) {
      titleEl.textContent = 'Select a chat';
      drawMessages([]);
      return;
    }

    const res = await apiFetch(`/api/chats/${chatId}`);
    if (!res.ok) return;
    const data = await res.json();
    titleEl.textContent = data.chat.title;
    state.messagesByChat[chatId] = data.messages;
    drawMessages(data.messages);
  }

  async function createChat() {
    const res = await apiFetch('/api/chats', { method: 'POST' });
    if (!res.ok) return;
    const data = await res.json();
    state.chats.unshift(data.chat);
    state.activeChatId = data.chat.id;
    drawChats();
    await loadMessages(data.chat.id);
  }

  async function sendMessage(e) {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || !state.activeChatId) return;

    input.value = '';
    const chatId = state.activeChatId;
    const current = state.messagesByChat[chatId] || [];
    current.push({ role: 'user', content: text });
    current.push({ role: 'assistant', content: '' });
    state.messagesByChat[chatId] = current;
    drawMessages(current);

    const res = await apiFetch(`/api/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message: text }),
    });
    if (!res.ok || !res.body) return;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';
    let assistantText = '';
    let streamFailed = false;

    const applyAssistantText = () => {
      current[current.length - 1] = { role: 'assistant', content: assistantText };
      drawMessages(current);
    };

    const applySseLine = (line) => {
      if (!line.startsWith('data: ')) return;
      const payload = line.slice(6).trim();
      if (!payload || payload === '[DONE]') return;
      try {
        const parsed = JSON.parse(payload);
        if (parsed.response) {
          assistantText += parsed.response;
          applyAssistantText();
          return;
        }
        if (parsed.error) {
          streamFailed = true;
          assistantText = parsed.message || 'LLM is unavailable right now.';
          applyAssistantText();
        }
      } catch {
        // ignore malformed chunks
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        if (sseBuffer) applySseLine(sseBuffer.replace(/\r$/, ''));
        break;
      }

      sseBuffer += decoder.decode(value, { stream: true });
      let newlineIdx;
      while ((newlineIdx = sseBuffer.indexOf('\n')) !== -1) {
        const line = sseBuffer.slice(0, newlineIdx).replace(/\r$/, '');
        sseBuffer = sseBuffer.slice(newlineIdx + 1);
        applySseLine(line);
      }
    }

    if (!assistantText && !streamFailed) {
      assistantText = 'No response from model.';
      applyAssistantText();
    }
  }

  newChatBtn.addEventListener('click', createChat);
  composer.addEventListener('submit', sendMessage);
  drawChats();
  if (state.activeChatId) loadMessages(state.activeChatId);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
