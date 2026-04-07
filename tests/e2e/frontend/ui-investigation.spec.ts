import { test, expect } from '@playwright/test';
import path from 'path';

test('UI Investigation: Entity Rendering and Graphviz Tabs', async ({ page, context }) => {
  const capturesDir = path.join(process.cwd(), 'e2e-captures', 'ui-investigation-live');

  test.step('1. Navigate to localhost:8787', async () => {
    await page.goto('http://localhost:8787', { waitUntil: 'networkidle2' });
    await page.screenshot({ path: `${capturesDir}/01-login-page.png` });
  });

  test.step('2. Check if login form exists', async () => {
    const emailInput = await page.$('input[type="email"]');
    const passwordInput = await page.$('input[type="password"]');

    if (emailInput && passwordInput) {
      console.log('✓ Login form found');
      await emailInput.fill('test@example.com');
      await passwordInput.fill('password123');

      const submitBtn = await page.$('button[type="submit"]');
      if (submitBtn) {
        await submitBtn.click();
        await page.waitForNavigation({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(2000);
      }
    }
  });

  test.step('3. Capture main interface', async () => {
    await page.screenshot({ path: `${capturesDir}/02-main-interface.png` });
  });

  test.step('4. Check entity encoding in messages', async () => {
    const messages = await page.$$('[data-message-content]');
    console.log(`Found ${messages.length} messages`);

    for (let i = 0; i < Math.min(3, messages.length); i++) {
      const text = await messages[i].textContent();
      const html = await messages[i].evaluate(el => el.innerHTML);

      console.log(`Message ${i}: ${text?.substring(0, 80)}`);

      // Check for apostrophe issues
      if (html.includes('&#39;') && !text?.includes("'")) {
        console.log('⚠️ APOSTROPHE ISSUE: HTML has &#39; but text shows different');
      }
      if (text?.includes('&#39;') || text?.includes('&amp;#39;')) {
        console.log('❌ CRITICAL: Apostrophe rendered as entity in visible text');
      }
    }
  });

  test.step('5. Test Graphviz tab clickability', async () => {
    const graphvizBlocks = await page.$$('[data-markdown-special-kind="graphviz"]');
    console.log(`Found ${graphvizBlocks.length} Graphviz blocks`);

    if (graphvizBlocks.length > 0) {
      const block = graphvizBlocks[0];
      const codeBtn = await block.$('[data-markdown-special-mode-btn="code"]');

      if (codeBtn) {
        const disabled = await codeBtn.evaluate(el => el.disabled);
        console.log(`Code button disabled: ${disabled}`);

        if (!disabled) {
          console.log('Attempting to click code button...');
          await codeBtn.click();
          await page.waitForTimeout(300);

          const codeShell = await block.$('[data-markdown-special-code-shell]');
          const isHidden = await codeShell?.evaluate(el => el.classList.contains('hidden'));
          console.log(`Code shell hidden after click: ${isHidden}`);
        }
      }

      await block.screenshot({ path: `${capturesDir}/03-graphviz-block.png` });
    }
  });

  test.step('6. Console logs', async () => {
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        console.log(`[${msg.type().toUpperCase()}] ${msg.text()}`);
      }
    });
  });
});
