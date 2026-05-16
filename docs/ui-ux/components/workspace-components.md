# Shared Workspace Components

## Used In
- `/admin/users/overview`
- `/admin/settings/connections`
- (Potentially future workspace management pages)

## Component Variants

### 1. `data-table`
- **Purpose**: Displays tabular data with sorting and pagination.
- **Visuals**: 1px `{colors.hairline}` border, `{rounded.lg}` (18px) corners. ZERO drop shadow.
- **Dependencies**:
  - Requires pagination controls.
  - Requires empty state graphic/text if 0 rows.

### 2. `status-badge`
- **Purpose**: Visually identifies roles (`ADMIN`, `MEMBER`) or states (`ACTIVE`).
- **Visuals**: `{rounded.pill}`, utilizing strict background tints aligned with the `DESIGN.md` color guidelines.

### 3. `workspace-subnav`
- **Purpose**: The left-hand menu that appears *only* within the Admin scope.
- **Visuals**: Clean text list. Active state indicated by `{colors.primary}` (Action Blue) text and a subtle background tint or left-border highlight.
