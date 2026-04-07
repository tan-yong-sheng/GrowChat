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

async function runComprehensiveTests() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const findings = {
    timestamp: new Date().toISOString(),
    tests: [],
    issues: [],
    summary: {}
  };

  try {
    console.log('🧪 Starting comprehensive QA tests...\n');

    // Test 1: Console errors on auth page
    console.log('📋 Test 1: Checking for console errors on auth page...');
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`${BASE_URL}/auth.html`);
    await page.waitForLoadState('networkidle');

    findings.tests.push({
      name: 'Auth page console errors',
      passed: consoleErrors.length === 0,
      details: consoleErrors.length > 0 ? consoleErrors : 'No errors'
    });

    if (consoleErrors.length > 0) {
      findings.issues.push({
        severity: 'HIGH',
        type: 'Console Error',
        page: '/auth.html',
        details: consoleErrors.join('; ')
      });
    }

    // Test 2: Form validation
    console.log('📋 Test 2: Testing form validation...');
    const emailInput = await page.$('input[type="email"]');
    const passwordInput = await page.$('input[type="password"]');

    if (emailInput && passwordInput) {
      // Check for autocomplete attributes
      const emailAutocomplete = await emailInput.getAttribute('autocomplete');
      const passwordAutocomplete = await passwordInput.getAttribute('autocomplete');

      findings.tests.push({
        name: 'Form autocomplete attributes',
        passed: emailAutocomplete && passwordAutocomplete,
        details: {
          email: emailAutocomplete,
          password: passwordAutocomplete
        }
      });
    }

    // Test 3: Responsive design at mobile viewport
    console.log('📋 Test 3: Testing responsive design (375px)...');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE_URL}/auth.html`);
    await page.waitForLoadState('networkidle');

    const mobileElements = await page.$$('input, button');
    const visibleElements = [];
    for (const el of mobileElements) {
      if (await el.isVisible()) {
        visibleElements.push(el);
      }
    }

    findings.tests.push({
      name: 'Mobile viewport (375px) - visible elements',
      passed: visibleElements.length > 0,
      details: `${visibleElements.length} visible elements`
    });

    // Test 4: Login flow
    console.log('📋 Test 4: Testing login flow...');
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${BASE_URL}/auth.html`);
    await page.waitForLoadState('networkidle');

    try {
      const emailInputs = await page.$$('input[type="email"]');
      const passwordInputs = await page.$$('input[type="password"]');

      if (emailInputs.length > 0 && passwordInputs.length > 0) {
        await emailInputs[0].fill(TEST_EMAIL);
        await passwordInputs[0].fill(TEST_PASSWORD);

        const form = await emailInputs[0].evaluateHandle(el => el.closest('form'));
        const submitBtn = await form.evaluateHandle(f => f?.querySelector('button[type="submit"]'));

        if (submitBtn) {
          await submitBtn.click();
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
          await page.waitForTimeout(1000);

          const currentUrl = page.url();
          const loginSuccessful = !currentUrl.includes('/auth');

          findings.tests.push({
            name: 'Login flow',
            passed: loginSuccessful,
            details: `Redirected to: ${currentUrl}`
          });

          if (loginSuccessful) {
            // Test 5: Main page elements
            console.log('📋 Test 5: Checking main page elements...');
            const sidebar = await page.$('#sidebar');
            const chatList = await page.$('#chat-list');
            const messageInput = await page.$('[data-testid="message-input"], textarea, input[placeholder*="message" i]');

            findings.tests.push({
              name: 'Main page elements',
              passed: !!(sidebar && messageInput),
              details: {
                sidebar: !!sidebar,
                chatList: !!chatList,
                messageInput: !!messageInput
              }
            });

            // Test 6: Sidebar toggle button
            console.log('📋 Test 6: Testing sidebar toggle button...');
            const toggleBtn = await page.$('#toggle-sidebar-desktop');
            if (toggleBtn) {
              const ariaLabel = await toggleBtn.getAttribute('aria-label');
              findings.tests.push({
                name: 'Sidebar toggle accessibility',
                passed: !!ariaLabel,
                details: `aria-label: "${ariaLabel}"`
              });
            }

            // Test 7: Search functionality
            console.log('📋 Test 7: Testing search modal...');
            const searchBtn = await page.$('#open-search');
            if (searchBtn) {
              await searchBtn.click();
              await page.waitForTimeout(500);

              const searchModal = await page.$('[role="dialog"]');
              findings.tests.push({
                name: 'Search modal opens',
                passed: !!searchModal,
                details: searchModal ? 'Modal visible' : 'Modal not found'
              });

              // Close modal
              const closeBtn = await page.$('[aria-label="Close"]');
              if (closeBtn) await closeBtn.click();
            }

            // Test 8: New chat button
            console.log('📋 Test 8: Testing new chat button...');
            const newChatBtn = await page.$('#new-chat');
            if (newChatBtn) {
              const isVisible = await newChatBtn.isVisible();
              findings.tests.push({
                name: 'New chat button visible',
                passed: isVisible,
                details: isVisible ? 'Button visible' : 'Button hidden'
              });
            }
          }
        }
      }
    } catch (error) {
      findings.tests.push({
        name: 'Login flow',
        passed: false,
        details: error.message
      });
    }

    // Summary
    const totalTests = findings.tests.length;
    const passedTests = findings.tests.filter(t => t.passed).length;
    const failedTests = totalTests - passedTests;

    findings.summary = {
      totalTests,
      passedTests,
      failedTests,
      passRate: `${Math.round((passedTests / totalTests) * 100)}%`
    };

    console.log('\n\n📊 Test Results:');
    console.log(`  Total: ${totalTests}`);
    console.log(`  Passed: ${passedTests}`);
    console.log(`  Failed: ${failedTests}`);
    console.log(`  Pass Rate: ${findings.summary.passRate}`);

    if (findings.issues.length > 0) {
      console.log(`\n⚠️ Issues Found: ${findings.issues.length}`);
      findings.issues.forEach((issue, idx) => {
        console.log(`  ${idx + 1}. [${issue.severity}] ${issue.type} on ${issue.page}`);
        console.log(`     ${issue.details}`);
      });
    }

    // Save report
    const timestamp = new Date().toISOString().split('T')[0];
    const reportPath = path.join(FINDINGS_DIR, `comprehensive-test-${timestamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(findings, null, 2));

    console.log(`\n✅ Report saved to: ${reportPath}`);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    findings.issues.push({
      severity: 'CRITICAL',
      type: 'Test Execution Error',
      details: error.message
    });
  } finally {
    await browser.close();
  }
}

runComprehensiveTests();
