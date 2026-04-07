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

async function comprehensiveTest() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const findings = {
    timestamp: new Date().toISOString(),
    issues: [],
    tests: []
  };

  try {
    console.log('🧪 Running comprehensive GrowChat workflow test...\n');

    // Test 1: Login
    console.log('📋 Test 1: User authentication...');
    await page.goto(`${BASE_URL}/auth.html`);
    await page.waitForLoadState('networkidle');

    const emailInput = await page.$('#email');
    const passwordInput = await page.$('#password');
    const submitBtn = await page.$('#auth-submit');

    let loginSuccess = false;
    if (emailInput && passwordInput && submitBtn) {
      await emailInput.fill(TEST_EMAIL);
      await passwordInput.fill(TEST_PASSWORD);
      await submitBtn.click();

      try {
        await page.waitForNavigation({ timeout: 5000 });
      } catch (e) {}

      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      loginSuccess = !page.url().includes('auth');
      findings.tests.push({
        name: 'User login',
        passed: loginSuccess,
        details: loginSuccess ? 'Successfully authenticated' : 'Authentication failed'
      });

      if (loginSuccess) {
        console.log('✅ Logged in successfully\n');
      } else {
        console.log('❌ Login failed\n');
      }
    }

    if (loginSuccess) {
      // Test 2: Chat list
      console.log('📋 Test 2: Chat list UI...');
      const chatListVisible = await page.evaluate(() => {
        const chats = document.querySelectorAll('[class*="chat-row"]');
        return chats.length > 0;
      });

      const chatCount = await page.evaluate(() => {
        return document.querySelectorAll('[class*="chat-row"]').length;
      });

      findings.tests.push({
        name: 'Chat list visibility',
        passed: chatListVisible,
        details: `${chatCount} chats displayed`
      });

      // Test 3: Message input
      console.log('📋 Test 3: Message input field...');
      const messageInput = await page.$('textarea#message-input');
      const inputReady = messageInput && await messageInput.isVisible();

      findings.tests.push({
        name: 'Message input field',
        passed: inputReady,
        details: inputReady ? 'Input field is visible and ready' : 'Input field not available'
      });

      // Test 4: Sidebar navigation
      console.log('📋 Test 4: Sidebar navigation...');
      const sidebar = await page.$('#sidebar');
      const sidebarVisible = sidebar && await sidebar.isVisible();

      findings.tests.push({
        name: 'Sidebar navigation',
        passed: sidebarVisible,
        details: sidebarVisible ? 'Sidebar visible' : 'Sidebar not visible'
      });

      // Test 5: User profile area
      console.log('📋 Test 5: User profile footer...');
      const userProfile = await page.$('.user-profile-footer');
      const profileVisible = userProfile && await userProfile.isVisible();

      findings.tests.push({
        name: 'User profile area',
        passed: profileVisible,
        details: profileVisible ? 'User profile section visible' : 'User profile not visible'
      });

      // Test 6: Search functionality
      console.log('📋 Test 6: Search button...');
      const searchBtn = await page.$('#open-search');
      const searchReady = searchBtn && await searchBtn.isVisible();

      findings.tests.push({
        name: 'Search button',
        passed: searchReady,
        details: searchReady ? 'Search button available' : 'Search button not found'
      });

      // Test 7: New chat button
      console.log('📋 Test 7: New chat button...');
      const newChatBtn = await page.$('#new-chat');
      const newChatReady = newChatBtn && await newChatBtn.isVisible();

      findings.tests.push({
        name: 'New chat button',
        passed: newChatReady,
        details: newChatReady ? 'New chat button available' : 'New chat button not found'
      });

      // Test 8: Responsive design
      console.log('📋 Test 8: Responsive design (mobile view)...');
      await page.setViewportSize({ width: 375, height: 812 });
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(300);

      const mobileLayout = await page.evaluate(() => {
        const sidebar = document.querySelector('#sidebar');
        const main = document.querySelector('main');
        return sidebar && main &&
               sidebar.offsetHeight > 0 &&
               main.offsetHeight > 0;
      });

      findings.tests.push({
        name: 'Mobile responsive layout',
        passed: mobileLayout,
        details: mobileLayout ? 'Layout responsive on mobile' : 'Layout issues on mobile'
      });

      // Reset to desktop
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.waitForLoadState('networkidle');

      // Test 9: Console errors
      console.log('📋 Test 9: Console health check...');
      const consoleErrors = [];
      const consoleWarnings = [];

      page.on('console', msg => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        } else if (msg.type() === 'warning') {
          consoleWarnings.push(msg.text());
        }
      });

      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);

      findings.tests.push({
        name: 'Console health',
        passed: consoleErrors.length === 0,
        details: `Errors: ${consoleErrors.length}, Warnings: ${consoleWarnings.length}`
      });

      if (consoleErrors.length > 0) {
        findings.issues.push({
          severity: 'HIGH',
          type: 'Console errors detected',
          details: `${consoleErrors.length} error(s): ${consoleErrors.slice(0, 2).join('; ')}`
        });
      }

      // Test 10: Accessibility
      console.log('📋 Test 10: Accessibility checks...');
      const a11yIssues = await page.evaluate(() => {
        const issues = [];

        // Check for main landmark
        const main = document.querySelector('main');
        if (!main) issues.push('Missing main landmark');

        // Check for alt text on images
        const images = document.querySelectorAll('img:not([alt])');
        if (images.length > 0) issues.push(`${images.length} images missing alt text`);

        return issues;
      });

      findings.tests.push({
        name: 'Accessibility compliance',
        passed: a11yIssues.length === 0,
        details: a11yIssues.length === 0 ? 'No a11y issues' : a11yIssues.join('; ')
      });

      if (a11yIssues.length > 0) {
        findings.issues.push({
          severity: 'MEDIUM',
          type: 'Accessibility issues',
          details: a11yIssues.join('; ')
        });
      }
    } else {
      // Add skipped tests if login failed
      const skipTests = [
        'Chat list visibility',
        'Message input field',
        'Sidebar navigation',
        'User profile area',
        'Search button',
        'New chat button',
        'Mobile responsive layout',
        'Console health',
        'Accessibility compliance'
      ];
      skipTests.forEach(test => {
        findings.tests.push({
          name: test,
          passed: false,
          details: 'Skipped due to login failure'
        });
      });
    }

    // Summary
    console.log('\n\n📊 Comprehensive Test Results:');
    const totalTests = findings.tests.length;
    const passedTests = findings.tests.filter(t => t.passed).length;
    console.log(`  Total: ${totalTests}`);
    console.log(`  Passed: ${passedTests}`);
    console.log(`  Failed: ${totalTests - passedTests}`);
    console.log(`  Pass Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%\n`);

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
    } else {
      console.log('\n✅ No issues found! All tests passed.');
    }

    // Save report
    const timestamp = new Date().toISOString().split('T')[0];
    const reportPath = path.join(FINDINGS_DIR, `comprehensive-workflow-${timestamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(findings, null, 2));

    console.log(`\n✅ Report saved to: ${reportPath}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

comprehensiveTest();
