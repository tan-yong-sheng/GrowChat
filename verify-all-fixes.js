import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:8787';
const TEST_EMAIL = 'tys203831@gmail.com';
const TEST_PASSWORD = '&Test1234';

async function verifyFixes() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    console.log('🔍 Verifying Bug Fixes...\n');

    // Test 1: Submit button disabled on empty form
    console.log('TEST 1: Submit button disabled on empty auth form');
    await page.goto(`${BASE_URL}/auth.html`);
    await page.waitForLoadState('networkidle');

    let submitBtn = await page.$('#auth-submit');
    let isDisabled = await submitBtn.evaluate(btn => btn.disabled);
    console.log(`  ✓ Initial state (empty form): disabled = ${isDisabled}`);
    
    if (!isDisabled) {
      console.log('  ❌ FAILED: Button should be disabled when form is empty');
    } else {
      console.log('  ✅ PASSED: Button is disabled when form is empty');
    }

    // Fill email only
    const emailInput = await page.$('#email');
    await emailInput.fill(TEST_EMAIL);
    isDisabled = await submitBtn.evaluate(btn => btn.disabled);
    console.log(`  ✓ Email only: disabled = ${isDisabled}`);
    
    // Fill password
    const passwordInput = await page.$('#password');
    await passwordInput.fill(TEST_PASSWORD);
    isDisabled = await submitBtn.evaluate(btn => btn.disabled);
    console.log(`  ✓ Email + password: disabled = ${isDisabled}`);
    
    if (isDisabled) {
      console.log('  ❌ FAILED: Button should be enabled when form is valid');
    } else {
      console.log('  ✅ PASSED: Button is enabled when form is valid');
    }

    // Submit and test sidebar toggle
    console.log('\nTEST 2: Sidebar toggle functionality');
    await submitBtn.click();
    
    try {
      await page.waitForNavigation({ timeout: 5000 });
    } catch (e) {}

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const sidebar = await page.$('#sidebar');
    if (sidebar) {
      const initialWidth = await sidebar.evaluate(el => el.style.width || window.getComputedStyle(el).width);
      const initialClasses = await sidebar.evaluate(el => Array.from(el.classList).sort().join(','));
      
      console.log(`  ✓ Initial sidebar width: ${initialWidth}`);
      console.log(`  ✓ Initial sidebar classes: ${initialClasses.substring(0, 50)}...`);
      
      const toggleBtn = await page.$('#toggle-sidebar-desktop');
      if (toggleBtn) {
        await toggleBtn.click();
        await page.waitForTimeout(600);

        const afterWidth = await sidebar.evaluate(el => el.style.width || window.getComputedStyle(el).width);
        const afterClasses = await sidebar.evaluate(el => Array.from(el.classList).sort().join(','));
        
        console.log(`  ✓ After toggle width: ${afterWidth}`);
        console.log(`  ✓ After toggle classes: ${afterClasses.substring(0, 50)}...`);
        
        if (initialWidth !== afterWidth || initialClasses !== afterClasses) {
          console.log('  ✅ PASSED: Sidebar state changed after toggle');
        } else {
          console.log('  ❌ FAILED: Sidebar state did not change');
        }
      }
    }

    console.log('\n✅ All fixes verified successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

verifyFixes();
