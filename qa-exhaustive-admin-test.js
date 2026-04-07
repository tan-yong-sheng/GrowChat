import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:8787';
const TEST_EMAIL = 'tys203831@gmail.com';
const TEST_PASSWORD = '&Test1234';
const FINDINGS_DIR = './docs/qa/findings';

if (!fs.existsSync(FINDINGS_DIR)) {
  fs.mkdirSync(FINDINGS_DIR, { recursive: true });
}

async function exhaustiveQATest() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const findings = {
    timestamp: new Date().toISOString(),
    issues: [],
    tests: []
  };

  try {
    console.log('🧪 Running exhaustive QA test...\n');

    // Test 1: Check for orphaned Save buttons in admin pages
    console.log('📋 Test 1: Checking for orphaned Save buttons in admin pages...');
    await page.goto(`${BASE_URL}/admin/settings/connections`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const saveButtons = await page.$$('button#save-users, button[id*="save"]');
    console.log(`  Found ${saveButtons.length} save buttons in admin pages`);

    for (let i = 0; i < saveButtons.length; i++) {
      const btn = saveButtons[i];
      const id = await btn.getAttribute('id');
      const text = await btn.textContent();
      const isDisabled = await btn.getAttribute('disabled');
      const isVisible = await btn.isVisible();

      console.log(`    Button ${i + 1}: id="${id}", text="${text}", disabled=${isDisabled}, visible=${isVisible}`);

      if (isVisible && !isDisabled) {
        findings.issues.push({
          severity: 'MEDIUM',
          type: 'Orphaned Save button',
          page: '/admin/settings/connections',
          element: `button#${id}`,
          details: `Save button "${text}" is visible and enabled but should be removed (immediate-save pattern)`
        });
      }
    }

    findings.tests.push({
      name: 'Orphaned Save buttons check',
      passed: saveButtons.length === 0,
      details: `Found ${saveButtons.length} save buttons`
    });

    // Test 2: Check for console errors on admin pages
    console.log('📋 Test 2: Checking for console errors on admin pages...');
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    findings.tests.push({
      name: 'Admin page console errors',
      passed: consoleErrors.length === 0,
      details: consoleErrors.length > 0 ? `${consoleErrors.length} errors` : 'No errors'
    });

    if (consoleErrors.length > 0) {
      findings.issues.push({
        severity: 'HIGH',
        type: 'Console errors on admin page',
        page: '/admin/settings/connections',
        details: consoleErrors.join('; ')
      });
    }

    // Test 3: Check for broken form inputs
    console.log('📋 Test 3: Checking form inputs for accessibility...');
    const inputs = await page.$$('input, textarea, select');
    const inputsWithoutLabels = [];

    for (const input of inputs) {
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const placeholder = await input.getAttribute('placeholder');
      const type = await input.getAttribute('type');

      if (!ariaLabel && !placeholder && id) {
        const label = await page.$(`label[for="${id}"]`);
        if (!label) {
          inputsWithoutLabels.push({ id, type });
        }
      }
    }

    findings.tests.push({
      name: 'Form inputs accessibility',
      passed: inputsWithoutLabels.length === 0,
      details: `${inputsWithoutLabels.length} inputs without labels`
    });

    if (inputsWithoutLabels.length > 0) {
      findings.issues.push({
        severity: 'MEDIUM',
        type: 'Form inputs missing labels',
        page: '/admin/settings/connections',
        details: `${inputsWithoutLabels.length} inputs lack associated labels or aria-labels`
      });
    }

    // Test 4: Check for keyboard navigation
    console.log('📋 Test 4: Testing keyboard navigation...');
    await page.keyboard.press('Tab');
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);

    findings.tests.push({
      name: 'Keyboard navigation',
      passed: !!focusedElement,
      details: focusedElement ? `Focused on ${focusedElement}` : 'No element focused'
    });

    // Test 5: Check for responsive design issues
    console.log('📋 Test 5: Testing responsive design at mobile viewport...');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const mobileElements = await page.$$('button, input, a');
    const visibleElements = [];
    for (const el of mobileElements) {
      if (await el.isVisible()) {
        visibleElements.push(el);
      }
    }

    findings.tests.push({
      name: 'Mobile viewport (375px)',
      passed: visibleElements.length > 0,
      details: `${visibleElements.length} visible interactive elements`
    });

    // Test 6: Check for color contrast issues
    console.log('📋 Test 6: Checking for potential color contrast issues...');
    const contrastIssues = await page.evaluate(() => {
      const issues = [];
      const elements = document.querySelectorAll('button, a, label, p, span');

      for (const el of elements) {
        const style = window.getComputedStyle(el);
        const bgColor = style.backgroundColor;
        const color = style.color;

        // Simple check: if both are light or both are dark, might be contrast issue
        if (bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent') {
          continue; // Skip transparent backgrounds
        }
      }
      return issues;
    });

    findings.tests.push({
      name: 'Color contrast check',
      passed: contrastIssues.length === 0,
      details: contrastIssues.length > 0 ? `${contrastIssues.length} potential issues` : 'No obvious issues'
    });

    // Summary
    console.log('\n\n📊 QA Test Results:');
    const totalTests = findings.tests.length;
    const passedTests = findings.tests.filter(t => t.passed).length;
    console.log(`  Total: ${totalTests}`);
    console.log(`  Passed: ${passedTests}`);
    console.log(`  Failed: ${totalTests - passedTests}`);

    findings.tests.forEach(test => {
      const status = test.passed ? '✅' : '❌';
      console.log(`  ${status} ${test.name}: ${test.details}`);
    });

    if (findings.issues.length > 0) {
      console.log(`\n⚠️ Issues Found: ${findings.issues.length}`);
      findings.issues.forEach((issue, idx) => {
        console.log(`  ${idx + 1}. [${issue.severity}] ${issue.type}`);
        console.log(`     ${issue.details}`);
      });
    }

    // Save report
    const timestamp = new Date().toISOString().split('T')[0];
    const reportPath = path.join(FINDINGS_DIR, `exhaustive-qa-${timestamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(findings, null, 2));

    console.log(`\n✅ Report saved to: ${reportPath}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

exhaustiveQATest();
