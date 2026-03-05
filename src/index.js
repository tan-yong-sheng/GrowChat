import { verifyJWT } from './auth.js';
import { authRouter } from './routers/auth.js';
import { chatRouter } from './routers/chat.js';
import { usersRouter } from './routers/users.js';
import { faqsRouter } from './routers/faqs.js';
import { filesRouter } from './routers/files.js';
import { adminRouter } from './routers/admin.js';
import { error, preflight } from './utils/response.js';

const API_ROUTES = [authRouter, chatRouter, usersRouter, faqsRouter, filesRouter, adminRouter];

function getPath(req) {
  return new URL(req.url).pathname;
}

function readBearer(req) {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice('Bearer '.length).trim();
}

async function resolveAuthUser(req, env) {
  const token = readBearer(req);
  if (!token || !env.JWT_SECRET) return null;

  try {
    return await verifyJWT(token, env.JWT_SECRET);
  } catch {
    return null;
  }
}

export default {
  async fetch(req, env, ctx) {
    const path = getPath(req);

    if (req.method === 'OPTIONS') {
      return preflight(req);
    }

    if (path.startsWith('/api/')) {
      if (!env.DB) return error(req, 'DB binding missing', 500);
      if (!env.SESSIONS) return error(req, 'SESSIONS KV binding missing', 500);

      const user = await resolveAuthUser(req, env);

      for (const route of API_ROUTES) {
        const response = await route(req, env, ctx, user, path);
        if (response) return response;
      }

      return error(req, 'Not found', 404);
    }

    return env.ASSETS.fetch(req);
  },
};
