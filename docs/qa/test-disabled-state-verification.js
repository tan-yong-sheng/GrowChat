/**
 * Verification script for disabled state styling
 * Tests that button:disabled and input:disabled CSS is properly applied
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read the compiled CSS file
const cssPath = path.join(__dirname, '../../public/styles.css');
const css = fs.readFileSync(cssPath, 'utf8');

console.log('🔍 Verifying Disabled State Styling...\n');

// Test 1: Check for button:disabled styles
const buttonDisabledMatch = css.match(/button:disabled\s*\{([^}]+)\}/);
if (buttonDisabledMatch) {
  console.log('✓ button:disabled found in CSS');
  console.log('  Styles:', buttonDisabledMatch[1].trim());
} else {
  console.log('✗ button:disabled NOT found in CSS');
}

// Test 2: Check for input:disabled styles
const inputDisabledMatch = css.match(/input:disabled\s*\{([^}]+)\}/);
if (inputDisabledMatch) {
  console.log('✓ input:disabled found in CSS');
  console.log('  Styles:', inputDisabledMatch[1].trim());
} else {
  console.log('✗ input:disabled NOT found in CSS');
}

// Test 3: Check for select:disabled styles
const selectDisabledMatch = css.match(/select:disabled\s*\{([^}]+)\}/);
if (selectDisabledMatch) {
  console.log('✓ select:disabled found in CSS');
  console.log('  Styles:', selectDisabledMatch[1].trim());
} else {
  console.log('✗ select:disabled NOT found in CSS');
}

// Test 4: Check for textarea:disabled styles
const textareaDisabledMatch = css.match(/textarea:disabled\s*\{([^}]+)\}/);
if (textareaDisabledMatch) {
  console.log('✓ textarea:disabled found in CSS');
  console.log('  Styles:', textareaDisabledMatch[1].trim());
} else {
  console.log('✗ textarea:disabled NOT found in CSS');
}

// Test 5: Check for semantic color tokens
console.log('\n🎨 Verifying Semantic Color Tokens...\n');

const colorTokens = [
  { name: 'error', color: '#dc2626' },
  { name: 'success', color: '#16a34a' },
  { name: 'warning', color: '#ea580c' },
  { name: 'info', color: '#0284c7' },
];

colorTokens.forEach(token => {
  if (css.includes(`--color-${token.name}`)) {
    console.log(`✓ --color-${token.name} token found`);
  } else {
    console.log(`✗ --color-${token.name} token NOT found`);
  }
});

// Test 6: Check for form state utility classes
console.log('\n📝 Verifying Form State Utilities...\n');

const utilities = ['form-error', 'form-success', 'form-warning', 'form-info'];
utilities.forEach(utility => {
  if (css.includes(`.${utility}`)) {
    console.log(`✓ .${utility} utility class found`);
  } else {
    console.log(`✗ .${utility} utility class NOT found`);
  }
});

console.log('\n✅ Verification complete!');

