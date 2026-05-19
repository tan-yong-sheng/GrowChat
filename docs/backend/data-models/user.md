# Data Model: User & Sessions

## Entities

### `users`

The core identity record.

- `id` (UUID, Primary Key)
- `email` (String, Unique)
- `password_hash` (String) — Sentinel `'oauth:no-password'` for Google-only users
- `name` (String)
- `google_id` (String, Nullable, Unique where not null) — Google `sub` ID for OAuth-linked accounts
- `account_status` (Enum: `active`, `pending`) — implicitly tracked via `DESIGN.md` conventions and auth router sanitization.
- `settings` (JSON String)
- `created_at` (Timestamp)
- `updated_at` (Timestamp)
- `last_active_at` (Timestamp)

### `user_roles` (RBAC Join Table)

Maps users to specific authorization roles.

- `id` (UUID, Primary Key)
- `user_id` (Foreign Key -> `users.id`)
- `role_id` (Foreign Key -> `roles.id`)

### `refresh_tokens`

Tracks persistent sessions.

- `token_hash` (String, Primary Key)
- `user_id` (Foreign Key -> `users.id`)
- `expires_at` (Timestamp)

### `password_reset_tokens`

Time-limited tokens for account recovery.

- `id` (UUID, Primary Key)
- `user_id` (Foreign Key -> `users.id`)
- `token_hash` (String, hashed token value)
- `expires_at` (Timestamp, defaults to +1 hour)

## Relationships

- `users` -> `has_many` -> `refresh_tokens`
- `users` -> `has_many` -> `user_roles`
- `users` -> `has_one` -> `password_reset_tokens` (technically many, but usually constrained by TTL).
