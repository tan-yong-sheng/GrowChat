import { test, expect } from '@playwright/test';
import { TEST_EMAIL, TEST_PASSWORD } from './test-helpers';
import * as path from 'path';
import * as fs from 'fs';

test.describe('File Upload Debug on Local Dev', () => {
  test.setTimeout(60000); // Increase timeout to 60 seconds
  test('Upload config.json and debug the process', async ({ page }) => {
    // Step 1: Navigate to auth page first
    console.log('🔵 Step 1: Navigating to auth page...');
    await page.goto('/auth.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 });

    // Get the base URL from the page's origin
    const baseUrl = new URL(page.url()).origin;

    // Step 2: Log in
    console.log('🔵 Step 2: Logging in...');
    const emailInput = page.locator('input[type="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const loginButton = page.locator('button').filter({ hasText: /login|sign in/i }).first();

    if (!TEST_EMAIL || !TEST_PASSWORD) {
      throw new Error('TEST_USER_EMAIL and TEST_USER_PASSWORD must be set');
    }

    await emailInput.fill(TEST_EMAIL);
    await passwordInput.fill(TEST_PASSWORD);

    // Listen for network activity
    let authResponseData = null;
    page.on('response', (response) => {
      if (response.url().includes('/api/auth/login')) {
        response.json().then(data => {
          authResponseData = data;
          console.log('✅ Auth response:', JSON.stringify(data, null, 2));
        }).catch(e => console.log('⚠️ Could not parse auth response:', e));
      }
    });

    await loginButton.click();
    await page.waitForNavigation({ timeout: 15000 }).catch(() => {});

    // Wait for app to load
    await page.waitForURL((url) => !url.pathname.includes('/auth'), { timeout: 15000 }).catch(() => {});
    console.log('✅ Logged in and navigated to app');

    // Step 3: Wait for chat UI
    console.log('🔵 Step 3: Waiting for chat UI...');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Give rendering extra time

    // Get page HTML to inspect structure
    const bodyHTML = await page.locator('body').innerHTML();
    console.log('📄 Body HTML preview:', bodyHTML.substring(0, 500));

    // Step 4: Look for file upload UI
    console.log('🔵 Step 4: Looking for file upload input...');
    const fileInputs = page.locator('input[type="file"]');
    const fileInputCount = await fileInputs.count();
    console.log(`Found ${fileInputCount} file input(s)`);

    // List all elements with "file" in aria-label or text
    const fileButtons = page.locator('button').filter({ hasText: /file|upload|attach|\+|add|send/i });
    const fileButtonCount = await fileButtons.count();
    console.log(`Found ${fileButtonCount} file-related button(s)`);

    // Look for any input field or button in the message area
    const messageInputs = page.locator('textarea, [contenteditable], input[type="text"]');
    const messageInputCount = await messageInputs.count();
    console.log(`Found ${messageInputCount} message input(s)`);

    // List all buttons on the page
    const allButtons = page.locator('button');
    const allButtonCount = await allButtons.count();
    console.log(`Found ${allButtonCount} total button(s)`);
    for (let i = 0; i < Math.min(5, allButtonCount); i++) {
      const text = await allButtons.nth(i).textContent();
      const ariaLabel = await allButtons.nth(i).getAttribute('aria-label');
      console.log(`  Button ${i}: text="${text?.trim()}", aria-label="${ariaLabel}"`);
    }

    // Step 5: Create test config.json file
    console.log('🔵 Step 5: Creating test config.json...');
    const testConfigPath = path.join(process.cwd(), 'test-config.json');
    const testConfigContent = {
      test: true,
      timestamp: new Date().toISOString(),
      data: { sample: 'test data' }
    };
    fs.writeFileSync(testConfigPath, JSON.stringify(testConfigContent, null, 2));
    console.log(`✅ Created test file at: ${testConfigPath}`);

    // Step 6: Try to upload file
    console.log('🔵 Step 6: Attempting to upload file...');

    if (fileInputCount > 0) {
      console.log('📤 Using file input element...');
      await fileInputs.first().setInputFiles(testConfigPath);

      // Monitor network requests
      let uploadResponse = null;
      page.on('response', (response) => {
        if (response.url().includes('/api/files/upload')) {
          response.json().then(data => {
            uploadResponse = data;
            console.log('📨 Upload response:', JSON.stringify(data, null, 2));
          }).catch(e => console.log('⚠️ Could not parse upload response:', e));
        }
      });

      // Wait for upload to complete
      await page.waitForTimeout(5000);

      if (uploadResponse) {
        console.log('✅ File uploaded successfully!');
        console.log('Response:', uploadResponse);
      } else {
        console.log('⚠️ No upload response received yet');
      }
    } else {
      console.log('⚠️ No file input found. Checking for alternative upload methods...');

      // Try to find and click an upload button
      if (fileButtonCount > 0) {
        console.log('📤 Found file button, clicking it...');
        await fileButtons.first().click();

        // Wait a bit and take screenshot
        await page.waitForTimeout(1000);

        // Now try file input again
        const fileInputAfterClick = page.locator('input[type="file"]');
        const fileInputAfterClickCount = await fileInputAfterClick.count();
        console.log(`After click: Found ${fileInputAfterClickCount} file input(s)`);

        if (fileInputAfterClickCount > 0) {
          console.log('📤 Setting file after button click...');
          await fileInputAfterClick.first().setInputFiles(testConfigPath);
          await page.waitForTimeout(3000);
        }
      }
    }

    // Step 7: Check for error messages
    console.log('🔵 Step 7: Checking for error messages...');
    const errorMessages = page.locator('[role="alert"], .error, .error-message, .toast--error').all();
    const errorCount = (await errorMessages).length;

    if (errorCount > 0) {
      console.log(`❌ Found ${errorCount} error message(s):`);
      for (const error of await errorMessages) {
        const text = await error.textContent();
        console.log(`  - ${text}`);
      }
    }

    // Step 8: Take screenshot for debugging
    console.log('🔵 Step 8: Taking screenshot...');
    await page.screenshot({ path: 'upload-debug.png', fullPage: true });
    console.log('✅ Screenshot saved as upload-debug.png');

    // Step 9: Check console logs
    console.log('🔵 Step 9: Checking browser console...');
    page.on('console', (msg) => {
      console.log(`[${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      console.error('❌ Page error:', err);
    });

    // Final check
    console.log('🔵 Final step: Checking page state...');
    const pageUrl = page.url();
    const pageTitle = await page.title();
    console.log(`Current URL: ${pageUrl}`);
    console.log(`Page title: ${pageTitle}`);

    // Clean up
    try {
      await fs.promises.unlink(testConfigPath);
      console.log('✅ Test completed');
    } catch (err) {
      console.log('⚠️ Cleanup error:', err?.message);
    }
  });
});

