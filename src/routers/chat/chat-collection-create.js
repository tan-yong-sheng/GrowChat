import { error, json } from '../../utils/response.js';
import { HTTP_STATUS } from '../../shared/http-status.js';
import { authorize } from '../../utils/authorize.js';
import { createRealtimeEvent } from '../../features/realtime/realtime.js';
import { publishRealtimeNow } from '../chat-message-helpers.js';
import { resolveDefaultModel } from '../chat-core.js';
import { mapAuthCodeToStatus, sanitizeModelId, sanitizeTitle } from './chat-collection-helpers.js';
export async function handleCreateChat({ req, env, db, user, originSessionId } = {}) {
  const authDecision = await authorize(env, user, {
    action: 'chat.write',
    resource: 'chat',
  });
  if (!authDecision.allow) {
    return error(req, authDecision.reason || 'Forbidden', mapAuthCodeToStatus(authDecision.code));
  }

  let body = {};
  try {
    body = await req.json();
  } catch {
    // optional
  }

  const id = crypto.randomUUID();
  const title = sanitizeTitle(body.title);
  const fallbackModel = await resolveDefaultModel(env, db, user.sub);
  const model = sanitizeModelId(body.model, fallbackModel);

  await db.run(
    'INSERT INTO chats (id, user_id, title, model, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, 0, unixepoch(), unixepoch())',
    [id, user.sub, title, model]
  );
  const chat = await db.first('SELECT * FROM chats WHERE id = ?', [id]);

  await publishRealtimeNow(
    env,
    createRealtimeEvent({
      type: 'chat.created',
      userId: user.sub,
      chatId: id,
      originSessionId,
      data: { model, chat },
    })
  );

  return json(req, { chat }, HTTP_STATUS.CREATED);
}
