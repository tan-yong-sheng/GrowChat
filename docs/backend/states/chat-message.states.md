<<<<<<< HEAD
# Chat Message Backend States

This state machine tracks the lifecycle of an `assistant` message in the `messages` database table during LLM generation.

## Valid States (`messages.status`)
- `pending`: The message record is created in the DB, and the LLM stream has just started.
- `complete`: The LLM stream finished normally, and the final concatenated content is saved to the DB.
- `error`: The LLM threw an exception mid-stream (e.g., rate limit, context window exceeded).
- `cancelled`: The user explicitly aborted the stream via the `/cancel` endpoint.

## Implicit Transitions
- `null` → `pending` (On `POST /api/chat/messages`).
- `pending` → `complete` (Stream ends gracefully. Emits `message.completed`).
- `pending` → `error` (Catch block in stream handler triggers. Emits `message.completed` but with error payload).
- `pending` → `cancelled` (User hits `/cancel` endpoint. Emits `message.cancelled`).

## Concurrency Guardrails
The backend relies on the `current_message_id` pointer in the `chats` table to manage the "leaf" of the conversation. If a user rapidly double-clicks send, the backend must rely on this pointer to reject concurrent branches or resolve conflicts.
=======
# Chat Message Backend States

This state machine tracks the lifecycle of an `assistant` message in the `messages` database table during LLM generation.

## Valid States (`messages.status`)
- `pending`: The message record is created in the DB, and the LLM stream has just started.
- `complete`: The LLM stream finished normally, and the final concatenated content is saved to the DB.
- `error`: The LLM threw an exception mid-stream (e.g., rate limit, context window exceeded).
- `cancelled`: The user explicitly aborted the stream via the `/cancel` endpoint.

## Implicit Transitions
- `null` → `pending` (On `POST /api/chat/messages`).
- `pending` → `complete` (Stream ends gracefully. Emits `message.completed`).
- `pending` → `error` (Catch block in stream handler triggers. Emits `message.completed` but with error payload).
- `pending` → `cancelled` (User hits `/cancel` endpoint. Emits `message.cancelled`).

## Concurrency Guardrails
The backend relies on the `current_message_id` pointer in the `chats` table to manage the "leaf" of the conversation. If a user rapidly double-clicks send, the backend must rely on this pointer to reject concurrent branches or resolve conflicts.
>>>>>>> feature/short-term-tasks
