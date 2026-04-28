---
version: 1.0
name: GrowChat UI
description: A clean, low-density conversational interface anchored by a content-first philosophy. The UI recedes so the content (chat) can speak. The application utilizes a split-pane layout with a light-gray utility sidebar and a pure-white canvas. Elevation is virtually non-existent; separation is achieved through subtle background tints (pure white vs. off-white) and 1px hairlines. The single interactive accent color is Action Blue, applied strictly to primary actions and focus states. Component geometry relies heavily on the "Pill" (fully rounded) for inputs and actions, and large soft radii (18px+) for structural cards.

colors:
  primary: "#0066cc"
  primary-focus: "#0071e3"
  ink: "#111827"
  body: "#374151"
  muted: "#6b7280"
  muted-light: "#9ca3af"
  hairline: "#f3f4f6"
  hairline-strong: "#e5e7eb"
  canvas: "#ffffff"
  surface-sidebar: "#f9f9f9"
  surface-card: "#ffffff"
  surface-input: "#f4f4f4"
  surface-hover: "#f3f4f6"
  on-primary: "#ffffff"
  on-dark: "#ffffff"
  status-online: "#10b981"
  status-error: "#ef4444"

typography:
  display-lg:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 40px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.374px
  display-md:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -0.2px
  title-lg:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.1px
  title-md:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0
  body-lg:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-md:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-sm:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  caption:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0
  button:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0

rounded:
  none: 0px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 18px
  2xl: 24px
  pill: 9999px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 64px

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: 12px 24px
    activeTransform: "scale(0.95)"
  button-secondary:
    backgroundColor: transparent
    textColor: "{colors.body}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: 8px 16px
    hoverBackground: "{colors.surface-hover}"
  button-icon:
    backgroundColor: transparent
    textColor: "{colors.muted}"
    rounded: "{rounded.full}"
    padding: 8px
    hoverBackground: "{colors.surface-hover}"
  chat-composer:
    backgroundColor: "{colors.surface-input}"
    textColor: "{colors.ink}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.pill}"
    padding: 12px 20px
    border: "1px solid transparent"
    focusBorder: "1px solid {colors.hairline-strong}"
  suggestion-card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.xl}"
    padding: 20px
    border: "1px solid {colors.hairline}"
    hoverBorder: "1px solid {colors.hairline-strong}"
  sidebar-container:
    backgroundColor: "{colors.surface-sidebar}"
    width: 260px
    borderRight: "1px solid {colors.hairline}"
  sidebar-nav-item:
    backgroundColor: transparent
    textColor: "{colors.body}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 8px 12px
    hoverBackground: "{colors.surface-card}"
---

# Design System & UI Guidelines

## Overview

GrowChat's web presence is designed as a masterclass in **low-density conversational interfaces framed by near-invisible UI**. Inheriting philosophies from modern, minimalist tech aesthetics, the interface acts as a quiet canvas where the conversation is the absolute focal point.

Density is unusually low even by contemporary SaaS standards. Decorative chrome—such as heavy drop shadows, gradients, and intricate borders—has been entirely eradicated. Elevation appears only when an element fundamentally breaks the z-index plane (like a modal overlay or a floating drawer), and even then, it relies on dimmed backdrops and frosted-glass `backdrop-filter` blurs rather than CSS box-shadows.

## The Visual Grammar

### 1. The Canvas and The Structure
The application utilizes a split-pane layout to organize information architecture without relying on heavy structural lines:
- **The Sidebar (`{colors.surface-sidebar}`)**: A subtle off-white/light-gray background (`#f9f9f9`) anchors the left side of the screen. This provides a visual nesting area for navigation and history without feeling like a heavy "admin" panel.
- **The Main Canvas (`{colors.canvas}`)**: The primary chat area is pure white (`#ffffff`). The lack of a hard boundary between the chat area and the input zone creates an airy, infinite-scroll feeling.

### 2. The "Action Blue" Principle
There is exactly **one** interactive brand color in the system: **Action Blue (`#0066cc`)**. 
- It is used strictly for primary "click me" signals: the "Send" button in the composer, primary submit buttons in modals, and active toggle switches in settings.
- There are no secondary accent colors. If an element is not a primary action, it must rely on neutral grays and hover-state background changes (`{colors.surface-hover}`) for interactivity.

### 3. Component Geometry: Pills and Cards
The system relies on two distinct shape grammars:
- **The Action Pill (`{rounded.pill}`)**: Any element designed for direct, primary user input must be fully rounded (9999px). This includes the main `chat-composer` input bar, the primary `button-primary` submit buttons, and search inputs. The pill shape visually screams "interactive".
- **The Structural Card (`{rounded.xl}` / 18px)**: Containers that hold data but are not primary inputs (such as the empty-state suggestion cards, or data tables in the admin workspace) use a large, soft radius. They are strictly flat with a 1px hairline border.

### 4. Typography and Cadence
- **Negative letter-spacing on Display**: Headlines (like the "How can I help you today?" hero text) utilize a tight letter-spacing (`-0.374px`) to create a confident, engineered aesthetic.
- **Readable Body**: Chat messages and body text utilize standard tracking and a relaxed line-height (`1.5`) to ensure readability during long reading sessions.

### 5. Micro-interactions
- **Active Scaling**: Primary buttons do not shift colors drastically on press; instead, they utilize an `active:scale-95` transform to provide tactile, physical feedback that the button has been depressed.
- **Focus Rings**: Keyboard accessibility is maintained through clean, 2px solid Focus Blue (`#0071e3`) outlines, avoiding default browser fuzziness.

## Admin Workspace Modifications
While the core chat interface is airy and conversational, the `/admin` and `/account` settings routes transition into a slightly denser, data-management mode:
- **Full-page tables**: Rely on 1px borders and `{rounded.lg}` containment.
- **Pill Badges**: Status indicators (e.g., User Roles, "Online" status) utilize `{rounded.pill}` badges with highly desaturated background tints (e.g., `bg-emerald-50` with `text-emerald-700`) to provide scannable information without dominating the visual hierarchy.
- **Drawers vs. Pages**: Personal settings (`/account`) open as a floating drawer over the chat context (utilizing a dimmed backdrop), while Workspace settings (`/admin`) navigate to a distinct full-page layout, communicating the severity and scope of the administrative actions.
