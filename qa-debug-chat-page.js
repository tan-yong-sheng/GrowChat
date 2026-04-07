import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:8787';
const TEST_EMAIL = 'tys203831@gmail.com';
const TEST_PASSWORD = '&Test1234';

async function debugChatPage() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('🔍 Debugging chat page after login...\n');

    // Login
    await page.goto(`${BASE_URL}/auth.html`);
    await page.waitForLoadState('networkidle');
    
    const emailInput = await page.$('#email');
    const passwordInput = await page.$('#password');
    const submitBtn = await page.$('#auth-submit');

    if (emailInput && passwordInput && submitBtn) {
      await emailInput.fill(TEST_EMAIL);
      await passwordInput.fill(TEST_PASSWORD);
      await submitBtn.click();
      
      try {
        await page.waitForNavigation({ timeout: 5000 });
      } catch (e) {
        // Navigation might not happen
      }
      
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      console.log('Current URL:', page.url());

      // Check page structure
      const mainContent = await page.$('main');
      console.log('Main element found:', !!mainContent);

      const sidebar = await page.$('#sidebar');
      console.log('Sidebar element found:', !!sidebar);

      // Check chat list
      const chatListContainer = await page.$('[role="navigation"]');
      console.log('Navigation/chat list found:', !!chatListContainer);

      // Look for chat items more broadly
      const chatItems = await page.$$('div[class*="chat"]');
      console.log(`Elements with "chat" class: ${chatItems.length}`);

      // Check for message input
      const messageInputs = await page.$$('input[type="text"], textarea, [contenteditable="true"]');
      console.log(`Message input elements found: ${messageInputs.length}`);

      // Check buttons
      const buttons = await page.$$('button');
      console.log(`Total buttons: ${buttons.length}`);
      
      for (let i = 0; i < Math.min(10, buttons.length); i++) {
        const text = await buttons[i].textContent();
        const ariaLabel = await buttons[i].getAttribute('aria-label');
        const id = await buttons[i].getAttribute('id');
        const visible = await buttons[i].isVisible();
        console.log(`  Button ${i}: id="${id}", text="${text}", aria-label="${ariaLabel}", visible=${visible}`);
      }

      // Check for new chat button specifically
      const newChatBtn = await page.$('#new-chat');
      console.log('\n#new-chat button found:', !!newChatBtn);
      if (newChatBtn) {
        const visible = await newChatBtn.isVisible();
        console.log('  Visible:', visible);
        console.log('  Text:', await newChatBtn.textContent());
      }

      // Take a screenshot
      await page.screenshot({ path: 'docs/qa/screenshots/chat-page-debug.png' });
      console.log('\n✅ Screenshot saved to docs/qa/screenshots/chat-page-debug.png');

    }

    await browser.close();

  } catch (error) {
    console.error('Error:', error.message);
    await browser.close();
  }
}

debugChatPage();
