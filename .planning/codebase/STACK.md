# Technology Stack

**Analysis Date:** [YYYY-MM-DD]

## Languages

**Primary:**
- JavaScript (ES6+) - Backend logic (`src/`) and Vanilla JS frontend (`public/js/`)
- CSS - Styling via Tailwind CSS
- HTML - Static structure for UI (`public/index.html`, `public/auth.html`)

**Secondary:**
- TypeScript - Used for configuration files (`playwright.config.ts`, `vitest.config.js`) and types (`@types/node`)

## Runtime

**Environment:**
- Cloudflare Workers (V8 Isolates)
- Node.js (for local dev server and build scripts)

**Package Manager:**
- npm 10+
- Lockfile: present (`package-lock.json`)

## Frameworks

**Core:**
- Custom Vanilla JS Fetch Handler - Backend HTTP routing (`src/index.js`)
- Vanilla JavaScript (No Framework) - Frontend UI (`public/js/`)
- Tailwind CSS v3.4 - Styling

**Testing:**
- Vitest v4.0 - Unit and Integration Testing
- Playwright v1.58 - End-to-End Testing

**Build/Dev:**
- Wrangler v4.75 - Cloudflare deployment and dev server
- ESLint v10.2 - Linting
- Prettier v3.8 - Formatting

## Key Dependencies

**Critical:**
- `zod` v4.3 - Schema validation
- `dompurify` v3.3 - HTML sanitization for security
- `ecc-universal` v1.9 - Cryptography (likely for JWT and signatures)

**Infrastructure:**
- `wrangler` v4.75 - Cloudflare deployment
- `tailwindcss` v3.4 - UI styling framework
- `@playwright/test` v1.58 - E2E tests

## Configuration

**Environment:**
- Local environment files: `.env`, `.env.local`, `.env.example`
- Required variables: `EMAIL_PROVIDER`, `RESEND_API_KEY` (or configured in DB)

**Build:**
- `wrangler.jsonc` - Cloudflare Workers configuration and resource bindings
- `tailwind.config.js` - CSS framework configuration
- `vitest.config.js` - Unit testing configuration
- `playwright.config.ts` - E2E testing configuration

## Platform Requirements

**Development:**
- Node.js environment
- Local SQLite database initialized via `scripts/init-local-db.js`

**Production:**
- Cloudflare Workers (Compute)
- Cloudflare D1 (Relational Database)
- Cloudflare KV (Key-Value Store)
- Cloudflare R2 (Object Storage)
- Cloudflare Durable Objects (Stateful Compute/Message Queues)

---

*Stack analysis: [YYYY-MM-DD]*