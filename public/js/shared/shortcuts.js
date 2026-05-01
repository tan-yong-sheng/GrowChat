import { state, setState } from './store.js';

const SHORTCUTS = {
  search: ['mod', 'k'],
  newChat: ['mod', 'shift', 'o'],
  focusInput: ['shift', 'escape'],
  toggleSidebar: ['mod', 'shift', 's'],
  closeModal: ['escape'],
};

const MODIFIER_KEYS = new Set(['mod', 'ctrl', 'shift', 'alt']);

function isTypingTarget(target) {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return target.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
}

function normalizeKey(key) {
  return String(key || '').toLowerCase();
}

function matchShortcut(event, combo) {
  const keys = combo.map(normalizeKey);
  const wantsMod = keys.includes('mod') || keys.includes('ctrl');
  const wantsShift = keys.includes('shift');
  const wantsAlt = keys.includes('alt');
  const mainKeys = keys.filter((k) => !MODIFIER_KEYS.has(k));
  const keyPressed = normalizeKey(event.key);

  if (wantsMod !== Boolean(event.metaKey || event.ctrlKey)) return false;
  if (wantsShift !== Boolean(event.shiftKey)) return false;
  if (wantsAlt !== Boolean(event.altKey)) return false;
  if (mainKeys.length > 0 && !mainKeys.includes(keyPressed)) return false;
  return true;
}

export function initShortcuts() {
  const registry = [
    {
      id: 'search',
      combo: SHORTCUTS.search,
      allowWhenTyping: false,
      run: () => setState({ showSearch: !state.showSearch }),
    },
    {
      id: 'newChat',
      combo: SHORTCUTS.newChat,
      allowWhenTyping: false,
      run: () => document.getElementById('new-chat')?.click(),
    },
    {
      id: 'focusInput',
      combo: SHORTCUTS.focusInput,
      allowWhenTyping: true,
      run: () => document.getElementById('message-input')?.focus(),
    },
    {
      id: 'toggleSidebar',
      combo: SHORTCUTS.toggleSidebar,
      allowWhenTyping: false,
      run: () => setState({ showSidebar: !state.showSidebar }),
    },
    {
      id: 'closeModal',
      combo: SHORTCUTS.closeModal,
      allowWhenTyping: true,
      run: () => {
        if (state.showSearch) {
          setState({ showSearch: false });
          return true;
        }
        return false;
      },
    },
  ];

  document.addEventListener('keydown', (e) => {
    const typing = isTypingTarget(e.target);
    for (const action of registry) {
      if (!matchShortcut(e, action.combo)) continue;
      if (typing && !action.allowWhenTyping) continue;

      const result = action.run();
      if (result !== false) {
        e.preventDefault();
      }
      return;
    }
  });
}
