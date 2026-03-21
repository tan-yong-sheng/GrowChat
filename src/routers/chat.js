import { createDB } from '../db.js';
import { error, preflight, sseData, sseHeaders } from '../utils/response.js';
import { createRealtimeEvent, getOriginSessionId } from '../features/realtime/realtime.js';
import { runAsyncSessionProcessor } from '../features/chat/async-session-processor.js';
import { resolveTurnContinuation } from '../llm/turn-policy.js';
import { createAssistantRunner } from '../chat/assistant-runner.js';
import { createAssistantStreamLifecycle } from '../chat/stream-lifecycle.js';
import { finalizeAssistantStream } from '../chat/stream-finalize.js';
import {
  buildMcpTools,
  executeMcpToolCall,
  loadToolServers,
  parseToolArguments,
  stringifyToolPayload,
} from '../chat/mcp.js';
import {
  applyToolCallDelta,
  buildUnknownToolPrompt,
  normalizeToolCalls,
} from '../chat/tools.js';
import { recordAttachmentCapabilityFailure } from '../chat/attachments.js';
import { createRealtimeBus } from '../services/realtime-bus.js';
import { SseLineParser, streamLLM } from '../llm.js';
import { normalizeProviderFamily } from '../llm/provider-registry.js';
import { MessageQueueDO } from '../durable/message-queue.js';
import { chatCollectionRouter } from './chat-collection.js';
import { chatMessageRouter } from './chat-message.js';
import {
  getMessageSnapshot,
  getOwnedChat,
  normalizeErrorMessage,
  requireAuth,
  sleep,
} from './chat-core.js';

async function publishRealtimeNow(env, event) {
  try {
    return await createRealtimeBus(env).publish(event);
  } catch {
    return false;
  }
}

const assistantStreamRunner = createAssistantRunner({
  sseData,
  sseHeaders,
  SseLineParser,
  streamLLM,
  runAsyncSessionProcessor,
  resolveTurnContinuation,
  normalizeProviderFamily,
  buildMcpTools,
  loadToolServers,
  executeMcpToolCall,
  parseToolArguments,
  stringifyToolPayload,
  applyToolCallDelta,
  buildUnknownToolPrompt,
  normalizeToolCalls,
  createAssistantStreamLifecycle,
  finalizeAssistantStream,
  recordAttachmentCapabilityFailure,
  createRealtimeEvent,
  getOriginSessionId,
  publishRealtimeNow,
  getMessageSnapshot,
  getOwnedChat,
  normalizeErrorMessage,
  sleep,
});

export async function chatRouter(req, env, ctx, user, path) {
  const isChatPath = path === '/api/chats'
    || path === '/api/chats/shared'
    || path === '/api/chats/archived'
    || /^\/api\/chats\/[^/]+(?:\/messages(?:\/[^/]+(?:\/(?:branch|regenerate|cancel|status|resume))?)?|\/(?:share|archive|pin|clone))?$/.test(path);
  if (!isChatPath) return null;

  const unauthorized = requireAuth(req, user);
  if (unauthorized) return unauthorized;

  const db = createDB(env.DB);
  const originSessionId = getOriginSessionId(req);

  const collectionResponse = await chatCollectionRouter(req, env, user, path, originSessionId, db);
  if (collectionResponse) return collectionResponse;

  const messageResponse = await chatMessageRouter({
    req,
    env,
    ctx,
    db,
    user,
    path,
    originSessionId,
    assistantStreamRunner,
  });
  if (messageResponse) return messageResponse;

  return null;
}

export class RealtimeHubDO extends MessageQueueDO {}
