import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:8787';

async function debugAuthPage() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('🔍 Debugging auth page structure...\n');

    await page.goto(`${BASE_URL}/auth.html`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Check form structure
    const form = await page.$('form');
    console.log('Form element found:', !!form);

    // Check all input fields
    const inputs = await page.$$('input');
    console.log(`Total input elements: ${inputs.length}`);
    
    for (let i = 0; i < inputs.length; i++) {
      const type = await inputs[i].getAttribute('type');
      const placeholder = await inputs[i].getAttribute('placeholder');
      const id = await inputs[i].getAttribute('id');
      const visible = await inputs[i].isVisible();
      console.log(`  Input ${i}: type="${type}", id="${id}", placeholder="${placeholder}", visible=${visible}`);
    }

    // Check all buttons
    const buttons = await page.$$('button');
    console.log(`\nTotal button elements: ${buttons.length}`);
    
    for (let i = 0; i < buttons.length; i++) {
      const text = await buttons[i].textContent();
      const type = await buttons[i].getAttribute('type');
      const id = await buttons[i].getAttribute('id');
      const visible = await buttons[i].isVisible();
      const ariaLabel = await buttons[i].getAttribute('aria-label');
      console.log(`  Button ${i}: type="${type}", id="${id}", text="${text}", aria-label="${ariaLabel}", visible=${visible}`);
    }

    // Check page structure
    const pageTitle = await page.title();
    console.log(`\nPage title: "${pageTitle}"`);

    // Check for specific elements
    const loginTab = await page.$('[role="tab"]');
    console.log(`\nLogin/Register tabs found: ${!!loginTab}`);

    // Get page HTML snippet for visual debugging
    const html = await page.content();
    if (html.includes('type="submit"')) {
      console.log('\n✅ Submit button found in HTML');
    } else {
      console.log('\n❌ Submit button NOT found in HTML');
    }

    await browser.close();

  } catch (error) {
    console.error('Error:', error.message);
    await browser.close();
  }
}

debugAuthPage();
