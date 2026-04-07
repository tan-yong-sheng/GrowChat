import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:8787';
const TEST_EMAIL = 'tys203831@gmail.com';
const TEST_PASSWORD = '&Test1234';

const findings = {
  pages: [],
  elements: [],
  errors: [],
  accessibility: [],
  interactions: [],
  screenshots: []
};

async function crawlApp() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      findings.errors.push({
        type: msg.type(),
        text: msg.text(),
      });
    }
  });

  page.on('pageerror', err => {
    findings.errors.push({
      type: 'page_error',
      message: err.message,
    });
  });

  try {
    console.log('[PHASE 1] Starting exhaustive crawl...\n');

    // Auth page
    console.log('[CRAWL] Auth page...');
    await page.goto(`${BASE_URL}/auth.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    findings.pages.push({
      url: '/auth.html',
      title: await page.title(),
      elements: await countElements(page)
    });

    await page.screenshot({ path: 'docs/qa/screenshots/01-auth-page.png' });
    findings.screenshots.push('01-auth-page.png');

    // Login
    console.log('[CRAWL] Logging in...');
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Sign In")');
    await page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(2000);

    findings.pages.push({
      url: '/',
      title: await page.title(),
      elements: await countElements(page)
    });

    await page.screenshot({ path: 'docs/qa/screenshots/02-main-page.png' });
    findings.screenshots.push('02-main-page.png');

    // Sidebar buttons
    console.log('[CRAWL] Sidebar navigation...');
    const sidebarButtons = await page.locator('[class*="sidebar"] button, [class*="nav"] button').all();
    console.log(`  Found ${sidebarButtons.length} sidebar buttons`);

    for (let i = 0; i < Math.min(sidebarButtons.length, 5); i++) {
      const btn = sidebarButtons[i];
      const text = await btn.textContent().catch(() => '(no text)');
      const visible = await btn.isVisible().catch(() => false);
      findings.elements.push({
        type: 'sidebar_button',
        text: text.substring(0, 50),
        visible,
        index: i
      });
    }

    // User profile dropdown
    console.log('[CRAWL] User profile menu...');
    const profileBtn = await page.locator('[class*="profile"]').first();
    if (await profileBtn.isVisible()) {
      await profileBtn.click();
      await page.waitForTimeout(500);

      const menuItems = await page.locator('[class*="menu"] button, [role="menu"] button').all();
      console.log(`  Found ${menuItems.length} menu items`);

      for (const item of menuItems) {
        const text = await item.textContent().catch(() => '');
        const visible = await item.isVisible().catch(() => false);
        findings.elements.push({
          type: 'menu_item',
          text: text.substring(0, 50),
          visible
        });
      }

      await page.screenshot({ path: 'docs/qa/screenshots/03-user-menu.png' });
      findings.screenshots.push('03-user-menu.png');
    }

    // Search modal
    console.log('[CRAWL] Search modal...');
    const searchBtn = await page.locator('button').filter({ hasText: /search/i }).first();
    if (await searchBtn.isVisible()) {
      await searchBtn.click();
      await page.waitForTimeout(500);

      const searchInput = await page.locator('input[placeholder*="search" i]').first();
      const searchVisible = await searchInput.isVisible().catch(() => false);
      findings.elements.push({
        type: 'search_modal',
        inputVisible: searchVisible
      });

      await page.screenshot({ path: 'docs/qa/screenshots/04-search-modal.png' });
      findings.screenshots.push('04-search-modal.png');
    }

    // New chat
    console.log('[CRAWL] Chat creation...');
    const newChatBtn = await page.locator('button:has-text("New Chat")').first();
    if (await newChatBtn.isVisible()) {
      await newChatBtn.click();
      await page.waitForTimeout(500);

      findings.elements.push({
        type: 'new_chat_button',
        clickable: true
      });

      await page.screenshot({ path: 'docs/qa/screenshots/05-new-chat.png' });
      findings.screenshots.push('05-new-chat.png');
    }

    // Message input
    console.log('[CRAWL] Message input...');
    const msgInput = await page.locator('input[placeholder*="message" i], textarea').first();
    if (await msgInput.isVisible()) {
      await msgInput.fill('Test message for QA');
      const value = await msgInput.inputValue();

      findings.elements.push({
        type: 'message_input',
        acceptsInput: value.length > 0
      });

      const sendBtn = await page.locator('button[aria-label*="send" i]').first();
      const sendVisible = await sendBtn.isVisible().catch(() => false);
      findings.elements.push({
        type: 'send_button',
        visible: sendVisible
      });
    }

    // Mobile test
    console.log('[CRAWL] Responsive design (mobile)...');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);

    const mobileElements = await countElements(page);
    findings.pages.push({
      url: '/ (mobile 375px)',
      elements: mobileElements
    });

    await page.screenshot({ path: 'docs/qa/screenshots/06-mobile-375px.png' });
    findings.screenshots.push('06-mobile-375px.png');

    // Accessibility
    console.log('[CRAWL] Accessibility audit...');
    const buttons = await page.locator('button').all();
    let unlabeledButtons = 0;

    for (const btn of buttons.slice(0, 30)) {
      const ariaLabel = await btn.getAttribute('aria-label').catch(() => null);
      const text = await btn.textContent().catch(() => '');
      if (!ariaLabel && !text.trim()) {
        unlabeledButtons++;
      }
    }

    findings.accessibility.push({
      test: 'Button ARIA labels',
      unlabeledCount: unlabeledButtons,
      sampledCount: Math.min(30, buttons.length)
    });

    // Test routes
    console.log('[CRAWL] Testing routes...');
    const testRoutes = ['/admin', '/settings', '/profile', '/404'];

    for (const route of testRoutes) {
      try {
        await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle', timeout: 5000 }).catch(() => {});
        const status = page.url().includes(route) ? 'accessible' : 'redirected';
        findings.pages.push({
          url: route,
          status,
          finalUrl: page.url()
        });
      } catch (e) {
        findings.pages.push({
          url: route,
          status: 'error',
          error: e.message
        });
      }
    }

    console.log('\n[PHASE 1] Crawl complete!\n');

  } catch (e) {
    console.error('[ERROR]', e.message);
    findings.errors.push({
      type: 'crawl_error',
      message: e.message
    });
  }

  await browser.close();

  const timestamp = new Date().toISOString().split('T')[0];
  const reportPath = `docs/qa/findings/exhaustive-crawl-${timestamp}.json`;

  fs.writeFileSync(reportPath, JSON.stringify(findings, null, 2));
  console.log(`[SAVED] ${reportPath}`);

  return findings;
}

async function countElements(page) {
  return await page.evaluate(() => {
    return {
      buttons: document.querySelectorAll('button').length,
      inputs: document.querySelectorAll('input, textarea').length,
      links: document.querySelectorAll('a').length,
      modals: document.querySelectorAll('[role="dialog"], [class*="modal"]').length,
      total: document.querySelectorAll('*').length
    };
  });
}

crawlApp().catch(console.error);
