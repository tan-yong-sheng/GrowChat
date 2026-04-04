import type { Page } from '@playwright/test';
import { TEST_BASE_URL } from './test-helpers';

export const TEST_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjQxMDI0NDQ4MDAsInN1YiI6IjEiLCJuYW1lIjoiVGVzdCJ9.signature';

export async function mockAdminBootstrap(page: Page) {
  await page.route('**/*', (route) => {
    const pathname = new URL(route.request().url()).pathname;

    if (pathname === '/api/users/me') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: '1', name: 'Admin', role: 'admin', primary_role: 'admin' },
          permissions: ['admin.rbac.admin', 'model.admin', 'model.use', 'chat.read', 'chat.write'],
          roles: [{ role_name: 'admin' }],
          app_config: { default_model_id: 'gpt-4' },
        }),
      });
    }

    if (pathname === '/api/auth/refresh') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: TEST_JWT,
          refresh_token: 'refresh-token',
          user: { id: '1', name: 'Admin', role: 'admin' },
        }),
      });
    }

    if (pathname === '/api/chats' || pathname.startsWith('/api/chats/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ chats: [] }),
      });
    }

    if (pathname === '/api/models') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          models: [
            { id: 'gpt-4', name: 'GPT-4' },
            { id: 'gpt-5-mini', name: 'GPT-5 Mini' },
          ],
          total: 2,
          limit: 20,
          offset: 0,
        }),
      });
    }

    return route.continue();
  });

  await page.route('**/admin/**', async (route) => {
    if (route.request().resourceType() !== 'document') {
      return route.continue();
    }

    const html = await fetch(new URL('/', TEST_BASE_URL).toString()).then((res) => res.text());
    return route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: html,
    });
  });
}

export async function setupAdminPage(page: Page) {
  await page.addInitScript((auth) => {
    localStorage.setItem('growchat_auth', JSON.stringify(auth));
  }, {
    access_token: TEST_JWT,
    refresh_token: 'refresh-token',
    user: { id: '1', name: 'Admin', role: 'admin' },
  });

  await mockAdminBootstrap(page);
}

export async function renderAdminRoute(page: Page, pathname: string) {
  await page.goto(pathname, { waitUntil: 'networkidle' });
  await page.waitForSelector('#app', { state: 'attached', timeout: 15000 });
}
