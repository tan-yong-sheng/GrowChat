# GrowChat `/admin/users/groups` RBAC Plan

## Goal
Add a group-management RBAC surface that matches the Open WebUI pattern:
- one admin subpage for user/group management
- one editable group record with metadata, permissions, and members
- one default-permissions template for new users/groups
- deny-by-default authorization on the server, not just the UI

## What I found
Open WebUI treats groups as first-class policy objects, not just labels:
- `src/routes/(app)/admin/users/[tab]/+page.svelte` exposes `overview` and `groups`
- `src/lib/components/admin/Users/Groups/*` separates `General`, `Permissions`, and `Users`
- `backend/open_webui/models/groups.py` stores group metadata, permissions, and membership
- `backend/open_webui/models/access_grants.py` uses users and groups as permission principals

GrowChat already has the pieces needed to support this:
- `src/utils/authorize.js` is permission-based and supports deny-by-default
- `migrations/010_rbac_core.sql` seeds `chat.*`, `model.*`, `file.*`, and `admin.*` permissions
- `src/routers/users.js` and `src/routers/admin.js` already split `admin.user.read`, `admin.user.write`, `admin.audit.read`, and `admin.rbac.admin`
- `public/js/features/admin/users/groups.js` is currently a placeholder

## Proposed policy
Use a two-layer policy:
- `admin.user.read` for viewing `/admin/users/groups` and loading group lists/details
- `admin.user.write` for group CRUD and membership changes
- `admin.rbac.admin` for permission editing and default permission templates

Recommended rule split:
- View-only admin: can inspect groups and membership
- User admin: can add/remove users, rename groups, delete groups
- RBAC admin: can change the permission bundle attached to a group and the default template

Keep these server-side:
- UI hiding is only cosmetic
- API endpoints must enforce the permission checks directly

## GrowChat feature map
```
[ authenticated user ]
          |
          v
  resolvePermissions()
          |
  +-------+-------------------------------+
  |                                       |
  v                                       v
role-based perms                     group-based perms (new)
  |                                       |
  +-------------------+-------------------+
                      |
                      v
              feature access layer

  chat.*            -> src/routers/chat.js
  model.use         -> src/routers/models.js (public usage)
  model.admin       -> src/routers/models.js + src/routers/admin.js
  file.upload       -> src/routers/files.js
  file.delete       -> src/routers/files.js
  admin.user.*      -> src/routers/users.js + admin shell
  admin.audit.read  -> src/routers/rbac.js
  admin.rbac.admin  -> src/routers/rbac.js + settings/admin policy
```

## Open WebUI to GrowChat mapping
```
Open WebUI group tabs
  overview -> user list / high-level visibility
  groups   -> group CRUD + members + permissions

GrowChat target
  overview -> /admin/users/overview
  groups   -> /admin/users/groups

Open WebUI permissions buckets
  workspace     -> model, knowledge, prompts, tools, skills
  sharing       -> public sharing flags
  access_grants -> who can share / access
  chat          -> chat controls and message operations
  features      -> notes, channels, folders, etc.
  settings      -> interface toggles

GrowChat permission buckets
  chat          -> chat.read/write/delete/share
  model         -> model.use/model.admin
  file          -> file.upload/file.delete
  admin         -> admin.user.read/write, admin.audit.read, admin.rbac.admin
```

## Implementation phases

### Phase 1: Data model
- Add group persistence if it does not already exist in GrowChat
- Store:
  - group name
  - description
  - optional config/data blob
  - permission bundle
  - membership rows
- Keep the current `roles` and `permissions` tables for system auth
- Do not replace the existing role model

### Phase 2: Authorization plumbing
- Extend permission resolution so group-derived permissions are merged with role-derived permissions
- Keep the merge additive only for v1
- Reuse `resolvePermissions()` and `authorize()` instead of introducing a second auth path
- Preserve the current active-account check in `src/index.js`

### Phase 3: API surface
Add a dedicated admin groups router, likely under `src/routers/admin.js` or a new `src/routers/groups.js`, with endpoints like:
- `GET /api/admin/groups`
- `POST /api/admin/groups`
- `GET /api/admin/groups/:id`
- `PUT /api/admin/groups/:id`
- `DELETE /api/admin/groups/:id`
- `POST /api/admin/groups/:id/users`
- `DELETE /api/admin/groups/:id/users`
- `GET /api/admin/groups/default-permissions`
- `PUT /api/admin/groups/default-permissions`

Authorization matrix:
- `GET` list/details -> `admin.user.read`
- member add/remove -> `admin.user.write`
- create/update/delete group -> `admin.user.write`
- default permissions -> `admin.rbac.admin`

### Phase 4: UI
- Replace the placeholder in `public/js/features/admin/users/groups.js`
- Mirror the Open WebUI layout:
  - list pane
  - group modal
  - tabs for general / permissions / users
  - default permissions card
- Keep the admin shell mounted and update local state in place
- Avoid full page reloads after group mutations

### Phase 5: Tests
- Add unit tests for permission resolution and route guards
- Add router tests for 403 behavior on each groups endpoint
- Add UI tests for:
  - list rendering
  - create/edit/delete flows
  - membership toggles
  - default-permissions save
- Verify that non-admin users cannot reach the groups page

## Decisions to keep the scope tight
- No deny-rules in v1
- No nested groups in v1
- No scoped group memberships in v1 unless we need them immediately
- No replacement of the current `roles` table

## Risks
- If group permissions are made too powerful, they can duplicate `admin.rbac.admin`
- If membership and policy editing are not separated, the page becomes hard to secure
- If the UI is built before the API, the page will look complete but not enforce anything

## Suggested end state
- `/admin/users/groups` is visible to admins with read permission
- user admins can manage membership and group metadata
- RBAC admins can edit permission templates
- feature access remains governed by a single permission engine
