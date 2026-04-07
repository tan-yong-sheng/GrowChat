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

async function deepInteractionTest() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const findings = {
    timestamp: new Date().toISOString(),
    issues: [],
    tests: [],
    interactionLog: []
  };

  // Capture console messages
  const consoleMessages = [];
  page.on('console', msg => {
    consoleMessages.push({
      type: msg.type(),
      text: msg.text()
    });
  });

  // Capture page errors
  page.on('pageerror', error => {
    findings.issues.push({
      severity: 'HIGH',
      type: 'Page error',
      details: error.message,
      stack: error.stack
    });
  });

  try {
    console.log('🔍 Starting deep interaction testing...\n');

    // Test 1: Auth page interactions
    console.log('📋 Test 1: Auth page form interactions');
    await page.goto(`${BASE_URL}/auth.html`);
    await page.waitForLoadState('networkidle');

    // Test empty form submission
    const submitBtn = await page.$('#auth-submit');
    if (submitBtn) {
      const isDisabled = await submitBtn.getAttribute('disabled');
      findings.tests.push({
        name: 'Submit button disabled on empty form',
        passed: isDisabled !== null,
        details: isDisabled ? 'Button is disabled' : 'Button is enabled (potential issue)'
      });
    }

    // Test form validation
    const emailInput = await page.$('#email');
    if (emailInput) {
      await emailInput.fill('invalid-email');
      const validity = await emailInput.evaluate(el => el.validity.valid);
      findings.tests.push({
        name: 'Email input validation',
        passed: !validity,
        details: validity ? 'Invalid email accepted (BUG)' : 'Invalid email rejected'
      });
    }

    // Test login
    console.log('📋 Test 2: Login workflow');
    const passwordInput = await page.$('#password');
    if (emailInput && passwordInput && submitBtn) {
      await emailInput.fill(TEST_EMAIL);
      await passwordInput.fill(TEST_PASSWORD);
      await submitBtn.click();

      try {
        await page.waitForNavigation({ timeout: 5000 });
      } catch (e) {}

      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);

      const loggedIn = !page.url().includes('auth');
      findings.tests.push({
        name: 'Login successful',
        passed: loggedIn,
        details: loggedIn ? 'Redirected to main page' : 'Login failed'
      });
    }

    if (!page.url().includes('auth')) {
      // Test 3: Sidebar interactions
      console.log('📋 Test 3: Sidebar interactions');
      const toggleBtn = await page.$('#toggle-sidebar-desktop');
      if (toggleBtn) {
        const initialState = await page.evaluate(() => {
          const sidebar = document.querySelector('#sidebar');
          return window.getComputedStyle(sidebar).marginLeft;
        });

        await toggleBtn.click();
        await page.waitForTimeout(300);

        const afterToggle = await page.evaluate(() => {
          const sidebar = document.querySelector('#sidebar');
          return window.getComputedStyle(sidebar).marginLeft;
        });

        findings.tests.push({
          name: 'Sidebar toggle functionality',
          passed: initialState !== afterToggle,
          details: initialState !== afterToggle ? 'Sidebar toggles' : 'Sidebar does not toggle'
        });
      }

      // Test 4: Search modal
      console.log('📋 Test 4: Search modal interactions');
      const searchBtn = await page.$('#open-search');
      if (searchBtn) {
        await searchBtn.click();
        await page.waitForTimeout(300);

        const modal = await page.$('[role="dialog"]');
        const modalVisible = modal && await modal.isVisible();

        findings.tests.push({
          name: 'Search modal opens',
          passed: modalVisible,
          details: modalVisible ? 'Modal visible' : 'Modal not visible'
        });

        if (modalVisible) {
          // Try to close modal
          const closeBtn = await page.$('[aria-label="Close"]');
          if (closeBtn) {
            await closeBtn.click();
            await page.waitForTimeout(300);

            const stillVisible = await modal.isVisible().catch(() => false);
            findings.tests.push({
              name: 'Search modal closes',
              passed: !stillVisible,
              details: !stillVisible ? 'Modal closed' : 'Modal still visible'
            });
          }
        }
      }

      // Test 5: New chat button
      console.log('📋 Test 5: New chat button');
      const newChatBtn = await page.$('#new-chat');
      if (newChatBtn) {
        const initialUrl = page.url();
        await newChatBtn.click();
        await page.waitForTimeout(500);

        const urlChanged = page.url() !== initialUrl;
        findings.tests.push({
          name: 'New chat creates new URL',
          passed: urlChanged,
          details: urlChanged ? 'New chat URL created' : 'URL unchanged'
        });
      }

      // Test 6: User profile menu
      console.log('📋 Test 6: User profile menu');
      const userProfileArea = await page.$('.user-profile-footer');
      if (userProfileArea) {
        const visible = await userProfileArea.isVisible();
        findings.tests.push({
          name: 'User profile area visible',
          passed: visible,
          details: visible ? 'Profile area visible' : 'Profile area not visible'
        });

        // Try to find and click settings button
        const settingsBtn = await page.evaluate(() => {
          const buttons = document.querySelectorAll('button');
          for (let btn of buttons) {
            const text = btn.textContent?.toLowerCase();
            if (text && text.includes('settings')) return true;
          }
          return false;
        });

        findings.tests.push({
          name: 'Settings button accessible',
          passed: settingsBtn,
          details: settingsBtn ? 'Settings button found' : 'Settings button not found'
        });
      }

      // Test 7: Message input
      console.log('📋 Test 7: Message input field');
      const messageInput = await page.$('textarea#message-input');
      if (messageInput) {
        const visible = await messageInput.isVisible();
        findings.tests.push({
          name: 'Message input visible',
          passed: visible,
          details: visible ? 'Input visible' : 'Input not visible'
        });

        // Test typing
        if (visible) {
          await messageInput.fill('Test message');
          const value = await messageInput.inputValue();
          findings.tests.push({
            name: 'Message input accepts text',
            passed: value === 'Test message',
            details: value === 'Test message' ? 'Text entered' : 'Text not entered'
          });
        }
      }

      // Test 8: Keyboard navigation
      console.log('📋 Test 8: Keyboard navigation');
      await page.keyboard.press('Tab');
      const focusedElement = await page.evaluate(() => {
        const el = document.activeElement;
        return {
          tagName: el?.tagName,
          id: el?.id,
          hasAriaLabel: !!el?.getAttribute('aria-label')
        };
      });

      findings.tests.push({
        name: 'Tab key focuses element',
        passed: !!focusedElement.tagName,
        details: focusedElement.tagName ? `Focused on ${focusedElement.tagName}` : 'No focus'
      });

      // Test 9: Responsive design
      console.log('📋 Test 9: Responsive design');
      const viewports = [
        { width: 375, height: 812, name: 'mobile' },
        { width: 768, height: 1024, name: 'tablet' }
      ];

      for (const viewport of viewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(`${BASE_URL}/`);
        await page.waitForLoadState('networkidle');

        const layoutOk = await page.evaluate(() => {
          const elements = document.querySelectorAll('*');
          for (let el of elements) {
            const rect = el.getBoundingClientRect();
            if (rect.width > window.innerWidth + 1) {
              return false;
            }
          }
          return true;
        });

        findings.tests.push({
          name: `Responsive layout at ${viewport.width}px`,
          passed: layoutOk,
          details: layoutOk ? 'No overflow' : 'Elements overflow viewport'
        });
      }

      // Reset viewport
      await page.setViewportSize({ width: 1280, height: 720 });
    }

    // Test 10: Console health
    console.log('📋 Test 10: Console health check');
    const errors = consoleMessages.filter(m => m.type === 'error');
    const warnings = consoleMessages.filter(m => m.type === 'warning');

    findings.tests.push({
      name: 'No console errors',
      passed: errors.length === 0,
      details: `Errors: ${errors.length}, Warnings: ${warnings.length}`
    });

    if (errors.length > 0) {
      errors.slice(0, 3).forEach(err => {
        findings.issues.push({
          severity: 'HIGH',
          type: 'Console error',
          details: err.text
        });
      });
    }

    // Summary
    console.log('\n\n📊 Deep Interaction Test Results:');
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
    const reportPath = path.join(FINDINGS_DIR, `deep-interaction-${timestamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(findings, null, 2));

    console.log(`\n✅ Report saved to: ${reportPath}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

deepInteractionTest();
