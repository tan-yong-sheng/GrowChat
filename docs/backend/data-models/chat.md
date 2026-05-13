# Data Model: Chat & Messages

## `chats`
Represents a conversation session.
- `id` (UUID, Primary Key)
- `user_id` (Foreign Key -> `users.id`)
- `title` (String)
- `current_message_id` (Foreign Key -> `messages.id` - representing the leaf node of the current conversation branch).
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

## `messages`
Represents a single turn in the conversation (User or Assistant).
- `id` (UUID, Primary Key)
- `chat_id` (Foreign Key -> `chats.id`)
- `parent_id` (Foreign Key -> `messages.id` - allows conversation branching/tree structure).
- `role` (Enum: `user`, `assistant`, `system`)
- `content` (String, Markdown)
- `model` (String, e.g., 'gpt-4')
- `status` (Enum: `pending`, `complete`, `error`, `cancelled`)
- `error_code` (String, optional)
- `error_message` (String, optional)
- `citations` (JSON String)
- `created_at` (Timestamp)

## `attachments`
Files uploaded by the user and associated with a specific message.
- `id` (UUID, Primary Key)
- `message_id` (Foreign Key -> `messages.id`)
- `filename` (String)
- `content_type` (String)
- `file_size` (Integer)
- `storage_key` (String, path to R2/S3 object)
