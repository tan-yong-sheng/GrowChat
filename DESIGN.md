# Access Control UI Design

## Goal

Show access control in a way that is simple for normal users and explicit for admins.

## Page Map

```text
GrowChat
├── /auth
│   └── Approval screen for pending accounts
├── /user/settings/resources
│   ├── My resources
│   └── Accessible resources (shared + platform, with badges)
└── /admin
    ├── /admin/settings/general
    ├── /admin/settings/policies
    ├── /admin/settings/models
    ├── /admin/settings/mcp-servers
    ├── /admin/settings/connections
    ├── /admin/users/overview
    │   └── /admin/users/policies
    └── /admin/groups
```

## Route Split

```text
Policies UI
├── /admin/settings/policies
│   ├── canonical route
│   ├── deep-link target
│   └── warning links point here
└── /admin/users/policies
    ├── visible entry point in the Users area
    ├── mounts the same PoliciesSettings component
    └── shares the same store, save, and discard handlers
```

## Add

```text
Add
├── /admin/settings/policies
├── /admin/users/policies
├── Read-only ACL inspector from user rows
├── Shared ACL editor modal
├── Policy entry points on models / connections / MCP servers
├── Group filter on policies page
├── Manage Policies shortcut from group modal
└── Members-only group modal
```

## Remove / Deprecate

```text
Remove / Deprecate
├── Group ACL tab
├── Group default-permissions modal
├── Any group config default for sharing
└── Any UI that stores generic permissions on groups
```

## User Pages

### `/auth`

Pending users can log in, but they see an approval screen instead of the main app.

```text
┌──────────────────────────────────────────────────────────────┐
│ GrowChat                                                     │
├──────────────────────────────────────────────────────────────┤
│ Your account is pending approval.                            │
│                                                              │
│ Status: Pending                                              │
│                                                              │
│ [Back to Sign In]                                            │
└──────────────────────────────────────────────────────────────┘
```

### `/user/settings/resources`

This page shows what the user owns, what they can access, and what is platform-owned.

```text
┌──────────────────────────────────────────────────────────────┐
│ User / Settings / Resources                                  │
├──────────────────────────────────────────────────────────────┤
│ My Resources                                                 │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ My MCP Servers      [Manage] [Use]                       │  │
│ │ My Connections      [Manage] [Use]                       │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                              │
│ Accessible Resources                                          │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ Shared MCP Server A [Use only]  [Shared] [MCP]          │  │
│ │ Shared Connection B  [Use only]  [Shared] [Connection]   │  │
│ │ Admin MCP Server X   [Read only] [Admin]  [MCP]         │  │
│ │ Admin Connection Y   [Read only] [Admin]  [Connection]  │  │
│ └──────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

Behavior:
- users can create and manage their own MCP servers and connections
- accessible resources are visible read only unless the user has a use right
- badges show whether an accessible resource is shared or platform-owned
- no ACL editor is shown here

## Admin Pages

### `/admin/settings/general`

```text
┌──────────────────────────────────────────────────────────────┐
│ Admin / Settings / General                                   │
├──────────────────────────────────────────────────────────────┤
│ Public Registration      [ On / Off ]                        │
│ Registration Status      [ Pending v ]                       │
│ Global Default Model     [ gpt-5-mini v ]                    │
└──────────────────────────────────────────────────────────────┘
```

### `/admin/settings/policies`

```text
┌──────────────────────────────────────────────────────────────┐
│ Admin / Settings / Policies                                  │
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

Notes:
- admins edit policies here
- resource pages open the same editor
- policy data stays in the existing resource ACL tables
- the group filter scopes the list to rules targeted at one group
- v1 only shows `Models`, `Connections`, and `MCP Servers`
- the compact resource selector is the primary family switcher
- this is the canonical policies URL, even when the same component is mounted under `/admin/users/policies`

### `/admin/users/policies`

```text
┌──────────────────────────────────────────────────────────────┐
│ Admin / Users / Policies                                     │
├──────────────────────────────────────────────────────────────┤
│ Same PoliciesSettings component as /admin/settings/policies  │
│ Same group filter, same resource selector, same ACL modal    │
│ Disabled resources hidden by default                          │
│ Visible navigation entry for admins who think in user/group  │
└──────────────────────────────────────────────────────────────┘
```

### `/admin/settings/models`

```text
┌──────────────────────────────────────────────────────────────┐
│ Admin / Settings / Models                                    │
├──────────────────────────────────────────────────────────────┤
│ gpt-5-mini     [Edit] [Policy]                               │
│ llama-3.1-8b    [Edit] [Policy]                               │
│ ...                                                          │
└──────────────────────────────────────────────────────────────┘
```

### `/admin/settings/mcp-servers`

```text
┌──────────────────────────────────────────────────────────────┐
│ Admin / Settings / MCP Servers                               │
├──────────────────────────────────────────────────────────────┤
│ Server A       [Edit] [Policy]                               │
│ Server B       [Edit] [Policy]                               │
│ ...                                                          │
└──────────────────────────────────────────────────────────────┘
```

### `/admin/settings/connections`

```text
┌──────────────────────────────────────────────────────────────┐
│ Admin / Settings / Connections                               │
├──────────────────────────────────────────────────────────────┤
│ Admin Connection X   [Edit] [Policy]                         │
│ Admin Connection Y   [Edit] [Policy]                         │
│ ...                                                          │
└──────────────────────────────────────────────────────────────┘
```

### `/admin/users/overview`

```text
┌──────────────────────────────────────────────────────────────┐
│ Admin / Users / Overview                                     │
├──────────────────────────────────────────────────────────────┤
│ Role   Name   Email     Status   Last Active   Actions       │
│ user   Bob    b@x.com   pending  never        [Lock] [Edit] │
│ admin  Alice   a@x.com   active   2m ago      [Lock] [Edit] │
└──────────────────────────────────────────────────────────────┘

Edit modal:
┌──────────────────────────────────────────────────────────────┐
│ Edit User                                                    │
├──────────────────────────────────────────────────────────────┤
│ General | Groups | Access                                    │
│                                                              │
│ Effective access only                                        │
│ - model.use via member                                       │
│ - admin.user.read via admin                                  │
│ - no direct overrides in v1                                  │
└──────────────────────────────────────────────────────────────┘

Inspect modal:
┌──────────────────────────────────────────────────────────────┐
│ ACL Inspector                                                │
├──────────────────────────────────────────────────────────────┤
│ Effective access only                                        │
│ - model.use via member                                       │
│ - mcp_server.use via group                                   │
│ - denied by explicit deny                                    │
│                                                              │
│ Reason chain                                                │
│ - user grant / group grant / admin-owned / blocked / denied │
└──────────────────────────────────────────────────────────────┘
```

### `/admin/groups`

```text
┌──────────────────────────────────────────────────────────────┐
│ Admin / Groups                                               │
├──────────────────────────────────────────────────────────────┤
│ model-ops   [Edit]                                           │
│ mcp-ops     [Edit]                                           │
│ ...                                                          │
└──────────────────────────────────────────────────────────────┘

Edit modal:
┌──────────────────────────────────────────────────────────────┐
│ Edit Group                                                   │
├──────────────────────────────────────────────────────────────┤
│ General | Members                                            │
│                                                              │
│ Members                                                      │
│ + Add member                                                 │
│                                                              │
│ alice@example.com                                            │
│ bob@example.com                                              │
│                                                              │
│ [Manage Policies] -> /admin/settings/policies?group=...      │
└──────────────────────────────────────────────────────────────┘
```

## Design Rules

- Use pages for browsing and modals for rule edits.
- Keep ownership visible with `My`, `Shared`, and `Admin` labels.
- Keep ACL editing admin-only in v1.
- Keep user-owned resources separate from admin-owned resources.
- Keep model policies and connection policies separate; do not imply one is required before the other.
- Do not show scopes in the UI.
- Show effective access by default, not raw policy internals.
- Do not show a permissions section in the group modal.
- Keep the group modal as a shortcut into the central policies page, not a second policy editor.
- The canonical policies route is `/admin/settings/policies`; `/admin/users/policies` is a visible alias only.
- Keep the user lock inspector read-only.
