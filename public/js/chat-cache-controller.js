import { state, setState } from './store.js';
import { pruneCachedChats } from './utils/chat-cache.js';

export function createChatCacheController({
  currentState = state,
  setStateFn = setState,
  recentChatIds = [],
  maxCachedChats = 6,
} = {}) {
  let pruneScheduled = false;
  let isPruning = false;

  function pruneChatCaches() {
    if (isPruning) return;
    isPruning = true;
    const result = pruneCachedChats({
      state: currentState,
      recentChatIds,
      maxCachedChats,
    });
    if (result.changed) {
      setStateFn({ messagesByChat: result.messagesByChat, attachmentsByChat: result.attachmentsByChat });
    }
    isPruning = false;
  }

  function schedulePrune() {
    if (pruneScheduled) return;
    pruneScheduled = true;
    setTimeout(() => {
      pruneScheduled = false;
      pruneChatCaches();
    }, 50);
  }

  return {
    pruneChatCaches,
    schedulePrune,
  };
}
