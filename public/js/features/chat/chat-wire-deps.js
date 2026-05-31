// WireChat dependencies: all imports and lazy loaders.
// Extracted from chat.js to keep the main file under 400 lines.

import {
  apiFetch,
  fetchArchivedChats,
  fetchChats,
  fetchSharedChats,
  fetchToolServers,
  getFileBlob,
  getFileContent,
  getFileMetadata,
  getClientSessionId,
  shareChat,
  toggleArchiveChat,
  unshareChat,
  uploadFile,
} from '../../shared/api.js';
import { escapeHtml, showToast, showToastProgress } from '../../shared/utils.js';
import { state, setState, subscribe } from '../../shared/store.js';
import { renderPlaceholder } from '../../shared/components/chat-placeholder.js';
import { renderMessageInput } from './message-input.js';
import { renderModelSelector } from './model-selector.js';
import { renderSidebar } from '../../shared/components/sidebar.js';
import { renderAssistantMessageBody } from './chat-message-rendering.js';
import { createChatMessageDom } from './chat-message-dom.js';
import { appendBlock, ensureThinkingBlock, updateToolCallState } from './chat-message-blocks.js';
import {
  getAllowedAttachmentKinds,
  getAllowedNonLocalKinds,
  getFileContentType,
  isAttachmentAllowedByModel,
  isSupportedAttachmentType,
} from '../../shared/utils/attachment-types.js';
import { touchRecentChat } from '../../shared/utils/chat-cache.js';
import { consumeToolServersInvalidation } from '../../shared/utils/tool-server-sync.js';
import { formatApiErrorMessage, extractThinkingBlocks } from './chat-message-utils.js';
import { createChatCacheController } from './chat-cache-controller.js';
import { createChatMessageIdentityTracker } from './chat-message-identity.js';
import { createChatMessageStream } from './chat-message-stream.js';
import { createChatDataController } from './chat-data-controller.js';
import { createChatRenderController } from './chat-render-controller.js';
import { createChatShellController } from './chat-shell-controller.js';
import { createChatUiResources } from './chat-ui-resources.js';

const loadChatStreamModule = () => import('./chat-stream.js');
const loadChatModalsModule = () => import('./chat-modals.js');
const loadChatFileEventsModule = () => import('./chat-file-events.js');
const loadChatMessageSeqModule = () => import('./chat-message-seq.js');
const loadChatSidebarListModule = () => import('./chat-sidebar-list.js');
const loadChatStreamControllerModule = () => import('./chat-stream-controller.js');
const loadChatStreamStateModule = () => import('./chat-stream-state.js');
const loadChatListActionsModule = () => import('./chat-list-actions.js');
const loadChatMessageListControllerModule = () => import('./chat-message-list-controller.js');
const loadChatRealtimeControllerModule = () => import('./chat-realtime-controller.js');

export function getWireChatDeps() {
  return {
    apiFetch,
    fetchArchivedChats,
    fetchChats,
    fetchSharedChats,
    fetchToolServers,
    getFileBlob,
    getFileContent,
    getFileMetadata,
    getClientSessionId,
    shareChat,
    toggleArchiveChat,
    unshareChat,
    uploadFile,
    escapeHtml,
    showToast,
    showToastProgress,
    state,
    setState,
    subscribe,
    renderPlaceholder,
    renderMessageInput,
    renderModelSelector,
    renderSidebar,
    renderAssistantMessageBody,
    createChatMessageDom,
    appendBlock,
    ensureThinkingBlock,
    updateToolCallState,
    getAllowedAttachmentKinds,
    getAllowedNonLocalKinds,
    getFileContentType,
    isAttachmentAllowedByModel,
    isSupportedAttachmentType,
    touchRecentChat,
    consumeToolServersInvalidation,
    formatApiErrorMessage,
    extractThinkingBlocks,
    createChatCacheController,
    createChatMessageIdentityTracker,
    createChatMessageStream,
    createChatDataController,
    createChatRenderController,
    createChatShellController,
    createChatUiResources,
    loadChatStreamModule,
    loadChatModalsModule,
    loadChatFileEventsModule,
    loadChatMessageSeqModule,
    loadChatSidebarListModule,
    loadChatStreamControllerModule,
    loadChatStreamStateModule,
    loadChatListActionsModule,
    loadChatMessageListControllerModule,
    loadChatRealtimeControllerModule,
  };
}
