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

async function chatWorkflowTest() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const findings = {
    timestamp: new Date().toISOString(),
    issues: [],
    tests: []
  };

  try {
    console.log('🧪 Testing chat workflow and message operations...\n');

    // Test 1: Login
    console.log('📋 Test 1: User login...');
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
        name: 'User login successful',
        passed: loginSuccess,
        details: loginSuccess ? 'Logged in and redirected to main page' : 'Login failed'
      });
    }

    if (!loginSuccess) {
      console.log('❌ Login failed, skipping remaining tests');
      const skipTests = ['Chat creation', 'Message sending', 'Message history', 'Chat list in sidebar', 'No console errors'];
      skipTests.forEach(test => {
        findings.tests.push({
          name: test,
          passed: false,
          details: 'Skipped due to login failure'
        });
      });
    } else {
      // Test 2: Chat list exists
      console.log('📋 Test 2: Chat list in sidebar...');
      const chatListVisible = await page.evaluate(() => {
        const chatItems = document.querySelectorAll('[class*="chat-row"], [class*="chat-item"]');
        return chatItems.length > 0;
      });

      const chatCount = await page.evaluate(() => {
        const chatItems = document.querySelectorAll('[class*="chat-row"], [class*="chat-item"]');
        return chatItems.length;
      });

      findings.tests.push({
        name: 'Chat list in sidebar',
        passed: chatListVisible,
        details: `${chatCount} chats visible`
      });

      // Test 3: Message input visible
      console.log('📋 Test 3: Message input field...');
      const messageInput = await page.$('input[placeholder*="Message"], [role="textbox"]');
      const inputVisible = await messageInput?.isVisible() || false;

      findings.tests.push({
        name: 'Message input visible',
        passed: inputVisible,
        details: inputVisible ? 'Input field found' : 'Input field not found'
      });

      // Test 4: Send button exists
      console.log('📋 Test 4: Send button...');
      const sendBtn = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (let btn of buttons) {
          const ariaLabel = btn.getAttribute('aria-label');
          if (ariaLabel && ariaLabel.toLowerCase().includes('send')) return true;
        }
        return false;
      });

      findings.tests.push({
        name: 'Send button exists',
        passed: sendBtn,
        details: sendBtn ? 'Send button found' : 'Send button not found'
      });

      // Test 5: Model selector exists
      console.log('📋 Test 5: Model selector...');
      const modelSelector = await page.evaluate(() => {
        const select = document.querySelector('select');
        if (select) return true;
        const dropdowns = document.querySelectorAll('[class*="model"], [class*="dropdown"]');
        return dropdowns.length > 0;
      });

      findings.tests.push({
        name: 'Model selector',
        passed: modelSelector,
        details: modelSelector ? 'Model selector found' : 'Model selector not found'
      });

      // Test 6: User menu exists
      console.log('📋 Test 6: User profile menu...');
      const userMenu = await page.$('#user-profile-button, [aria-label*="User"], [aria-label*="Profile"]');
      const menuExists = !!userMenu;

      findings.tests.push({
        name: 'User profile menu',
        passed: menuExists,
        details: menuExists ? 'User menu found' : 'User menu not found'
      });

      // Test 7: Check for console errors
      console.log('📋 Test 7: Console error check...');
      const consoleErrors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);

      findings.tests.push({
        name: 'No console errors',
        passed: consoleErrors.length === 0,
        details: consoleErrors.length > 0 ? `${consoleErrors.length} errors` : 'No errors'
      });

      if (consoleErrors.length > 0) {
        findings.issues.push({
          severity: 'HIGH',
          type: 'Console errors detected',
          details: consoleErrors.slice(0, 3).join('; ')
        });
      }
    }

    // Summary
    console.log('\n\n📊 Chat Workflow Test Results:');
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
    const reportPath = path.join(FINDINGS_DIR, `chat-workflow-${timestamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(findings, null, 2));

    console.log(`\n✅ Report saved to: ${reportPath}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    findings.issues.push({
      severity: 'CRITICAL',
      type: 'Test execution error',
      details: error.message
    });
  } finally {
    await browser.close();
  }
}

chatWorkflowTest();
