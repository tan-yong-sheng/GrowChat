import { error } from '../../utils/response.js';
import { trimTrailingAssistantMessages } from '../chat-history.js';
import {
  normalizeSelectedToolNames,
  requireOwnedChatWithPermission,
  resolveChatModel,
} from '../chat-message-helpers.js';

export async function handleRegenerateMessage({
  req,
  env,
  ctx,
  db,
  user,
  chatId,
  msgId,
  originSessionId,
  assistantStreamRunner,
}) {
  const { chat, error: denied } = await requireOwnedChatWithPermission(
    req,
    env,
    db,
    user,
    'chat.write',
    chatId
  );
  if (denied) return denied;

  const sourceMsg = await db.first(
    'SELECT role, parent_id FROM messages WHERE id = ? AND chat_id = ?',
    [msgId, chatId]
  );
  if (!sourceMsg) return error(req, 'Message not found', 404);
  if (sourceMsg.role !== 'assistant')
    return error(req, 'Can only regenerate assistant messages', 400);

  const modelResult = await resolveChatModel(req, env, db, user, chat);
  if (modelResult?.error) return modelResult.error;
  const { model, providerInfo } = modelResult;

  let body;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const selectedToolNames = normalizeSelectedToolNames(
    body.selected_tool_names || body.tool_names || body.tools
  );

  const history = trimTrailingAssistantMessages(
    await db.all(
      `SELECT role, content FROM messages WHERE chat_id = ? AND (
				created_at < (SELECT created_at FROM messages WHERE id = ?)
				OR (
					created_at = (SELECT created_at FROM messages WHERE id = ?)
					AND rowid <= (SELECT rowid FROM messages WHERE id = ?)
				)
			) ORDER BY created_at ASC, rowid ASC LIMIT 30`,
      [
        chatId,
        sourceMsg.parent_id || msgId,
        sourceMsg.parent_id || msgId,
        sourceMsg.parent_id || msgId,
      ]
    )
  );

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
