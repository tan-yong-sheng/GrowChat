<<<<<<< HEAD
# Admin Workspace UI States

This document maps the explicit state machines for elements within the full-page administrative workspace (`/admin`).

## 1. Global Admin Navigation (`#admin-nav`)

**Purpose**: High-level routing within the workspace.

### Valid States:
- `Active_Users`: The "Users" tab is highlighted.
- `Active_Settings`: The "Settings" tab is highlighted.

### State Transitions & Bug Checks:
- **Bug check**: If an Admin is inside `/admin/settings` and their role is revoked in the database by another Admin, does the next client-side navigation or API request catch the 403 and elegantly redirect them to `/`?

## 2. Users Data Table Search (`#user-search`)

**Purpose**: Filters the table of workspace users.

### Valid States:
- `Idle`: Empty input.
- `Typing`: User is actively entering keystrokes.
- `Debouncing`: User paused typing; waiting N milliseconds before firing API.
- `Fetching`: API request in flight. Spinner may be visible in the table.

### State Transitions & Bug Checks:
- `Typing` → `Debouncing` → `Fetching`
  - **Bug check**: Rapidly typing "test" should not fire 4 sequential API requests. It must debounce and fire 1 request for "test".

## 3. Table Pagination (`#table-pagination`)

**Purpose**: Navigates datasets larger than the page limit.

### Valid States:
- `Page_1_No_Prev`: "Prev" button disabled.
- `Page_N`: Both "Prev" and "Next" enabled.
- `Page_Max_No_Next`: "Next" button disabled.

### State Transitions & Bug Checks:
- `Page_N` → `Page_1` (On Search input change).
  - **Bug check**: If a user is on Page 5 of the table, and they enter a search query that only yields 3 total results, the UI *must* reset the pagination state to Page 1. Otherwise, the table will try to render Page 5 of a 1-page dataset, resulting in a broken empty table.
=======
# Admin Workspace UI States

This document maps the explicit state machines for elements within the full-page administrative workspace (`/admin`).

## 1. Global Admin Navigation (`#admin-nav`)

**Purpose**: High-level routing within the workspace.

### Valid States:
- `Active_Users`: The "Users" tab is highlighted.
- `Active_Settings`: The "Settings" tab is highlighted.

### State Transitions & Bug Checks:
- **Bug check**: If an Admin is inside `/admin/settings` and their role is revoked in the database by another Admin, does the next client-side navigation or API request catch the 403 and elegantly redirect them to `/`?

## 2. Users Data Table Search (`#user-search`)

**Purpose**: Filters the table of workspace users.

### Valid States:
- `Idle`: Empty input.
- `Typing`: User is actively entering keystrokes.
- `Debouncing`: User paused typing; waiting N milliseconds before firing API.
- `Fetching`: API request in flight. Spinner may be visible in the table.

### State Transitions & Bug Checks:
- `Typing` → `Debouncing` → `Fetching`
  - **Bug check**: Rapidly typing "test" should not fire 4 sequential API requests. It must debounce and fire 1 request for "test".

## 3. Table Pagination (`#table-pagination`)

**Purpose**: Navigates datasets larger than the page limit.

### Valid States:
- `Page_1_No_Prev`: "Prev" button disabled.
- `Page_N`: Both "Prev" and "Next" enabled.
- `Page_Max_No_Next`: "Next" button disabled.

### State Transitions & Bug Checks:
- `Page_N` → `Page_1` (On Search input change).
  - **Bug check**: If a user is on Page 5 of the table, and they enter a search query that only yields 3 total results, the UI *must* reset the pagination state to Page 1. Otherwise, the table will try to render Page 5 of a 1-page dataset, resulting in a broken empty table.
>>>>>>> feature/short-term-tasks
