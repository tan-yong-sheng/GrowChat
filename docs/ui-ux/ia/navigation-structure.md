# GrowChat Navigation Structure

This document outlines the top-level Information Architecture (IA) and page hierarchy.

## 1. Public Scope (Unauthenticated)

- `/` (Landing Page — Marketing & Signup Funnel)
  - Hero: tagline, deploy CTA, GitHub stars badge
  - Features: 3 pillars (RBAC, Multi-provider LLM, Cloudflare deploy)
  - Comparison: vs Open WebUI, LibreChat, HiveChat
  - Pricing: Free & Open Source (MIT)
  - Footer: GitHub link, deploy CTA
  - _Auto-redirects authenticated users to SPA_
- `/auth.html` (Authentication Gateway)
  - Login View
  - Registration View
  - Forgot Password Modal
  - Reset Password Modal (Requires `?token=`)
- `/s/:id` (Public Shared Chat View)

## 2. Personal Scope (Authenticated)

- `/` (Main Chat Application)
  - New Chat (Empty State)
  - Active Chat (Requires `?chat_id=`)
- `/account` (Personal Settings Drawer - overlaid on `/`)
  - `/account/settings/connections` (Personal API Keys)
  - `/account/settings/models` (Personal LLM Overrides)
  - `/account/settings/integrations`
  - `/account/settings/security`
  - `/account/profile`

## 3. Workspace / Admin Scope (Elevated Roles Only)

- `/admin` (Admin Overview)
  - `/admin/users/overview` (User Table)
  - `/admin/users/roles`
  - `/admin/users/policies`
- `/admin/settings` (Workspace Configurations)
  - `/admin/settings/connections` (Global LLM Providers)
  - `/admin/settings/models`
  - `/admin/settings/integrations`
- `/admin/system`
  - `/admin/system/general`
