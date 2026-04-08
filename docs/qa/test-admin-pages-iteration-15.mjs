#!/usr/bin/env node

/**
 * Deep QA Testing Suite for GrowChat Admin Pages - Iteration 15
 * Tests disabled state styling, form validation, and state management
 * Verifies all 9 admin pages + My Settings modal
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:8787';
const EMAIL = 'tys203831@gmail.com';
const PASSWORD = '&Test1234';
const RESULTS_DIR = './docs/qa/test-results';

// Ensure results directory exists
if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

const ADMIN_PAGES = [
  { path: '/admin/users/overview', name: 'Admin Users Overview' },
  { path: '/admin/users/roles', name: 'Admin Users Roles' },
  { path: '/admin/users/groups', name: 'Admin Users Groups' },
  { path: '/admin/users/policy', name: 'Admin Users Policy' },
  { path: '/admin/settings/connections', name: 'Admin Settings Connections' },
  { path: '/admin/settings/models', name: 'Admin Settings Models' },
  { path: '/admin/settings/integrations', name: 'Admin Settings Integrations' },
  { path: '/admin/system/general', name: 'Admin System General' },
  { path: '/admin/system/security', name: 'Admin System Security' },
];

let browser;
let results = {
  timestamp: new Date().toISOString(),
  pages: [],
  disabledStateTests: [],
  formValidationTests: [],
  toggleStateTests: [],
  overallScore: 0,
  summary: '',
};

async function login(page) {
  console.log('🔐 Logging in...');

  // Navigate to auth page
  await page.goto(`${BASE_URL}/auth`);

  // Fill in credentials
  await page.fill('input[placeholder="Enter Your Email"]', EMAIL);
  await page.fill('input[placeholder="Enter Your Password"]', PASSWORD);

  // Click sign in button
  await page.click('button:not([disabled])');

  // Wait for navigation to complete
  await page.waitForNavigation({ timeout: 10000 });
  await page.waitForTimeout(1000);

  console.log('✅ Logged in successfully\n');
}

async function testDisabledStates(page, pageInfo) {
  console.log(`📋 Testing disabled states on ${pageInfo.name}...`);

  const disabledElements = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button:disabled'));
    const inputs = Array.from(document.querySelectorAll('input:disabled'));
    const selects = Array.from(document.querySelectorAll('select:disabled'));

    return {
      buttons: buttons.map(el => ({
        text: el.textContent?.trim(),
        opacity: window.getComputedStyle(el).opacity,
        cursor: window.getComputedStyle(el).cursor,
      })).slice(0, 5),
      inputs: inputs.map(el => ({
        id: el.id,
        bgColor: window.getComputedStyle(el).backgroundColor,
        color: window.getComputedStyle(el).color,
      })).slice(0, 5),
      selects: selects.map(el => ({
        id: el.id,
        bgColor: window.getComputedStyle(el).backgroundColor,
      })).slice(0, 5),
      totalDisabled: buttons.length + inputs.length + selects.length,
    };
  });

  const test = {
    page: pageInfo.name,
    disabledButtonsFound: disabledElements.buttons.length > 0,
    disabledInputsFound: disabledElements.inputs.length > 0,
    buttonOpacityCorrect: disabledElements.buttons.some(b => parseFloat(b.opacity) === 0.5),
    inputBgColorCorrect: disabledElements.inputs.some(i => i.bgColor.includes('243') || i.bgColor.includes('f3')),
    totalDisabledElements: disabledElements.totalDisabled,
    details: disabledElements,
  };

  results.disabledStateTests.push(test);
  console.log(`  ✓ Found ${test.totalDisabledElements} disabled elements`);
  console.log(`  ✓ Button opacity correct: ${test.buttonOpacityCorrect}`);
  console.log(`  ✓ Input bg color correct: ${test.inputBgColorCorrect}\n`);
}

async function testFormValidation(page, pageInfo) {
  console.log(`📝 Testing form validation on ${pageInfo.name}...`);

  // Look for error/success messages
  const validationElements = await page.evaluate(() => {
    const errors = Array.from(document.querySelectorAll('[class*="error"], [class*="red"], .form-error'))
      .filter(el => el.textContent?.trim().length > 0)
      .slice(0, 5);

    const successes = Array.from(document.querySelectorAll('[class*="success"], [class*="green"], .form-success'))
      .filter(el => el.textContent?.trim().length > 0)
      .slice(0, 5);

    return {
      errorMessages: errors.map(e => ({
        text: e.textContent?.trim(),
        classes: e.className,
        color: window.getComputedStyle(e).color,
      })),
      successMessages: successes.map(s => ({
        text: s.textContent?.trim(),
        classes: s.className,
        color: window.getComputedStyle(s).color,
      })),
    };
  });

  const test = {
    page: pageInfo.name,
    errorMessagesFound: validationElements.errorMessages.length > 0,
    successMessagesFound: validationElements.successMessages.length > 0,
    details: validationElements,
  };

  results.formValidationTests.push(test);
  console.log(`  ✓ Error messages found: ${validationElements.errorMessages.length}`);
  console.log(`  ✓ Success messages found: ${validationElements.successMessages.length}\n`);
}

async function testToggleStates(page, pageInfo) {
  console.log(`🔘 Testing toggle/switch states on ${pageInfo.name}...`);

  const toggleStates = await page.evaluate(() => {
    const toggles = Array.from(document.querySelectorAll('[role="switch"], input[type="checkbox"]'))
      .filter(el => el.offsetHeight > 0)
      .slice(0, 10);

    return {
      totalToggles: toggles.length,
      toggleDetails: toggles.map(t => ({
        checked: t.checked || t.getAttribute('aria-checked') === 'true',
        disabled: t.disabled,
        ariaLabel: t.getAttribute('aria-label'),
        classes: t.className.split(' ').slice(0, 3).join(' '),
      })),
    };
  });

  const test = {
    page: pageInfo.name,
    totalToggles: toggleStates.totalToggles,
    hasDisabledToggles: toggleStates.toggleDetails.some(t => t.disabled),
    details: toggleStates,
  };

  results.toggleStateTests.push(test);
  console.log(`  ✓ Found ${toggleStates.totalToggles} toggle elements`);
  console.log(`  ✓ Some toggles disabled: ${test.hasDisabledToggles}\n`);
}

async function testAdminPage(page, pageInfo) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${pageInfo.name}`);
  console.log(`URL: ${pageInfo.path}`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    // Navigate to the admin page using SPA routing
    await page.evaluate((path) => {
      window.history.pushState({}, '', path);
      if (window.renderCurrentRoute) {
        window.renderCurrentRoute();
      }
    }, pageInfo.path);

    await page.waitForTimeout(1500); // Wait for page to render

    // Take screenshot
    const screenshotPath = path.join(RESULTS_DIR, `${pageInfo.path.replace(/\//g, '_')}_screenshot.png`);
    await page.screenshot({ path: screenshotPath });

    // Run tests
    await testDisabledStates(page, pageInfo);
    await testFormValidation(page, pageInfo);
    await testToggleStates(page, pageInfo);

    results.pages.push({
      name: pageInfo.name,
      path: pageInfo.path,
      screenshot: screenshotPath,
      status: 'PASS',
    });

  } catch (error) {
    console.error(`❌ Error testing ${pageInfo.name}: ${error.message}`);
    results.pages.push({
      name: pageInfo.name,
      path: pageInfo.path,
      status: 'FAIL',
      error: error.message,
    });
  }
}

async function testMySettingsModal(page) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: My Settings Modal`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    // Navigate to main page and open My Settings
    await page.goto(`${BASE_URL}/`);
    await page.waitForTimeout(1500);

    // Click user profile button to open modal
    await page.click('button:has-text("Tan Yong Sheng")');
    await page.waitForTimeout(1000);

    // Check if modal appeared and test tabs
    const modalTabs = await page.$$('[data-subnav]');
    console.log(`  ✓ Found ${modalTabs.length} tabs in modal`);

    // Test each tab
    const tabs = ['connections', 'models', 'integrations'];
    for (const tab of tabs) {
      const tabElement = await page.$(`[data-subnav="${tab}"]`);
      if (tabElement) {
        await tabElement.click();
        await page.waitForTimeout(800);
        console.log(`  ✓ Successfully clicked tab: ${tab}`);
      }
    }

    results.pages.push({
      name: 'My Settings Modal',
      status: 'PASS',
      tabsFound: tabs.length,
    });

  } catch (error) {
    console.error(`❌ Error testing My Settings Modal: ${error.message}`);
    results.pages.push({
      name: 'My Settings Modal',
      status: 'FAIL',
      error: error.message,
    });
  }
}

async function calculateOverallScore() {
  const passedPages = results.pages.filter(p => p.status === 'PASS').length;
  const totalPages = results.pages.length;
  const disabledStateScore = results.disabledStateTests.filter(t => t.buttonOpacityCorrect && t.inputBgColorCorrect).length / Math.max(results.disabledStateTests.length, 1);
  const formValidationScore = results.formValidationTests.filter(t => t.errorMessagesFound || t.successMessagesFound).length / Math.max(results.formValidationTests.length, 1);

  const pageScore = (passedPages / totalPages) * 100;
  const stateScore = disabledStateScore * 100;
  const validationScore = formValidationScore * 100;

  results.overallScore = Math.round((pageScore + stateScore + validationScore) / 3);
  results.summary = `Pages: ${passedPages}/${totalPages}, Disabled States: ${Math.round(stateScore)}%, Form Validation: ${Math.round(validationScore)}%`;
}

async function run() {
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    console.log('🚀 Starting Deep QA Testing Suite - Admin Pages Iteration 15\n');

    // Login
    await login(page);

    // Test all admin pages
    for (const pageInfo of ADMIN_PAGES) {
      await testAdminPage(page, pageInfo);
    }

    // Test My Settings modal
    await testMySettingsModal(page);

    // Calculate overall score
    await calculateOverallScore();

    // Save results
    const resultsFile = path.join(RESULTS_DIR, `qa-results-${Date.now()}.json`);
    fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 TEST RESULTS SUMMARY`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Overall UI/UX Score: ${results.overallScore}/100`);
    console.log(`Pages Tested: ${results.pages.filter(p => p.status === 'PASS').length}/${results.pages.length}`);
    console.log(`Disabled States Verified: ${results.disabledStateTests.filter(t => t.buttonOpacityCorrect).length}/${results.disabledStateTests.length}`);
    console.log(`Form Validation Found: ${results.formValidationTests.filter(t => t.errorMessagesFound || t.successMessagesFound).length}/${results.formValidationTests.length}`);
    console.log(`\nResults saved to: ${resultsFile}`);
    console.log(`${'='.repeat(60)}\n`);

    await browser.close();
    process.exit(0);

  } catch (error) {
    console.error('Fatal error:', error);
    if (browser) await browser.close();
    process.exit(1);
  }
}

run();
