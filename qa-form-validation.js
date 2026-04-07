import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:8787';
const FINDINGS_DIR = './docs/qa/findings';

if (!fs.existsSync(FINDINGS_DIR)) {
  fs.mkdirSync(FINDINGS_DIR, { recursive: true });
}

async function formValidationTest() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const findings = {
    timestamp: new Date().toISOString(),
    issues: [],
    tests: []
  };

  try {
    console.log('🧪 Testing form validation and error handling...\n');

    // Test 1: Check for required attributes
    console.log('📋 Test 1: Form inputs have required attributes...');
    await page.goto(`${BASE_URL}/auth.html`);
    await page.waitForLoadState('networkidle');

    const inputs = await page.$$('input[type="email"], input[type="password"]');
    const requiredInputs = [];

    for (const input of inputs) {
      const required = await input.getAttribute('required');
      if (required !== null) {
        requiredInputs.push(true);
      }
    }

    findings.tests.push({
      name: 'Form inputs have required attributes',
      passed: requiredInputs.length > 0,
      details: `${requiredInputs.length} inputs have required attribute`
    });

    // Test 2: Check for input type attributes
    console.log('📋 Test 2: Form inputs have correct type attributes...');
    const emailInputs = await page.$$('input[type="email"]');
    const passwordInputs = await page.$$('input[type="password"]');

    findings.tests.push({
      name: 'Form has email and password inputs',
      passed: emailInputs.length > 0 && passwordInputs.length > 0,
      details: `Email: ${emailInputs.length}, Password: ${passwordInputs.length}`
    });

    // Test 3: Check for form labels
    console.log('📋 Test 3: Form inputs have associated labels...');
    const formInputs = await page.$$('input');
    const inputsWithLabels = [];

    for (const input of formInputs) {
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const placeholder = await input.getAttribute('placeholder');

      if (ariaLabel || placeholder || (id && await page.$(`label[for="${id}"]`))) {
        inputsWithLabels.push(true);
      }
    }

    findings.tests.push({
      name: 'Form inputs have labels or aria-labels',
      passed: inputsWithLabels.length === formInputs.length,
      details: `${inputsWithLabels.length}/${formInputs.length} inputs have labels`
    });

    // Test 4: Check for autocomplete attributes
    console.log('📋 Test 4: Form inputs have autocomplete attributes...');
    const emailInput = await page.$('input[type="email"]');
    const passwordInput = await page.$('input[type="password"]');

    const emailAutocomplete = emailInput ? await emailInput.getAttribute('autocomplete') : null;
    const passwordAutocomplete = passwordInput ? await passwordInput.getAttribute('autocomplete') : null;

    findings.tests.push({
      name: 'Form inputs have autocomplete attributes',
      passed: !!emailAutocomplete && !!passwordAutocomplete,
      details: `Email: ${emailAutocomplete}, Password: ${passwordAutocomplete}`
    });

    // Test 5: Check for password field
    console.log('📋 Test 5: Password field accessibility...');
    const passwordField = await page.$('input[type="password"]');

    findings.tests.push({
      name: 'Password field present',
      passed: !!passwordField,
      details: passwordField ? 'Password field found' : 'No password field'
    });

    // Test 6: Check for form element
    console.log('📋 Test 6: Form element structure...');
    const form = await page.$('form');

    findings.tests.push({
      name: 'Form element present',
      passed: !!form,
      details: form ? 'Form element found' : 'No form element'
    });

    // Summary
    console.log('\n\n📊 Form Validation Test Results:');
    const totalTests = findings.tests.length;
    const passedTests = findings.tests.filter(t => t.passed).length;
    console.log(`  Total: ${totalTests}`);
    console.log(`  Passed: ${passedTests}`);
    console.log(`  Failed: ${totalTests - passedTests}`);

    findings.tests.forEach(test => {
      const status = test.passed ? '✅' : '❌';
      console.log(`  ${status} ${test.name}: ${test.details}`);
    });

    if (findings.issues.length > 0) {
      console.log(`\n⚠️ Issues Found: ${findings.issues.length}`);
      findings.issues.forEach((issue, idx) => {
        console.log(`  ${idx + 1}. [${issue.severity}] ${issue.type}`);
        console.log(`     ${issue.details}`);
      });
    }

    // Save report
    const timestamp = new Date().toISOString().split('T')[0];
    const reportPath = path.join(FINDINGS_DIR, `form-validation-${timestamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(findings, null, 2));

    console.log(`\n✅ Report saved to: ${reportPath}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

formValidationTest();
