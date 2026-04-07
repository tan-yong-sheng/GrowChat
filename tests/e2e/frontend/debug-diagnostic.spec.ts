import { test, expect } from '@playwright/test';

test('Diagnostic: Check page load and auth state', async ({ page }) => {
  await page.goto('http://localhost:8787');
  await page.waitForLoadState('networkidle');

  // Take screenshot to see what's on the page
  await page.screenshot({ path: 'diagnostic-screenshot.png' });

  // Check what's visible
  const title = await page.title();
  console.log('Page title:', title);

  const url = page.url();
  console.log('Current URL:', url);

  // Check for auth elements
  const emailInput = await page.locator('input[type="email"]').isVisible({ timeout: 1000 }).catch(() => false);
  console.log('Email input visible:', emailInput);

  const chatInput = await page.locator('[data-chat-input]').isVisible({ timeout: 1000 }).catch(() => false);
  console.log('Chat input visible:', chatInput);

  // Check for any error messages
  const bodyText = await page.locator('body').textContent();
  console.log('Body text (first 500 chars):', bodyText?.substring(0, 500));

  // Check localStorage
  const authData = await page.evaluate(() => localStorage.getItem('growchat_auth'));
  console.log('Auth data in localStorage:', authData ? 'present' : 'missing');

  // Check for any console errors
  page.on('console', msg => console.log('Browser console:', msg.type(), msg.text()));

  expect(true).toBe(true);
});
