// WireChat controllers: render, message list, chat handlers, shell.
// Phase 3 of wireChat extraction from chat.js.
// @ts-nocheck

import { handleClickChat } from './chat-click-handler.js';
import {
  buildFallbackAssistantMessage,
  buildTempChatImpls,
  getMessageById,
  hydrateAttachmentImages,
} from './chat-wire-controller-helpers.js';
import {
  buildRenderControllerSection,
  buildShellControllerSection,
  createChatListHandlersSection,
  createMessageListInteractionsSection,
} from './chat-wire-controller-section-builders.js';

function assembleRenderSection(ctx, deps) {
  const renderController = buildRenderControllerSection({ ctx, deps });
  ctx.drawMessagesImpl = renderController.drawMessages;
  return renderController;
}

function assembleMessageListSection(ctx, deps) {
  return createMessageListInteractionsSection({ ctx, deps });
}

function assembleChatListSection(ctx, deps) {
  return createChatListHandlersSection({ ctx, deps, handleClickChat });
}

function assembleShellSection(ctx, deps, chatListHandlers) {
  const tempChat = buildTempChatImpls(deps.state, ctx.isTempChatId);
  const shellController = buildShellControllerSection({
    ctx,
    deps: { ...deps, ...tempChat },
    getChatHandlers: chatListHandlers.getChatHandlers,
  });
  ctx.syncChatUrlImpl = shellController.syncChatUrl;
  ctx.startNewChatImpl = shellController.startNewChat;
  ctx.refreshChatListObserverImpl = shellController.refreshChatListObserver;
  const shellEventCleanup = shellController.bindShellEvents();
  return { shellController, shellEventCleanup, tempChat };
}

function bindAssembledSectionsToCtx(ctx, assembled) {
  const {
    renderController,
    messageList,
    chatListHandlers,
    shellController,
    shellEventCleanup,
    tempChat,
  } = assembled;
  const { state, uiResources } = ctx;

  Object.assign(ctx, {
    destroyShellEvents: shellEventCleanup,
    shellController,
    renderController,
    destroyMessageListInteractions: messageList.destroyMessageListInteractions,
    messageListInteractionsReadyPromise: messageList.messageListInteractionsReadyPromise,
    ensureMessageListInteractions: messageList.ensureMessageListInteractions,
    getChatHandlers: chatListHandlers.getChatHandlers,
    chatListHandlersReadyPromise: chatListHandlers.chatListHandlersReadyPromise,
    ensureChatListHandlers: chatListHandlers.ensureChatListHandlers,
    pruneTempChats: tempChat.pruneTempChatsImpl,
    buildTempChat: tempChat.buildTempChatImpl,
    buildFallbackAssistantMessage: (chatId, messageId, options) =>
      buildFallbackAssistantMessage(state, chatId, messageId, options),
    getMessageById: (chatId, messageId) => getMessageById(state, chatId, messageId),
    hydrateAttachmentImages: (containerEl) => hydrateAttachmentImages(uiResources, containerEl),
    getChatHandlersImpl: chatListHandlers.getChatHandlersImpl,
  });
}

export function setupWireChatControllers(ctx, deps) {
  const renderController = assembleRenderSection(ctx, deps);
  const messageList = assembleMessageListSection(ctx, deps);
  const chatListHandlers = assembleChatListSection(ctx, deps);
  const { shellController, shellEventCleanup, tempChat } = assembleShellSection(
    ctx,
    deps,
    chatListHandlers
  );
  bindAssembledSectionsToCtx(ctx, {
    renderController,
    messageList,
    chatListHandlers,
    shellController,
    shellEventCleanup,
    tempChat,
  });
}
