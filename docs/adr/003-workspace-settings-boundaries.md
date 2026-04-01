# ADR 003: Shared Workspace Settings Service and Route Boundaries

## Status
Accepted

## Context
GrowChat now has two settings surfaces:

- `/admin/settings/**` for the admin workspace
- `/account/settings/**` for the user workspace

They should share the same frontend structure and backend workspace-settings logic so the UI stays 1:1, while still keeping policy boundaries explicit.

## Decision
Use a shared workspace-settings service and shared frontend shell components for both route families:

- shared shell, nav, footer, and modal components live in `public/js/shared/`
- shared backend workspace settings shaping lives in `src/services/workspace-settings.js`
- route-specific routers keep policy and auth boundaries explicit
- ACL mutations require the stronger `admin.rbac.admin` permission on the backend

## Consequences
- Admin and account settings stay visually aligned.
- Shared renderers and payload shaping reduce drift and redundant network work.
- Route-level policy remains separate, so ACL and admin-only mutations still have clear boundaries.
- Future settings changes should extend the shared service first, then opt into route-specific policy only where needed.
