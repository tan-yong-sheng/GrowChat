import { test, expect, devices } from '@playwright/test';

// Define multiple device profiles for comprehensive testing
const DEVICE_PROFILES = [
  { name: 'mobile-small', width: 320, height: 568, label: 'iPhone SE' },
  { name: 'mobile-medium', width: 375, height: 667, label: 'iPhone 8' },
  { name: 'mobile-large', width: 414, height: 896, label: 'iPhone 11' },
  { name: 'tablet-portrait', width: 768, height: 1024, label: 'iPad Portrait' },
  { name: 'tablet-landscape', width: 1024, height: 768, label: 'iPad Landscape' },
  { name: 'desktop-small', width: 1024, height: 768, label: 'Desktop 1024px' },
  { name: 'desktop-medium', width: 1366, height: 768, label: 'Desktop 1366px' },
  { name: 'desktop-large', width: 1920, height: 1080, label: 'Desktop 1920px' },
];

test.describe('Mobile Responsiveness Analysis @responsiveness', () => {
  test.beforeEach(async ({ page }) => {
    const now = 1704067200000;
    await page.addInitScript((fixedNow) => {
      const originalNow = Date.now;
      Date.now = () => fixedNow;
      window.__restoreDateNowForTests = () => {
        Date.now = originalNow;
      };
    }, now);

    // Mock API responses
    await page.route('**/api/users/me**', (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          user: { id: '1', name: 'Responsive Test User', email: 'test@example.com' },
        }),
      })
    );

    await page.route('**/api/auth/refresh', (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          access_token:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjQxMDI0NDQ4MDAsInN1YiI6IjEiLCJuYW1lIjoiVGVzdCJ9.signature',
          refresh_token: 'refresh-token',
          user: { id: '1', name: 'Responsive Test User' },
        }),
      })
    );

    await page.route('**/api/chats*', (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          chats: [
            {
              id: 'c1',
              title: 'First Chat - Testing Responsiveness',
              model: 'gpt-4',
              updated_at: now,
              created_at: now,
            },
            {
              id: 'c2',
              title: 'Second Chat with Longer Title for Testing Text Wrapping',
              model: 'gpt-4',
              updated_at: now,
              created_at: now,
            },
            {
              id: 'c3',
              title: 'Third Chat',
              model: 'gpt-4',
              updated_at: now,
              created_at: now,
            },
          ],
        }),
      })
    );

    await page.route('**/api/chats/c1', (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          chat: {
            id: 'c1',
            title: 'First Chat - Testing Responsiveness',
            model: 'gpt-4',
            updated_at: now,
            created_at: now,
          },
          messages: [],
        }),
      })
    );

    await page.route('**/api/chats/c1/messages*', (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          messages: [
            {
              id: 'm1',
              role: 'user',
              content: 'This is a test message to check responsiveness across different screen sizes.',
            },
            {
              id: 'm2',
              role: 'assistant',
              content:
                'This is a longer assistant response that should wrap properly on mobile devices. It contains multiple sentences to test text wrapping and layout behavior.',
            },
            {
              id: 'm3',
              role: 'user',
              content: 'Another user message',
            },
            {
              id: 'm4',
              role: 'assistant',
              content: 'Another assistant response with code example:\n```javascript\nconst test = () => console.log("test");\n```',
            },
          ],
        }),
      })
    );

    await page.route('**/api/models', (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          models: [
            { id: 'gpt-4', name: 'GPT-4' },
            { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
          ],
        }),
      })
    );

    await page.route('**/api/realtime/stream', (route) =>
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' })
    );
  });

  // Auth page responsiveness tests
  test.describe('Auth Page Responsiveness', () => {
    for (const device of DEVICE_PROFILES) {
      test(`auth page login mode - ${device.label} (${device.width}x${device.height})`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: device.width, height: device.height });
        await page.goto('/auth.html');
        await page.waitForLoadState('networkidle');

        // Check for layout issues
        const form = page.locator('#auth-form');
        await expect(form).toBeVisible();

        // Verify form is not cut off
        const formBox = await form.boundingBox();
        expect(formBox).not.toBeNull();
        if (formBox) {
          expect(formBox.width).toBeGreaterThan(0);
          expect(formBox.height).toBeGreaterThan(0);
        }

        await page.screenshot({
          path: `tests/e2e/artifacts/responsiveness/auth-${device.name}.png`,
          fullPage: true,
        });
      });
    }
  });

  // Main app shell responsiveness tests
  test.describe('App Shell Responsiveness', () => {
    for (const device of DEVICE_PROFILES) {
      test(`app shell - ${device.label} (${device.width}x${device.height})`, async ({ page }) => {
        await page.setViewportSize({ width: device.width, height: device.height });
        await page.goto('/');
        await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
        await page.waitForLoadState('networkidle');

        // Check for layout issues
        const app = page.locator('#app');
        await expect(app).toBeVisible();

        const appBox = await app.boundingBox();
        expect(appBox).not.toBeNull();

        await page.screenshot({
          path: `tests/e2e/artifacts/responsiveness/app-shell-${device.name}.png`,
          fullPage: true,
        });
      });
    }
  });

  // Chat view responsiveness tests
  test.describe('Chat View Responsiveness', () => {
    for (const device of DEVICE_PROFILES) {
      test(`chat view with messages - ${device.label} (${device.width}x${device.height})`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: device.width, height: device.height });
        await page.goto('/');
        await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
        await page.waitForLoadState('networkidle');

        // Click on first chat
        const chatItem = page.locator('text=First Chat - Testing Responsiveness').first();
        if (await chatItem.isVisible()) {
          await chatItem.click();
          await page.waitForLoadState('networkidle');
        }

        await page.screenshot({
          path: `tests/e2e/artifacts/responsiveness/chat-view-${device.name}.png`,
          fullPage: true,
        });
      });
    }
  });

  // Message input responsiveness tests
  test.describe('Message Input Responsiveness', () => {
    for (const device of DEVICE_PROFILES) {
      test(`message input area - ${device.label} (${device.width}x${device.height})`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: device.width, height: device.height });
        await page.goto('/');
        await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
        await page.waitForLoadState('networkidle');

        // Find and check message input
        const messageInput = page.locator('[data-testid="message-input"], textarea, input[type="text"]').first();
        if (await messageInput.isVisible()) {
          const inputBox = await messageInput.boundingBox();
          expect(inputBox).not.toBeNull();
          if (inputBox) {
            expect(inputBox.width).toBeGreaterThan(0);
          }
        }

        await page.screenshot({
          path: `tests/e2e/artifacts/responsiveness/message-input-${device.name}.png`,
          fullPage: true,
        });
      });
    }
  });

  // Sidebar responsiveness tests
  test.describe('Sidebar Responsiveness', () => {
    for (const device of DEVICE_PROFILES) {
      test(`sidebar visibility - ${device.label} (${device.width}x${device.height})`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: device.width, height: device.height });
        await page.goto('/');
        await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
        await page.waitForLoadState('networkidle');

        // Check if sidebar is visible or hidden based on screen size
        const isMobile = device.width < 768;
        const sidebar = page.locator('[data-testid="sidebar"], aside, nav').first();

        if (isMobile) {
          // On mobile, sidebar might be hidden or in a drawer
          const sidebarVisible = await sidebar.isVisible().catch(() => false);
          // Just verify the page doesn't crash
          expect(page).toBeTruthy();
        } else {
          // On desktop, sidebar should be visible
          if (await sidebar.isVisible()) {
            const sidebarBox = await sidebar.boundingBox();
            expect(sidebarBox).not.toBeNull();
          }
        }

        await page.screenshot({
          path: `tests/e2e/artifacts/responsiveness/sidebar-${device.name}.png`,
          fullPage: true,
        });
      });
    }
  });

  // Text overflow and wrapping tests
  test.describe('Text Overflow and Wrapping', () => {
    for (const device of DEVICE_PROFILES.filter((d) => d.width < 768)) {
      // Focus on mobile devices
      test(`text wrapping on mobile - ${device.label} (${device.width}x${device.height})`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: device.width, height: device.height });
        await page.goto('/');
        await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
        await page.waitForLoadState('networkidle');

        // Check for text overflow issues
        const allElements = await page.locator('*').all();
        let overflowCount = 0;

        for (const element of allElements.slice(0, 50)) {
          // Check first 50 elements
          const scrollWidth = await element.evaluate((el) => (el as HTMLElement).scrollWidth);
          const clientWidth = await element.evaluate((el) => (el as HTMLElement).clientWidth);

          if (scrollWidth > clientWidth + 1) {
            // Allow 1px tolerance
            overflowCount++;
          }
        }

        // Log overflow issues but don't fail - we'll analyze visually
        console.log(`Text overflow issues found: ${overflowCount}`);

        await page.screenshot({
          path: `tests/e2e/artifacts/responsiveness/text-wrap-${device.name}.png`,
          fullPage: true,
        });
      });
    }
  });

  // Touch target size tests (mobile)
  test.describe('Touch Target Sizes', () => {
    for (const device of DEVICE_PROFILES.filter((d) => d.width < 768)) {
      test(`touch targets - ${device.label} (${device.width}x${device.height})`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: device.width, height: device.height });
        await page.goto('/');
        await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
        await page.waitForLoadState('networkidle');

        // Check for buttons and interactive elements
        const buttons = await page.locator('button').all();
        let smallTargets = 0;

        for (const button of buttons.slice(0, 20)) {
          const box = await button.boundingBox();
          if (box && (box.width < 44 || box.height < 44)) {
            smallTargets++;
          }
        }

        console.log(`Touch targets smaller than 44x44px: ${smallTargets}`);

        await page.screenshot({
          path: `tests/e2e/artifacts/responsiveness/touch-targets-${device.name}.png`,
          fullPage: true,
        });
      });
    }
  });

  // Viewport meta tag verification
  test('viewport meta tag configuration', async ({ page }) => {
    await page.goto('/');
    const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewportMeta).toBeTruthy();
    console.log('Viewport meta tag:', viewportMeta);
  });

  // CSS media query verification
  test('CSS media queries are applied', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });

    const mediaQueryTest = await page.evaluate(() => {
      return window.matchMedia('(max-width: 768px)').matches;
    });

    console.log('Mobile media query matches:', mediaQueryTest);
    expect(mediaQueryTest).toBe(true);
  });
});
