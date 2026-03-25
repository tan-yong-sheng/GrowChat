# RBAC Plan

## Direction

Use explicit groups and per-action permissions for admin access.

Recommended defaults:

- public signup defaults to `pending`
- `/admin/settings/general` can switch signup to `active`
- normal users see only a simple approved / waiting experience
- admin users belong to a default admin group
- risky admin actions use explicit per-action permissions
- recovery uses a break-glass path, not a permanent special role

This keeps day-to-day access understandable while preserving recovery if RBAC is misconfigured.

## Product Goals

- Keep onboarding low-friction.
- Keep the default state explicit.
- Avoid exposing normal users to policy complexity.
- Make admin control precise, not ambiguous.
- Reduce accidental privilege creep.
- Preserve tenant separation without forcing enterprise-heavy setup.

## Policy Shape

Use these layers:

- `global default`
- `role default`
- `group override`
- `user override`
- `hard deny for irreversible actions`

Use these permission buckets:

- `view`
- `edit`
- `save`
- `approve`
- `delete`
- `assign`
- `manage`

Sensitive actions must be explicit permissions, not implied by page access.

## First Release Scope

Start with:

- signup approval flow
- admin access control
- user management safety rules
- group-based admin delegation

Defer until later:

- BYOK controls
- model access delegation
- advanced settings inheritance

## Backend Touchpoints

- `src/index.js`
- `src/routers/auth.js`
- `src/routers/users.js`
- `src/routers/admin.js`
- `src/routers/groups.js`
- `src/routers/rbac.js`
- `src/utils/authorize.js`
- `src/routers/user-profile.js`

## Suggested Permission Keys

Suggested admin permissions:

- `admin.user.read`
- `admin.user.write`
- `admin.user.delete`
- `admin.user.approve`
- `admin.group.read`
- `admin.group.write`
- `admin.rbac.admin`
- `admin.rbac.assign`
- `admin.settings.view`
- `admin.settings.edit`
- `admin.settings.general.edit`
- `admin.settings.general.signup_policy.edit`
- `admin.settings.general.default_model.edit`
- `admin.audit.read`

Suggested signup-state rules:

- `pending` means not allowed to log in
- `active` means allowed to log in
- normal users only see waiting / approved
- admin users see the status control

## Recovery Model

Use a break-glass recovery path instead of a permanent special role.

Recommended shape:

- server-side secret or env-controlled recovery route
- only used when normal RBAC access is broken
- can restore default admin group membership or permissions
- must be auditable when used

Why this is better:

- no permanent special account to manage
- no role lifecycle edge cases
- normal access remains group-based
- recovery is still possible after a bad config

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

### `/admin/users/overview` Edit Modal

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

### `/admin/users/groups`

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
│   Admin                                                   │
│   [x] Read users                                          │
│   [x] Write users                                         │
│   [ ] Delete users                                        │
│   [ ] Approve users                                       │
│   [ ] Edit admin settings                                 │
│   [ ] Assign admin permissions                             │
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
│ admin        | [x] user.read           | Recent events...         │
│ manager      | [x] user.write          |                          │
│ support      | [ ] user.delete         |                          │
│ default      | [x] settings.edit       |                          │
└────────────────────────────────────────────────────────────────────┘
```

The RBAC screen should make policy review readable, not expose every raw mechanic everywhere.

## Interaction Rules

- Normal users should never need to understand the permission tree.
- Admins should see the effective status first.
- Destructive actions should require explicit permission.
- Hidden permissions should hide controls instead of leaving broken buttons.
- Pending users should see one simple waiting message.

## Build Order

1. Lock signup approval behavior.
2. Add admin access control for user management.
3. Add default admin group behavior.
4. Add per-action permission checks for delete / approve / edit-sensitive flows.
5. Add RBAC admin UI for auditing and review.

## Open Questions

- What exact recovery route should the break-glass path use?
- Should the default admin group be editable, or only its membership and permissions?
- Should admin settings edits live in the same permission family as user management, or a separate `admin.settings.*` family?
