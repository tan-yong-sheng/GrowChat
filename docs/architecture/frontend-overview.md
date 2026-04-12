# Frontend Architecture

## Overview

GrowChat's frontend is a **vanilla JavaScript SPA** with no framework dependency (no React, Vue, Svelte). It implements custom routing, lazy-loaded feature modules, and reactive state management.

## Entry Points

| File | Purpose |
| --- | --- |
| `public/index.html` | Main SPA — mounts `<div id="app">`, loads `bootstrap/app.js` as ESM |
| `public/auth.html` | Standalone auth page (login/register/forgot/reset) — loads `bootstrap/auth.js` |

Both load Tailwind CSS (`/styles.css`) and Bootstrap Icons CDN. The SPA also loads `marked.js` (@13.0.3) for server-side markdown rendering.

## Routing Strategy

Client-side routing via `window.location.pathname` and `popstate` listener. No routing library.

**Route resolution order:**
1. `/s/:shareId` → shared chat view (no auth required)
2. Legacy redirects (see below)
3. `/admin/**` → `features/admin/admin.js`
4. `/account/**` → `features/account/account.js` (drawer)
5. Default → `features/chat/chat.js`

**Legacy redirects:**
- `/admin/settings/roles` → `/admin/users/roles`
- `/admin/settings/general` → `/admin/system/general`
- `/admin` and `/admin/settings` → redirect to first sub-route
- `/account` → `/account/settings/connections`

## Module Loading Strategy

All feature modules are **dynamically imported** on first visit to a route:

```js
// Lazy load on demand
const { openAccountSettingsDrawer } = await import('../features/account/account.js');
const { renderAdminRoute } = await import('../features/admin/admin.js');
const { renderChat } = await import('../features/chat/chat.js');
```

## Bootstrap Sequence (`bootstrap/session-bootstrap.js`)

1. Validate or refresh JWT access token
2. Fetch `/api/users/me?include=permissions,roles`
3. Initialize RBAC (permissions + roles, fallback to admin/member defaults)
4. Load chats (hydrate from localStorage, then background refresh)
5. Set initial model ID (URL param → server default → global default → cached)
6. Install keyboard shortcuts
7. Start realtime sync (unless admin/shared route)
8. Schedule deferred bootstrap (RBAC + realtime)
9. Prefetch models (via `requestIdleCallback`)

## State Management

Simple module-level reactive store in `public/js/shared/store.js`:

```js
import { state, setState } from './shared/store.js';

// Read
state.user.id
state.chats
state.models
state.permissions
state.userRoles

// Write (triggers reactivity)
setState({ selectedModelId: 'conn_1__gpt-4' });
```

Key state properties:
- `state.user` — current user profile + settings
- `state.chats` — cached chat list
- `state.models` — available models
- `state.permissions` — resolved permission set
- `state.userRoles` — assigned roles
- `state.selectedModelId` — active model

## Directory Structure

```
public/js/
├── bootstrap/              # App entry, session setup, skeletons
│   ├── app.js             # Main entry: bootstrap(), route matching
│   ├── app-route-utils.js # Chat ID extraction, temp chat stubs
│   ├── app-shells.js      # Skeleton HTML renderers
│   ├── auth.js            # Auth page logic
│   └── session-bootstrap.js # Token, RBAC, chat list, model prefetch
├── features/               # Lazy-loaded on demand
│   ├── chat/              # 39 files: messages, streaming, UI, modals, input
│   ├── admin/             # Admin pages: users, settings, system
│   └── account/           # User settings drawer: connections, models, integrations
├── shared/                 # Shared by all features
│   ├── api/               # API client: request, response, auth, cache, resources
│   ├── components/        # Reusable UI: sidebar, search, modals, settings shell
│   └── utils/             # Shared utilities: model sync, permissions, caching
└── utils/                  # Standalone utilities (vestigial — prefer shared/utils/)
```

## Key Patterns

### Chat Module (`features/chat/` - 39 files)

Organized by concern:
- **Message rendering**: `chat-message-dom.js`, `chat-message-list-html.js`, `chat-message-rendering.js`
- **Streaming**: `chat-message-stream.js` + `chat-stream-controller.js` + `chat-stream-state.js`
- **Data**: `chat-data-controller.js`, `chat-cache-controller.js`
- **UI**: `chat-shell-controller.js`, `chat-render-controller.js`, `chat-sidebar-list.js`
- **Input**: `message-input.js`, `message-input-controller.js`, `edit-textarea.js`
- **Model selection**: `model-selector.js`, `model-selector-controller.js`
- **Realtime**: `chat-realtime-controller.js`

### Admin Module (`features/admin/`)

Sub-routed by feature:
- `admin/users/` — overview, roles, groups
- `admin/settings/` — connections, integrations, models, policies, security, general
- Shared helpers: `admin-layout.js`, `admin-route-state.js`, `modal-shell.js`, `acl-modal.js`

### Shared Components (`shared/components/` - 36 files)

Key component families:
- **Settings**: `settings-shell.js`, `settings-nav.js`, `settings-drawer-shell.js`, `settings-modal-shell.js`
- **Workspace**: `workspace-shell.js`, `workspace-sidebar.js`, `workspace-top-tabs.js`, `workspace-vertical-tabs.js`
- **Search**: `search-modal.js`, `search-modal-controller.js`, `search-bar.js`, `search-input.js`
- **Modals**: `connection-modal.js`, `server-modal.js`, `files-modal.js`, `viewport-modal-shell.js`
- **Sidebar**: `sidebar.js`, `sidebar-helpers.js`, `workspace-sidebar.js`

## Caching Strategy

- **localStorage** caches chats (`chatCache`) and models (`modelState`) per user
- Cache is hydrated on bootstrap, then refreshed in background
- Invalidation tokens (`model-sync.js`) trigger re-sync when server data changes
- `public/js/utils/` contains vestigial copies of some shared utilities — prefer `shared/utils/`

## Realtime

`shared/realtime.js` uses EventSource for real-time updates, connected to `/api/realtime/stream`. Started conditionally after bootstrap (not on admin/shared routes).

## Keyboard Shortcuts

Registered via `shared/shortcuts.js`. See implementation for current shortcut map.

## Cloudflare Asset Routing

`public/_routes.json`:
```json
{
  "version": 1,
  "include": ["/*"],
  "exclude": ["/favicon.png", "/logo.png", "/styles.css", "/js/*", "/.well-known/*"]
}
```

All non-excluded routes go to the Worker handler. JS files are served as static assets.
