# Landing Page (`/`)

> Public-facing marketing page for GrowChat. Serves as the signup funnel entry point.

## Route Logic

| Condition | Served |
|-----------|--------|
| Unauthenticated `/` (no Authorization header) | `landing.html` |
| Authenticated `/` (Authorization header) | SPA redirect via `landing.js` → `/index.html` |
| API `/api/*` | Existing API routing (unchanged) |

## Sections

1. **Hero**: Tagline ("30-second deploy. Zero Docker. Chat with any LLM."), deploy CTA button, GitHub stars badge
2. **Features**: Three pillar cards — RBAC, Multi-Provider LLM, Cloudflare Deploy
3. **Comparison**: Table vs Open WebUI, LibreChat, HiveChat
4. **Pricing**: "Free & Open Source" card with MIT license badge
5. **Footer**: GitHub repo link, MIT license, deploy CTA

## Client-Side Behavior

- `landing.js` checks `localStorage` for `growchat_auth` on load
  - If valid token exists → `window.location.replace('/index.html')`
- Fetches GitHub stars from `https://api.github.com/repos/tan-yong-sheng/GrowChat`
- Smooth scroll for `#` anchor links
- Mobile nav toggle (hamburger menu)

## Design Compliance

- **Action Blue** (`#0066cc`): all CTAs, nav links, feature icons
- **Pill geometry** (`rounded-full`): buttons, badges, nav items
- **Low-density**: generous spacing, 8pt grid
- **Monochrome palette**: `#171717` primary, `#737373` muted, `#e5e5e5` borders, `#fafafa` surface
- **Typography**: Inter (body) / Archivo (headings)

## Files

| File | Purpose |
|------|---------|
| `public/landing.html` | Static marketing page |
| `public/js/features/landing.js` | GitHub stars, smooth scroll, mobile nav, auth redirect |
| `src/index.js` | Route handler (serves `landing.html` for unauthenticated `/`) |

## States

```
[Page Load] → checkAuthRedirect()
  → has valid token? → redirect to /index.html
  → no token? → show landing page → fetchGitHubStars()
```

## Related

- [Navigation Structure](../ia/navigation-structure.md)
- [Auth States](../states/auth.states.md)
- [Auth Flow](../user-flows/00-authentication.md)
