import { createLogger } from '../utils/logger.js';
import { createDB } from '../db.js';
import { json, sseData, sseHeaders } from '../utils/response.js';
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
import { applyToolCallDelta, buildUnknownToolPrompt, normalizeToolCalls } from '../chat/tools.js';
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

function serializeAllowedToolServers(servers = []) {
  return (Array.isArray(servers) ? servers : [])
    .filter((server) => server?.enabled !== false && server?.id && server?.url)
    .map((server) => {
      const tools = (Array.isArray(server.tools) ? server.tools : [])
        .filter(
          (tool) =>
            tool?.enabled !== false &&
            tool?.visible_for_user !== false &&
            String(tool?.name || '').trim()
        )
        .map((tool) => ({
          name: String(tool.name || '').trim(),
          title: String(tool.title || '').trim(),
          description: String(tool.description || '').trim(),
          enabled: true,
          visible_for_user: tool.visible_for_user !== false,
          hidden_for_user: tool.hidden_for_user === true,
        }));
      return {
        id: String(server.id),
        name: String(server.name || '').trim(),
        enabled: true,
        access_label: server.access_label || (server.source === 'user' ? 'Personal' : 'Admin'),
        access_variant: server.access_variant || (server.source === 'user' ? 'personal' : 'admin'),
        tools,
      };
    })
    .filter((server) => server.name && server.tools.length > 0);
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
  createLogger,
});

// eslint-disable-next-line max-params -- router dispatcher pattern: (req, env, ctx, user, path)
export async function chatRouter(req, env, ctx, user, path) {
  if (!isChatPath(path)) return null;

  const authorized = requireAuth(req, user);
  if (authorized) return authorized;

  const db = createDB(env.DB);
  const originSessionId = getOriginSessionId(req);

  if (req.method === 'GET' && path === '/api/tool-servers') {
    const servers = await loadToolServers(db, { userId: user.sub });
    return json(req, { servers: serializeAllowedToolServers(servers) });
  }

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

function isChatPath(path) {
  return (
    path === '/api/chats' ||
    path === '/api/tool-servers' ||
    path === '/api/chats/shared' ||
    path === '/api/chats/archived' ||
    /^\/api\/chats\/[^/]+(?:\/messages(?:\/[^/]+(?:\/(?:branch|regenerate|cancel|status|resume))?)?|\/(?:share|archive|pin|clone))?$/.test(
      path
    )
  );
}

export class RealtimeHubDO extends MessageQueueDO {}
