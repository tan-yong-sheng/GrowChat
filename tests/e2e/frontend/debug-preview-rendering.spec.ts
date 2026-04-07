import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:8788';
const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'TestPassword123!';

test.describe('Chat Preview Rendering', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Wait for auth form to be visible
    await page.waitForSelector('#auth-form', { timeout: 5000 });

    // Check if we're in sign-up mode by looking at the button text
    const toggleText = await page.locator('#toggle-text').textContent();
    const isSignupMode = toggleText?.includes('already have an account');

    if (!isSignupMode) {
      // We're in login mode, need to switch to signup
      await page.click('#toggle-mode');
      await page.waitForTimeout(500);
    }

    // Fill signup form
    await page.fill('#name', 'Test User');
    await page.fill('#email', TEST_EMAIL);
    await page.fill('#password', TEST_PASSWORD);

    // Submit form
    await page.click('#auth-submit');

    // Wait for either successful login or error
    await page.waitForTimeout(2000);

    // Try to wait for chat interface
    const chatInputVisible = await page.locator('[data-chat-input]').isVisible({ timeout: 5000 }).catch(() => false);

    if (!chatInputVisible) {
      // If still on auth page after signup, try logging in instead
      const emailInput = await page.locator('#email').isVisible({ timeout: 1000 }).catch(() => false);
      if (emailInput) {
        // Switch to login if in signup
        const toggleText2 = await page.locator('#toggle-text').textContent();
        if (toggleText2?.includes("Don't have")) {
          await page.click('#toggle-mode');
          await page.waitForTimeout(500);
        }

        // Login
        await page.fill('#email', TEST_EMAIL);
        await page.fill('#password', TEST_PASSWORD);
        await page.click('#auth-submit');
        await page.waitForTimeout(2000);
      }
    }

    // Wait for chat interface to load
    await page.waitForSelector('[data-chat-input]', { timeout: 10000 });
  });

  test('KaTeX preview renders correctly', async ({ page }) => {
    const katexCode = '$$E = mc^2$$';

    // Send message with KaTeX
    await page.fill('[data-chat-input]', katexCode);
    await page.click('button[type="submit"]');

    // Wait for message to appear
    await page.waitForSelector('[data-markdown-special-kind="katex"]', { timeout: 5000 });

    // Check preview is visible
    const preview = await page.locator('[data-markdown-special-preview]').first();
    await expect(preview).not.toHaveClass(/hidden/);

    // Verify KaTeX rendered (should have SVG or math content)
    const mathContent = await preview.innerHTML();
    expect(mathContent).not.toContain('$$E = mc^2$$');
  });

  test('Mermaid preview renders correctly', async ({ page }) => {
    const mermaidCode = '```mermaid\ngraph TD\n  A[Start] --> B[End]\n```';

    // Send message with Mermaid
    await page.fill('[data-chat-input]', mermaidCode);
    await page.click('button[type="submit"]');

    // Wait for diagram to appear
    await page.waitForSelector('[data-markdown-special-kind="mermaid"]', { timeout: 5000 });

    // Check preview is visible
    const preview = await page.locator('[data-markdown-special-preview]').first();
    await expect(preview).not.toHaveClass(/hidden/);

    // Verify Mermaid rendered (should have SVG)
    const svgContent = await preview.locator('svg').count();
    expect(svgContent).toBeGreaterThan(0);
  });

  test('Graphviz preview falls back to code mode on error', async ({ page }) => {
    const graphvizCode = '```graphviz\ndigraph G { A -> B; }\n```';

    // Send message with Graphviz
    await page.fill('[data-chat-input]', graphvizCode);
    await page.click('button[type="submit"]');

    // Wait for special block to appear
    await page.waitForSelector('[data-markdown-special-kind="graphviz"]', { timeout: 5000 });

    const block = await page.locator('[data-markdown-special-kind="graphviz"]').first();

    // Wait a moment for rendering attempt
    await page.waitForTimeout(1000);

    // Check if error occurred (should be in code mode)
    const hasError = await block.evaluate(el => el.dataset.markdownSpecialHasError === '1');
    const mode = await block.evaluate(el => el.dataset.markdownSpecialMode);

    if (hasError) {
      // Verify forced to code mode
      expect(mode).toBe('code');

      // Check error message is displayed
      const errorEl = await block.locator('[data-markdown-special-error]');
      await expect(errorEl).toBeVisible();

      // Verify preview button is disabled
      const previewBtn = await block.locator('[data-markdown-special-mode-btn="preview"]');
      await expect(previewBtn).toBeDisabled();
    }
  });

  test('Preview/code toggle state management', async ({ page }) => {
    const katexCode = '$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$';

    // Send message with KaTeX
    await page.fill('[data-chat-input]', katexCode);
    await page.click('button[type="submit"]');

    // Wait for special block
    await page.waitForSelector('[data-markdown-special-kind="katex"]', { timeout: 5000 });

    const block = await page.locator('[data-markdown-special-kind="katex"]').first();

    // Verify starts in preview mode
    let mode = await block.evaluate(el => el.dataset.markdownSpecialMode);
    expect(mode).toBe('preview');

    // Click code button
    await block.locator('[data-markdown-special-mode-btn="code"]').click();

    // Verify switched to code mode
    mode = await block.evaluate(el => el.dataset.markdownSpecialMode);
    expect(mode).toBe('code');

    // Verify code is visible
    const codeShell = await block.locator('[data-markdown-special-code-shell]');
    await expect(codeShell).not.toHaveClass(/hidden/);

    // Click preview button
    await block.locator('[data-markdown-special-mode-btn="preview"]').click();

    // Verify switched back to preview mode
    mode = await block.evaluate(el => el.dataset.markdownSpecialMode);
    expect(mode).toBe('preview');
  });

  test('HTML entity rendering in messages', async ({ page }) => {
    const htmlEntities = 'Test: &amp; &lt; &gt; &quot;';

    // Send message with HTML entities
    await page.fill('[data-chat-input]', htmlEntities);
    await page.click('button[type="submit"]');

    // Wait for message to appear
    await page.waitForSelector('[data-message-content]', { timeout: 5000 });

    // Get message content
    const messageContent = await page.locator('[data-message-content]').last().innerHTML();

    // Verify entities are properly escaped (not double-encoded)
    expect(messageContent).toContain('&amp;');
    expect(messageContent).toContain('&lt;');
    expect(messageContent).toContain('&gt;');
    expect(messageContent).toContain('&quot;');

    // Verify they render as actual characters
    const text = await page.locator('[data-message-content]').last().textContent();
    expect(text).toContain('& < > "');
  });

  test('Collapse/expand special blocks', async ({ page }) => {
    const mermaidCode = '```mermaid\ngraph TD\n  A[Start] --> B[End]\n```';

    // Send message with Mermaid
    await page.fill('[data-chat-input]', mermaidCode);
    await page.click('button[type="submit"]');

    // Wait for special block
    await page.waitForSelector('[data-markdown-special-kind="mermaid"]', { timeout: 5000 });

    const block = await page.locator('[data-markdown-special-kind="mermaid"]').first();

    // Verify starts expanded
    let collapsed = await block.evaluate(el => el.dataset.markdownSpecialCollapsed === '1');
    expect(collapsed).toBe(false);

    // Click collapse button
    await block.locator('[data-markdown-special-collapse]').click();

    // Verify collapsed
    collapsed = await block.evaluate(el => el.dataset.markdownSpecialCollapsed === '1');
    expect(collapsed).toBe(true);

    // Verify preview is hidden
    const preview = await block.locator('[data-markdown-special-preview]');
    await expect(preview).toHaveClass(/hidden/);

    // Click expand button
    await block.locator('[data-markdown-special-collapse]').click();

    // Verify expanded
    collapsed = await block.evaluate(el => el.dataset.markdownSpecialCollapsed === '1');
    expect(collapsed).toBe(false);
  });
});
