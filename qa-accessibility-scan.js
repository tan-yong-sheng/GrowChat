import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:8787';
const FINDINGS_DIR = './docs/qa/findings';

if (!fs.existsSync(FINDINGS_DIR)) {
  fs.mkdirSync(FINDINGS_DIR, { recursive: true });
}

async function scanForAdditionalIssues() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const issues = [];

  try {
    console.log('🔍 Scanning for additional UI/UX issues...\n');

    // Check auth page
    console.log('📄 Checking auth page...');
    await page.goto(`${BASE_URL}/auth.html`);
    await page.waitForLoadState('networkidle');

    // Check for form labels
    const inputs = await page.$$('input');
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const placeholder = await input.getAttribute('placeholder');
      const type = await input.getAttribute('type');

      if (!ariaLabel && !placeholder && id) {
        const label = await page.$(`label[for="${id}"]`);
        if (!label) {
          issues.push({
            severity: 'MEDIUM',
            type: 'Missing form label',
            page: '/auth.html',
            element: `input[type="${type}"][id="${id}"]`,
            details: 'Input has no associated label, aria-label, or placeholder'
          });
        }
      }
    }

    // Check for color contrast on buttons
    const buttons = await page.$$('button');
    console.log(`  Found ${buttons.length} buttons on auth page`);

    // Check for keyboard navigation
    console.log('📋 Testing keyboard navigation...');
    await page.keyboard.press('Tab');
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    if (!focusedElement) {
      issues.push({
        severity: 'HIGH',
        type: 'Keyboard navigation broken',
        page: '/auth.html',
        details: 'Tab key does not focus any element'
      });
    }

    // Check for focus visible styles
    const focusedBtn = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      const styles = window.getComputedStyle(el);
      return {
        outline: styles.outline,
        boxShadow: styles.boxShadow,
        hasFocusVisible: el.matches(':focus-visible')
      };
    });

    if (focusedBtn && focusedBtn.outline === 'none' && focusedBtn.boxShadow === 'none') {
      issues.push({
        severity: 'MEDIUM',
        type: 'Missing focus visible indicator',
        page: '/auth.html',
        details: 'Focused element has no visible focus indicator'
      });
    }

    // Check viewport meta tag
    const viewportMeta = await page.$('meta[name="viewport"]');
    if (!viewportMeta) {
      issues.push({
        severity: 'HIGH',
        type: 'Missing viewport meta tag',
        page: '/auth.html',
        details: 'Responsive design may not work on mobile devices'
      });
    }

    // Check for lang attribute
    const htmlLang = await page.evaluate(() => document.documentElement.getAttribute('lang'));
    if (!htmlLang) {
      issues.push({
        severity: 'LOW',
        type: 'Missing lang attribute',
        page: '/auth.html',
        details: 'HTML element should have lang attribute for accessibility'
      });
    }

    // Check main page
    console.log('📄 Checking main page...');
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Check for main landmark
    const main = await page.$('main');
    if (!main) {
      issues.push({
        severity: 'MEDIUM',
        type: 'Missing main landmark',
        page: '/',
        details: 'Page should have a <main> element for semantic structure'
      });
    }

    // Check for heading hierarchy
    const h1s = await page.$$('h1');
    const h2s = await page.$$('h2');
    if (h1s.length === 0) {
      issues.push({
        severity: 'MEDIUM',
        type: 'Missing h1 heading',
        page: '/',
        details: 'Page should have at least one h1 heading'
      });
    }

    // Check for skip link
    const skipLink = await page.$('a[href="#main"], a[href="#content"]');
    if (!skipLink) {
      issues.push({
        severity: 'LOW',
        type: 'Missing skip link',
        page: '/',
        details: 'Page should have a skip-to-content link for keyboard users'
      });
    }

    // Check for images without alt text
    const images = await page.$$('img');
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const alt = await img.getAttribute('alt');
      const src = await img.getAttribute('src');
      const ariaHidden = await img.getAttribute('aria-hidden');

      if (!alt && !ariaHidden && src && !src.includes('data:')) {
        issues.push({
          severity: 'MEDIUM',
          type: 'Image missing alt text',
          page: '/',
          element: `img[src="${src}"]`,
          details: 'Images should have alt text or aria-hidden="true"'
        });
      }
    }

    // Summary
    console.log('\n\n📊 Issues Found:');
    const bySeverity = {};
    issues.forEach(issue => {
      bySeverity[issue.severity] = (bySeverity[issue.severity] || 0) + 1;
      console.log(`  [${issue.severity}] ${issue.type} on ${issue.page}`);
      console.log(`    ${issue.details}`);
    });

    console.log('\n📈 Summary by severity:');
    Object.entries(bySeverity).forEach(([severity, count]) => {
      console.log(`  ${severity}: ${count}`);
    });

    // Save report
    const timestamp = new Date().toISOString().split('T')[0];
    const reportPath = path.join(FINDINGS_DIR, `accessibility-scan-${timestamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify({ timestamp: new Date().toISOString(), issues }, null, 2));

    console.log(`\n✅ Report saved to: ${reportPath}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

scanForAdditionalIssues();
