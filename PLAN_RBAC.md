# RBAC Plan

## Decision

- `admin` is a separate role with full access.
- Groups are delegated permission bundles for non-admin staff.
- A normal user can receive some admin-like controls through groups without becoming an admin.
- There is no authorization-bearing default admin group.
- If we want a human-friendly admin label, it can exist for reporting only, but it must not be checked in authorization.

## Core Model

- Role answers: "what trust tier is this account?"
- Group answers: "which capability bundles apply?"
- A user can belong to multiple groups.
- Effective permissions are the union of the user's role permissions and all group permissions.
- Permission answers: "what action is allowed?"
- Scope answers: "where is it allowed?"

The ceiling is important:

- `admin` role = wildcard access
- groups = explicit curated permissions only
- admin-only permissions are never assignable through groups
- groups only add permissions; they never subtract permissions

## Access Domains

Use "access domains" or "permission families" instead of loose "access types". That keeps the model readable and easier to extend.

### User-facing domains

- `chat.*` for chat access and lifecycle
- `model.use` for model invocation
- `file.*` for uploads and file cleanup

### Staff/admin domains

- `admin.user.*` for user/account operations
- `admin.group.*` for group management
- `admin.settings.*` for platform settings
- `admin.audit.*` for audit visibility
- `admin.rbac.*` for role, permission, and policy management

### Reserved domains

- `admin.secrets.*` for secret/config work if we add it later

## Recommended Permission Keys

### Base product permissions

- `chat.read`
- `chat.write`
- `chat.delete`
- `chat.share`
- `model.use`
- `model.admin`
- `file.upload`
- `file.delete`

### Delegated staff permissions

- `admin.user.read`
- `admin.user.write`
- `admin.user.approve`
- `admin.user.deactivate`
- `admin.user.reactivate`
- `admin.group.read`
- `admin.group.write`
- `admin.group.members.manage`
- `admin.settings.general.read`
- `admin.settings.general.edit`
- `admin.settings.models.read`
- `admin.settings.models.edit`
- `admin.settings.integrations.read`
- `admin.audit.read`

### Admin-only permissions

- `admin.rbac.admin`
- `admin.settings.integrations.edit`
- `admin.secrets.edit`
- `admin.user.delete`
- `admin.group.delete`

## Default Bundles

### Onboarding stack

These are the recommended default bundles for non-admin users.

- `starter`: `chat.read`, `chat.write`, `model.use`
- `member`: `starter` plus `chat.share`, `file.upload`
- `creator`: `member` plus `chat.delete`, `file.delete`

### Staff bundles

- `support`: `member` plus `admin.user.read`, `admin.user.approve`, `admin.audit.read`
- `moderator`: `member` plus `chat.delete`, `file.delete`
- `model_operator`: `model.use`, `model.admin`, `admin.settings.models.read`, `admin.settings.models.edit`
- `settings_operator`: `admin.settings.general.read`, `admin.settings.general.edit`
- `security_reader`: `admin.audit.read`, `admin.user.read`

### Assignment rules

- New public signups should start with `starter`.
- Approved regular users should move to `member`.
- Trusted power users can be granted `creator`.
- Staff bundles are additive and can be combined as needed.
- No onboarding bundle should include `admin.*`, `admin.rbac.admin`, or `admin.secrets.edit`.

### Admin role

- `admin` is not a group.
- `admin` gets all permissions directly.
- The first admin should be provisioned with the `admin` role, not by putting them in a special group.
- A user with multiple non-admin groups is still not an admin unless the `admin` role is assigned.

## Why No Default Admin Group

If the admin group can be granted everything, it becomes a second admin role in practice.
That makes the boundary fuzzy and creates privilege creep.

Better design:

- `admin` role = full access, simple and explicit
- groups = partial delegated access only and additive
- the group editor should hide admin-only permissions entirely

## Scope Rules

Current schema already supports scoped roles through `user_roles`, but group permissions are global today.

Plan for now:

- keep group bundles narrow
- do not rely on groups for sensitive global powers
- if we need scoped delegation later, add scope-aware grants instead of widening the group editor
- avoid deny-groups and exclusion rules in the first version

Recommended scope labels:

- `self`
- `assigned`
- `group`
- `all`

## Policy Shape

Use these layers:

- `global default`
- `role default`
- `group bundle`
- `user override`
- `hard deny for irreversible actions`

Hard deny means some actions should require extra logic even if a user is broadly privileged.

Examples:

- removing the last admin
- rotating or exposing secrets
- deleting audit history

## Product Goals

- Keep onboarding low-friction.
- Keep the default state explicit.
- Avoid exposing normal users to policy complexity.
- Make delegated admin control precise, not ambiguous.
- Reduce accidental privilege creep.
- Keep admin access understandable and auditable.

## Backend Touchpoints

- `src/utils/authorize.js`
- `src/routers/admin.js`
- `src/routers/groups.js`
- `src/routers/rbac.js`
- `src/routers/users.js`
- `src/routers/models.js`
- `src/routers/chat.js`
- `src/routers/files.js`
- `src/index.js`

## Migration Plan

### Phase 1

- Keep existing schema shape.
- Introduce the new permission taxonomy.
- Map existing checks to the new names where needed.
- Add seed bundles for the default groups.

### Phase 2

- Split broad permissions that are doing too much.
- Move platform settings out of `admin.user.write`.
- Separate user management from configuration management.

### Phase 3

- Add UI for group templates and effective permissions.
- Add audit visibility for RBAC changes.

### Phase 4

- Add scoped delegation only where we actually need it.
- Do not add scope complexity before we need it.

## UI Plan

The UI should show outcomes first, not policy mechanics.

### `/admin/settings/general`

```text
Admin / Settings / General
┌──────────────────────────────────────────────────────────────┐
│ General                                                      │
├──────────────────────────────────────────────────────────────┤
│ Public Registration                     [ On  toggle ]       │
│ Registration Status                     [ Pending      v ]   │
│   New public signups start as Pending by default.            │
│   Active = can log in immediately                            │
│   Pending = must be approved by an admin                    │
│                                                              │
│ Default Model                           [ Select model  v ]  │
└──────────────────────────────────────────────────────────────┘
```

### `/admin/users/overview`

```text
Users
┌────────────────────────────────────────────────────────────────────────┐
│ Role   Name        Email            Status      Last Active   Actions   │
├────────────────────────────────────────────────────────────────────────┤
│ admin  Alice       a@x.com          active      2m ago       [Edit]    │
│ user   Bob         b@x.com          pending     never        [Edit]    │
│ user   Carol       c@x.com          active      1h ago       [Edit]    │
└────────────────────────────────────────────────────────────────────────┘
```

### `/admin/users/overview` edit modal

```text
┌──────────────────────── Edit User ─────────────────────────┐
│ Role              [ User / Admin / Pending      v ]        │
│ Status            [ Active / Pending            v ]        │
│ Name              [............................]           │
│ Email             [............................]           │
│                                                            │
│ [ General ] [ Permissions ] [ Groups ]                     │
│                                                            │
│ Permissions                                                │
│   [ ] Approve users                                         │
│   [ ] Delete users                                          │
│   [ ] Manage groups                                         │
│   [ ] Edit settings                                         │
│                                                            │
│                                         [ Cancel ] [Save]   │
└────────────────────────────────────────────────────────────┘
```

### `/admin/groups`

```text
┌──────────────────────── Edit Group ────────────────────────┐
│ General | Permissions | Members | Limits                  │
│                                                           │
│ Permissions                                               │
│   Workspace                                               │
│   [x] Chat access                                         │
│   [x] Model use                                           │
│   [ ] Delete chats                                        │
│                                                           │
│   Staff                                                   │
│   [x] Read users                                          │
│   [x] Approve users                                       │
│   [ ] Delete users                                        │
│   [ ] Edit RBAC                                           │
│   [ ] Manage secrets                                      │
│                                                           │
│                                         [ Cancel ] [Save]  │
└───────────────────────────────────────────────────────────┘
```

### `/admin/rbac`

```text
Admin / RBAC
┌────────────────────────────────────────────────────────────────────┐
│ Roles        | Permissions             | Audit                    │
├────────────────────────────────────────────────────────────────────┤
│ admin        | [x] all                  | Recent events...         │
│ manager      | [x] user.read            |                          │
│ support      | [x] user.approve         |                          │
│ member       | [x] chat.write           |                          │
└────────────────────────────────────────────────────────────────────┘
```

The RBAC screen should make policy review readable, not expose every raw mechanic everywhere.

## Interaction Rules

- Normal users should never need to understand the permission tree.
- Admins should see effective access first.
- Destructive actions should require explicit permission.
- Hidden permissions should hide controls instead of leaving broken buttons.
- Pending users should see one simple waiting message.
- Partial staff access should always feel narrower than admin access.

## Build Order

1. Lock the permission taxonomy and decide the reserved admin-only keys.
2. Update authorization to treat `admin` as wildcard access.
3. Split broad settings permissions out of `admin.user.write`.
4. Seed default user groups and their bundles.
5. Add RBAC admin UI for auditing and review.
6. Add tests for "group can be powerful but not admin".

## Open Questions

- Do we want `settings_operator` to be able to edit general settings only, or also model defaults?
- Should `admin.audit.read` be available to `security_reader` and `support`, or only to admin?
- Do we want scoped group grants later, or is a narrow global bundle enough for v1?
