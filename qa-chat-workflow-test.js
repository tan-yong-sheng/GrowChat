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
      } catch (e) {
        // Navigation might not happen, check URL instead
      }
      
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);

      loginSuccess = !page.url().includes('auth');
      findings.tests.push({
        name: 'User login successful',
        passed: loginSuccess,
        details: loginSuccess ? 'Logged in and redirected to main page' : `Login failed, URL: ${page.url()}`
      });
    }

    if (!loginSuccess) {
      console.log('❌ Login failed, skipping remaining tests');
      findings.tests.push({
        name: 'Chat creation',
        passed: false,
        details: 'Skipped due to login failure'
      });
      findings.tests.push({
        name: 'Message sending',
        passed: false,
        details: 'Skipped due to login failure'
      });
      findings.tests.push({
        name: 'Message history',
        passed: false,
        details: 'Skipped due to login failure'
      });
      findings.tests.push({
        name: 'Chat list in sidebar',
        passed: false,
        details: 'Skipped due to login failure'
      });
      findings.tests.push({
        name: 'No console errors',
        passed: false,
        details: 'Skipped due to login failure'
      });
    } else {
      // Test 2: Create new chat
      console.log('📋 Test 2: Create new chat...');
      const newChatBtn = await page.$('#new-chat');
      let chatCreated = false;
      if (newChatBtn) {
        await newChatBtn.click();
        await page.waitForTimeout(500);
        
        const chatInput = await page.$('input[placeholder*="Message"]') || await page.$('textarea');
        chatCreated = !!chatInput;
        
        findings.tests.push({
          name: 'New chat creation',
          passed: chatCreated,
          details: chatCreated ? 'Chat created and input visible' : 'Chat creation failed'
        });
      }

      // Test 3: Send message
      console.log('📋 Test 3: Send message...');
      const messageInput = await page.$('input[placeholder*="Message"]') || await page.$('textarea');
      let messageSent = false;
      if (messageInput) {
        await messageInput.fill('Hello, this is a test message');
        
        const sendBtn = await page.$('button[aria-label*="Send"]') || await page.$('button:has-text("Send")');
        if (sendBtn) {
          await sendBtn.click();
          await page.waitForTimeout(1000);
          
          const messageDisplayed = await page.evaluate(() => {
            const messages = document.querySelectorAll('[role="article"]');
            return messages.length > 0;
          });
          
          messageSent = messageDisplayed;
          findings.tests.push({
            name: 'Message sending',
            passed: messageSent,
            details: messageSent ? 'Message sent and displayed' : 'Message not displayed'
          });
        }
      }

      // Test 4: Check message history
      console.log('📋 Test 4: Message history display...');
      const messageCount = await page.evaluate(() => {
        return document.querySelectorAll('[role="article"]').length;
      });

      findings.tests.push({
        name: 'Message history',
        passed: messageCount > 0,
        details: `${messageCount} messages displayed`
      });

      // Test 5: Sidebar chat list
      console.log('📋 Test 5: Sidebar chat list...');
      const chatListItems = await page.$$('[role="button"][class*="chat"]') || await page.$$('div[class*="chat-row"]');
      
      findings.tests.push({
        name: 'Chat list in sidebar',
        passed: chatListItems.length > 0,
        details: `${chatListItems.length} chats visible in sidebar`
      });

      // Test 6: Check for console errors
      console.log('📋 Test 6: Console error check...');
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
          type: 'Console errors during workflow',
          details: consoleErrors.join('; ')
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
  } finally {
    await browser.close();
  }
}

chatWorkflowTest();
