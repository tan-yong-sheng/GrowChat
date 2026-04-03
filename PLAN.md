# Settings UX Plan

## Goal

Make the settings experience easy for a new admin to learn without giving up the shared backend and shared UI primitives already in place.

The product should feel like two clearly different scopes:

- `My Settings` for personal, low-risk account changes
- `Admin Settings` for workspace-wide management

The important constraint is that the implementation remains shared underneath. The visible experience should be intentionally different so the scopes are easy to understand.

## Decision

Use a route-backed drawer/sheet for `My Settings`, while keeping `Admin Settings` as a full-page workspace management area.

This gives the product two different learning modes:

- `My Settings` feels lightweight and personal
- `Admin Settings` feels explicit and operational

The drawer approach is preferred over a tiny centered popup because it is more usable for longer forms, keyboard users, and mobile layouts.

## Product Principles

1. Keep one shared settings engine underneath.
2. Make the two scopes visually and behaviorally distinct.
3. Show scope explicitly instead of relying on route names alone.
4. Hide ACL from the personal experience unless an explicit access-management capability exists.
5. Use progressive disclosure for advanced admin actions.
6. Prefer read-only states and scoped actions over page-wide confusion.

## Experience Model

### My Settings

This is the personal account surface.

Expected contents:

- Profile
- Security
- Notifications
- Personal connections, if truly user-owned
- Personal integrations, if truly user-owned
- Personal models, if owned at the user scope

Expected behavior:

- Opens as a drawer/sheet over the main app
- Uses the same shared forms and validation as admin, but in a lighter shell
- Shows a `Personal` scope badge
- Uses simple action labels like `Save` and `Cancel`
- Avoids ACL and workspace-wide controls by default

### Admin Settings

This is the workspace management surface.

Expected contents:

- Overview
- Connections
- Models
- Integrations
- Users
- Policies
- Audit, if present

Expected behavior:

- Stays as a full page
- Starts with an overview landing page for new admins
- Uses a `Workspace` or `Admin` scope badge
- Surfaces task cards instead of dropping the user into a deep configuration screen
- Exposes advanced access controls only when the capability exists

## Information Architecture

### Top-Level Navigation

- Home
- My Settings
- Admin Settings
- Users
- Audit or Policies, if applicable

### Admin Settings Navigation

- Overview
- Connections
- Models
- Integrations
- Users
- Policies
- Audit

### My Settings Navigation

- Overview
- Profile
- Security
- Notifications
- Personal Connections
- Personal Integrations
- Personal Models

## Scope and Permission Rules

The UI should be capability-aware, but not permission-noisy.

Use plain labels:

- `View`
- `Manage`
- `Manage access`

Map them to capabilities such as:

- `connection.read`
- `connection.manage`
- `connection.acl.manage`
- `model.read`
- `model.manage`
- `model.acl.manage`
- `integration.read`
- `integration.manage`
- `integration.acl.manage`

Rules:

- Show shared components when possible.
- Hide ACL from `My Settings` unless the user explicitly has access-management permission.
- Keep the backend as the source of truth for capability flags.
- Never rely on client-side checks for security.

## Rollout Order

### Phase 1

- Keep the current shared backend service and shared frontend components.
- Add the route-backed drawer behavior for `My Settings`.
- Keep `Admin Settings` as a page.
- Add scope badges and helper text.

### Phase 2

- Add the `Admin Settings Overview` landing page.
- Move new admin users into the overview first.
- Make task cards explain the impact of each section.

### Phase 3

- Refine the permission matrix wording in the UI.
- Hide advanced controls behind explicit capability checks.
- Review whether any remaining controls should be moved into `Advanced`.

## Success Criteria

The design is successful if a new admin can answer these questions without help:

- What changes only me?
- What changes the workspace?
- Which actions can I manage?
- Which actions are advanced and access-related?

Additional success signals:

- Fewer accidental clicks into the wrong scope
- Less time spent explaining the difference between personal and workspace settings
- Lower maintenance drift because the shared engine is still reused

## Non-Goals

- Do not merge personal and admin settings into one identical surface.
- Do not expose raw permission codes in the normal UI.
- Do not make the entire account area modal-only if it hurts navigation or deep linking.
- Do not add another parallel settings implementation.

## Recommended Next Step

Implement the route-backed drawer for `My Settings` and the admin overview landing page, while keeping the shared settings service and capability matrix intact.

## Implementation Checklist

- [x] Document the UX split between `My Settings` and `Admin Settings`
- [x] Define the shared permission/capability model
- [x] Add a route-backed drawer shell for `My Settings`
- [ ] Simplify the `My Settings` in-drawer navigation if the current tabs still feel too dense
- [ ] Add an `Admin Settings Overview` landing page
- [ ] Review whether any personal settings sections should be hidden or collapsed by default
- [ ] Verify the drawer experience on desktop and mobile with Playwright
- [ ] Confirm the account close behavior is intuitive from a direct deep link
