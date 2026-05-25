---
version: alpha
name: GrowChat
description: Self-hosted multi-user Cloudflare Workers chat application with monochrome architectural minimalism.

colors:
  primary: '#171717'
  primary-hover: '#262626'
  secondary: '#737373'
  tertiary: '#525252'
  neutral: '#fafafa'
  surface: '#ffffff'
  surface-container: '#f5f5f5'
  on-surface: '#171717'
  on-surface-variant: '#525252'
  outline: '#e5e5e5'
  outline-variant: '#f3f4f6'
  error: '#dc2626'
  success: '#16a34a'
  warning: '#ea580c'
  info: '#0284c7'

typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.4
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.4
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.3
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1.2
  label-xs:
    fontFamily: Inter
    fontSize: 9px
    fontWeight: 500
    lineHeight: 1.2
  display:
    fontFamily: Archivo
    fontSize: 36px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: -0.02em

rounded:
  none: 0px
  sm: 6px
  md: 12px
  lg: 16px
  full: 9999px

spacing:
  xs: 4px
  sm: 8px
  md: 12px
  md2: 16px
  lg: 20px
  lg2: 24px
  xl: 32px
  gutter: 24px
  margin: 32px

components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '#ffffff'
    rounded: '{rounded.full}'
    padding: '14px 32px'
  button-primary-hover:
    backgroundColor: '{colors.primary-hover}'
  button-secondary:
    backgroundColor: 'transparent'
    textColor: '{colors.on-surface}'
    rounded: '{rounded.md}'
    padding: '12px 16px'
  input:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.on-surface}'
    rounded: '{rounded.md}'
  badge:
    backgroundColor: '{colors.neutral}'
    textColor: '{colors.on-surface}'
    rounded: '{rounded.full}'
    padding: '4px 8px'
  toggle-on:
    backgroundColor: '{colors.primary}'
  toggle-off:
    backgroundColor: '{colors.outline}'
---

## Overview

GrowChat embodies **Architectural Minimalism** — a monochrome design system where restraint is the aesthetic. The UI evokes a premium matte finish: high-contrast ink on limestone, with zero chromatic distraction. Every surface, every weight, every radius is deliberate. Nothing decorates. Everything serves.

The monochrome palette makes the interface recede so the content — conversations, code, model outputs — commands full attention. Inter provides institutional clarity for UI chrome. Archivo lands with impact only on hero surfaces. The pill geometry (full-radius buttons, pill-shaped composer) signals approachability without softness.

Dark mode is not currently supported. A future update may define inverted token values when dark mode is implemented.

## Colors

The palette is strictly monochrome — a single greyscale progression from near-black to warm off-white, with no accent hue. Interaction is conveyed through weight, position, and contrast, not color.

- **Primary (#171717):** Deep ink for headlines, primary CTAs, active states, and all high-emphasis interactive elements. This is the sole driver for action.
- **Primary Hover (#262626):** The responsive hover state of primary — slightly lifted from pure black to provide tactile feedback on buttons and toggles.
- **Secondary (#737373):** Medium grey for muted labels, captions, secondary text, and de-emphasized metadata.
- **Tertiary (#525252):** Dark grey for body text variants and on-surface-variant elements that need more emphasis than secondary but less than primary.
- **Neutral (#fafafa):** Warm off-white foundation for app backgrounds, sidebars, and structural surfaces. Softer than pure white, providing visual breathing room.
- **Surface (#ffffff):** Pure white for content cards, elevated panels, and primary reading areas.
- **Surface Container (#f5f5f5):** Light grey wells for inset areas — input composers, user message bubbles, edit fields. Signals "recessed" or "editable."
- **On Surface (#171717):** Primary text color on surfaces. Same value as primary — used for semantic clarity in component tokens.
- **On Surface Variant (#525252):** Secondary text on surfaces — body copy, descriptions, helper text. Less assertive than on-surface.
- **Outline (#e5e5e5):** Hairline borders, input borders, structural dividers. Visible but never heavy.
- **Outline Variant (#f3f4f6):** The lightest structural lines — card edges, subtle separators, the boundary between adjacent surfaces.

### Status Colors

Status colors are semantic, not brand. They follow universal convention for feedback states:

- **Error (#dc2626):** Validation failures, destructive actions, critical alerts.
- **Success (#16a34a):** Confirmations, completed operations, positive states.
- **Warning (#ea580c):** Caution states, pending actions, non-critical issues.
- **Info (#0284c7):** Informational notes, tips, neutral status indicators.

## Typography

The typography strategy uses two font families with distinct roles:

- **Inter** is the primary voice — used for all UI chrome, navigation, buttons, labels, body text, and chat messages. Its humanist geometry provides institutional clarity and long-form readability. Four weights (400, 500, 600, 700) cover the full range from body to headline.
- **Archivo** is the impact font — reserved exclusively for hero display text, splash screens, and large numerical data. Its geometric construction provides punch at display scale. Never used below 36px.
- **System monospace** handles technical data: code blocks, tool outputs, model IDs, URLs, and timestamps.

### Scale

The 11-level scale eliminates all arbitrary pixel values. Every text size in the codebase maps to a named token:

- **headline-lg (24px/600):** Page titles, hero headings.
- **headline-md (20px/600):** Section headings, drawer titles.
- **headline-sm (16px/600):** Subsection headings, card titles.
- **body-lg (16px/400):** Primary body text, chat messages.
- **body-md (14px/400):** Standard UI text, descriptions, settings labels.
- **body-sm (12px/400):** Small body text, captions, secondary descriptions.
- **label-lg (14px/500):** Button labels, form labels.
- **label-md (12px/500):** Badges, tags, status indicators.
- **label-sm (11px/500):** Micro-labels, timestamps, metadata.
- **label-xs (9px/500):** The absolute smallest readable text — rare, for dense data only.
- **display (36px/700, Archivo):** Hero splash text, large numbers. Sparingly.

## Layout

The layout follows a **Fixed-Max-Width Sidebar + Fluid Content** model. The sidebar is 260px fixed-width on desktop, collapsible on mobile. Content fills the remaining viewport.

A de-facto 8-point spacing scale (with 4px half-step for micro-adjustments and 12px/20px for tight internal padding) maintains consistent rhythm. The scale is honest — it includes the 12px and 20px values that the codebase uses heavily, rather than forcing a strict 8px-only grid that would require migrating hundreds of instances.

Components are grouped using **containment principles**: related items sit on white cards (`surface`) against the off-white app background (`neutral`), with inset areas (`surface-container`) for editable or recessed content.

## Elevation & Depth

Depth is achieved through **tonal layers** rather than shadows. The background uses warm off-white (`neutral`), primary content sits on pure white cards (`surface`), and inset areas use a light grey well (`surface-container`). This three-layer tonal system provides clear visual hierarchy without heaviness.

Shadows are reserved exclusively for **floating surfaces** — elements that physically detach from the page plane:

- `shadow-sm` — dropdowns and popovers
- `shadow-xl` / `shadow-2xl` — modals and overlay dialogs

No other elements use shadows. Cards, buttons, inputs, and badges are entirely flat — relying on background color differentiation and 1px borders for structure.

## Shapes

The shape language is defined by **Pill Geometry** — the full-radius (9999px) rounded corner is the signature motif. Primary buttons, the chat composer, avatars, and badges all use the pill form. This provides approachability without sacrificing the monochrome system's architectural precision.

Secondary shapes follow a clean hierarchy:

- **sm (6px):** Tags, inline chips, small badges
- **md (12px):** Cards, inputs, dropdowns, chat rows
- **lg (16px):** Message bubbles, modals, panels
- **full (9999px):** Pills — buttons, avatars, composer, primary CTAs

## Components

### Buttons

Primary buttons use the pill form with near-black fill and white text. Hover lifts to `primary-hover` (#262626). Active state applies `scale(0.95)` for tactile feedback. Secondary buttons are transparent with dark text and `md` rounding.

### Inputs

Text inputs and textareas sit on `surface` (#ffffff) with `outline` (#e5e5e5) borders and `md` (12px) rounding. Edit fields and the chat composer use `surface-container` (#f5f5f5) to signal "recessed/editable." Focus rings use `primary` at 20% opacity.

### Badges

Badges use the pill form (`full` rounding) with `neutral` (#fafafa) background and `on-surface` (#171717) text. No colored badges except for semantic status (error, success, warning, info).

### Toggles

Toggle switches use `primary` (#171717) when on, `outline` (#e5e5e5) when off. The pill form with a circular thumb maintains consistency with the button system.

## Do's and Don'ts

- Do use `#171717` (primary) for all primary CTAs and interactive highlights
- Do use `{rounded.full}` for pill-shaped elements — buttons, avatars, composer, badges
- Do use `{rounded.md}` (12px) for cards, inputs, and dropdowns
- Do use `surface-container` (#f5f5f5) for inset/well areas — edit fields, user message bubbles
- Do maintain WCAG AA contrast ratios (4.5:1 for normal text, 3:1 for large text)
- Do use Inter for all UI text; Archivo only for display/hero surfaces at 36px+
- Don't use arbitrary hex colors — reference design tokens instead
- Don't use `#0066cc` (Action Blue) — it has been retired from the palette
- Don't mix more than 2 font weights on a single surface
- Don't use `rounded-2xl`, `rounded-3xl`, or arbitrary pixel radii — use the 5 named tokens
- Don't use colored shadows (`shadow-blue-*`, `shadow-` + any color)
- Don't introduce new background greys — use `neutral`, `surface`, or `surface-container`
