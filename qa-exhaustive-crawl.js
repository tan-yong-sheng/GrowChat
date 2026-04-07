import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:8787';
const TEST_EMAIL = 'tys203831@gmail.com';
const TEST_PASSWORD = '&Test1234';
const FINDINGS_DIR = './docs/qa/findings';

// Ensure findings directory exists
if (!fs.existsSync(FINDINGS_DIR)) {
  fs.mkdirSync(FINDINGS_DIR, { recursive: true });
}

async function crawlApp() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const findings = {
    pages: [],
    elements: [],
    errors: [],
    accessibility: [],
    interactions: [],
    screenshots: []
  };

  try {
    console.log('🔍 Starting exhaustive QA crawl...\n');

    // Test 1: Auth page
    console.log('📄 Testing auth page...');
    await page.goto(`${BASE_URL}/auth.html`);
    await page.waitForLoadState('networkidle');

    const authElements = await countElements(page);
    findings.pages.push({
      url: '/auth.html',
      title: await page.title(),
      elements: authElements
    });

    const authScreenshot = `01-auth-page.png`;
    await page.screenshot({ path: path.join(FINDINGS_DIR, authScreenshot) });
    findings.screenshots.push(authScreenshot);

    // Login
    console.log('🔐 Logging in...');
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for navigation and network to settle
    await page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(2000);

    // Test 2: Main page
    console.log('📄 Testing main page...');
    const mainElements = await countElements(page);
    findings.pages.push({
      url: '/',
      title: await page.title(),
      elements: mainElements
    });

    const mainScreenshot = `02-main-page.png`;
    await page.screenshot({ path: path.join(FINDINGS_DIR, mainScreenshot) });
    findings.screenshots.push(mainScreenshot);

    // Test 3: User profile menu
    console.log('👤 Testing user profile menu...');
    const userMenuBtn = await page.$('[data-testid="user-profile-button"], button:has-text("Profile"), .user-profile-btn');
    if (userMenuBtn) {
      await userMenuBtn.click();
      await page.waitForTimeout(500);

      const userMenuScreenshot = `03-user-menu.png`;
      await page.screenshot({ path: path.join(FINDINGS_DIR, userMenuScreenshot) });
      findings.screenshots.push(userMenuScreenshot);
    }

    // Test 4: Search modal
    console.log('🔍 Testing search modal...');
    const searchBtn = await page.$('#open-search');
    if (searchBtn) {
      await searchBtn.click();
      await page.waitForTimeout(500);

      const searchModalScreenshot = `04-search-modal.png`;
      await page.screenshot({ path: path.join(FINDINGS_DIR, searchModalScreenshot) });
      findings.screenshots.push(searchModalScreenshot);

      // Close search modal
      const closeBtn = await page.$('[aria-label="Close"]');
      if (closeBtn) await closeBtn.click();
      await page.waitForTimeout(300);
    }

    // Test 5: New chat button
    console.log('➕ Testing new chat button...');
    const newChatBtn = await page.$('#new-chat');
    if (newChatBtn) {
      await newChatBtn.click();
      await page.waitForTimeout(1000);

      const newChatScreenshot = `05-new-chat.png`;
      await page.screenshot({ path: path.join(FINDINGS_DIR, newChatScreenshot) });
      findings.screenshots.push(newChatScreenshot);
    }

    // Test 6: Mobile viewport
    console.log('📱 Testing mobile viewport (375x812)...');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');

    const mobileElements = await countElements(page);
    findings.pages.push({
      url: '/ (mobile 375px)',
      elements: mobileElements
    });

    const mobileScreenshot = `06-mobile-375px.png`;
    await page.screenshot({ path: path.join(FINDINGS_DIR, mobileScreenshot) });
    findings.screenshots.push(mobileScreenshot);

    // Test 7: Route testing
    console.log('🛣️ Testing routes...');
    const routes = ['/admin', '/settings', '/profile', '/404'];
    for (const route of routes) {
      try {
        await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle', timeout: 5000 });
        const finalUrl = page.url();
        findings.pages.push({
          url: route,
          status: finalUrl !== `${BASE_URL}${route}` ? 'redirected' : 'ok',
          finalUrl: finalUrl !== `${BASE_URL}${route}` ? finalUrl : undefined
        });
      } catch (e) {
        findings.pages.push({
          url: route,
          status: 'error',
          error: e.message
        });
      }
    }

    // Test 8: Accessibility audit
    console.log('♿ Running accessibility audit...');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });

    const buttons = await page.$$('button');
    let unlabeledCount = 0;
    const sampledCount = Math.min(30, buttons.length);

    for (let i = 0; i < sampledCount; i++) {
      const btn = buttons[i];
      const ariaLabel = await btn.getAttribute('aria-label');
      const textContent = await btn.textContent();
      const hasLabel = ariaLabel || (textContent && textContent.trim().length > 0);

      if (!hasLabel) {
        unlabeledCount++;
        const btnClass = await btn.getAttribute('class');
        findings.elements.push({
          type: 'unlabeled_button',
          class: btnClass,
          index: i,
          visible: await btn.isVisible()
        });
      }
    }

    findings.accessibility.push({
      test: 'Button ARIA labels',
      unlabeledCount,
      sampledCount
    });

    // Test 9: Console errors
    console.log('📋 Checking console for errors...');
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        findings.errors.push({
          type: msg.type(),
          text: msg.text()
        });
      }
    });

    // Generate report
    const timestamp = new Date().toISOString().split('T')[0];
    const reportPath = path.join(FINDINGS_DIR, `exhaustive-crawl-${timestamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(findings, null, 2));

    console.log('\n✅ QA crawl complete!');
    console.log(`📊 Report saved to: ${reportPath}`);
    console.log(`\n📈 Summary:`);
    console.log(`  - Pages tested: ${findings.pages.length}`);
    console.log(`  - Screenshots: ${findings.screenshots.length}`);
    console.log(`  - Accessibility issues: ${findings.accessibility[0]?.unlabeledCount || 0}`);
    console.log(`  - Console errors: ${findings.errors.length}`);

  } catch (error) {
    console.error('❌ Error during crawl:', error);
    findings.errors.push({
      type: 'fatal',
      text: error.message,
      stack: error.stack
    });
  } finally {
    await browser.close();
  }
}

async function countElements(page) {
  return {
    buttons: await page.$$eval('button', els => els.length),
    inputs: await page.$$eval('input', els => els.length),
    links: await page.$$eval('a', els => els.length),
    modals: await page.$$eval('[role="dialog"]', els => els.length),
    total: await page.$$eval('*', els => els.length)
  };
}

crawlApp().catch(console.error);
