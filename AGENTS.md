# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

This is a lightweight Cloudflare Workers AI chatbot widget project:
- **Backend API + static hosting**: Cloudflare Worker in `src/index.js`.
- **Embeddable frontend widget**: plain JS script in `public/widget.js`.
- **Styling pipeline**: Tailwind input `src/input.css` compiled to `public/styles.css`.
- **Config/bindings**: `wrangler.jsonc` wires Worker entrypoint, static assets, Workers AI, Vectorize, and KV.

The `README.md` currently only contains an asset link and no operational docs.

## Common commands

From repository root:

- Install dependencies:
  - `npm install`
- Build CSS bundle:
  - `npm run build:css`
- Local development (build CSS then run Wrangler dev server):
  - `npm run dev`
- Deploy Worker (build CSS then deploy):
  - `npm run deploy`

### Tests/linting status

- No test framework is currently configured in `package.json` (no `test` script).
- No linter is currently configured in `package.json` (no `lint` script).
- Because there is no configured test runner, there is currently no single-test command in this repo.

## Architecture notes

### Request flow and routing

`src/index.js` is the central runtime:
- Handles API routes:
  - `POST /api/chat` (streaming chat completions)
  - `GET /api/history` (session history from KV)
  - `POST /api/seed` (seed FAQ vectors)
  - `GET /api/health`
- Handles CORS and preflight `OPTIONS`.
- Falls back to `env.ASSETS.fetch(req)` for static files from `public/`.

### Chat + memory + RAG pipeline

In `src/index.js`:
1. Reads/sets `chatbot_session` cookie.
2. Loads/saves session data in `CHAT_SESSIONS` KV namespace.
3. Builds FAQ context by:
   - generating embeddings with Workers AI model `@cf/baai/bge-base-en-v1.5`
   - querying Vectorize index via `env.VECTORIZE.query(...)`
4. Calls streaming chat model `@cf/meta/llama-3-8b-instruct`.
5. Streams SSE back to client while reconstructing assistant text server-side, then persists assistant message to KV on stream flush.

### Frontend widget behavior

`public/widget.js`:
- Injects `styles.css` and renders floating chat UI into the host page.
- Uses global config overrides if present (`window.CHATBOT_BASE_URL`, `CHATBOT_TITLE`, etc.).
- Sends messages to `/api/chat` with `credentials: 'include'` so session cookie persists.
- Reads prior conversation from `/api/history`.
- Parses SSE `data:` lines from the chat endpoint and incrementally updates assistant response UI.

`public/index.html` is a demo page that sets title/greeting globals and loads `widget.js`.

### Cloudflare bindings and deployment assumptions

`wrangler.jsonc` defines:
- `main: src/index.js`
- `assets.directory: ./public` (static asset serving)
- `ai.binding: AI`
- `vectorize` binding `VECTORIZE` (index `faq-vectors`)
- KV binding `CHAT_SESSIONS`

When changing data or AI flows, keep `wrangler.jsonc` bindings and `src/index.js` usage aligned.

## Repository-specific notes

- `open-webui/` is ignored via `.gitignore` and treated as external reference material, not part of runtime code.
- Generated CSS artifact (`public/styles.css`) is built from Tailwind input and config (`src/input.css`, `tailwind.config.js`).