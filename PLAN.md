# Access Control Plan

After this plan is finished, I should be able to point out which legacy authz code can be removed or simplified.

## Current Direction

- RBAC is the source of truth for global capabilities.
- Ownership is the source of truth for chat and file access.
- ACL stays for admin-managed shared resources only.
- Public chat sharing is a publish toggle, not user-to-user sharing.
- Deny overrides allow.
- Admin permissions are explicit RBAC permissions, not a hidden super-role.
- `users.role` is legacy-compatible display state; `user_roles` + `roles` + `permissions` are authoritative.
- `account_status` controls approval state; `status` stays for presence.
- `chat.read`, `chat.write`, `chat.delete`, and `chat.share` must be enforced server-side.
- `chat.share` only creates or revokes a public link.
- `file.upload` and `file.delete` are permission-gated plus ownership-gated.
- ACL editing is admin-only in v1.
- No direct user-to-user resource sharing in v1.
- No external policy engine in v1.
- Rate limits are tier/entitlement data, not roles.
- `/admin/users/roles` is the visible role editor entry point.
- `/admin/users/policies` is the visible ACL entry point from the Users area.
- `/admin/users/overview` can show a read-only effective-access inspector.
- Resource pages reuse the same ACL modal instead of duplicating policy logic.
- Groups remain optional and membership-only if they are retained.

## Near-Term Role Model

- Exactly one role per user.
- Roles are capability bundles for stable product responsibilities.
- Start with editable `admin` and `member` templates.
- Add custom roles later only if the template model proves too limited.
- Custom roles should be clones or variants of templates, not group membership aliases.
- Role edits must take effect immediately on the server.
- JWT should carry identity, not permission authority.
- Permission checks should resolve from the database, with revocation-safe behavior.

## Outdated / Superseded

- The previous ACL-first plan is superseded by a hybrid model.
- `ACL is the enforcement layer` is no longer accurate for chats and files.
- `chat.*` being "global permissions only" without ownership checks is outdated.
- `group_permissions` and group default-permission UI are no longer part of the target model.
- The old "users.role as the real auth source" fallback model is temporary compatibility only.
- A separate policy store for `/admin/users/policies` is not wanted.
- User-to-user ACL overrides are not part of v1.
- Multi-role-per-user is not part of the current plan.
- `/admin/settings/roles` is not part of the primary UI surface.
- `/admin/settings/policies` is not part of the primary UI surface.
- If compatibility aliases exist, they should redirect to `/admin/users/roles` and `/admin/users/policies`.
- `demo` as a permanent role is not part of the current plan.

## Core Model

Every authorization decision should answer:

- Who is the actor?
- What action is being requested?
- Which resource is targeted?
- Is the resource owned, published, admin-managed, or shared by ACL?

Recommended decision inputs:

- actor: authenticated user
- action: permission key such as `admin.user.read` or `chat.write`
- resource family: `admin`, `chat`, `file`, `model`, `connection`, `mcp_server`
- resource id: optional, for object-level checks
- ownership: yes/no
- publish state: yes/no
- ACL result: allow/deny/none
- tier: `free`, `member`, `demo`, etc.

If there is an explicit deny, deny.
If the action is global admin capability, require RBAC.
If the action is chat/file access, require RBAC plus ownership or publish state.
If the action targets admin-managed shared resources, require RBAC plus ACL.
If nothing matches, deny.

## Product Model

### Roles

Roles are capability bundles for stable product responsibilities:

- `admin`
- `member`

Recommended meaning:

- `admin` can manage users, roles, audit logs, and platform resources.
- `member` can chat, use models, and upload files.

Do not encode rate limits as roles.
Keep future custom roles as clones or variants of these templates, not as group membership.

### Sharing

- Chats are not shared with other users directly.
- Public chat links are read-only and anonymous.
- Sharing a chat means publishing it, not granting another user access.
- Files stay private to the owner unless a future feature says otherwise.

### ACL Scope

Keep ACL only for admin-managed resource families:

- `model`
- `connection`
- `mcp_server`

If a resource can be user-owned, ownership should still be the primary check.

Groups can remain as optional ACL principals for admin-managed resources, but they should not become a second generic permission system.

## Access Families

- `admin.*` for platform administration and audit tooling
- `chat.*` for conversations and message actions
- `file.*` for uploads, browsing, and deletion
- `model.*` for model catalog and model use
- `connection.*` for provider routing and configuration
- `mcp_server.*` for MCP server usage and administration

## Permission Matrix

| Permission | Scope | Extra Check | Example |
|---|---|---|---|
| `admin.audit.read` | Global | RBAC only | Read platform audit logs |
| `admin.rbac.admin` | Global | RBAC only | Manage roles and permissions |
| `admin.user.read` | Global | RBAC only | List or inspect users |
| `admin.user.write` | Global | RBAC only | Edit user state and roles |
| `chat.read` | Own chat | Ownership, or public share for anonymous view | Open your own chat history |
| `chat.write` | Own chat | Ownership | Send messages to your own chat |
| `chat.delete` | Own chat | Ownership | Delete your own chat thread |
| `chat.share` | Own chat | Ownership | Create or revoke a public share link |
| `file.upload` | Own files | RBAC only at upload time, then file becomes owned | Upload a document to your account |
| `file.delete` | Own file | Ownership | Remove your own uploaded file |
| `model.admin` | Global | RBAC only | Edit model catalog or settings |
| `model.use` | Model access | RBAC plus model ACL or personal-source allow | Use an allowed model in chat |

Examples:

- `chat.read` does not mean every user can read every chat.
- `chat.delete` means a user can delete their own chat if their role allows it.
- `chat.share` only publishes a read-only public page.
- `model.use` can be allowed by role, by ACL, or by personal ownership of the connection behind the model.

## Preset Bundles

Suggested defaults:

- `member`: `chat.read`, `chat.write`, `model.use`, `file.upload`
- `admin`: broad allow bundle across admin and content families

## Resource Rules

- Chats are owned by one user.
- Files are owned by one user.
- Public share links expose read-only chat content.
- `chat.delete` means the user can delete their own chat when ownership and permission both allow it.
- `chat.read` and `chat.write` still require ownership for normal chat resources.
- Models remain admin-managed catalog entries.
- Connections and MCP servers can be user-owned or admin-managed.
- Admin-managed resources can use ACL rules for exceptions.
- Model ACLs do not depend on connection ACLs.
- `manage` is for ownership-level editing of a user-owned resource.
- `admin` is for platform-owned resources, defaults, and ACL editing.
- Only admins delegate resource access in v1.

## Policy Management

`/admin/users/policies` stays the canonical ACL editor for admin-managed resources.

- It is admin-only read/write.
- It groups policies by resource family.
- It should show only the resource families that actually use ACLs.
- `Chat` and `File` should not become ACL editors in v1.
- Resource pages reuse the same ACL modal where applicable.
- `/admin/users/policies` is the only active Users-area ACL route.
- The users route must not create a second policy store.

## Evaluation Rules

- Check explicit denies first.
- Check account status next.
- Check RBAC permissions next.
- Check ownership or publish state for chat/file resources.
- Check ACL rules for admin-managed resources.
- Deny by default.

## UI Impact

Keep the browsing surface on the page.
Use a shared ACL editor modal for rule edits.
The modal is the same one whether it is opened from the policies page or from a resource page.
The roles page is visible under the Users section at `/admin/users/roles`.
`/admin/settings/roles` is not the primary UI surface.

### Pages To Create Or Edit

```text
GrowChat
├── /auth                          (edit)
├── /s/:share_id                   (edit public read-only view)
├── /user/settings/resources       (create/edit)
└── /admin
    ├── /admin/users/overview       (edit)
    ├── /admin/users/roles          (create/edit, visible)
    ├── /admin/users/policies       (edit, visible)
    ├── /admin/settings/general     (edit)
    ├── /admin/settings/models      (edit)
    ├── /admin/settings/connections (edit)
    ├── /admin/settings/mcp-servers (edit)
    └── /admin/groups               (edit, if retained)
```

### `/admin/users/roles`

```text
Admin / Users / Roles
+------------------------------------------------------------------+
| Roles                                              [Create Role]  |
+------------------------------------------------------------------+
| Admin   [system] [12 perms]  full platform               [Edit]  |
| Member  [system] [4 perms]    base app                    [Edit]  |
| Support [custom] [8 perms]    cloned template             [Edit]  |
+------------------------------------------------------------------+
| Clicking Edit opens a compact modal                             |
| - role name for custom roles only                               |
| - permission search + groups                                    |
| - last-admin guardrail note                                     |
| - reset / discard / save                                         |
| - row rhythm should mirror `/admin/users/groups`                |
+------------------------------------------------------------------+
```

### `/admin/users/policies`

```text
Admin / Users / Policies
+------------------------------------------------------------+
| Same PoliciesSettings component as the resource ACL editor |
| Sole active ACL route                                       |
| Shares the same store, save, and discard handlers          |
+------------------------------------------------------------+
```

### `/admin/users/overview`

```text
Users
+------------------------------------------------------------+
| Role   Name   Email     Status   Last Active   Actions     |
+------------------------------------------------------------+
| member Bob    b@x.com   pending  never        [Edit]      |
| admin  Alice  a@x.com   active   2m ago      [Edit]      |
+------------------------------------------------------------+

Access inspector:
+------------------------------------------------------------+
| Effective access only                                      |
| - chat.read via member                                     |
| - chat.write via member                                    |
| - admin.user.read via admin                                |
| - no direct overrides in v1                                |
+------------------------------------------------------------+
```
