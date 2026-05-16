<<<<<<< HEAD
# Realtime Events (SSE)

The `MessageQueueDO` broadcasts the following JSON event payloads to connected clients.

## `message.created`
Emitted when the user submits a prompt, or when the assistant begins streaming its response.

### Payload
```json
{
  "type": "message.created",
  "userId": "uuid",
  "chatId": "uuid",
  "messageId": "uuid",
  "originSessionId": "string"
}
```

## `message.completed`
Emitted when the LLM stream finishes successfully, or an error forces it to halt.

### Payload
```json
{
  "type": "message.completed",
  "userId": "uuid",
  "chatId": "uuid",
  "messageId": "uuid",
  "originSessionId": "string"
}
```

## `message.cancelled`
Emitted when the user clicks "Stop Generating" and the `POST /api/chat/messages/:id/cancel` endpoint is hit.

### Payload
```json
{
  "type": "message.cancelled",
  "userId": "uuid",
  "chatId": "uuid",
  "messageId": "uuid",
  "originSessionId": "string"
}
```

## `chat.updated`
Emitted when a chat title is renamed, or a message within the chat is soft-deleted.

### Payload
```json
{
  "type": "chat.updated",
  "userId": "uuid",
  "chatId": "uuid",
  "originSessionId": "string",
  "data": {
    "deleted_message_id": "uuid" 
  }
}
```
=======
# Realtime Events (SSE)

The `MessageQueueDO` broadcasts the following JSON event payloads to connected clients.

## `message.created`
Emitted when the user submits a prompt, or when the assistant begins streaming its response.

### Payload
```json
{
  "type": "message.created",
  "userId": "uuid",
  "chatId": "uuid",
  "messageId": "uuid",
  "originSessionId": "string"
}
```

## `message.completed`
Emitted when the LLM stream finishes successfully, or an error forces it to halt.

### Payload
```json
{
  "type": "message.completed",
  "userId": "uuid",
  "chatId": "uuid",
  "messageId": "uuid",
  "originSessionId": "string"
}
```

## `message.cancelled`
Emitted when the user clicks "Stop Generating" and the `POST /api/chat/messages/:id/cancel` endpoint is hit.

### Payload
```json
{
  "type": "message.cancelled",
  "userId": "uuid",
  "chatId": "uuid",
  "messageId": "uuid",
  "originSessionId": "string"
}
```

## `chat.updated`
Emitted when a chat title is renamed, or a message within the chat is soft-deleted.

### Payload
```json
{
  "type": "chat.updated",
  "userId": "uuid",
  "chatId": "uuid",
  "originSessionId": "string",
  "data": {
    "deleted_message_id": "uuid" 
  }
}
```
>>>>>>> feature/short-term-tasks
