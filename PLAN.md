# Access Control Plan

After finish this plan, let me know if there are any legacy codes which haven't yet been removed ...

## Decision

- Roles are presets.
- Groups are membership-only resource teams.
- ACL is the enforcement layer.
- Deny overrides allow globally.
- Admin is a preset bundle that still goes through the engine.
- There is no special admin group in v1.
- `users.status` stays for presence; `account_status` stores approval state.
- No scopes in v1.
- No direct user ACL overrides in v1.
- ACL editing is admin-only in v1.
- `/admin/settings/policies` is the canonical admin-only policy editor.
- `/admin/users/policies` is a route alias and visible entry point to the same editor.
- `/admin/users/policies` keeps disabled resources hidden by default; it is the slimmer policy review surface.
- Do not create a second policy state/store for the users route.
- `/admin/users/overview` can show a read-only ACL inspector from a lock icon on each row.
- The inspector is for effective access only, not editing or saving.
- Resource pages open the same ACL editor modal as the policies page.
- The group modal only manages metadata and members.
- The group modal can deep-link to `/admin/settings/policies` with a group filter.
- The policies page uses top-row family tabs and a separate group filter, not a left sidebar.
- Model ACLs and connection ACLs are independent. Do not require one to exist before the other.
- The user overview lock action must reuse the same ACL evaluator and reason chain.

## Core Model

An access rule answers:

- Who is the principal?
- Allow or deny?
- What resource is targeted?
- What action is allowed?

Recommended shape:

- principal type: `user` or `group`
- principal id: the specific user or group
- effect: `allow` or `deny`
- resource family: `model`, `mcp_server`, `chat`, `file`, `connection`, `admin`
- resource id: optional for one specific resource
- action: `read`, `use`, `manage`, `admin`

If `resource_id` is null, the rule applies to the whole family.
If `resource_id` is set, the rule applies to one resource.
Groups do not store generic permissions.

## Product Model

### Roles

Roles are user-facing presets for stable job functions:

- `admin`
- `member`

Roles expand into ACL rules.
Do not copy role rules into users at write time.

### Groups

Groups are teams of users.

Examples:

- `model-ops` can contain the people allowed to work on a set of models
- `mcp-ops` can contain the people allowed to use a set of MCP servers

Users can belong to multiple groups.
Group membership does not grant access by itself. Access comes from ACL rules that target the group.

### Policy Management

`/admin/settings/policies` is the source of truth for ACL editing.

- It is admin-only read/write.
- It groups policies by resource family.
- It uses a compact resource selector for `Models`, `Connections`, and `MCP Servers` in v1.
- `Chat`, `Files`, and `Admin` are hidden until phase 2.
- Resource pages open the same shared ACL editor modal.
- Groups only manage membership and metadata.
- Group-based editing is done by filtering the policies page to a group.
- `/admin/users/policies` is a convenience route and tab that mounts the same policies component.
- Keep `/admin/settings/policies` working for canonical deep links and warning links.
- Keep `/admin/users/policies` focused on active policy work; disabled rows stay hidden unless the canonical settings route is used.

## Access Families

- `chat.*` for conversations and message actions
- `file.*` for uploads, browsing, and deletion
- `model.*` for model catalog and per-model access
- `mcp_server.*` for MCP server usage and administration
- `connection.*` for provider routing and configuration
- `admin.*` for platform administration and audit tooling

## Preset Bundles

Suggested defaults:

- `member`: `chat.read`, `chat.write`, `model.use`, `file.upload`
- `admin`: broad allow bundle across all families

## Resource Rules

- Models are admin-owned catalog entries only.
- MCP servers and connections can be admin-owned or user-owned.
- Model access should be per individual model only.
- MCP server access should be per individual server only.
- Model ACLs do not depend on connection ACLs. Keep the resource policies separate.
- Chat and file permissions stay global for now, with owner-based delete for self-owned chats/files.
- `account_status = pending` means the user can log in but must see an approval screen.
- `account_status = active` means the user can continue normally.
- Admin actions use the same ACL engine as everyone else.
- Model permissions should use `read`, `use`, `manage`, and `admin`.
- MCP server permissions should use `read`, `use`, `manage`, and `admin`.
- Connection permissions should use `read`, `use`, `manage`, and `admin`.
- `manage` is for ownership-level editing of a user-owned resource.
- `admin` is for platform-owned resources, defaults, and ACL editing.
- Users can own their own connections and MCP servers.
- Users do not own model catalog entries.
- Only admins delegate resource access in v1.
- Group permissions are removed from the product model.

## Evaluation Rules

- Check explicit denies first.
- Then check ownership.
- Then check group allows.
- Then check role preset allows.
- If nothing matches, deny by default.

## UI Impact

Keep the browsing surface on the page.
Use a shared ACL editor modal for rule edits.
The modal is the same one whether it is opened from the policies page or from a resource page.
The policies component is mounted from both `/admin/settings/policies` and `/admin/users/policies`.
The settings route remains canonical for bookmarks, deep links, and warning targets.

### `/admin/settings/policies`

```text
Admin / Settings / Policies
┌──────────────────────────────────────────────────────────────┐
│ Policies                                                     │
├──────────────────────────────────────────────────────────────┤
│ Group [All groups v]  Resources [Models v] Search [_____]   │
│                 [Visibility v]                               │
├──────────────────────────────────────────────────────────────┤
│ model name              [badge]   [Lock]                    │
│ connection name          [badge]   [Lock]                    │
│ ...                                                          │
└──────────────────────────────────────────────────────────────┘
                         │
                         ▼
                ┌──────────────────────┐
                │ ACL Editor           │
                ├──────────────────────┤
                │ Effect    [Allow v]  │
                │ Principal [Group v]  │
                │ Target    [group]    │
                │ Action    [use v]    │
                │ Resource  [This item]│
                │                      │
                │ Existing rules       │
                │ - allow group:ops    │
                │ - deny user:bob      │
                │                      │
                │ [Add Rule] [Save]    │
                └──────────────────────┘
```

Route split:

```text
/admin/settings/policies  ── canonical editor, deep links, warning targets
/admin/users/policies     ── visible navigation alias, same component/store
                              │
                              └── mounts the same PoliciesSettings module
```

### `/admin/settings/general`

```text
Admin / Settings / General
┌──────────────────────────────────────────────────────────────┐
│ General                                                      │
├──────────────────────────────────────────────────────────────┤
│ Public Registration                     [ On  toggle ]       │
│ Registration Status                     [ Pending   v ]      │
│ Global Default Model                   [ gpt-5-mini  v ]     │
└──────────────────────────────────────────────────────────────┘
```

### `/admin/models`

```text
Admin / Settings / Models
┌──────────────────────────────────────────────────────────────┐
│ Models                                   [ Add Model ]       │
├──────────────────────────────────────────────────────────────┤
│ gpt-5-mini        Enabled   [Edit] [Policy]                  │
│ llama-3.1-8b      Enabled   [Edit] [Policy]                  │
└──────────────────────────────────────────────────────────────┘
```

### `/admin/mcp-servers`

```text
Admin / Settings / MCP Servers
┌──────────────────────────────────────────────────────────────┐
│ MCP Servers                              [ Add Server ]      │
├──────────────────────────────────────────────────────────────┤
│ Server A          Enabled   [Edit] [Policy]                  │
│ Server B          Disabled  [Edit] [Policy]                  │
└──────────────────────────────────────────────────────────────┘
```

Phase 1 shows MCP servers in the central policies page and on the resource page with the same editor.
Normal users only see effective access labels.
Admins can optionally see the reason chain in a compact detail view.

### `/admin/settings/connections`

```text
Admin / Settings / Connections
┌──────────────────────────────────────────────────────────────┐
│ Connections                              [ Add Connection ]  │
├──────────────────────────────────────────────────────────────┤
│ Admin Connection X   Enabled   [Edit] [Policy]               │
│ User Connection Y    Enabled   [Edit] [Policy]               │
└──────────────────────────────────────────────────────────────┘
```

Use the same shared ACL modal for connection rules.

### `/user/settings/resources`

```text
User / Settings / Resources
┌──────────────────────────────────────────────────────────────┐
│ My Resources                                                 │
├──────────────────────────────────────────────────────────────┤
│ My MCP Servers         [Manage] [Use]                       │
│ My Connections         [Manage] [Use]                       │
│                                                              │
│ Accessible Resources                                         │
├──────────────────────────────────────────────────────────────┤
│ Shared MCP Server A    [Use only]  [Shared] [MCP]           │
│ Shared Connection B    [Use only]  [Shared] [Connection]    │
│ Admin MCP Server X     [Read only] [Admin]  [MCP]           │
│ Admin Connection Y     [Read only] [Admin]  [Connection]    │
└──────────────────────────────────────────────────────────────┘
```

Visible by default, read-only for accessible items you do not own, with clear badges.

### `/admin/groups`

```text
Admin / Groups / Edit Group
┌──────────────────────────────────────────────────────────────┐
│ General | Members                                            │
├──────────────────────────────────────────────────────────────┤
│ Group members                                               │
│ + Add member                                                │
│                                                             │
│ alice@example.com                                           │
│ bob@example.com                                             │
└──────────────────────────────────────────────────────────────┘
```

### `/admin/users`

```text
Users
┌──────────────────────────────────────────────────────────────┐
│ Role   Name   Email     Status   Last Active   Actions      │
├──────────────────────────────────────────────────────────────┤
│ user   Bob    b@x.com   pending  never        [Edit]       │
│ admin  Alice   a@x.com   active   2m ago      [Edit]       │
└──────────────────────────────────────────────────────────────┘

┌────────────────────── Edit User ────────────────────────────┐
│ General | Groups | Access                                   │
│ Access                                                      │
│ Effective access only                                        │
│ - model.use via member                                       │
│ - admin.user.read via admin                                 │
│ - no direct overrides in v1                                 │
└──────────────────────────────────────────────────────────────┘
```

## Migration Plan

### Phase 1

- Keep the current auth flow stable.
- Keep `account_status` as the approval state.
- Add `/admin/settings/policies` and point it at the existing ACL tables.
- Add `/admin/users/policies` as a route alias that mounts the same ACL editor.
- Keep the shared ACL editor modal in the model, connection, and MCP resource pages.
- Keep chat and files as global permissions.
- Keep groups as membership-only resource teams.
- Keep self-owned chat/file delete as owner checks, not moderation workflow.

### Phase 2

- Remove the old `Workspace / Sharing / Admin` group permission sections.
- Remove the `group_permissions` data path from the group modal and routes.
- Migrate any legacy group permission entries into role presets or resource ACL rows if they are still needed.
- Remove any leftover group default-permissions config after the migration is complete.

### Migration Notes

- The central policies page is a UI layer over the existing ACL tables.
- No new database table is required just to add the central page.
- Do not duplicate ACL state between `/admin/settings/policies` and `/admin/users/policies`.
- Keep `model_acl_rules`, `connection_acl_rules`, and `tool_server_acl_rules` as the source of truth for resource ACLs.
- If a model is backed by a connection, do not add a hidden ACL prerequisite between those resources.
- If chat/files/admin ever need their own persisted rule tables, add them later as a separate migration.
- Show MCP server effective access in read-only mode.
- Keep user ACL overrides out of v1.
- Users can create personal MCP servers and connections.
- Models stay admin-owned only.
- User settings show a single Accessible section with shared/admin badges for non-owned items.
- Add `/admin/settings/connections` in v1 using the same ACL engine as models and MCP servers.

### Phase 3

- Move model access out of `group_model_access`.
- Remove the old scope-based group permission path.
- Wire the ACL engine into admin pages.
- Enable MCP server ACL editing.
- Keep connections on the same ACL model and remove any stale separate access path if one remains.

### Phase 4

- Add audit logs for ACL changes.
- Add effective-access views for admins.

## Implementation Order

1. Rewrite authorization around ACL tables and deny precedence.
2. Keep roles as presets and groups as teams.
3. Implement model ACL UI and backend rules.
4. Add connection admin UI and ACL rules.
5. Add MCP server effective-access preview UI.
6. Implement MCP server ACL UI and backend rules.
7. Remove `group_model_access` after migration.
8. Add policy audit and effective-access review screens.

## Open Questions

- Should the ACL editor be a modal or a right-side drawer?
- Should `manage` be enough for MCP servers, or do you want a separate `admin` action later?
