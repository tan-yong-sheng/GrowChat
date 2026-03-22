# Endpoint Audit Findings

Scope: backend route audit against `src/routers/*`, frontend call sites in `public/js/*`, and legacy embed code in `public/widget.js` before removal.

## Summary

| Status | Endpoint / Area | Finding |
|---|---|---|
| Removed | `GET /api/folders` | Deleted from the backend and UI in this cleanup. |
| Removed | `PATCH /api/chats/:id/folder` | Deleted from the frontend action surface in this cleanup. |
| Removed | `PATCH /api/chats/:id/icon` | Deleted from the frontend action surface in this cleanup. |
| Removed | `GET /api/tags`, `POST /api/chats/:id/tags`, `DELETE /api/chats/:id/tags/:tag` | Deleted from the backend/UI surface in this cleanup. |
| Removed | `GET /api/chats/:id/tokens`, `PUT /api/chats/:id/system-prompt` | Deleted with the chat info modal. |
| Removed | `POST /api/chat`, `GET /api/history` | Deleted with the legacy widget. |
| Removed | `GET /api/admin/stats` | Deleted from the backend. |

## Findings

### 1. Folder API and UI surface were removed

The old `GET /api/folders` route, folder sidebar modules, and icon picker modal were removed in this cleanup. The chat list no longer hides chats by `folder_id`, and the row actions no longer expose folder move or icon edit.

Removed files:
- `src/routers/folders.js`
- `public/js/features/chat/folder-sidebar.js`
- `public/js/features/chat/folder-sidebar-helpers.js`
- `public/js/shared/components/icon-picker-modal.js`

Removed frontend calls:
- `PATCH /api/chats/:id/folder`
- `PATCH /api/chats/:id/icon`

### 2. Tag feature and search token were removed

The tag modal, tag action, and `tag:` search token were removed in this cleanup.

Removed files and code paths:
- `public/js/shared/components/tag-modal.js`
- `GET /api/tags`
- `POST /api/chats/:id/tags`
- `DELETE /api/chats/:id/tags/:tag`
- `tag:` search token support in `public/js/shared/components/search-input.js`
- `tag:` query stripping in `public/js/shared/components/search-modal-helpers.js`
- `tags` columns removed from the canonical `chats` and `documents` schema

### 3. Chat info modal routes were removed

The chat info modal and its two route calls were removed in this cleanup.

Removed files and code paths:
- `public/js/shared/components/chat-info-modal.js`
- `GET /api/chats/:id/tokens`
- `PUT /api/chats/:id/system-prompt`

### 4. Legacy widget routes were removed

The legacy widget script and its two route calls were removed in this cleanup.

Removed files and code paths:
- `public/widget.js`
- `POST /api/chat`
- `GET /api/history`

### 5. `GET /api/admin/stats` was removed

The backend-only admin stats route was deleted from `src/routers/admin.js`.

## Conclusion

The codebase now has the folder/icon, tag, chat-info modal, widget, and admin stats surfaces removed. What remains should be checked route-by-route for any other intentionally supported APIs.
