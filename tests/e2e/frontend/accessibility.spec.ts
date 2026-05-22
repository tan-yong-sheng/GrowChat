import { test, expect } from '@playwright/test';

test.describe('Accessibility audit', () => {
  test('should not have any automatically detectable accessibility issues on home page', async ({
    page,
  }) => {
    await page.goto('/');

    // Dynamic import required due to CJS/ESM interop type mismatch
    // (AxeBuilder is a constructor at runtime but TS can't resolve the construct signature)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AxeBuilder } = require('@axe-core/playwright') as typeof import('@axe-core/playwright');
    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
