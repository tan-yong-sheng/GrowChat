import { test } from '@playwright/test';

test('debug-ui-investigation', async ({ page }) => {
  // Navigate to app
  await page.goto('http://localhost:8787');

  // Capture initial state
  await page.screenshot({ path: 'e2e-captures/ui-investigation-live/01-initial.png' });

  // Check for login form
  const emailInput = await page.$('input[type="email"]');
  if (emailInput) {
    console.log('Found login form');
    await emailInput.fill('test@example.com');
    await page.$('input[type="password"]').then(p => p?.fill('password123'));

    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
      await page.waitForTimeout(3000);
    }
  }

  // Capture after login attempt
  await page.screenshot({ path: 'e2e-captures/ui-investigation-live/02-after-login.png' });

  // Check for messages with apostrophes
  const messages = await page.$$('[data-message-content]');
  console.log(`Found ${messages.length} messages`);

  for (let i = 0; i < Math.min(3, messages.length); i++) {
    const text = await messages[i].textContent();
    const html = await messages[i].evaluate(el => el.innerHTML);

    console.log(`\nMessage ${i}:`);
    console.log(`  Text: ${text?.substring(0, 100)}`);
    console.log(`  Has &#39;: ${html.includes('&#39;')}`);
    console.log(`  Has &amp;#39;: ${html.includes('&amp;#39;')}`);
  }

  // Check for Graphviz blocks
  const graphvizBlocks = await page.$$('[data-markdown-special-kind="graphviz"]');
  console.log(`\nFound ${graphvizBlocks.length} Graphviz blocks`);

  if (graphvizBlocks.length > 0) {
    const block = graphvizBlocks[0];
    const codeBtn = await block.$('[data-markdown-special-mode-btn="code"]');

    if (codeBtn) {
      const disabled = await codeBtn.evaluate(el => el.disabled);
      console.log(`Code button disabled: ${disabled}`);

      if (!disabled) {
        await codeBtn.click();
        await page.waitForTimeout(500);

        const codeShell = await block.$('[data-markdown-special-code-shell]');
        const hidden = await codeShell?.evaluate(el => el.classList.contains('hidden'));
        console.log(`Code shell hidden after click: ${hidden}`);
      }
    }

    await block.screenshot({ path: 'e2e-captures/ui-investigation-live/03-graphviz-block.png' });
  }

  // Capture final state
  await page.screenshot({ path: 'e2e-captures/ui-investigation-live/04-final.png' });
});
