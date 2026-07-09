import { error } from '../../utils/response.js';
import { HTTP_STATUS } from '../../shared/http-status.js';
import { trimTrailingAssistantMessages } from '../chat-history.js';
import {
  normalizeSelectedToolNames,
  requireOwnedChatWithPermission,
  resolveChatModel,
} from '../chat-message-helpers.js';

async function validateRegenerateAccess({ req, env, db, user, chatId, msgId }) {
  const { chat, error: denied } = await requireOwnedChatWithPermission(
    req,
    env,
    db,
    user,
    'chat.write',
    chatId
  );
  if (denied) return { denied };

  const sourceMsg = await db.first(
    'SELECT role, parent_id FROM messages WHERE id = ? AND chat_id = ?',
    [msgId, chatId]
  );
  if (!sourceMsg) {
    return { denied: error(req, 'Message not found', HTTP_STATUS.NOT_FOUND) };
  }
  if (sourceMsg.role !== 'assistant') {
    return {
      denied: error(req, 'Can only regenerate assistant messages', HTTP_STATUS.BAD_REQUEST),
    };
  }

  return { chat, sourceMsg };
}

async function parseRegenerateBody(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  return normalizeSelectedToolNames(body.selected_tool_names || body.tool_names || body.tools);
}

async function buildRegenerateHistory(db, chatId, msgId, sourceMsg) {
  const anchorId = sourceMsg.parent_id || msgId;
  const HISTORY_LIMIT = 30;
  const rows = await db.all(
    `SELECT role, content FROM messages WHERE chat_id = ? AND (
      created_at < (SELECT created_at FROM messages WHERE id = ?)
      OR (
        created_at = (SELECT created_at FROM messages WHERE id = ?)
        AND rowid <= (SELECT rowid FROM messages WHERE id = ?)
      )
    ) ORDER BY created_at ASC, rowid ASC LIMIT ?`,
    [chatId, anchorId, anchorId, anchorId, HISTORY_LIMIT]
  );
  return trimTrailingAssistantMessages(rows);
}

export async function handleRegenerateMessage({
  req,
  env,
  ctx,
  db,
  user,
  chatId,
  msgId,
  originSessionId: _originSessionId,
  assistantStreamRunner,
}) {
  const accessResult = await validateRegenerateAccess({
    req,
    env,
    db,
    user,
    chatId,
    msgId,
  });
  if (accessResult.denied) return accessResult.denied;

  const { chat, sourceMsg } = accessResult;
  const modelResult = await resolveChatModel(req, env, db, user, chat);
  if (modelResult?.error) return modelResult.error;

  const { model, providerInfo } = modelResult;
  const selectedToolNames = await parseRegenerateBody(req);
  const history = await buildRegenerateHistory(db, chatId, msgId, sourceMsg);

  const { response } = await assistantStreamRunner({
    req,
    env,
    ctx,
    db,
    user,
    chatId,
    userMsgId: sourceMsg.parent_id,
    parentId: sourceMsg.parent_id,
    model,
    history,
    citations: null,
    providerFamily: providerInfo.providerFamily,
    selectedToolNames,
  });
  return response;
}
