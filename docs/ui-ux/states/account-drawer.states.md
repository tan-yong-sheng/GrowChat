# Account Settings Drawer UI States

This document maps the state machines for the personal settings drawer overlay (`/account`).

## 1. Drawer Overlay (`#account-drawer`)

**Purpose**: Hosts personal configuration without breaking context.

### Valid States:
- `Closed`: Unmounted or translated off-screen.
- `Animating_In`: Sliding into view.
- `Open`: Fully visible, focus trapped inside.
- `Animating_Out`: Sliding out of view.

### State Transitions & Bug Checks:
- `Closed` → `Open` (Triggered via click or direct URL routing to `/account/...`)
- `Open` → `Closed` (Triggered via `Esc`, click on backdrop, or browser Back button).
  - **Bug check**: If opened via clicking the profile icon (pushing state), does hitting the browser "Back" button close the drawer without reloading the whole page?

## 2. Setting Toggle Switch (`.setting-toggle`)

**Purpose**: Instantly enables/disables a personal configuration (e.g., an LLM provider).

### Valid States:
- `Off`: Switch is gray/inactive.
- `On`: Switch is active color (`Action Blue`).
- `Saving`: (Optimistic UI) Switch visually moves, but a background request is firing.

### State Transitions & Bug Checks:
- `Off` → `On` (User clicks) -> API request fires in background.
- `Saving` → `Off` (If API fails, e.g., 500 error).
  - **Bug check**: This is a critical optimistic UI check. If the API fails to save the toggle state, the switch *must* snap back to its previous state and a red error toast must appear. Silent failures leave the user thinking a setting is saved when it isn't.
