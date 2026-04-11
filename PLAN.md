# GrowChat Model/Admin/Chat UX Plan

## Goal

Fix the relationship between:
- `/admin/settings/connections`
- `/admin/settings/models`
- `/admin/settings/integrations`
- `/admin/system/general`
- `/admin/system/security`
- `/admin/users/overview`
- `/admin/users/roles`
- `/admin/users/groups`
- `/admin/users/policies`
- `/account/settings/connections`
- `/account/settings/models`
- `/account/settings/integrations`
- `/`
- `/auth.html`
- `/s/:shareId`

The app should treat these as three scopes of one system:
- `admin` = global truth
- `account` = personal effective view
- `chat` = runtime selector

These settings pages should use immediate persistence for scope-owning changes. There should be no staged-save footer or queued commit flow on the account/admin model, connection, integration, or system screens.

## Core Naming Rules

Use these labels consistently:
- `Selected models` for admin model state
- `Available to you` for account model state
- `Selectable in chat` for the chat dropdown

Do not use one generic `active models` label to mean all three.

## Persistence Contract

Account and admin settings are immediate-save surfaces.

- No staged-save queue.
- No dirty draft buffer.
- No manual Save button.
- No footer whose purpose is to commit pending changes.
- Every edit commits as a narrow field-level mutation.
- UI may be optimistic, but the committed value is always the last successful save.
- On failure, rollback only the changed field(s) and surface the error inline.

## Count Semantics

The same number must mean different things depending on scope:
- Admin count = all selected upstream models, regardless of personal hides.
- Account count = all models available to the current user/session.
- Chat selection = the same effective account list, but narrowed only by current chat context.

Never use page-local row counts as the header count. Pagination must not change the meaning of the header total.

## Scope Matrix

- Admin pages own global existence, discovery, selection, ACLs, attachment caps, deployment defaults, registration, and email config.
- Account pages own the user’s effective visibility, personal overlays, and per-user capability views.
- Chat owns runtime selection for the current turn and never widens beyond the account-effective set.
- Admin overview (`/admin/users/overview`) is a stable workspace shell; admin settings and system pages are the routes that may suspend the sidebar.
- Auth owns session entry and password recovery, not workspace scope.
- Shared chat owns read-only publication only.
- Integrations own tool availability only and must never alter model counts.

## Route Canonicalization

- `/admin` and `/admin/` should resolve to `/admin/users/overview`.
- `/admin/users` should resolve to `/admin/users/overview`.
- `/admin/settings` should resolve to `/admin/settings/connections`.
- `/admin/system` should resolve to `/admin/system/general`.
- `/admin/settings/roles` should resolve to `/admin/users/roles`.
- `/admin/users/policy` should resolve to `/admin/users/policies`.
- `/admin/settings/policies` should resolve to `/admin/users/policies`.
- `/admin/settings/general` should resolve to `/admin/system/general`.
- `/admin/settings/email` should resolve to `/admin/system/security`.
- `/account`, `/account/`, `/account/profile`, and `/account/profile/*` should resolve to `/account/settings/connections`.
- `/account/settings/*` is the canonical account settings surface.
- Do not treat `/account/profile` as a separate product area; it is legacy UI that must fold into account settings.
- Do not treat bare `/admin` as a separate admin home; it is a shortcut to the users overview inspector.

## Visibility Inheritance

- A model that is not selected upstream is not a second-class account model; it is removed from account/chat scope entirely.
- Account pages only render the effective catalog. They do not list unselected discovered models as hidden rows or recovery rows.
- The same rule applies to shared connections and shared tool servers: if admin does not select or share them upstream, they disappear from account scope instead of becoming hidden recovery rows.
- If the effective catalog becomes empty because nothing is selected upstream, the account page should explain that the workspace needs an admin-level recovery action.
- If the effective catalog is non-empty, account pages should not mention globally disabled models unless they are needed to explain why a specific action failed.

## ACL / Sharing Surface

- `/admin/users/overview` is the read-only inspector for effective access. Use it to answer "what does this user actually get?" for models, connections, and MCP servers.
- `/admin/users/roles` defines permission templates. Role edits change what a user is allowed to do, but do not directly share a specific connection unless the permission model allows it.
- `/admin/users/groups` defines membership. Group membership is the bridge that usually makes shared resources visible to users.
- `/admin/users/policies` defines resource access rules. This is the page that should decide whether a connection is shared to a user or group.
- A connection that is only hidden in `/account/settings/connections` is still shared at the admin layer if the user was granted access.
- A connection that is not shared through admin ACLs should not appear in `/account/settings/connections` at all.
- If the user wants a provider to be visible again in account scope after hiding it personally, they should re-show it in account settings or ask an admin to restore the shared grant.
- If the user wants the provider to be visible for the whole workspace or a group, that change belongs in `/admin/users/groups` and `/admin/users/policies`, not in account scope.

### ACL Decision Tree

1. Is the connection owned by the user and only meant for that account?
   - Manage it in `/account/settings/connections`.
2. Is the connection shared by the workspace or a group?
   - Inspect and edit its grant in `/admin/users/policies`, using `/admin/users/groups` if membership is what drives the grant.
3. Does the user need to understand why they can or cannot see it?
   - Inspect the read-only effective result in `/admin/users/overview`.
4. Does the problem involve permission templates rather than a specific shared resource?
   - Edit `/admin/users/roles`.
5. Did the user hide a shared connection locally?
   - Treat it as a personal visibility override only. Do not revoke the admin grant.

### Connection Card Semantics

- Personal rows mean the user owns the connection and can edit the provider config.
- Shared rows mean the connection is granted by admin policy and may be hidden locally, but not redefined as personal.
- Hidden shared rows remain editable for visibility only; they are not admin-disabled rows.
- `Hidden for you` is deprecated in the account models table; hidden shared rows now keep the `Admin`/`Personal` label and the hidden state is conveyed by row context and recoverability, not a separate access label.
- A shared row that is hidden locally should remain explainable as a hidden account override, not silently disappear from every admin-facing view.
- The admin effective-access inspector should distinguish `shared`, `hidden_for_user`, and `revoked` states.
- The account page should use the same underlying connection identity across personal and shared sections so users can understand what is theirs versus what is granted.

## Cross-Page Scenarios

- User hides a shared connection in `/account/settings/connections`:
  - The connection stays shared in admin scope.
  - The row stays visible in account scope as a recoverable hidden row under the same access label as the underlying grant.
  - Reloading the page should preserve the personal hide.
- Admin revokes the shared grant in `/admin/users/policies`:
  - The connection disappears from account scope after invalidation.
  - `/admin/users/overview` should show the updated effective access.
  - Chat should stop offering the connection if it depended on that grant.
- Admin changes selected upstream models in `/admin/settings/connections`:
  - The selected upstream set changes first.
  - `/admin/settings/models` re-renders as the selected-model projection plus policy metadata.
  - Account scope and chat immediately follow the new effective set.
- Admin edits model policy metadata in `/admin/settings/models`:
  - ACLs and attachment caps change on the selected model set.
  - Historical chat messages keep the label for context.
- Current chat context narrows the selector below account scope:
  - The chat selector may show fewer options than account settings.
  - The helper text should explain that this is a chat-level restriction.
  - The account page remains the effective account catalog, not the chat catalog.
- Group membership changes in `/admin/users/groups`:
  - The effective inspector updates.
  - Any access inherited through the group appears or disappears from account scope.
- Role edits in `/admin/users/roles`:
  - Permissions change, but a specific shared connection should not move unless policy or membership changes too.
- Connection discovery or model-selection changes in `/admin/settings/connections`:
  - Admin, account, and chat model lists invalidate together.
  - `/admin/settings/models` must rehydrate to the selected upstream set.
  - Header counts and selectable counts should reconcile after refresh.
- Global default model or registration changes in `/admin/system/general`:
  - Chat bootstrap should pick up the new default on refresh.
  - Model availability counts should not change.
- Email config changes in `/admin/system/security`:
  - Delivery tests should use the new config immediately.
  - Model, connection, and chat scopes should remain unchanged.

## Interaction Matrix

| Action | Owning page | Invalidation | Account effect | Chat effect |
|---|---|---|---|---|
| Personal hide/show a shared connection | `/account/settings/connections` | user/account visibility | toggles only that user’s visibility | updates selectable resources after refresh |
| Grant or revoke a shared connection | `/admin/users/policies` | ACL + account + chat | shared row appears/disappears for entitled users | selector updates on next invalidation |
| Change group membership | `/admin/users/groups` | ACL + account + chat | inherited grants appear/disappear | selector and effective access inspector update |
| Change role templates | `/admin/users/roles` | permission scope only | may affect broad capability checks | no direct resource visibility change unless policy maps it |
| Change selected upstream models | `/admin/settings/connections` | discovery + account + chat | effective catalog changes | selector and model count reconcile immediately |
| Edit model policy metadata | `/admin/settings/models` | model + account + chat | policy changes on the selected catalog | selector and composer reconcile immediately |
| Edit tool-server availability | `/admin/settings/integrations` | tool-only | no model count change | no model count change |
| Change global default model / registration state | `/admin/system/general` | bootstrap + auth | no model count change | may change chat default selection only |
| Update outbound email config | `/admin/system/security` | auth/email delivery | no model count change | no model count change |
| Inspect effective access | `/admin/users/overview` | none | read-only view of current grants | read-only view of current grants |

## Ordering Policy

- Zero-jump policy: keep list order predictable and explain state changes rather than letting rows jump without context.
- Prefer stable alphabetical ordering within each visible group so enable/disable toggles do not reshuffle the list.
- If a page uses separate visible and hidden groups, preserve each group’s internal order and keep hidden rows recoverable rather than silently removed.
- If a toggle changes state, keep the row in the same place when possible; do not make users hunt for the item after a state change.
- The same ordering convention should apply consistently across `/admin/settings/connections`, `/admin/settings/models`, `/admin/settings/integrations`, `/account/settings/connections`, `/account/settings/models`, and `/account/settings/integrations`.
- Do not let pagination or filtering rewrite the underlying ordering model.

## Atomic Shell Transitions

- When switching between major shells (`/`, `/admin/*`, `/account/*`), reserve the destination geometry immediately and keep the current shell legible until the next shell is ready.
- Route changes should use a stable loading shell or skeleton; do not let sidebar, nav, or content panels disappear and reappear in separate phases.
- Same-tab transitions must keep the current layout legible while async data loads; loading should not look like the page has flattened or merged into one block.
- Admin overview should stay visually stable while its shell mounts. Admin settings and account settings may suspend or close the sidebar, but the transition must still be atomic and should never expose a collapsed intermediate frame.
- The transition rule applies to admin overview, settings drawers, archived overlays, and any route that swaps the main shell.

## Modal Hash Anchors

- Every modal should set a stable URL hash while open, such as `#user-access-modal` or `#account-connection-modal`, so QA and debugging can identify the active overlay quickly.
- Closing a modal should clear only that modal's hash and return the URL to the underlying page path.
- Hash anchors are informational only. They must not change route ownership, scope, or persisted state.
- Prefer stable, descriptive modal hashes over ad hoc query params when the goal is to inspect or reproduce an overlay state.

## Interaction Contract

### 1. `/admin/settings/connections`

Owns provider connectivity, discovery, and upstream selection.

Rules:
- Connection changes can add/remove models for everyone, and selection controls decide which discovered models stay in the upstream set.
- A connection test failure should not silently hide the connection; it should show an unhealthy state.
- If discovery produces zero models, show that explicitly.
- Any connection mutation that affects discovery or selection must invalidate admin models, account models, and chat model caches.
- Persist changes immediately when the connection itself is edited; do not wait for a separate save step.
- Connection state should explain whether it is healthy, degraded, or empty before the user navigates away.

Empty states:
- No connections yet: show an onboarding CTA.
- Connections exist but no models discovered: show a retry/test CTA.

### 2. `/admin/settings/models`

Owns the selected-model projection and model-side policy metadata.

Rules:
- Header count means selected upstream models.
- The page must render the models selected by `/admin/settings/connections`, not an independent discovery truth.
- ACL and attachment caps are model-side admin controls.
- Unselected/discovered models do not belong here unless they are part of the selected upstream set.
- Model policy and cap edits persist immediately and should optimistically update the local view.
- If a model policy change alters the effective account set, the account page and chat selector must reconcile on the next invalidation.

Empty states:
- No models at all: explain whether this is because there are no connections or because nothing has been selected upstream.
- No selected models: block chat usage with a clear warning.

### 3. `/admin/settings/integrations`

Owns tool-server availability only.

Rules:
- This page must not affect model counts.
- Changes here should invalidate tool availability, not model availability.
- Integration edits persist immediately.

Empty states:
- No integrations yet: show a neutral setup CTA.

### 4. `/admin/system/general`

Owns deployment-level app defaults and registration controls.

Rules:
- App title remains server-configured only.
- Public registration and registration status persist immediately.
- The global default model updates chat bootstrap defaults but does not change model availability counts.
- Any default-model change should invalidate chat bootstrap state, not the model catalog itself.

Empty states:
- N/A; this surface always renders config-backed defaults.

### 5. `/admin/system/security`

Owns email delivery configuration.

Rules:
- Resend/API-key changes persist immediately.
- Test-email sending is a transient action, not a persisted setting.
- This page must not affect model counts, ACLs, or connection visibility.

Empty states:
- No API key configured: prompt for configuration.

### 6. `/admin/users/overview`

Owns read-only effective access inspection.

Rules:
- This page answers "what does this user actually get?" across models, connections, and MCP servers.
- It should show role, group membership, and the effective access families together.
- It must not be used to edit access directly.
- If a resource is disabled or hidden, the inspector should label that as an access state, not as a deletion.
- For connections, show whether the row is `personal`, `shared`, `hidden for user`, or `revoked`.
- If a shared connection is hidden locally, the inspector should still show the grant and the local visibility override as separate facts.

Empty states:
- No user selected: show a neutral prompt to inspect a user.
- No effective access data: explain that the user has no resolved grants yet.

### 7. `/admin/users/roles`

Owns permission templates.

Rules:
- Role edits change what actions a user can perform.
- Role edits do not directly grant a specific shared connection unless the policy system maps that permission to a resource grant.
- Changing a role should be treated as a broad policy change, not a resource-by-resource visibility toggle.

Empty states:
- No custom roles yet: show the built-in templates and a create-role CTA.

### 8. `/admin/users/groups`

Owns membership.

Rules:
- Group membership is the main bridge between users and shared resources.
- Adding or removing members should affect the effective access inspector and any downstream shared-resource visibility.
- Group changes do not themselves define what a group can access; they only determine who inherits the group’s access.

Empty states:
- No groups yet: show a create-group CTA.

### 9. `/admin/users/policies`

Owns explicit resource grants and denies.

Rules:
- This page decides whether a specific connection, model, or MCP server is shared to a user or group.
- A deny should override an allow in the effective inspector.
- Shared resources should remain visible to admins even when a user hides them personally.
- Policy changes must invalidate the effective access view and any account pages that depend on that grant.

Empty states:
- No policies yet: show a neutral setup CTA and explain that access defaults to role/group inheritance.

### 10. `/account/settings/connections`

Owns the user’s personal connections.

Rules:
- This is a personal overlay, not global truth.
- Changes here affect only that user’s effective model list.
- Shared/admin-managed connections may be visible as read-only context.
- Admin-disabled shared connections do not appear here at all.
- Personal visibility and connection edits persist immediately, with rollback on failure if needed.
- Do not mirror admin counts here; this page reflects only the user’s effective resource set.
- Hiding a shared connection here only affects this user; it does not revoke the admin grant.
- A connection that is not already shared by admin policy should not show up as a shared row here.
- If a shared connection disappears after reload, that is a symptom of effective access revocation or a model/catalog refresh, not a bug in the local hide toggle.
- Personal rows should be labeled `Personal`.
- Shared rows should be labeled `Shared`.
- Hidden shared rows should keep the underlying grant label (`Admin` / `Personal`) and may use a hidden-state affordance instead of a separate access label.
- Hidden shared rows should remain visible in a recoverable state, ideally grouped or clearly tagged, instead of disappearing.

Empty states:
- No personal connections yet: use the add-connection CTA; do not render a separate empty-state block.
- Shared connections still exist: show them separately so the page never feels empty when the workspace has usable shared resources.

### 11. `/account/settings/models`

Owns the user’s effective model availability.

Rules:
- Header count should match the effective selectable model total for the same user/session.
- If the user hides a model, it can remain visible here only as a personal recovery target, but it disappears from chat.
- If admin disables a model, it disappears here and from chat entirely.
- Do not surface admin-disabled models as account-owned items; they belong only in admin scope.
- Hidden shared rows should stay visible as a recovery state without changing the grant label.
- Hidden shared rows should be grouped into a separate recoverable section when there are enough rows to clutter the main list.
- The main list should favor currently usable models; hidden shared rows should not crowd the primary browsing path.
- When there are only a few hidden rows, inline tagging is fine; when there are many, split them into a collapsible hidden section.
- Hidden shared rows are recoverable visibility state, not selectable availability, so they should not inflate the main availability count.
- This page should explain why a model is unavailable, not just hide it.
- There is no staged-save footer here; each toggle/cap edit commits immediately.
- Header totals should stay in sync with the chat dropdown count for the same effective session, unless chat is further narrowed by the current conversation context.

Empty states:
- Nothing available from admin: tell the user to ask an admin to enable models.
- Nothing available because of personal hides: offer a reset/restore action.

### 12. `/account/settings/integrations`

Owns personal integrations.

Rules:
- No coupling to model counts.
- Tool availability changes should not affect model selection.
- Integration edits persist immediately.
- Tool-server availability must never be used as a proxy for model availability.
- Admin-disabled shared tool servers do not appear here at all.

Empty states:
- No personal integrations yet: show a setup CTA.

### 13. `/`

Owns runtime model selection.

Rules:
- The dropdown is a live mirror of `/account/settings/models`.
- It may narrow further for the current chat context, but it must never show more than account settings.
- The selector should advertise its scope explicitly so users understand it is not admin truth.
- If the chat context is narrower than account scope, say so in the helper text instead of implying a broken count.
- If the chat context removes the current model, treat that as a chat-level fallback case, not an account-level visibility bug.
- If the selected model becomes unavailable, show a banner and pick a fallback for the next send.
- The banner should explain whether the fallback was caused by admin disablement, personal hiding, or chat-context narrowing.
- If the current chat has no allowed model left, the composer should be disabled rather than letting the user send with a stale selection.

Empty states:
- No selectable models: disable composer and explain why.

### 14. `/auth.html`

Owns authentication and password recovery.

Rules:
- Login and registration are separate modes on the same page.
- Forgot-password and reset-password are modal-driven recovery flows.
- These flows are auth-only and must not mutate admin/account/chat settings.

Empty states:
- Login mode with no session: show sign-in CTA.
- Reset token missing or invalid: show recovery error and return to sign-in.

### 15. `/s/:shareId`

Owns the public shared-chat read-only view.

Rules:
- This route is read-only.
- It may show the model label for historical context.
- It must not expose account/admin controls or editable inputs.

Empty states:
- Missing or revoked share: show a not-found or revoked-share state.

## UI/API Contract

This section is the source of truth for how each page talks to the backend. The rule is simple:
- UI pages may project or hide data, but they must not invent state that the API did not return.
- Writes must hit the narrowest endpoint that owns the decision.
- A change is not complete until the owning page, the dependent pages, and the related cache invalidation all agree.

### Endpoint Matrix

| Page | Read endpoints | Write endpoints | Invalidation scope |
|---|---|---|---|
| `/admin/settings/connections` | `/api/admin/openai/connections`, `/api/admin/openai/connections/access`, `/api/admin/models` | `/api/admin/openai/connections`, `/api/admin/openai/connections/access` | admin models, account models, chat models |
| `/admin/settings/models` | `/api/admin/models`, `/api/admin/models/access` | `/api/admin/models`, `/api/admin/models/access` | admin models, account models, chat models |
| `/admin/settings/integrations` | `/api/admin/tool-servers`, `/api/admin/tool-servers/access` | `/api/admin/tool-servers`, `/api/admin/tool-servers/access` | tool-server views only |
| `/admin/system/general` | `/api/admin/config`, `/api/models` | `/api/admin/config` | chat bootstrap only for default-model changes |
| `/admin/system/security` | `/api/admin/email-config` | `/api/admin/email-config`, `/api/admin/email-config/test` | email delivery only |
| `/admin/users/overview` | `/api/admin/users/:id/access` | none | none |
| `/admin/users/roles` | RBAC admin APIs | RBAC admin APIs | permission checks only |
| `/admin/users/groups` | group admin APIs | group admin APIs | shared-access effective views |
| `/admin/users/policies` | `/api/admin/models/access`, `/api/admin/openai/connections/access`, `/api/admin/tool-servers/access` | same | admin/account/chat shared-access views |
| `/auth.html` | `/api/auth/login`, `/api/auth/register`, `/api/auth/refresh`, `/api/auth/logout`, `/api/auth/forgot-password`, `/api/auth/reset-password` | `/api/auth/login`, `/api/auth/register`, `/api/auth/logout`, `/api/auth/forgot-password`, `/api/auth/reset-password` | auth bootstrap only |
| `/s/:shareId` | `/s/:shareId?format=json` | none | none |
| `/account/settings/connections` | `/api/users/me/settings?include=permissions,roles`, `/api/users/me/resources/connections` | `/api/users/me/resources/connections/:id`, `/api/users/me` | account settings, chat selector |
| `/account/settings/models` | `/api/users/me/settings?include=permissions,roles`, `/api/models` | `/api/users/me` | account settings, chat selector |
| `/account/settings/integrations` | `/api/users/me/settings?include=permissions,roles`, `/api/users/me/resources/mcp-servers` | `/api/users/me/resources/mcp-servers/:id`, `/api/users/me` | account settings only |
| `/` | `/api/models`, `/api/chats`, `/api/users/me/settings?include=permissions,roles` | `/api/chats`, `/api/chats/:id/messages` | chat runtime only |

### Backend Ownership Rules

- `src/routers/admin.js` owns global admin mutations, ACL writes, system config, email config, and admin-scoped access inspection.
- `src/routers/auth.js` owns login, registration, refresh, logout, and password-recovery flows.
- `src/routers/users.js` and `src/services/workspace-settings.js` own account payload composition, personal visibility overrides, and effective shared-resource views.
- `src/routers/models.js` owns the public effective model catalog plus selected-model projection, model-side policy metadata, and model ACLs.
- `src/routers/chat-core.js` and the chat controllers own runtime model selection, fallback, and message flow only.
- `src/routers/public.js` owns the public shared-chat read-only route.
- UI code must never write around the owning router just to force a visible state change.
- A page may request a refresh of dependent scopes, but it must not mutate a scope it does not own.
- Connections and integrations follow the same scoped-access pattern as models, but they keep their own resource-specific endpoints instead of collapsing into a fake generic `/api/connections` or `/api/integrations` API.

### Invalidation Rules

- `broadcastModelsInvalidation()` follows any change that affects model availability, connection discovery, model selection, model ACLs, or personal model visibility.
- `broadcastConnectionsInvalidation()` follows any change that affects connection discovery, connection ACLs, or personal connection visibility.
- `broadcastToolServersInvalidation()` follows any change that affects tool servers or tool visibility.
- These invalidations are also surfaced to the UI as `growchat:models-invalidated`, `growchat:connections-invalidated`, and `growchat:tool-servers-invalidated` so same-tab views converge immediately.
- `setState({ globalDefaultModelId })` or equivalent bootstrap refresh follows global default-model changes.
- Account writes may invalidate chat/account caches, but they must never rewrite admin truth.
- Admin writes may fan out to account/chat caches, but they must remain authored from admin endpoints only.

### Admin/Account Sync Contract

- Admin pages own the mutation, account pages own the projection.
- If an admin page changes a model, connection, or tool server, the account drawer must refresh from the shared invalidation channel instead of waiting for a hard reload.
- If the same tab performs the admin mutation, the UI must listen to the custom invalidation event, not only the `storage` event.
- The account page should never infer upstream selection from stale local state; it must re-read the effective payload after invalidation.
- The chat selector should refresh from the same model invalidation source as account settings so the counts stay aligned.
- `settings-route-cache` is the bridge that keeps open admin/account drawers synchronized with those broadcasts.

### Same-Page Interaction Matrix

#### Models

- `model-search-input` filters the current page only. It may trigger a refetch for the effective scope, but it must not change the meaning of the count label.
- `model-provider-select` filters the current page only. It must not change admin truth or personal overrides.
- `prev-page` and `next-page` paginate the effective catalog only. They must never traverse into admin-disabled rows when the page is scoped to account data.
- Model policy controls on admin model pages update the selected-model projection and must broadcast model invalidation.
- `model-toggle` on account pages flips personal visibility only and must persist through `/api/users/me`.
- `[data-model-acl]` opens the model ACL modal. It is a same-page edit surface for admin group policy, not a navigation target.
- Hidden shared rows stay inline in account models and keep the underlying grant label; they are recoverable visibility state, not a separate model family.

#### Connections

- `.connection-toggle` on admin pages flips the global shared connection state and must broadcast both connection and model invalidation.
- `.connection-toggle[data-toggle-scope="shared"]` on account pages flips only the personal visibility override and must persist through `/api/users/me`.
- `[data-account-connection-edit]` opens the personal connection modal. Saving it mutates the personal row only.
- `.connection-acl-btn` opens the admin ACL modal. Saving it mutates the shared grant and should invalidate account/chat views.
- Shared rows and personal rows must remain visually distinct so the user can tell grant ownership from local visibility.

#### Integrations

- `.server-toggle` on admin pages flips global tool-server enablement and must broadcast tool-server invalidation.
- `.tool-toggle` on admin pages changes tool enablement inside a server and must still invalidate tool-server views.
- `.server-toggle` on account pages flips only the personal visibility override for a shared server and must persist through `/api/users/me`.
- `[data-account-integration-edit]` opens the personal integration modal. Saving it mutates the user-owned server only.
- `.tool-toggle[data-toggle-scope="shared"]` on account pages flips only the visibility of a shared tool for that user.
- `.tools-toggle` expands or collapses tool rows and is purely local UI state.
- `.tool-access-btn` opens the admin ACL modal. Saving it mutates the shared grant and should invalidate account/chat views.

#### User Inspector

- `/admin/users/overview` is read-only, but it reacts to model, connection, and tool-server invalidations so the effective access view stays current.
- The inspector should treat `shared`, `personal`, `hidden_for_user`, `revoked`, and `disabled` as separate states.
- Opening the inspector must not mutate any resource family.

#### Bootstrap And Cache

- Account and chat bootstraps should re-read the effective model payload when invalidation fires.
- Same-tab broadcasts must be handled by the settings-route cache and the chat bootstrap, not only by `storage` events.
- If a page is already open, the visible table should refresh in place rather than waiting for route change.

### Sidebar Visibility Policy

- The workspace sidebar is a chat-first navigation surface; it should not compete with full settings surfaces.
- Entering `/account/*`, `/admin/settings/*`, or `/admin/system/*` should collapse or close the expanded sidebar before the settings shell takes over.
- `/admin/users/overview` remains a stable workspace shell and should not inherit the settings-shell collapse.
- Leaving those settings routes should restore the previous sidebar visibility instead of requiring a reload.
- Transient overlays such as Archived Chats, search, files, share, and ACL modals should temporarily suspend the sidebar if it is expanded.
- When a modal opens, the mobile sidebar backdrop must not remain active behind it.
- When the modal closes, restore the prior sidebar state if the user did not explicitly change it.
- `showSidebar` is UI state only; it should not be persisted as a side effect of opening or closing a modal.
- `sidebarCollapsed` can remain a user preference on desktop, but route-driven settings surfaces may override it temporarily while open. On desktop, the route override may collapse to the slim rail rather than a zero-width hidden state if that preserves shell geometry better.

### Admin Shell Consistency

- `/admin/users/*` is the "workspace-style" admin shell and should keep the outer sidebar open unless the user explicitly closes it.
- `/admin/settings/*` and `/admin/system/*` are the "settings-style" admin shells and should auto-close or suspend the outer sidebar on entry.
- Switching between those admin families should preserve the correct sidebar contract without a reload or a transient half-open state.
- The inner left sidebar for users versus settings/system should share the same horizontal anchor, spacing, and top alignment unless a route intentionally deviates and documents why.
- If a route intentionally uses a different inner-sidebar position, the difference should be deliberate, visible in the plan, and covered by a route-specific layout note.

### Route Startup Performance Review (2026-04-11)

Method:
- Measured route startup with playwright-cli (`goto` + resource timing + console capture) and cross-checked server TTFB with `curl`.
- Focused routes: `/`, `/admin/users/overview`, `/admin/settings/connections`, `/admin/system/general`, `/account/settings/connections`.

General findings:
- Startup module fan-out is high across app shells (about 39-40 startup resource requests, with about 32 script-module requests on each tested route).
- Home route startup currently performs `/api/users/me` + `/api/chats` immediately.
- Admin settings/system cold loads still trigger `/api/auth/refresh` and `/api/chats`, even though the visible surface is settings-focused.
- Account settings startup triggers additional settings/model fetches (`/api/models`, `/api/users/me/settings`) during initial paint.
- Console captured intermittent settings warning from `renderGeneralSettings` model loading (`Failed to fetch`), which can create perceived startup instability.

Per-route optimization policy:
- `/`
  - Keep first paint chat-focused, but defer non-critical modules (markdown/render extras, optional tool integrations) until first use.
  - Keep auth bootstrap minimal and avoid secondary non-essential fetches on first frame.
- `/admin/users/*`
  - Treat as admin-workspace shell, but avoid chat-list hydration (`/api/chats`) on first paint unless chat UI is visible.
- `/admin/settings/*`
  - Keep settings-first bootstrap: avoid eager chat data fetches and avoid refresh-token exchange unless token is near expiry or a 401 occurs.
  - Lazy-load tab-specific data; only fetch connection/model/integration payloads for active tab.
- `/admin/system/*`
  - Same as settings-first bootstrap; avoid global eager fetches.
  - Ensure model-dependent calls in general/security panels fail soft with cached fallback and non-blocking UI.
- `/account/settings/*`
  - Defer `/api/models` and `/api/users/me/settings` until the relevant settings tab mounts.
  - Preserve route-local cache so tab switches reuse already loaded payloads.

Cross-route implementation guardrails:
- Prefer one bootstrap API contract (`/api/users/me?include=permissions,roles`) and pass data directly to RBAC init.
- Make bootstrap route-aware before issuing chat list/messages requests.
- Convert high-fan-out startup module graph into route bundles (or staged dynamic imports) so each route loads only required modules.
- Keep realtime connection deferred until after first paint and disable it on routes that do not need live chat updates.
- Track route startup budgets (request count, DCL, first meaningful paint proxy) and regressions per route family.

### Control-Level Dependency Graph

This is the deeper rule set that connects one UI control to the exact payload shape and every dependent surface that must rehydrate.

#### Admin Settings Controls

- `/admin/settings/models`
  - `[data-model-acl]`
    - Writes: `/api/admin/models` with access updates
    - Side effects: refresh effective access for the chosen model
    - Dependent surfaces: account settings, chat selector, admin users overview, policies page
  - attachment cap controls
    - Writes: `/api/admin/models`
    - Side effects: update model-side policy metadata
    - Dependent surfaces: account settings, chat selector, admin users overview, policies page
  - `model-search-input`, `model-provider-select`, `prev-page`, `next-page`
    - Reads: `/api/admin/models`
    - Side effects: local refetch only, no new mutations
    - Dependent surfaces: none beyond the current admin list
  - `Access` column
    - Displays `Admin`, `Shared`, or `Personal` only for selected-model truth
    - Never substitutes for account visibility state

- `/admin/settings/connections`
  - `.connection-toggle`
    - Writes: `/api/admin/openai/connections`
    - Side effects: broadcast connections invalidation and model invalidation
    - Dependent surfaces: account connections, account models, chat selector, admin users overview, policies page
  - `.connection-acl-btn`
    - Writes: `/api/admin/openai/connections` access updates
    - Side effects: refresh sharing and effective access
    - Dependent surfaces: account connections, account models, chat selector, admin users overview, policies page
  - model selection checkboxes inside the modal
    - Writes: same connection payload
    - Side effects: changes which models are discoverable from the connection
    - Dependent surfaces: admin models, account models, chat selector
  - provider URL/key/header fields
    - Writes: same connection payload
    - Side effects: can change discovery, auth, and health
    - Dependent surfaces: admin models and effective account catalog

- `/admin/settings/integrations`
  - `.server-toggle`
    - Writes: `/api/admin/tool-servers`
    - Side effects: broadcast tool-server invalidation
    - Dependent surfaces: account integrations, admin users overview, policies page
  - `.tool-toggle`
    - Writes: `/api/admin/tool-servers`
    - Side effects: toggles tool availability without changing model counts
    - Dependent surfaces: account integrations and effective tool visibility only
  - `.tool-access-btn`
    - Writes: `/api/admin/tool-servers` access updates
    - Side effects: refresh shared tool visibility
    - Dependent surfaces: account integrations, admin users overview, policies page
  - `.tools-toggle`
    - Pure UI state only
    - Side effects: local expand/collapse
    - Dependent surfaces: none

- `/admin/system/general`
  - `public-reg-toggle`, `registration-status`, `default-model`
    - Writes: `/api/admin/config`
    - Side effects: `default-model` broadcasts model invalidation; registration changes only affect auth/bootstrap
    - Dependent surfaces: `/`, `/auth.html`, chat bootstrap, admin users overview

- `/admin/system/security`
  - `resend-api-key`, `send-test-email`
    - Writes: `/api/admin/email-config` and `/api/admin/email-config/test`
    - Side effects: email delivery only
    - Dependent surfaces: none of the model/connection/integration surfaces

#### Account Settings Controls

- `/account/settings/models`
  - `model-toggle`
    - Writes: `/api/users/me`
    - Side effects: personal model visibility changes only; broadcast model invalidation
    - Dependent surfaces: `/`, account drawer reopen state, model selector
  - `model-provider-select`, `model-search-input`, `prev-page`, `next-page`
    - Reads: `/api/models?scope=effective`
    - Side effects: local refetch only
    - Dependent surfaces: current account page and chat selector count reconciliation
  - Hidden-state affordance on a model row
    - Indicates personal visibility override on a shared resource
    - Must not be treated as admin disablement

- `/account/settings/connections`
  - `.connection-toggle[data-toggle-scope="shared"]`
    - Writes: `/api/users/me`
    - Side effects: personal visibility override only; broadcast connection and model invalidation
    - Dependent surfaces: account connections, account models, chat selector
  - `.connection-toggle` for personal rows
    - Writes: `/api/users/me/resources/connections/:id`
    - Side effects: personal connection enabled/disabled state changes; broadcast connection and model invalidation
    - Dependent surfaces: account connections, account models, chat selector
  - `[data-account-connection-edit]`
    - Writes: `/api/users/me/resources/connections/:id`
    - Side effects: personal row update only
    - Dependent surfaces: account connections, account models, chat selector
  - `.connection-acl-btn` does not belong here
    - Shared ACL is admin-owned; account cannot grant or revoke workspace access

- `/account/settings/integrations`
  - `.server-toggle`
    - Writes: `/api/users/me`
    - Side effects: personal visibility override only; broadcast tool-server invalidation
    - Dependent surfaces: account integrations and chat tool UI
  - `.tool-toggle[data-toggle-scope="shared"]`
    - Writes: `/api/users/me`
    - Side effects: personal tool visibility override only; broadcast tool-server invalidation
    - Dependent surfaces: account integrations and chat tool UI
  - `[data-account-integration-edit]`
    - Writes: `/api/users/me/resources/mcp-servers/:id`
    - Side effects: personal integration row update only
    - Dependent surfaces: account integrations and chat tool UI

#### Chat Controls

- `#model-selector-btn`, `#model-search-input`, `button[data-model-id]`, `#prev-page`, `#next-page`
  - Reads: `/api/models?scope=effective`
  - Side effects: chat narrowing only, never broadens beyond account scope
  - Dependent surfaces: composer enablement, fallback notice, active model label
- `#model-selector-notice`
  - Shows why the current model fell back
  - Must explain admin disablement, personal hiding, or chat-context narrowing when the backend can prove it
- Tool toggles in the composer
  - Read from chat resource payloads only
  - Must not affect model counts or account settings

#### Admin Users / Policies Controls

- `/admin/users/overview`
  - `Show disabled` toggle
    - Pure inspector UI
    - Side effects: local list filtering only
  - `btn-inspect-user-access`
    - Reads: `/api/admin/users/:id/access`
    - Side effects: read-only modal refresh on invalidation
- `/admin/users/policies`
  - Family selector, group selector, search, visibility filters
    - Pure policy exploration controls
    - Side effects: local family/group filtering only
  - Resource selection checkboxes
    - Writes: admin ACL endpoints through the shared policy flow
    - Side effects: invalidates the matched family plus dependent account/chat views
  - Resource edit buttons
    - Open family-specific access modals
    - Depend on the same invalidation rules as the ACL writes themselves

### Mutation Response Rules

- Write endpoints should return the committed object or the committed identifiers needed for a targeted UI update.
- The UI should prefer the write response over a full refetch when the response already contains the authoritative committed state.
- A refetch is required only when the write changes a wider scope than the current page can accurately reconcile.
- Personal preference writes should return the updated user/preferences payload.
- Resource-row writes should return the updated resource row.
- Admin config writes should return the updated config snapshot.
- ACL writes should return the saved rule set or enough metadata to update the effective inspector.
- Immediate-save surfaces should never require a final manual commit step after a successful write response.

### State Ownership Matrix

| State slice | Owner | Allowed writers | Notes |
|---|---|---|---|
| `state.user` | `usersRouter` / auth bootstrap | auth/profile/account writes | identity, role, and profile state only |
| `state.settings.preferences` | account user-settings payload | `/api/users/me` | personal hides, defaults, and attachments live here |
| `state.settings.connections.my_connections` | account settings payload | `/api/users/me/resources/connections/:id` | personal connection rows only |
| `state.settings.connections.connections` | effective workspace/account payload | admin ACLs + user visibility overrides | shared rows must be labeled, not guessed |
| `state.settings.models` | account settings payload | `/api/models` + personal overrides | effective model availability only |
| `state.models` | public model cache | model routers + invalidation | chat uses this as the selector source |
| `state.defaultModelId` | bootstrap / admin config | `/api/admin/config` | affects chat bootstrap only |
| `state.globalDefaultModelId` | bootstrap / admin config | `/api/admin/config` | cannot change admin/global counts |
| `state.chat.*` | chat runtime | chat controllers | may narrow, may fallback, may never widen |
| `state.admin.*` | admin surfaces | admin routers | global truth, ACLs, and discovery only |

Rules:
- If a page does not own the state slice, it may read it but must not mutate it directly.
- If a page mutates a slice, that mutation must flow through the owning API route.
- Shared-resource visibility should be derived from owner state plus effective visibility overrides, never from client assumptions.

### Resource Family Matrix

| Family | Admin truth | Account truth | Chat truth | Personal override |
|---|---|---|---|---|
| Models | `/api/admin/models` | `/api/models` + `/api/users/me` | `/api/models` + chat context | hide/show + attachment caps |
| Connections | `/api/admin/openai/connections` + ACLs | `/api/users/me/settings` + `/api/users/me/resources/connections` | account-effective connections only | hide/show shared rows + personal connection edits |
| MCP servers | `/api/admin/tool-servers` + ACLs | `/api/users/me/settings` + `/api/users/me/resources/mcp-servers` | account-effective tool visibility only | hide/show shared tools + personal server edits |
| System config | `/api/admin/config` | `/api/users/me/settings` for personal defaults only | bootstrap reads defaults from account/session state | none |
| Email config | `/api/admin/email-config` | none | none | none |
| Users / roles / groups / policies | `/api/admin/users/*` + RBAC/admin ACL endpoints | only reflected in account payloads | only reflected through effective scope | none |

Rules:
- A family should have one admin truth endpoint set and one effective-account projection.
- Chat can narrow a family, but it cannot invent new items in that family.
- Personal overrides can hide or restore visible shared items, but they cannot create new admin truth.
- If a family has no admin truth, the account view should not fabricate a placeholder row.
- If a family is hidden personally, the UI should prefer an explicit hidden state over silent disappearance whenever the underlying resource is still shared.

### Payload Shape Contract

- `/api/users/me/settings?include=permissions,roles`
  - Returns the account bootstrap payload for the current user.
  - Must include `user`, `permissions`, `roles`, `settings.general`, `settings.preferences`, `settings.connections`, `settings.integrations`, `settings.tool_servers`, and `settings.models`.
  - Must preserve both personal rows and shared rows so the UI can label them instead of guessing.
  - Must preserve hidden shared-state flags in preferences so reload can restore the same personal view.
- `/api/models`
  - Returns `models`, `total`, `active_total`, `limit`, and `offset`.
  - Must be the effective user-facing catalog used by account settings and chat.
  - Must not expose admin-disabled models as selectable account rows.
  - May paginate, but the totals must remain scope-correct.
  - Pagination must operate on the effective scope only; next/prev controls must never leak disabled rows from the global catalog into account scope.
- `/api/admin/openai/connections`
  - Returns the admin connection config snapshot with `enabled` and `connections`.
  - Must represent admin truth only.
  - Must not silently mix ACL state into the discovery/config payload.
- `/api/admin/openai/connections/access`
  - Returns `connection_id`, `groups`, and `rules`.
  - Must round-trip `principal_type`, `principal_id`, `effect`, and `action`.
  - Must be sufficient for the effective-access inspector to explain shared or denied visibility.
- `/api/admin/users/:id/access`
  - Returns `user`, `groups`, `role_permissions`, and `access`.
  - Must be read-only and explain effective access across models, connections, and MCP servers.
- `/api/admin/config`
  - Returns the global config snapshot, including registration state and default model.
  - Must be the only owner of deployment-wide defaults.
- `/api/admin/email-config`
  - Returns the email config snapshot.
  - `/api/admin/email-config/test` must be transient and not change the config snapshot.
- `/api/admin/tool-servers`
  - Returns admin tool-server truth and accessibility only.
  - Must not alter model counts.
- `/api/chats`
  - Returns and mutates chat runtime state only.
  - Must not mutate admin truth or personal settings payloads directly.

### Account Pages

- `/account/settings/connections`
  - Reads: `/api/users/me/settings?include=permissions,roles`, `/api/users/me/resources/connections`
  - Writes personal connection edits through `/api/users/me/resources/connections/:id`
  - Writes personal visibility overrides through `/api/users/me`
  - Must render personal rows, shared rows, and hidden shared rows distinctly
  - Must not edit admin ACL grants directly
  - On save, update only the edited row or visibility flag, then invalidate account/chat views if shared visibility changed
- `/account/settings/models`
  - Reads: `/api/users/me/settings?include=permissions,roles`, `/api/models`
  - Writes personal model visibility / attachment caps through `/api/users/me`
  - Must treat `/api/models` as the effective selectable catalog
  - Must not show admin-disabled models as owned rows
  - Must paginate only within the effective catalog; next/prev controls must not traverse into admin-disabled rows
  - On save, update only the changed model row(s), then invalidate chat selector state
- `/account/settings/integrations`
  - Reads: `/api/users/me/settings?include=permissions,roles`, `/api/users/me/resources/mcp-servers`
  - Writes personal MCP server edits through `/api/users/me/resources/mcp-servers/:id`
  - Writes personal tool visibility through `/api/users/me`
  - Must not affect model counts
  - On save, update only the changed server/tool rows and invalidate tool views

### Admin Pages

- `/admin/settings/connections`
  - Reads: `/api/admin/openai/connections`, `/api/admin/openai/connections/access`, `/api/admin/models`
  - Writes connection config through `/api/admin/openai/connections`
  - Writes connection ACLs through `/api/admin/openai/connections/access`
  - Must invalidate admin models, account models, and chat model caches after discovery changes
  - On save, update the edited connection row and any affected ACL badges before invalidation completes
- `/admin/settings/models`
  - Reads: `/api/admin/models`, `/api/admin/models/access`
  - Writes model-side policy and caps through `/api/admin/models`
  - Writes model ACLs through `/api/admin/models/access`
  - Must render the selected-model projection, not a separate enablement truth
  - On save, update the affected model row, selected counts, and access badges immediately
- `/admin/settings/integrations`
  - Reads: `/api/admin/tool-servers`, `/api/admin/tool-servers/access`
  - Writes tool server config through `/api/admin/tool-servers`
  - Writes tool ACLs through `/api/admin/tool-servers/access`
  - Must not change model counts
  - On save, update only the edited server/tool rows
- `/admin/system/general`
  - Reads and writes `/api/admin/config`
  - Uses `/api/models` only for default-model choice lists
  - Must not redefine resource availability
  - On save, update only the changed general-setting field and refresh chat bootstrap defaults if needed
- `/admin/system/security`
  - Reads and writes `/api/admin/email-config`
  - Test action uses `/api/admin/email-config/test`
  - Must remain isolated from model and connection counts
  - On save, update only the email-config panel state
- `/admin/users/overview`
  - Reads `/api/admin/users/:id/access`
  - Must remain read-only
- `/admin/users/roles`
  - Reads and writes RBAC role templates through the admin RBAC endpoints
  - Must not directly mutate specific resource grants unless policy design says so
- `/admin/users/groups`
  - Reads and writes group membership through the admin group endpoints
  - Must invalidate all shared-resource views when membership changes
- `/admin/users/policies`
  - Reads and writes ACL resources through `/api/admin/models/access`, `/api/admin/openai/connections/access`, and `/api/admin/tool-servers/access`
  - Must be the only page that directly manages shared grants and denies

### Chat Pages

- `/`
  - Reads `/api/models`, `/api/chats`, `/api/users/me/settings?include=permissions,roles`
  - Writes chat creation and message flow through `/api/chats` and `/api/chats/:id/messages`
  - Must never widen beyond the effective account catalog
  - Must show a fallback banner when the selected model is no longer allowed
  - Must disable composing when no allowed model remains
  - On invalidation, refresh the dropdown before the next send and never silently restore a forbidden model
- `/api/chats/:id`
  - Owns chat history, chat-specific model fallback, and runtime state
  - Must preserve historical model labels even when the model is later disabled
- `/api/models`
  - Acts as the effective user-facing model catalog
  - Must reflect account-visible availability, not raw admin truth
  - Must stay stable enough for chat bootstrapping and selector counts
  - Must be the same effective catalog used by account settings, unless chat narrowing is applied on top
  - Its effective set is the intersection of connection discovery, upstream selection, ACL, and personal visibility; model-side policy changes alone do not widen undiscovered connection output.

## Sync Rules

1. Any mutation that changes discovery, selection, ACL, attachment caps, or personal visibility must broadcast a model invalidation.
2. Admin pages refetch admin-scoped data.
3. Account pages and chat refetch public/effective model data.
4. Account changes never update admin truth.
5. Chat should never cache a model set longer than the current invalidation window.
6. Historical chat messages remain immutable even if a model disappears.
7. Header counts must come from the same scope-specific API total the page is representing, not from the current visible page slice.
8. The UI may be optimistic, but the persisted value is always the last successful immediate save.

## Disabled-Model Fallback

When a model is disabled after a chat already used it:

1. Keep all prior messages and metadata unchanged.
2. Show the old model in history as historical context only.
3. Mark it unavailable for new sends, regenerations, and branches.
4. If the current chat still has another allowed model, switch the composer to that model.
5. If not, fall back in this order:
   - chat model if still allowed
   - user default model
   - global default model
   - first allowed model
6. If no allowed model exists, disable the composer and surface a recovery action.

## Page-Level Ownership Summary

- Admin pages define what exists.
- Account pages define what the user can actually use.
- Chat consumes the account result and never invents availability on its own.
- Admin is the source of truth for existence and upstream selection.
- Admin system general owns registration and global defaults.
- Admin system security owns email delivery configuration.
- Account is the source of truth for personal visibility and effective usability.
- Chat is a runtime consumer that never widens the list beyond account scope.
- The ACL chain is: roles define what the user can do, groups define who they travel with, policies define what resources they can reach, and account settings define what they personally hide or restore.

## Acceptance Criteria

- Admin active counts, account active counts, and chat dropdown counts are no longer treated as the same metric.
- Model selection and model-side policy actions propagate through the right scope only.
- A disabled historical model remains readable in chat history.
- Chat never offers a model that account settings would not allow.
- Empty states explain the reason for absence, not just the absence itself.
- Account/admin settings pages do not expose staged-save UI or require a manual save button.

## Implementation Map

### Data / API

- Keep `/api/admin/models` as the global catalog endpoint.
- Keep `/api/admin/config` as the deployment-defaults endpoint for registration and the global default model.
- Keep `/api/admin/email-config` as the email delivery configuration endpoint.
- Keep `/api/models` as the effective user-facing catalog endpoint.
- Account settings should consume `/api/models` in its default mode so admin-disabled models never enter the personal scope.
- Do not force admin counts into `/api/models`; let the public endpoint remain the account/chat source of truth.
- Preserve historical model IDs in chats even if the current catalog no longer contains them.
- Account connections should rely on the user settings payload for both personal rows and admin-shared rows, so visibility is derived from effective access and not guessed in the client.

### Frontend

- `public/js/features/admin/settings/connections.js`
  - Keep discovery and shared access controls aligned with admin truth.
- `public/js/features/admin/settings/models.js`
  - Rename counters/labels to global terminology.
  - Ensure global invalidation refreshes account and chat views.
- `public/js/features/admin/settings/integrations.js`
  - Keep tool-server availability isolated from model counts.
- `public/js/features/admin/settings/general.js`
  - Keep global default model and registration edits immediate-save.
- `public/js/features/admin/settings/security.js`
  - Keep email config edits immediate-save and side-effect scoped.
- `public/js/features/admin/admin-shell-controller.js`
  - Remove shared staged-save footer behavior from admin settings flows.
- `public/js/features/account/account-models.js`
  - Rename counters/labels to account-effective terminology.
  - Keep this page aligned with `/api/models`.
- `public/js/features/chat/model-selector-controller.js`
  - Treat the selector as a consumer of account-effective models.
  - Add banner handling for unavailable current model.
- `public/js/features/chat/chat-data-controller.js`
  - Add fallback selection logic when current model disappears.
  - Preserve readable history while blocking new sends on invalid models.
- `public/js/bootstrap/session-bootstrap.js`
  - Make model invalidation refresh the public model cache before chat bootstraps stale data.

### State / Sync

- Model invalidation should be a single cross-page signal.
- Admin writes should invalidate account state and chat state.
- Account writes should never mutate admin state.
- Tool/integration invalidations should stay separate from model invalidation.
- Remove any leftover staged-save queue or footer plumbing from account/admin flows if it reappears in future refactors.

## Verification Checklist

- Change a model in admin and confirm account and chat update without a full reload.
- Hide a model in account and confirm it disappears from chat immediately.
- Disable a model in admin while a chat is open and confirm the composer falls back or blocks sending.
- Open a chat that used a now-disabled model and confirm history still renders.
- Verify empty states on all relevant pages use scope-correct language.
- Change a group membership and confirm the read-only access inspector reflects the new effective grants.
- Change a policy grant and confirm `/admin/users/overview` and account scope reconcile on refresh.
- Hide a shared connection in account, reload, and confirm the admin grant still exists while the personal view stays hidden.
- Confirm `/admin/users/roles` changes affect permission templates but do not directly edit a specific shared connection row.
- Change the global default model in `/admin/system/general` and confirm chat bootstrap changes without altering model counts.
- Update email config in `/admin/system/security` and confirm no model or connection counts change.
- Confirm there is no staged-save footer or manual save action in account/admin settings.
- Confirm account model count and chat selectable count match for the same effective session.

## Edge Cases

- If a model is removed from admin but still exists in chat history, render the old label and mark it unavailable.
- If the user has no allowed models but the workspace still has global models, show a user-scoped empty state instead of a workspace-scoped failure.
- If the workspace has no global models, show an admin-scoped recovery path instead of a user-scoped one.
- If a connection change causes the model list to shrink, keep the current chat open and only block new sends when necessary.
- If a model is disabled mid-stream, do not rewrite the transcript unless the backend truly cannot continue.

## Exact Copy Guidance

- Admin models header: `Selected models`
- Account models header: `Available to you`
- Model tables use an `Access` column for `Admin` / `Personal`; do not restore the old `Input` column until the future settings icon flow exists.
- If hidden shared rows are shown, keep them inline under the same `Models` table and convey hidden state without changing the grant label.
- Chat dropdown helper: `Selectable in chat`
- Empty selected-model catalog: `No models are selected upstream.`
- Empty personal catalog: `No models are available to you.`
- Empty chat catalog: `No selectable models are currently available for this chat.`

## Scope Decision Tree

1. Is the user asking what exists in the workspace?
   - Use admin scope.
2. Is the user asking what they can personally use?
   - Use account scope.
3. Is the UI choosing a model for an active chat turn?
   - Use chat/runtime scope.
4. Does the answer require persistence or policy?
   - Persist at the narrowest scope that owns the decision.

## Draft Status

- This plan is the current UX contract for admin/account/chat scope boundaries.
- Do not reintroduce staged-save flows into account/admin settings.
- Do not collapse admin truth, account visibility, and chat selection into one count or one label.
- Any future change should preserve the route canonicalization and ACL ownership rules defined above.

## Open Work

- Remove the remaining staged-draft plumbing from admin ACL modals and settings surfaces.
  - Delete the leftover draft registry path in `public/js/features/admin/acl-draft.js` and stop using staged ACL snapshots in connections, models, and integrations.
  - Keep only immediate-save or read-only flows for `src/`, `public/`, `tests/`, and `migrations/` surfaces.
  - Update any tests that still assert draft persistence, unsaved prompts, or manual save orchestration so they assert immediate persistence instead.
- Normalize MCP server tool toggles across `/account/settings/integrations` and `/admin/settings/integrations`.
  - The account surface currently has cases where an individual tool toggle is visible but not actually toggleable.
  - Treat this as a generalized scope-and-control mismatch, not a one-off UI bug.
  - The owning rule should be explicit for every toggle: personal override, shared visibility, or admin truth.
  - The control should always advertise whether it is editable, read-only, or inherited from another scope.
- Enrich cross-page and cross-surface interaction tracing.
  - We should be able to read one page and understand how it relates to other pages, modal states, drawers, and backend endpoints.
  - Each major UI element should map to its owning route, mutation endpoint, invalidation scope, and dependent surfaces.
  - URL hashes, modal anchors, and other deep links should become part of the same traceability contract.
  - The goal is to make interrelation between pages, components, and API resources visible enough that debugging and QA can follow the chain without guessing.
- Remove all remaining staged-draft behavior from admin users/settings flows.
  - The codebase should not keep any staged delete, staged edit, unsaved prompt, or manual save orchestration for account/admin settings surfaces.
  - Users, roles, groups, policies, connections, models, integrations, general, and security should all behave as immediate-save or immediate-action surfaces where applicable.
  - Any remaining draft registry, dirty checker, shared save footer, or unsaved-changes prompt should be treated as legacy behavior to delete, not preserve.
  - Update tests to assert immediate persistence and remove stale staged-save expectations.

## Interaction Traceability Contract

This is the proposed contract for making cross-page and cross-API relationships legible.

- Every page must declare its ownership model:
  - canonical route
  - scope (`admin`, `account`, `chat`, or `shared`)
  - primary data family
  - read endpoints
  - write endpoints
  - invalidation targets
  - dependent surfaces
- Every modal, drawer, and overlay must declare:
  - stable hash anchor
  - owning page
  - owning data family
  - open/close trigger
  - read/write behavior
  - whether it is informational, editable, or read-only
- Every mutation must answer the same chain:
  - what owns the state
  - what endpoint changes it
  - what immediate UI changes
  - what cross-page invalidation follows
  - what other surface must reconcile
- Every projection surface must say whether it is:
  - a source of truth
  - a personal overlay
  - an effective-view projection
  - a runtime narrowing of some broader scope
- Every backend payload must be classified as:
  - admin truth
  - account-effective truth
  - chat/runtime truth
  - personal override
  - read-only inspection

The practical outcome should be:

- A single source can be traced from route to control to backend endpoint to dependent page.
- A modal hash can be used to reproduce the same UI state across pages and sessions.
- QA can see whether a mismatch is caused by ownership, projection, invalidation, or copy/label drift.
- New features must fit into this graph instead of inventing disconnected state.

## Implementation Checklist

1. Lock route canonicalization for `/admin`, `/admin/users`, `/admin/settings`, `/admin/system`, `/account`, and `/account/profile*`.
2. Keep `/admin/system/general` and `/admin/system/security` aligned to their immediate-save config contracts.
3. Keep `/admin/users/overview` as the read-only effective-access inspector.
4. Keep `/admin/users/groups` and `/admin/users/policies` as the shared-access control path.
5. Keep `/account/settings/connections` as personal visibility plus read-only shared context.
6. Keep `/account/settings/models` aligned to the effective catalog only.
7. Keep `/` as a chat-only consumer of account-effective models.
8. Remove remaining staged-save footer / dirty-buffer behavior from admin settings surfaces.
9. Verify invalidation propagation for model, connection, ACL, tool-server, and default-model changes.
10. Verify account/chat narrowing and fallback behavior after upstream selection changes.
11. Verify labels, counts, and empty states never mix admin truth with account scope.

## File Map

- `public/js/bootstrap/app.js`
  - Route canonicalization and account/admin redirect wiring.
- `public/js/features/admin/admin-route-state.js`
  - Admin route ownership and canonical path resolution.
- `public/js/features/account/account.js`
  - Account route resolution and drawer/navigation behavior.
- `public/js/features/admin/users/overview.js`
  - Read-only effective access inspector.
- `public/js/features/admin/users/roles.js`
  - Role template management.
- `public/js/features/admin/users/groups.js`
  - Group membership management and policy navigation.
- `public/js/features/admin/settings/connections.js`
  - Global connection discovery and access controls.
- `public/js/features/admin/settings/models.js`
  - Selected-model projection, ACLs, and attachment caps.
- `public/js/features/admin/settings/integrations.js`
  - Tool-server availability.
- `public/js/features/admin/settings/policies.js`
  - Resource grant/deny management.
- `public/js/features/admin/settings/general.js`
  - Registration and global-default configuration.
- `public/js/features/admin/settings/security.js`
  - Email delivery configuration.
- `public/js/features/admin/admin-shell-controller.js`
  - Shared footer, dirty checking, and save orchestration.
- `public/js/features/account/account-connections.js`
  - Personal vs shared connection visibility.
- `public/js/features/account/account-models.js`
  - Effective account model catalog.
- `public/js/features/account/account-integrations.js`
  - Personal integrations and tool visibility.
- `public/js/features/chat/model-selector-controller.js`
  - Chat selector scope, labels, and current-model fallback.
- `public/js/features/chat/chat-data-controller.js`
  - Chat fallback logic and model loss handling.
- `public/js/shared/api/models.js`
  - Effective model fetch contract.
- `src/routers/models.js`
  - Public model catalog, selected-model projection, model-side policy metadata, and effective access filtering.
- `src/routers/users.js`
  - User settings payloads and admin effective-access inspection.
- `src/services/workspace-settings.js`
  - Workspace/account payload composition for shared and personal resources.

## Implementation Order

1. Lock route canonicalization in `public/js/bootstrap/app.js` and `public/js/features/admin/admin-route-state.js`.
2. Confirm the account payloads in `src/services/workspace-settings.js` and `src/routers/users.js` expose effective shared vs personal resources correctly.
3. Lock the admin settings and ACL/system surfaces in `public/js/features/admin/settings/connections.js`, `models.js`, `integrations.js`, `settings/policies.js`, `settings/general.js`, `settings/security.js`, and `public/js/features/admin/users/overview.js`, `roles.js`, `groups.js`.
4. Lock account visibility in `public/js/features/account/account-connections.js`, `account-models.js`, and `account-integrations.js`.
5. Lock chat scope/fallback in `public/js/features/chat/model-selector-controller.js` and `chat-data-controller.js`.
6. Lock the public model contract in `public/js/shared/api/models.js` and `src/routers/models.js`.
7. Run verification against the checklist and update only if the observed behavior still diverges from the contract.

## Per-File Checklist

- `public/js/bootstrap/app.js`
  - `// Canonicalize /admin and /account legacy roots.`
  - `// Route account/profile into account settings connections.`
- `public/js/features/admin/admin-route-state.js`
  - `// Keep /admin/users/overview as the canonical admin root.`
  - `// Map settings/system aliases to canonical user/admin paths.`
- `public/js/features/admin/users/overview.js`
  - `// Show effective access only; no direct editing.`
  - `// Distinguish personal, shared, hidden-for-user, and revoked states.`
- `public/js/features/admin/users/roles.js`
  - `// Treat roles as permission templates, not resource grants.`
- `public/js/features/admin/users/groups.js`
  - `// Treat membership as the bridge for inherited access.`
- `public/js/features/admin/settings/connections.js`
  - `// Own connection discovery and access-rule editing.`
- `public/js/features/admin/settings/models.js`
  - `// Own selected-model projection, ACLs, and attachment caps.`
- `public/js/features/admin/settings/integrations.js`
  - `// Own tool-server availability without changing model counts.`
- `public/js/features/admin/settings/policies.js`
  - `// Own explicit grants and denies for shared resources.`
- `public/js/features/admin/settings/general.js`
  - `// Own registration and global default model config.`
- `public/js/features/admin/settings/security.js`
  - `// Own outbound email config and test-email actions.`
- `public/js/features/admin/admin-shell-controller.js`
  - `// Avoid shared staged-save footer behavior if the page is immediate-save.`
- `public/js/features/account/account-connections.js`
  - `// Show personal rows plus read-only shared rows.`
  - `// Local hide only affects this user.`
- `public/js/features/account/account-models.js`
  - `// Consume effective catalog only.`
  - `// No admin-disabled rows in account scope.`
- `public/js/features/account/account-integrations.js`
  - `// Keep tool visibility separate from model visibility.`
- `public/js/features/chat/model-selector-controller.js`
  - `// Mirror account scope and explain narrower chat context.`
  - `// Banner on current-model loss, then fallback.`
- `public/js/features/chat/chat-data-controller.js`
  - `// Preserve history; only block new sends when needed.`
- `public/js/shared/api/models.js`
  - `// Fetch effective user-facing catalog by default.`
- `src/routers/models.js`
  - `// Filter admin-disabled models from effective catalog.`
- `src/routers/users.js`
  - `// Provide account payloads and effective access inspection.`
- `src/services/workspace-settings.js`
  - `// Compose shared/personal resource payloads with clear scope.`

## Test Map

- `public/js/bootstrap/app.js`
  - `tests/unit/public-app.test.js`
- `public/js/features/admin/admin-route-state.js`
  - `tests/unit/public-admin-route-state.test.js`
- `public/js/features/admin/users/overview.js`
  - `tests/unit/public-admin-access.test.js`
- `public/js/features/admin/users/roles.js`
  - `tests/unit/public-admin-module.test.js`
- `public/js/features/admin/users/groups.js`
  - `tests/unit/public-admin-users-groups.test.js`
- `public/js/features/admin/settings/connections.js`
  - `tests/unit/public-admin-connections-modal.test.js`
  - `tests/unit/public-admin-connections-helpers.test.js`
- `public/js/features/admin/settings/models.js`
  - `tests/unit/public-admin-models.test.js`
  - `tests/unit/public-admin-models-helpers.test.js`
- `public/js/features/admin/settings/integrations.js`
  - `tests/unit/public-admin-integrations.test.js`
  - `tests/unit/public-admin-integrations-helpers.test.js`
- `public/js/features/admin/settings/policies.js`
  - `tests/unit/public-admin-policies.test.js`
- `public/js/features/admin/settings/general.js`
  - `tests/unit/public-admin-general.test.js`
  - `tests/unit/public-admin-general-helpers.test.js`
- `public/js/features/admin/settings/security.js`
  - `tests/e2e/frontend/admin-system-security-tab.spec.ts`
- `public/js/features/admin/admin-shell-controller.js`
  - `tests/e2e/frontend/admin-settings.spec.ts`
- `public/js/features/account/account-connections.js`
  - `tests/unit/public-account-connections.test.js`
- `public/js/features/account/account-models.js`
  - `tests/unit/public-account-models.test.js`
- `public/js/features/account/account-integrations.js`
  - `tests/unit/public-account-integrations.test.js`
- `public/js/features/chat/model-selector-controller.js`
  - `tests/unit/public-model-selector.test.js`
- `public/js/features/chat/chat-data-controller.js`
  - `tests/unit/public-chat-message-stream.test.js`
- `public/js/shared/api/models.js`
  - `src/routers/models.test.js`
- `src/routers/users.js`
  - `src/routers/users.test.js`
- `src/services/workspace-settings.js`
  - `src-workspace-settings.test.js`

## Browser Verification Matrix

- `/admin/users/overview`
  - Confirms the canonical admin entrypoint resolves correctly.
  - Confirms effective access is read-only and labels personal/shared/revoked state clearly.
- `/admin`
  - Confirms the legacy admin root redirects to `/admin/users/overview`.
- `/admin/users`
  - Confirms the legacy user root redirects to `/admin/users/overview`.
- `/admin/users/roles`
  - Confirms roles read as permission templates only.
  - Confirms no resource sharing controls appear here.
- `/admin/settings/roles`
  - Confirms the legacy roles route redirects to `/admin/users/roles`.
- `/admin/users/groups`
  - Confirms groups are the membership bridge for inherited access.
  - Confirms membership changes affect effective access on reload.
- `/admin/users/policies`
  - Confirms explicit grants and denies are editable here.
  - Confirms policy changes propagate to account/chat scope after refresh.
- `/admin/settings/policies`
  - Confirms the legacy policies route redirects to `/admin/users/policies`.
- `/admin/settings/connections`
  - Confirms admin-managed connections are visible only when shared by policy.
  - Confirms no personal hide action can revoke a shared grant.
- `/admin/settings`
  - Confirms the legacy settings root redirects to `/admin/settings/connections`.
- `/admin/settings/models`
  - Confirms unselected upstream models stay out of the effective account/chat catalog.
  - Confirms the count means `selected upstream`, not `all defined`.
- `/admin/settings/integrations`
  - Confirms integrations remain tool-scoped, not model-scoped.
  - Confirms tool visibility does not affect model counts.
- `/admin/settings/general`
  - Confirms the legacy general settings route redirects to `/admin/system/general`.
- `/admin/settings/email`
  - Confirms the legacy email settings route redirects to `/admin/system/security`.
- `/admin/system`
  - Confirms the legacy system root redirects to `/admin/system/general`.
- `/admin/system/general`
  - Confirms global default model changes only affect chat bootstrap defaults.
  - Confirms registration controls persist immediately.
- `/admin/system/security`
  - Confirms email key changes persist immediately.
  - Confirms test-email is a transient action and does not alter model scope.
- `/account/settings/connections`
  - Confirms personal hide persists on reload.
  - Confirms a personal hide does not remove the admin grant.
  - Confirms a shared row can be hidden for one user while remaining effective for others.
  - Confirms admin-disabled rows do not appear in account scope.
- `/account`
  - Confirms the legacy account root redirects to `/account/settings/connections`.
- `/account/profile/overview`
  - Confirms legacy profile routes redirect to `/account/settings/connections`.
- `/account/settings/models`
  - Confirms the count matches the chat dropdown baseline.
  - Confirms chat-narrowing does not change the account catalog.
- `/account/settings/integrations`
  - Confirms user-level integration visibility tracks only account scope.
  - Confirms integration changes do not mutate model availability.
- `/`
  - Confirms the model dropdown mirrors account scope.
  - Confirms current-model fallback messaging appears when a selected model disappears.
  - Confirms chat-level narrowing is explained explicitly when fewer models are shown.

## Verification Status

- The contract is documented at page, endpoint, payload, invalidation, and state-ownership level.
- The current codebase has been aligned to the shared-save footerless immediate-save direction.
- If a page changes its endpoint ownership, payload shape, or invalidation scope, update this plan first so the UX contract stays explicit.
- Treat this document as the implementation contract, not a brainstorming note.

## Non-Goals

- Do not revive staged-save for account/admin settings.
- Do not reintroduce `/account/profile` as a canonical account UX surface.
- Do not reintroduce `/admin` as a separate dashboard surface.
- Do not treat personal hides as admin grants or vice versa.
- Do not let tool-server changes mutate model counts.

## 2026-04-11 — Remove fully staged draft behavior (src/public/tests/migrations)

### Scope requested
- Remove remaining staged-draft behavior completely from `src/`, `public/`, `tests/`, and `migrations/`.
- Use `ISSUES.md` prior progress as baseline; complete the cleanup end-to-end.

### Confirmed remaining draft surface
- `public/js/features/admin/acl-draft.js` (draft cloning/signature helpers).
- `public/js/features/admin/settings/connections-helpers.js` (modal draft persist/apply/build helpers).
- `public/js/features/admin/settings/connections.js` (modal draft orchestration/state).
- Tests still asserting staged/draft behavior under `tests/unit/`.
- `migrations/` has no staged-draft schema/state to remove.

### Implementation plan
1. Remove draft helper module and stale imports/usages in admin settings flows.
2. Refactor connections modal flow to immediate-state behavior only (no draft registry / draft replay).
3. Remove or rewrite unit tests that assert staged-draft mechanics; keep behavior tests aligned with immediate-save flow.
4. Verify no remaining staged-draft references across target folders and run focused test coverage for touched areas.

### Continuation check (2026-04-11)
1. Re-scan `src/`, `public/`, `tests/`, `migrations/` for staged-draft symbols and deferred-save mechanics.
2. Remove only behaviorally relevant leftovers; do not remove unrelated chat message draft UX unless explicitly requested.
3. Re-validate via symbol sweep and report exact file:line outcomes.

### Continuation check (2026-04-11, pass 2)
1. Re-open `ISSUES.md` and treat previous removals as baseline.
2. Re-scan only `src/`, `public/`, `tests/`, `migrations/` for staged-draft behavior leftovers.
3. Remove any remaining behavior-level leftovers and stale assertions; keep unrelated message-composer drafts intact.
4. Re-run residual sweep and syntax checks for touched files, then report with file:line references.
