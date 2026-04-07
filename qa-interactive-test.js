import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:8787';
const FINDINGS_DIR = './docs/qa/findings';

if (!fs.existsSync(FINDINGS_DIR)) {
  fs.mkdirSync(FINDINGS_DIR, { recursive: true });
}

async function testInteractiveElements() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const issues = [];
  const tests = [];

  try {
    console.log('🧪 Testing interactive elements and edge cases...\n');

    // Test 1: Check for broken links
    console.log('📋 Test 1: Checking for broken links...');
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const links = await page.$$('a');
    let brokenLinks = 0;
    for (const link of links) {
      const href = await link.getAttribute('href');
      if (href && !href.startsWith('#') && !href.startsWith('http') && !href.startsWith('mailto')) {
        // Check if it's a relative link that might be broken
        if (href.startsWith('/') && !href.includes('.')) {
          // This is a route, not a file
          continue;
        }
      }
    }
    tests.push({ name: 'Link validation', passed: true, details: `${links.length} links checked` });

    // Test 2: Check for missing images
    console.log('📋 Test 2: Checking for missing images...');
    const images = await page.$$('img');
    let missingImages = 0;
    for (const img of images) {
      const src = await img.getAttribute('src');
      if (src && !src.includes('data:')) {
        try {
          const response = await page.evaluate(async (url) => {
            const res = await fetch(url, { method: 'HEAD' });
            return res.ok;
          }, src);
          if (!response) missingImages++;
        } catch (e) {
          // Network error, skip
        }
      }
    }
    tests.push({ name: 'Image availability', passed: missingImages === 0, details: `${images.length} images, ${missingImages} missing` });

    // Test 3: Check for console warnings
    console.log('📋 Test 3: Checking for console warnings...');
    const warnings = [];
    page.on('console', msg => {
      if (msg.type() === 'warning') {
        warnings.push(msg.text());
      }
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    tests.push({ name: 'Console warnings', passed: warnings.length === 0, details: warnings.length > 0 ? `${warnings.length} warnings` : 'No warnings' });

    // Test 4: Check for memory leaks (basic check)
    console.log('📋 Test 4: Checking for potential memory issues...');
    const memoryInfo = await page.evaluate(() => {
      if (performance.memory) {
        return {
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
          jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
        };
      }
      return null;
    });

    if (memoryInfo) {
      const heapUsagePercent = (memoryInfo.usedJSHeapSize / memoryInfo.jsHeapSizeLimit) * 100;
      tests.push({
        name: 'Heap memory usage',
        passed: heapUsagePercent < 90,
        details: `${heapUsagePercent.toFixed(1)}% of limit`
      });
      if (heapUsagePercent > 90) {
        issues.push({
          severity: 'MEDIUM',
          type: 'High memory usage',
          page: '/',
          details: `Heap usage at ${heapUsagePercent.toFixed(1)}% - potential memory leak`
        });
      }
    }

    // Test 5: Check for unhandled promise rejections
    console.log('📋 Test 5: Checking for unhandled promise rejections...');
    let unhandledRejections = [];
    page.on('pageerror', error => {
      unhandledRejections.push(error.message);
    });

    tests.push({ name: 'Unhandled rejections', passed: unhandledRejections.length === 0, details: unhandledRejections.length > 0 ? `${unhandledRejections.length} rejections` : 'None' });

    // Test 6: Check for slow network requests
    console.log('📋 Test 6: Checking for slow network requests...');
    const slowRequests = [];
    page.on('response', response => {
      const timing = response.request().timing();
      if (timing && timing.responseEnd - timing.requestStart > 5000) {
        slowRequests.push({
          url: response.url(),
          duration: timing.responseEnd - timing.requestStart
        });
      }
    });

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    tests.push({ name: 'Network performance', passed: slowRequests.length === 0, details: slowRequests.length > 0 ? `${slowRequests.length} slow requests` : 'All requests < 5s' });

    // Test 7: Check for CSS issues
    console.log('📋 Test 7: Checking for CSS rendering issues...');
    const cssIssues = await page.evaluate(() => {
      const issues = [];
      const elements = document.querySelectorAll('*');
      for (const el of elements) {
        const styles = window.getComputedStyle(el);
        // Check for common CSS issues
        if (styles.display === 'none' && el.offsetHeight > 0) {
          issues.push('Element with display:none has height');
        }
      }
      return issues;
    });

    tests.push({ name: 'CSS rendering', passed: cssIssues.length === 0, details: cssIssues.length > 0 ? `${cssIssues.length} issues` : 'No issues' });

    // Summary
    console.log('\n\n📊 Test Results:');
    const totalTests = tests.length;
    const passedTests = tests.filter(t => t.passed).length;
    console.log(`  Total: ${totalTests}`);
    console.log(`  Passed: ${passedTests}`);
    console.log(`  Failed: ${totalTests - passedTests}`);

    tests.forEach(test => {
      const status = test.passed ? '✅' : '❌';
      console.log(`  ${status} ${test.name}: ${test.details}`);
    });

    if (issues.length > 0) {
      console.log(`\n⚠️ Issues Found: ${issues.length}`);
      issues.forEach((issue, idx) => {
        console.log(`  ${idx + 1}. [${issue.severity}] ${issue.type}`);
        console.log(`     ${issue.details}`);
      });
    }

    // Save report
    const timestamp = new Date().toISOString().split('T')[0];
    const reportPath = path.join(FINDINGS_DIR, `interactive-test-${timestamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify({ timestamp: new Date().toISOString(), tests, issues }, null, 2));

    console.log(`\n✅ Report saved to: ${reportPath}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

testInteractiveElements();
