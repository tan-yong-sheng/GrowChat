import { json } from '../utils/response.js';
import { createRealtimeEvent } from '../features/realtime/realtime.js';
import { requireOwnedChat, getMessageSnapshot } from './chat-core.js';
import { publishRealtimeNow } from './chat-message-helpers.js';

const ROLE_USER = 'user';
const ROLE_ASSISTANT = 'assistant';
const MENTION_ATTACHMENT = 'attachment';
const HTTP_OK = 200;

export async function createAssistantBranchMessage({
  req,
  env,
  db,
  user,
  chatId,
  sourceMsg,
  content,
  originSessionId,
}) {
  const newAssistantMsgId = crypto.randomUUID();
  await db.batch([
    db.prepare(
      'INSERT INTO messages (id, chat_id, role, content, model, citations, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())',
      [
        newAssistantMsgId,
        chatId,
        ROLE_ASSISTANT,
        content,
        sourceMsg.model,
        sourceMsg.citations,
        sourceMsg.parent_id,
      ]
    ),
    db.prepare(
      'UPDATE chats SET current_message_id = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
      [newAssistantMsgId, chatId, user.sub]
    ),
  ]);
  const newMsg = await fetchAssistantBranchSnapshot(db, newAssistantMsgId);
  const updatedChat = (await requireOwnedChat(req, db, chatId, user.sub)).chat || null;
  await publishRealtimeNow(
    env,
    createRealtimeEvent({
      type: 'message.completed',
      userId: user.sub,
      chatId,
      messageId: newAssistantMsgId,
      originSessionId,
      data: {
        role: ROLE_ASSISTANT,
        model: sourceMsg.model,
        message: newMsg,
        chat: updatedChat,
      },
    })
  );
  return json(req, { message: newMsg }, HTTP_OK);
}

async function fetchAssistantBranchSnapshot(db, messageId) {
  return db.first(
    'SELECT id, chat_id, role, content, model, citations, parent_id, created_at FROM messages WHERE id = ?',
    [messageId]
  );
}

export async function createUserBranchMessage({
  req,
  env,
  db,
  user,
  chatId,
  sourceMsg,
  content,
  model,
  attachmentDocs,
  originSessionId,
}) {
  const newUserMsgId = crypto.randomUUID();
  await db.batch(
    buildUserBranchStatements({
      db,
      newUserMsgId,
      chatId,
      user,
      sourceMsg,
      content,
      model,
      attachmentDocs,
    })
  );

  const createdBranchUserMessage = await getMessageSnapshot(db, newUserMsgId);
  const updatedBranchChat = (await requireOwnedChat(req, db, chatId, user.sub)).chat || null;

  attachBranchDocMetadata(createdBranchUserMessage, attachmentDocs);

  await publishRealtimeNow(
    env,
    createRealtimeEvent({
      type: 'message.created',
      userId: user.sub,
      chatId,
      messageId: newUserMsgId,
      originSessionId,
      data: {
        role: ROLE_USER,
        model,
        message: createdBranchUserMessage,
        chat: updatedBranchChat,
      },
    })
  );

  return newUserMsgId;
}

function buildUserBranchStatements({
  db,
  newUserMsgId,
  chatId,
  user,
  sourceMsg,
  content,
  model,
  attachmentDocs,
}) {
  const statements = [
    db
      .prepare(
        'INSERT INTO messages (id, chat_id, role, content, model, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, unixepoch())'
      )
      .bind(newUserMsgId, chatId, ROLE_USER, content, model, sourceMsg.parent_id),
    db
      .prepare(
        'UPDATE chats SET current_message_id = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?'
      )
      .bind(newUserMsgId, chatId, user.sub),
  ];
  for (const doc of attachmentDocs) {
    statements.push(
      db
        .prepare(
          'INSERT INTO message_documents (id, message_id, document_id, mention_type, created_at) VALUES (?, ?, ?, ?, unixepoch())'
        )
        .bind(crypto.randomUUID(), newUserMsgId, doc.id, MENTION_ATTACHMENT)
    );
  }
  return statements;
}

function attachBranchDocMetadata(message, attachmentDocs) {
  if (message && attachmentDocs.length > 0) {
    message.attachments = attachmentDocs.map((doc) => ({
      id: doc.id,
      filename: doc.filename,
      content_type: doc.content_type,
      file_size: doc.file_size,
    }));
  }
}
