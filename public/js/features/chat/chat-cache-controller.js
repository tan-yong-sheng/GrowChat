import { state, setState } from '../../shared/store.js';
import { pruneCachedChats } from '../../shared/utils/chat-cache.js';

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
      setStateFn({
        messagesByChat: result.messagesByChat,
        attachmentsByChat: result.attachmentsByChat,
      });
    }
    isPruning = false;
  }

  function schedulePrune() {
    if (pruneScheduled) return;
    pruneScheduled = true;
    const PRUNE_DEBOUNCE_MS = 50;
    setTimeout(() => {
      pruneScheduled = false;
      pruneChatCaches();
    }, PRUNE_DEBOUNCE_MS);
  }

  return {
    pruneChatCaches,
    schedulePrune,
  };
}
