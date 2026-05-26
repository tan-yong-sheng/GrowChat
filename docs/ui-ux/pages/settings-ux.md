# Settings UX Design

## Summary

This document describes the behavioral UX design for GrowChat's settings surfaces. One shared settings engine underneath, two different user experiences:

- **My Settings** becomes a route-backed drawer/sheet
- **Admin Settings** stays a full-page workspace management area

The goal is to make the scope obvious to a new admin user.

For visual identity (colors, typography, spacing, shapes), see [DESIGN.md](../../../DESIGN.md).

## Route Map

```text
/account
  /settings -> opens as a drawer/sheet over the main app -> personal scope
/admin
  /settings -> full-page workspace management -> admin scope
```

## Page and Surface Map

```text
MAIN APP
|
+-- My Settings (drawer/sheet)
|   +-- Overview
|   +-- Profile
|   +-- Security
|   +-- Notifications
|   +-- Personal Connections
|   +-- Personal Integrations
|   +-- Personal Models
|
+-- Admin Settings (full page)
    +-- Overview
    +-- Connections
    +-- Models
    +-- Integrations
    +-- Users
    +-- Policies
    +-- Audit
```

## Navigation Structure

```text
Top-Level Nav
  - Home
  - My Settings
  - Admin Settings
  - Users
  - Audit / Policies

My Settings Nav
  - Overview
  - Profile
  - Security
  - Notifications
  - Personal Connections
  - Personal Integrations
  - Personal Models

Admin Settings Nav
  - Overview
  - Connections
  - Models
  - Integrations
  - Users
  - Policies
  - Audit
```

## Layout Diagram

### My Settings Drawer

```text
--------------------------------------------------
app behind                        |              |
                                  |  dimmed      |
                                  |  backdrop    |
                                  |              |
                                  |  ----------  |
                                  |  | Header |  |
                                  |  |        |  |
                                  |  |Personal|  |
                                  |  |------  |  |
                                  |  |Overview|  |
                                  |  |Profile |  |
                                  |  |Security|  |
                                  |  |  ...   |  |
                                  |  |------  |  |
                                  |  |Save/   |  |
                                  |  |Cancel  |  |
                                  |  ----------  |
--------------------------------------------------
```

### Admin Settings Page

```text
--------------------------------------------------------------
|  Top nav                                                    |
|------------------------------------------------------------|
|  Admin overview or section nav                             |
|------------------------------------------------------------|
|  Main workspace content                                    |
|                                                            |
|  task cards, tables, forms, and shared settings sections   |
|                                                            |
|------------------------------------------------------------|
|  Sticky save footer                                        |
--------------------------------------------------------------
```

## Shared Components

These should remain shared underneath both surfaces:

- settings shell
- settings top nav
- settings subnav
- shared action footer
- modal and drawer form primitives
- workspace capability resolver
- backend workspace settings service

## Components To Create Or Modify

### Create

- `My Settings` drawer/sheet host
- `Admin Settings Overview` landing page
- scope badge component, if not already present
- drawer route state helper

### Modify

- `public/js/features/account/account.js` — render `My Settings` as a drawer-backed surface
- `public/js/features/admin/admin.js` — keep `Admin Settings` as a page
- shared settings shell components — reuse the same form and save logic in both places
- permission/capability helpers — keep the UI aware of `read`, `manage`, and `manage access`

## Visual Rules

### My Settings

- lighter density
- personal language
- shorter helper copy
- default to fewer actions
- no ACL controls unless explicitly allowed

### Admin Settings

- denser and more operational
- workspace language
- clear impact statements
- task-oriented overview first
- advanced access controls visible only by capability

## Interaction Rules

### Drawer Behavior

- Open with a route change
- Close with browser back or explicit close button
- Preserve refresh state
- Trap focus inside the drawer
- Restore focus to the opener on close

### Save Behavior

- Save should not force a full page reload
- Use optimistic updates when safe
- Keep the drawer open after save unless the user exits

### Mobile Behavior

- Drawer becomes a full-screen sheet on small screens
- Header and primary actions stay sticky
- Use single-column layouts

## Decision Tree

```text
User opens settings
|
+-- Personal account change?
|   +-- Yes -> My Settings drawer
|   +-- No -> Admin Settings page
|       +-- Needs workspace-wide impact?
|           +-- Yes -> Admin Settings page
|           +-- No -> My Settings drawer
```

## Learning Model

The user should understand the app through scope:

- `Personal` means only my account
- `Workspace` means shared settings
- `Admin` means elevated operational control

That scope should be visible in the page chrome, not hidden in route names.

## Maintenance Goal

The code should remain shared underneath, but the UX should not feel duplicated. That means:

- one backend service
- one capability matrix
- one shared component set
- two intentionally different surface patterns
