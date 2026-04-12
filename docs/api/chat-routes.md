# Chat Routes

Source: `src/routers/chat.js` + `src/routers/chat/` sub-routers

## Overview

Chat routes manage the full chat lifecycle: creation, messaging (SSE streaming), branching, sharing, pinning, archiving, and cloning. Messages are delivered via Server-Sent Events with resume capability.

## Chat Collection (`/api/chats`)

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| GET | `/api/chats` | `chat.read` | List user's chats (paginated, default 30, `has_more` flag, searchable) |
| POST | `/api/chats` | `chat.write` | Create new chat |
| GET | `/api/chats/shared` | `chat.read` | List user's shared chats |
| GET | `/api/chats/archived` | `chat.read` | List user's archived chats |
| GET | `/api/chats/:id` | `chat.read` | Get chat metadata + messages |
| PUT | `/api/chats/:id` | `chat.write` | Update chat (title, pinned) |
| DELETE | `/api/chats/:id` | `chat.delete` | Delete chat |
| POST | `/api/chats/:id/share` | `chat.share` | Share chat (generates public share link) |
| DELETE | `/api/chats/:id/share` | `chat.share` | Unshare chat |
| POST | `/api/chats/:id/pin` | `chat.write` | Toggle pin |
| POST | `/api/chats/:id/archive` | `chat.write` | Toggle archive |
| POST | `/api/chats/:id/clone` | `chat.write` | Clone chat with messages |

## Chat Messages (`/api/chats/:id/messages`)

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| POST | `/api/chats/:id/messages` | `chat.write` | Send message (returns SSE stream, max 100 tool steps, 20 follow-ups, 10-min timeout) |
| GET | `/api/chats/:id/messages/:msgId/resume` | `chat.read` | Resume interrupted SSE stream |
| GET | `/api/chats/:id/messages/:msgId/status` | `chat.read` | Get message generation status |
| PUT | `/api/chats/:id/messages/:msgId` | `chat.write` | Edit assistant message in place |
| DELETE | `/api/chats/:id/messages/:msgId` | `chat.delete` | Delete message + subtree |

## Message Actions

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| POST | `/api/chats/:id/messages/:msgId/branch` | `chat.write` | Branch conversation from a specific message |
| POST | `/api/chats/:id/messages/:msgId/regenerate` | `chat.write` | Regenerate assistant response |
| POST | `/api/chats/:id/messages/:msgId/cancel` | `chat.write` | Cancel in-progress generation |

## Realtime Stream (`/api/realtime/stream`)

Source: `src/routers/realtime.js`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET/POST | `/api/realtime/stream` | Yes | Server-sent events realtime stream |

The realtime endpoint provides a persistent SSE connection for real-time updates across client and server state changes. The stream is backed by a Durable Object (`MessageQueueDO`) that manages keepalive intervals (15s) and delta distribution.

## Streaming Details

- **Protocol:** Server-Sent Events (SSE)
- **Content-Type:** `text/event-stream`
- **Delta Storage:** Message deltas stored in `message_deltas` table for resume capability
- **Keepalive:** 15-second interval via `MessageQueueDO` Durable Object
- **Resumption:** Delta-based — client sends last known delta ID to resume from that point

## Shared Chat Viewing

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/s/:shareId` | No | View shared chat — returns SPA HTML (with `<script data-share-id>`) or JSON (`Accept: application/json`) |
