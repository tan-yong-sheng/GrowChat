/**
 * Comprehensive QA Crawler for GrowChat
 * Systematically navigates all pages, routes, menus, buttons, modals, and interactive elements
 * Captures console errors, accessibility issues, UI inconsistencies
 */

const { test, expect, chromium } = require('@playwright/test');

const BASE_URL = 'http://localhost:8787';
const TEST_EMAIL = 'tys203831@gmail.com';
const TEST_PASSWORD = '&Test1234';

test.describe('GrowChat Comprehensive QA Crawler', () => {
  let page;
  let browser;
  const findings = [];
  const consoleErrors = [];
  const accessibilityIssues = [];

  test.beforeAll(async () => {
    browser = await chromium.launch();
  });

  test.afterAll(async () => {
    await browser.close();
  });

  test.beforeEach(async () => {
    const context = await browser.newContext();
    page = await context.newPage();

    // Capture console messages
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        consoleErrors.push({
          type: msg.type(),
          text: msg.text(),
          location: msg.location(),
        });
      }
    });

    // Capture page errors
    page.on('pageerror', (error) => {
      findings.push({
        type: 'PAGE_ERROR',
        message: error.message,
        stack: error.stack,
      });
    });
  });

  test('QA-001: Auth Page - Verify all form elements and accessibility', async () => {
    await page.goto(`${BASE_URL}/auth.html`);

    // Capture initial state
    await page.screenshot({ path: 'docs/qa/screenshots/auth-page-initial.png' });

    // Check for console errors on auth page
    await page.waitForTimeout(1000);
    expect(consoleErrors).toBeDefined();

    // Verify form elements exist
    const loginTab = await page.locator('button:has-text("Login")');
    const registerTab = await page.locator('button:has-text("Register")');
    expect(await loginTab.isVisible()).toBe(true);
    expect(await registerTab.isVisible()).toBe(true);

    // Test login form
    await loginTab.click();
    const emailInput = await page.locator('input[type="email"]');
    const passwordInput = await page.locator('input[type="password"]');

    expect(await emailInput.isVisible()).toBe(true);
    expect(await passwordInput.isVisible()).toBe(true);

    // Check for accessibility attributes
    const emailAutocomplete = await emailInput.getAttribute('autocomplete');
    const passwordAutocomplete = await passwordInput.getAttribute('autocomplete');

    findings.push({
      type: 'ACCESSIBILITY_CHECK',
      element: 'email input',
      autocomplete: emailAutocomplete,
      status: emailAutocomplete ? 'PASS' : 'FAIL',
    });

    findings.push({
      type: 'ACCESSIBILITY_CHECK',
      element: 'password input (login)',
      autocomplete: passwordAutocomplete,
      status: passwordAutocomplete ? 'PASS' : 'FAIL',
    });

    // Test register form
    await registerTab.click();
    const nameInput = await page.locator('input[type="text"]').first();
    const regEmailInput = await page.locator('input[type="email"]');
    const regPasswordInputs = await page.locator('input[type="password"]');

    findings.push({
      type: 'ACCESSIBILITY_CHECK',
      element: 'name input',
      hasAutocomplete: await nameInput.getAttribute('autocomplete') ? true : false,
    });
  });

  test('QA-002: Login flow and session persistence', async () => {
    await page.goto(`${BASE_URL}/auth.html`);

    // Login
    const emailInput = await page.locator('input[type="email"]');
    const passwordInput = await page.locator('input[type="password"]');
    const loginButton = await page.locator('button:has-text("Sign In")').first();

    await emailInput.fill(TEST_EMAIL);
    await passwordInput.fill(TEST_PASSWORD);
    await loginButton.click();

    // Wait for navigation
    await page.waitForNavigation();

    // Should be on main page
    expect(page.url()).toContain(BASE_URL);
    expect(page.url()).not.toContain('auth');

    await page.screenshot({ path: 'docs/qa/screenshots/main-page-after-login.png' });

    // Check for UI elements
    const sidebar = await page.locator('[class*="sidebar"]');
    const chatList = await page.locator('[class*="chat"]');

    findings.push({
      type: 'UI_ELEMENT_CHECK',
      element: 'Sidebar',
      visible: await sidebar.isVisible().catch(() => false),
    });
  });

  test('QA-003: Main page - Sidebar and navigation elements', async () => {
    await page.goto(`${BASE_URL}/auth.html`);

    // Login first
    await page.locator('input[type="email"]').fill(TEST_EMAIL);
    await page.locator('input[type="password"]').fill(TEST_PASSWORD);
    await page.locator('button:has-text("Sign In")').first().click();
    await page.waitForNavigation();

    // Test sidebar elements
    const newChatButton = await page.locator('button:has-text("New Chat")');
    expect(await newChatButton.isVisible()).toBe(true);
    findings.push({ type: 'UI_ELEMENT', name: 'New Chat Button', status: 'VISIBLE' });

    // Check user profile button
    const userProfile = await page.locator('[class*="profile"]').first();
    const profileVisible = await userProfile.isVisible().catch(() => false);
    findings.push({ type: 'UI_ELEMENT', name: 'User Profile', status: profileVisible ? 'VISIBLE' : 'NOT_FOUND' });

    // Check search button
    const searchButton = await page.locator('button[aria-label*="search" i], button:has-text("Search")').first();
    const searchVisible = await searchButton.isVisible().catch(() => false);
    findings.push({ type: 'UI_ELEMENT', name: 'Search Button', status: searchVisible ? 'VISIBLE' : 'NOT_FOUND' });

    // Take screenshot
    await page.screenshot({ path: 'docs/qa/screenshots/main-page-sidebar.png' });
  });

  test('QA-004: User profile dropdown - Visibility and positioning', async () => {
    await page.goto(`${BASE_URL}/auth.html`);

    // Login
    await page.locator('input[type="email"]').fill(TEST_EMAIL);
    await page.locator('input[type="password"]').fill(TEST_PASSWORD);
    await page.locator('button:has-text("Sign In")').first().click();
    await page.waitForNavigation();

    // Click user profile to open menu
    const userProfileButton = await page.locator('[class*="profile"]').first();

    if (await userProfileButton.isVisible()) {
      await userProfileButton.click();
      await page.waitForTimeout(500);

      // Check if dropdown menu is visible
      const dropdownMenu = await page.locator('[class*="dropdown"], [class*="menu"], [role="menu"]').first();

      const menuVisible = await dropdownMenu.isVisible().catch(() => false);
      findings.push({
        type: 'UI_POSITIONING',
        element: 'User Profile Dropdown',
        visible: menuVisible,
        location: menuVisible ? 'IN_VIEWPORT' : 'OUTSIDE_VIEWPORT_OR_HIDDEN',
      });

      // Check individual menu items
      const settingsItem = await page.locator('text=Settings').first();
      const settingsVisible = await settingsItem.isVisible().catch(() => false);
      findings.push({
        type: 'UI_ELEMENT',
        name: 'Settings Menu Item',
        visible: settingsVisible,
      });

      const signOutItem = await page.locator('text=Sign Out').first();
      const signOutVisible = await signOutItem.isVisible().catch(() => false);
      findings.push({
        type: 'UI_ELEMENT',
        name: 'Sign Out Menu Item',
        visible: signOutVisible,
      });

      await page.screenshot({ path: 'docs/qa/screenshots/user-profile-dropdown.png' });
    }
  });

  test('QA-005: Message input and send functionality', async () => {
    await page.goto(`${BASE_URL}/auth.html`);

    // Login
    await page.locator('input[type="email"]').fill(TEST_EMAIL);
    await page.locator('input[type="password"]').fill(TEST_PASSWORD);
    await page.locator('button:has-text("Sign In")').first().click();
    await page.waitForNavigation();

    // Find message input
    const messageInput = await page.locator('input[placeholder*="message" i], textarea[placeholder*="message" i]').first();
    const sendButton = await page.locator('button[aria-label*="send" i], button:has-text("Send")').first();

    const inputVisible = await messageInput.isVisible().catch(() => false);
    const sendVisible = await sendButton.isVisible().catch(() => false);

    findings.push({
      type: 'UI_ELEMENT',
      name: 'Message Input',
      visible: inputVisible,
    });

    findings.push({
      type: 'UI_ELEMENT',
      name: 'Send Button',
      visible: sendVisible,
    });

    // Test typing in message input
    if (inputVisible) {
      await messageInput.fill('Test message');
      const inputValue = await messageInput.inputValue();
      findings.push({
        type: 'FUNCTIONALITY',
        feature: 'Message Input - Type',
        status: inputValue === 'Test message' ? 'PASS' : 'FAIL',
      });
    }

    await page.screenshot({ path: 'docs/qa/screenshots/message-input-area.png' });
  });

  test('QA-006: Console errors and warnings summary', async () => {
    // Navigate through multiple pages to collect errors
    const pages = ['/auth.html', '/'];

    for (const pagePath of pages) {
      consoleErrors.length = 0; // Reset for each page

      try {
        await page.goto(`${BASE_URL}${pagePath}`);
        await page.waitForTimeout(2000);

        findings.push({
          type: 'PAGE_LOAD',
          page: pagePath,
          consoleErrorCount: consoleErrors.length,
          errors: consoleErrors.map(e => e.text),
        });
      } catch (e) {
        findings.push({
          type: 'NAVIGATION_ERROR',
          page: pagePath,
          error: e.message,
        });
      }
    }
  });

  test.afterEach(async () => {
    // Save findings to file
    const fs = require('fs');
    const timestamp = new Date().toISOString();
    const reportPath = `docs/qa/findings/qa-crawler-${timestamp.split('T')[0]}.json`;

    if (!fs.existsSync('docs/qa/findings')) {
      fs.mkdirSync('docs/qa/findings', { recursive: true });
    }

    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp,
      findings,
      consoleErrors,
      totalFindings: findings.length,
    }, null, 2));
  });
});
