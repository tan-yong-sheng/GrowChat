# GrowChat

A multi-user Cloudflare Workers chat application with support for multiple LLM providers.

## Features

✅ **Phase 1 (Current)**
- User authentication with JWT tokens and refresh token rotation
- Multi-user chat management with persistent D1 database
- Streaming LLM responses via Server-Sent Events (SSE)
- Support for Workers AI and OpenAI-compatible APIs
- PBKDF2 password hashing with Web Crypto
- Responsive web UI built with vanilla JS and Tailwind CSS

🚀 **Phase 2 (Planned)**
- RAG with Cloudflare Vectorize for FAQ vector search
- File uploads with R2
- Admin panel for managing FAQs and users

## Quick Start

### Prerequisites
- Node.js 18+
- Cloudflare account with:
  - Workers (free tier)
  - D1 database (free tier)
  - KV namespaces (free tier)
  - Workers AI (free tier)

### Installation

```bash
git clone https://github.com/tan-yong-sheng/GrowChat.git
cd GrowChat
npm install
```

### Local Development

```bash
npm run dev
```

Open `http://localhost:8787` in your browser.

### Deployment

1. **Create D1 Database**
   ```bash
   wrangler d1 create growchat
   ```
   Copy the database ID from the output into `wrangler.jsonc`.

2. **Create KV Namespaces**
   ```bash
   wrangler kv:namespace create SESSIONS
   wrangler kv:namespace create CACHE
   ```
   Update `wrangler.jsonc` with the namespace IDs.

3. **Set Secrets**
   ```bash
   wrangler secret put JWT_SECRET
   wrangler secret put OPENAI_API_KEY
   ```

4. **Deploy**
   ```bash
   npm run deploy
   ```

## Architecture

See [AGENTS.md](./AGENTS.md) for detailed architecture documentation.

### Core Components

- **Backend**: Cloudflare Worker (`src/index.js`) with D1 database
- **Frontend**: Vanilla JS SPA with localStorage auth state
- **LLM Integration**: Pluggable model support (Workers AI + OpenAI-compatible)
- **Database**: SQLite with users, chats, messages tables
- **Authentication**: JWT tokens with refresh token rotation

## API Routes

All routes (except auth) require `Authorization: Bearer <token>` header.

### Authentication

- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login and get tokens
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout

### Users

- `GET /api/users/me` - Get current user
- `PUT /api/users/me` - Update profile

### Chats

- `GET /api/chats` - List chats
- `POST /api/chats` - Create chat
- `GET /api/chats/:id` - Get chat with messages
- `PUT /api/chats/:id` - Update chat
- `DELETE /api/chats/:id` - Delete chat
- `POST /api/chats/:id/messages` - Send message (streams LLM response via SSE)

## Configuration

### Environment Variables

```env
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=sk-...  # Set via wrangler secret
DEFAULT_MODEL=gpt-4
JWT_SECRET=...  # Set via wrangler secret
```

### Model Selection

The system checks for models in this order:
1. User-provided model in request
2. Chat's stored model
3. `DEFAULT_MODEL` environment variable
4. Falls back to `@cf/meta/llama-3.1-8b-instruct` (free Workers AI)

## Database Schema

```sql
users
  id (UUID)
  email (unique)
  password_hash (PBKDF2)
  name
  role (admin|user)
  settings (JSON)
  created_at, updated_at

chats
  id (UUID)
  user_id (foreign key)
  title
  model
  pinned (0|1)
  tags (JSON array)
  created_at, updated_at

messages
  id (UUID)
  chat_id (foreign key)
  role (user|assistant)
  content
  model
  citations (JSON)
  created_at
```

## Development

### Build CSS

```bash
npm run build:css
```

### Run Tests

Tests not yet configured (Phase 3 roadmap).

### Code Quality

No linter currently configured (Phase 3 roadmap).

## Deployment Status

- **Latest Version**: Deployed to Cloudflare Workers
- **URL**: `https://growchat.tanyongsheng-net.workers.dev`
- **Test Status**: Manual smoke tests passing (register, login, chat creation, streaming)

## Troubleshooting

### JWT_SECRET not configured
```bash
wrangler secret put JWT_SECRET
# Re-deploy: npm run deploy
```

### OPENAI_API_KEY missing
```bash
wrangler secret put OPENAI_API_KEY
# Re-deploy: npm run deploy
```

### D1 Database errors
Check that `wrangler.jsonc` has correct database ID from `wrangler d1 list`.

## Roadmap

### Phase 1 (Current)
- ✅ User authentication
- ✅ Multi-user chat
- ✅ Streaming LLM
- ✅ Multi-model support

### Phase 2
- [ ] Vector embeddings (Vectorize)
- [ ] File uploads (R2)
- [ ] Admin panel

### Phase 3
- [ ] Testing infrastructure
- [ ] Chat sharing/exports
- [ ] Advanced analytics

## License

MIT

## Support

For issues or questions, open an issue on GitHub.
