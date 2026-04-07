import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:8787';

async function verifyAccessibilityFixes() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('🔍 Verifying accessibility fixes...\n');

    // Test 1: Check for main landmark on chat page
    console.log('📋 Test 1: Checking for main landmark on chat page...');
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const mainElement = await page.$('main');
    console.log(`  ${mainElement ? '✅' : '❌'} Main landmark found: ${mainElement ? 'YES' : 'NO'}`);

    // Test 2: Check for skip link
    console.log('📋 Test 2: Checking for skip link...');
    const skipLink = await page.$('a[href="#main"]');
    console.log(`  ${skipLink ? '✅' : '❌'} Skip link found: ${skipLink ? 'YES' : 'NO'}`);

    if (skipLink) {
      const skipLinkText = await skipLink.textContent();
      console.log(`     Text: "${skipLinkText}"`);
    }

    // Test 3: Check admin page for main landmark
    console.log('📋 Test 3: Checking for main landmark on admin page...');
    await page.goto(`${BASE_URL}/admin/users/overview`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const adminMainElement = await page.$('main');
    console.log(`  ${adminMainElement ? '✅' : '❌'} Main landmark on admin: ${adminMainElement ? 'YES' : 'NO'}`);

    // Test 4: Verify skip link is hidden by default
    console.log('📋 Test 4: Checking skip link visibility (should be hidden)...');
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');

    const skipLinkVisible = await page.evaluate(() => {
      const link = document.querySelector('a[href="#main"]');
      if (!link) return null;
      const style = window.getComputedStyle(link);
      return {
        display: style.display,
        position: style.position,
        width: style.width,
        height: style.height,
        clip: style.clip,
        clipPath: style.clipPath
      };
    });

    console.log(`  Skip link styles:`, skipLinkVisible);

    console.log('\n✅ Accessibility verification complete!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

verifyAccessibilityFixes();
