/**
 * Message Editing Router
 * Handles message edit functionality
 */

import db from '../db.js';

/**
 * Edit a message
 * @param {Object} params - Request parameters
 * @param {string} params.messageId - Message ID to edit
 * @param {string} params.content - New message content
 * @param {string} params.userId - User ID making the edit
 * @returns {Promise<Response>}
 */
export async function editMessage({ messageId, content, userId }) {
  if (!messageId) {
    return Response.json({ error: 'Message ID is required' }, { status: 400 });
  }

  if (!content || content.trim().length === 0) {
    return Response.json({ error: 'Content is required' }, { status: 400 });
  }

  // Find the message
  const message = await db
    .prepare('SELECT * FROM messages WHERE id = ?')
    .bind(messageId)
    .first();

  if (!message) {
    return Response.json({ error: 'Message not found' }, { status: 404 });
  }

  // Check ownership
  if (message.user_id !== userId) {
    return Response.json({ error: 'You can only edit your own messages' }, { status: 403 });
  }

  // Update message with new content and edited_at timestamp
  const editedAt = Math.floor(Date.now() / 1000);
  await db
    .prepare('UPDATE messages SET content = ?, edited_at = ? WHERE id = ?')
    .bind(content, editedAt, messageId)
    .run();

  return Response.json({
    message: {
      id: messageId,
      content,
      edited_at: editedAt,
    },
  });
}

export default {
  editMessage,
};
