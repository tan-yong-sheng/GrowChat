import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:8787';

async function verifyButtonDisabled() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await page.goto(`${BASE_URL}/auth.html`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const submitBtn = await page.$('#auth-submit');
    const isDisabled = await submitBtn.getAttribute('disabled');
    
    console.log('Button disabled attribute:', isDisabled);
    console.log('Button is disabled:', isDisabled !== null);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

verifyButtonDisabled();
