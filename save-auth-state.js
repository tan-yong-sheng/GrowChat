import { chromium } from 'playwright';
import fs from 'fs';

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

// Login
await page.goto('http://localhost:8789', { waitUntil: 'networkidle' });
await page.locator('#email').fill('tys203831@gmail.com');
await page.locator('input[type="password"]').first().fill('&Test203831');
await page.locator('#auth-submit').click();
await page.waitForLoadState('networkidle');

// Extract localStorage + cookies
const localStorage = await page.evaluate(() => {
  const items = {};
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    items[key] = window.localStorage.getItem(key);
  }
  return items;
});

const state = await context.storageState();
state.localStorage = localStorage;

fs.writeFileSync('tests/e2e/fixtures/auth-state.json', JSON.stringify(state, null, 2));

await browser.close();
console.log('Auth state saved with localStorage');
