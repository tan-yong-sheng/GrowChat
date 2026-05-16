# Chat & Realtime APIs

## `GET /api/realtime/stream`
**Responsibility**: Establishes a long-lived Server-Sent Events (SSE) connection between the client and the Durable Object (`MessageQueueDO`).

### Request
- Headers: `x-client-session-id` (optional, fallback generated)
- Cookie / Auth: Requires active user session.

### Response (200 OK / text/event-stream)
- Streams `message.created`, `message.completed`, `message.cancelled`, and `chat.updated` events.

### Side Effects
- Registers client in the Durable Object memory.
- Initiates `KEEPALIVE_INTERVAL_MS` pings.

---

## `POST /api/chat/messages`
**Responsibility**: Receives a user prompt, stores it, and triggers the LLM completion stream.

### Request
- `chat_id` (string, optional)
- `content` (string, required)
- `model` (string, required)
- `attachments` (array)

### Response (200 OK)
- `message_id` (string)
- `chat_id` (string)

### Internal Calls & Side Effects
- `createRealtimeBus().publish(event)` -> Hits the internal `POST /publish` endpoint on the Durable Object.
- Emits `message.created` for the user message.
- Triggers background LLM generation.
- LLM generator emits `message.completed` (or `message.error`) upon finishing.

---

## `DELETE /api/chat/messages/:id`
**Responsibility**: Soft-deletes or hides a message in a chat.

### Side Effects
- Updates `messages` table.
- Emits `chat.updated` with `{ deleted_message_id: id }` to sync all connected clients.
