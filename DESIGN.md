# Access Control UI Design

## Goal

Show access control in a way that is simple for normal users and explicit for admins.

## Navigation Map

```text
/admin
|-- Users
|   |-- /admin/users/overview
|   |   - user list
|   |   - single-role assignment
|   |   - effective access drawer
|   |
|   |-- /admin/users/roles        [new, visible]
|   |   - edit Admin template
|   |   - edit Member template
|   |   - clone to custom role later
|   |
|   `-- /admin/users/policies
|       - visible ACL entry point
|
|-- Settings
|   |-- /admin/settings/general
|   |-- /admin/settings/models
|   |-- /admin/settings/connections
|   `-- /admin/settings/integrations
|
`-- Audit
    `-- /admin/audit              [optional later]
```

## Route Rules

- `/admin/users/roles` is the primary visible role-management page.
- `/admin/settings/roles` and `/admin/settings/policies` are compatibility-only if they exist.
- `/admin/users/policies` is the sole active Users-area ACL entry point and mounts the same ACL component.

## Permission Labels

Use these labels in the UI:

- `admin.*` for platform-wide admin actions
- `chat.read`, `chat.write`, `chat.delete`, `chat.share` for owned chats
- `file.upload`, `file.delete` for owned files
- `model.use` for allowed model access
- `model.admin` for model catalog management

Behavior cues:

- `Read` means the user can open the resource.
- `Write` means the user can modify owned content.
- `Delete` means the user can remove their own resource.
- `Share link` means the chat becomes a public read-only page.
- `Use only` means the resource is accessible but not editable.

## User Pages

### `/admin/users/overview`

```text
+---------------------------------------------------------------+
| Users                                                         |
|---------------------------------------------------------------|
| Role   Name   Email     Status   Last Active   Actions        |
|---------------------------------------------------------------|
| member Bob    b@x.com   pending  never        [Edit]         |
| admin  Alice  a@x.com   active   2m ago      [Edit]         |
+---------------------------------------------------------------+

User drawer:
+---------------------------------------------------------------+
| Role:  [ admin | member ]                                     |
| Status: [ active | pending ]                                  |
|                                                               |
| Effective access                                              |
| - chat.read                                                  |
| - chat.write                                                 |
| - file.upload                                                |
| - admin.user.read                                            |
|                                                               |
| [Open role template]   [Save]                                 |
+---------------------------------------------------------------+
```

### `/admin/users/roles`

```text
+--------------------------------------------------------------------------+
| Roles                                               [Create Role]         |
|                                                                          |
| Admin   [system] [12 perms]  full platform                       [Edit] |
| Member  [system] [4 perms]   base app                            [Edit] |
| Support [custom] [8 perms]   cloned template                     [Edit] |
+--------------------------------------------------------------------------+
| Clicking Edit opens a compact modal                                     |
| - role name for custom roles only                                       |
| - permission search + grouped toggles                                   |
| - last-admin guardrail note                                              |
| - reset / discard / save                                                 |
+--------------------------------------------------------------------------+
```

Notes:
- This page is a role list first, not a full-width matrix.
- Edit happens in a modal so the page stays easy to scan.
- Custom roles can be introduced later by cloning a template.
- Keep the page visually aligned with `/admin/users/policies` density and spacing.
- Borrow the compact row rhythm from `/admin/users/groups` wherever possible.
- The modal can reuse the compact permissions-group treatment from policies.
- Show raw permission keys only in advanced mode.
- Keep warnings visible but not dominant.

### `/admin/users/policies`

```text
+------------------------------------------------------------------+
| Admin / Users / Policies                                         |
|                                                                  |
| Same PoliciesSettings component as the canonical ACL editor     |
| Sole active ACL route                                            |
| Shared store, save, discard, and deep-link behavior             |
+------------------------------------------------------------------+
```

## Admin Pages

### `/admin/settings/general`

```text
+--------------------------------------------------------------+
| Admin / Settings / General                                   |
|--------------------------------------------------------------|
| Public Registration      [ On / Off ]                        |
| Registration Status      [ Pending v ]                       |
| Global Default Model     [ gpt-5-mini v ]                    |
+--------------------------------------------------------------+
```

### `/admin/settings/models`

```text
+--------------------------------------------------------------+
| Admin / Settings / Models                                    |
|--------------------------------------------------------------|
| gpt-5-mini     [Edit] [Policy]                               |
| llama-3.1-8b    [Edit] [Policy]                               |
| ...                                                          |
+--------------------------------------------------------------+
```

### `/admin/settings/connections`

```text
+--------------------------------------------------------------+
| Admin / Settings / Connections                               |
|--------------------------------------------------------------|
| Admin Connection X   [Edit] [Policy]                         |
| Admin Connection Y   [Edit] [Policy]                         |
| ...                                                          |
+--------------------------------------------------------------+
```

### `/admin/settings/integrations`

```text
+--------------------------------------------------------------+
| Admin / Settings / Integrations                              |
|--------------------------------------------------------------|
| Server A       [Edit] [Policy]                               |
| Server B       [Edit] [Policy]                               |
| ...                                                          |
+--------------------------------------------------------------+
```

## Visual Rules

- Keep role management under Users, not Settings, for better discoverability.
- Keep ACL management under Users as the sole active access-control namespace.
- Use one role picker per user.
- Keep groups out of the role editor.
- Show effective access summaries instead of exposing raw joins everywhere.
- Use warnings for last-admin and self-lockout cases.
- Keep `/admin/users/roles` visually aligned with `/admin/users/policies` so admins learn one pattern.
