# Shared Workspace Components

## Used In
<<<<<<< HEAD

=======
>>>>>>> feature/short-term-tasks
- `/admin/users/overview`
- `/admin/settings/connections`
- (Potentially future workspace management pages)

## Component Variants

<<<<<<< HEAD
### 1. `button`

- **Purpose**: Canonical pill button primitive for workspace/admin actions.
- **Visuals**: `{rounded.pill}` with explicit primary/secondary/ghost variants and consistent disabled/focus-visible behavior.
- **Implementation**: Shared helper in `public/js/shared/components/button.js`.

### 2. `data-table`

=======
### 1. `data-table`
>>>>>>> feature/short-term-tasks
- **Purpose**: Displays tabular data with sorting and pagination.
- **Visuals**: 1px `{colors.hairline}` border, `{rounded.lg}` (18px) corners. ZERO drop shadow.
- **Dependencies**:
  - Requires pagination controls.
  - Requires empty state graphic/text if 0 rows.

<<<<<<< HEAD
### 3. `status-badge`

- **Purpose**: Visually identifies roles (`ADMIN`, `MEMBER`) or states (`ACTIVE`).
- **Visuals**: `{rounded.pill}`, utilizing strict background tints aligned with the `DESIGN.md` color guidelines.

### 4. `workspace-subnav`

- **Purpose**: The left-hand menu that appears _only_ within the Admin scope.
=======
### 2. `status-badge`
- **Purpose**: Visually identifies roles (`ADMIN`, `MEMBER`) or states (`ACTIVE`).
- **Visuals**: `{rounded.pill}`, utilizing strict background tints aligned with the `DESIGN.md` color guidelines.

### 3. `workspace-subnav`
- **Purpose**: The left-hand menu that appears *only* within the Admin scope.
>>>>>>> feature/short-term-tasks
- **Visuals**: Clean text list. Active state indicated by `{colors.primary}` (Action Blue) text and a subtle background tint or left-border highlight.
