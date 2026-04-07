import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:8787';
const TEST_EMAIL = 'tys203831@gmail.com';
const TEST_PASSWORD = '&Test1234';
const FINDINGS_DIR = './docs/qa/findings';
const SCREENSHOTS_DIR = './docs/qa/screenshots';

if (!fs.existsSync(FINDINGS_DIR)) {
  fs.mkdirSync(FINDINGS_DIR, { recursive: true });
}
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function deepResearchCrawl() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const findings = {
    timestamp: new Date().toISOString(),
    pages: [],
    interactiveElements: [],
    issues: [],
    consoleMessages: []
  };

  // Capture all console messages
  page.on('console', msg => {
    findings.consoleMessages.push({
      type: msg.type(),
      text: msg.text(),
      location: msg.location()
    });
  });

  try {
    console.log('🔍 Starting comprehensive page crawl...\n');

    // Test 1: Auth page
    console.log('📄 Crawling: Auth Page');
    await page.goto(`${BASE_URL}/auth.html`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    let pageData = await capturePageData(page, '/auth.html');
    findings.pages.push(pageData);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01-auth-page.png') });

    // Test 2: Login and navigate to main page
    console.log('📄 Crawling: Main Chat Page');
    const emailInput = await page.$('#email');
    const passwordInput = await page.$('#password');
    const submitBtn = await page.$('#auth-submit');

    if (emailInput && passwordInput && submitBtn) {
      await emailInput.fill(TEST_EMAIL);
      await passwordInput.fill(TEST_PASSWORD);
      await submitBtn.click();

      try {
        await page.waitForNavigation({ timeout: 5000 });
      } catch (e) {}

      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      pageData = await capturePageData(page, '/');
      findings.pages.push(pageData);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02-main-chat-page.png') });

      // Test 3: Admin pages
      const adminPages = [
        '/admin/users/overview',
        '/admin/system/general',
        '/admin/settings/connections',
        '/admin/settings/models',
        '/admin/settings/security'
      ];

      for (const adminPage of adminPages) {
        console.log(`📄 Crawling: ${adminPage}`);
        try {
          await page.goto(`${BASE_URL}${adminPage}`);
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(500);

          pageData = await capturePageData(page, adminPage);
          findings.pages.push(pageData);

          const screenshotName = adminPage.replace(/\//g, '-').substring(1) + '.png';
          await page.screenshot({ path: path.join(SCREENSHOTS_DIR, screenshotName) });
        } catch (error) {
          findings.issues.push({
            severity: 'MEDIUM',
            type: 'Page navigation error',
            page: adminPage,
            details: error.message
          });
        }
      }

      // Test 4: Test all interactive elements on main page
      console.log('\n🔘 Testing interactive elements...');
      await page.goto(`${BASE_URL}/`);
      await page.waitForLoadState('networkidle');

      const interactiveElements = await page.evaluate(() => {
        const elements = [];

        // Buttons
        document.querySelectorAll('button').forEach((btn, idx) => {
          elements.push({
            type: 'button',
            id: btn.getAttribute('id'),
            ariaLabel: btn.getAttribute('aria-label'),
            text: btn.textContent?.trim().substring(0, 50),
            visible: btn.offsetParent !== null,
            disabled: btn.hasAttribute('disabled')
          });
        });

        // Links
        document.querySelectorAll('a').forEach((link, idx) => {
          if (link.offsetParent !== null) {
            elements.push({
              type: 'link',
              href: link.getAttribute('href'),
              text: link.textContent?.trim().substring(0, 50),
              visible: true
            });
          }
        });

        // Form inputs
        document.querySelectorAll('input, textarea, select').forEach((input, idx) => {
          if (input.offsetParent !== null) {
            elements.push({
              type: input.tagName.toLowerCase(),
              id: input.getAttribute('id'),
              placeholder: input.getAttribute('placeholder'),
              type: input.getAttribute('type'),
              visible: true
            });
          }
        });

        return elements;
      });

      findings.interactiveElements = interactiveElements;
      console.log(`  Found ${interactiveElements.length} interactive elements`);

      // Test 5: Test keyboard navigation
      console.log('\n⌨️ Testing keyboard navigation...');
      await page.keyboard.press('Tab');
      const focusedElement = await page.evaluate(() => {
        const el = document.activeElement;
        return {
          tagName: el?.tagName,
          id: el?.id,
          ariaLabel: el?.getAttribute('aria-label')
        };
      });

      if (!focusedElement.tagName) {
        findings.issues.push({
          severity: 'MEDIUM',
          type: 'Keyboard navigation issue',
          page: '/',
          details: 'No element receives focus on Tab press'
        });
      }

      // Test 6: Test responsive design
      console.log('\n📱 Testing responsive design...');
      const viewports = [
        { width: 375, height: 812, name: 'mobile' },
        { width: 768, height: 1024, name: 'tablet' },
        { width: 1280, height: 720, name: 'desktop' }
      ];

      for (const viewport of viewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(`${BASE_URL}/`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(300);

        const layoutIssues = await page.evaluate(() => {
          const issues = [];
          const elements = document.querySelectorAll('*');

          for (let el of elements) {
            const rect = el.getBoundingClientRect();
            if (rect.width > window.innerWidth) {
              issues.push({
                element: el.tagName,
                id: el.id,
                overflow: rect.width - window.innerWidth
              });
            }
          }

          return issues;
        });

        if (layoutIssues.length > 0) {
          findings.issues.push({
            severity: 'HIGH',
            type: 'Responsive design issue',
            viewport: `${viewport.width}x${viewport.height}`,
            details: `${layoutIssues.length} elements overflow viewport`
          });
        }

        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `responsive-${viewport.name}.png`) });
      }

      // Reset to desktop
      await page.setViewportSize({ width: 1280, height: 720 });
    }

    // Summary
    console.log('\n\n📊 Deep Research Crawl Results:');
    console.log(`  Pages crawled: ${findings.pages.length}`);
    console.log(`  Interactive elements found: ${findings.interactiveElements.length}`);
    console.log(`  Issues found: ${findings.issues.length}`);
    console.log(`  Console messages: ${findings.consoleMessages.length}`);

    if (findings.issues.length > 0) {
      console.log('\n⚠️ Issues by severity:');
      const bySeverity = {};
      findings.issues.forEach(issue => {
        bySeverity[issue.severity] = (bySeverity[issue.severity] || 0) + 1;
      });
      Object.entries(bySeverity).forEach(([severity, count]) => {
        console.log(`  ${severity}: ${count}`);
      });
    }

    // Save report
    const timestamp = new Date().toISOString().split('T')[0];
    const reportPath = path.join(FINDINGS_DIR, `deep-research-crawl-${timestamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(findings, null, 2));

    console.log(`\n✅ Report saved to: ${reportPath}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

async function capturePageData(page, url) {
  const pageData = {
    url,
    title: await page.title(),
    buttons: 0,
    links: 0,
    forms: 0,
    modals: 0,
    errors: []
  };

  const counts = await page.evaluate(() => {
    return {
      buttons: document.querySelectorAll('button').length,
      links: document.querySelectorAll('a').length,
      forms: document.querySelectorAll('form').length,
      modals: document.querySelectorAll('[role="dialog"]').length
    };
  });

  pageData.buttons = counts.buttons;
  pageData.links = counts.links;
  pageData.forms = counts.forms;
  pageData.modals = counts.modals;

  return pageData;
}

deepResearchCrawl();
