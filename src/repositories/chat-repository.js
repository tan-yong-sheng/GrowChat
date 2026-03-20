export class ChatRepository {
  constructor(db) {
    this.db = db;
  }

  async findOwnedChat(chatId, userId) {
    return this.db.first('SELECT * FROM chats WHERE id = ? AND user_id = ?', [chatId, userId]);
  }

  async getMessageSnapshot(messageId) {
    if (!messageId) return null;
    try {
      return await this.db.first(
        'SELECT id, chat_id, role, content, model, citations, parent_id, status, error_code, error_message, tool_calls, message_blocks, created_at FROM messages WHERE id = ?',
        [messageId]
      );
    } catch {
      return this.db.first(
        'SELECT id, chat_id, role, content, model, citations, parent_id, message_blocks, created_at FROM messages WHERE id = ?',
        [messageId]
      );
    }
  }

  async getChatMessages(chatId) {
    try {
      return await this.db.all(
        'SELECT id, role, content, model, citations, parent_id, status, error_code, error_message, tool_calls, message_blocks, created_at FROM messages WHERE chat_id = ? ORDER BY created_at ASC, rowid ASC',
        [chatId]
      );
    } catch {
      return this.db.all(
        'SELECT id, role, content, model, citations, parent_id, message_blocks, created_at FROM messages WHERE chat_id = ? ORDER BY created_at ASC, rowid ASC',
        [chatId]
      );
    }
  }
}

export function createChatRepository(db) {
  return new ChatRepository(db);
}
