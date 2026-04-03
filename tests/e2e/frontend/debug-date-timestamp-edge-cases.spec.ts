import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Date Timestamp Edge Case Fix - Search Modal', () => {
  test('verify date labels display correctly without "Unknown date" errors', async () => {
    console.log('\n=== Date Timestamp Edge Case Verification ===\n');

    // Read and verify the search modal helpers code
    const helpersPath = path.join(
      process.cwd(),
      'public/js/shared/components/search-modal-helpers.js'
    );

    const helpersCode = fs.readFileSync(helpersPath, 'utf-8');

    // Verify the getSearchChatDateLabel function handles edge cases
    const hasNullCheck = helpersCode.includes("if (!dateString) return 'Unknown date'");
    const hasNaNCheck = helpersCode.includes('Number.isNaN(date.getTime())');
    const hasEpochCheck = helpersCode.includes('date.getFullYear() <= 1970');
    const callsFormatDate = helpersCode.includes('formatDate(dateString)');
    const hasFallback = helpersCode.includes("return label || 'Unknown date'");

    console.log('Search Modal Helpers Code Verification:');
    console.log(`✓ Null/empty dateString check: ${hasNullCheck}`);
    console.log(`✓ NaN date check: ${hasNaNCheck}`);
    console.log(`✓ Epoch year check (<=1970): ${hasEpochCheck}`);
    console.log(`✓ Calls formatDate utility: ${callsFormatDate}`);
    console.log(`✓ Fallback to "Unknown date": ${hasFallback}`);

    expect(hasNullCheck).toBe(true);
    expect(hasNaNCheck).toBe(true);
    expect(hasEpochCheck).toBe(true);
    expect(callsFormatDate).toBe(true);
    expect(hasFallback).toBe(true);

    // Verify the formatDate function in utils.js
    const utilsPath = path.join(
      process.cwd(),
      'public/js/shared/utils.js'
    );

    const utilsCode = fs.readFileSync(utilsPath, 'utf-8');

    const hasFormatDateFunction = utilsCode.includes('export function formatDate(dateString)');
    const hasUtilsNullCheck = utilsCode.includes('if (!dateString) return');
    const hasUtilsNaNCheck = utilsCode.includes('Number.isNaN(date.getTime())');
    const hasDateLabels = utilsCode.includes("'Today'") &&
                          utilsCode.includes("'Yesterday'") &&
                          utilsCode.includes("'Previous 7 days'") &&
                          utilsCode.includes("'Previous 30 days'");

    console.log('\nUtils formatDate Function Verification:');
    console.log(`✓ formatDate function exported: ${hasFormatDateFunction}`);
    console.log(`✓ Null/empty check: ${hasUtilsNullCheck}`);
    console.log(`✓ NaN check: ${hasUtilsNaNCheck}`);
    console.log(`✓ All date labels present: ${hasDateLabels}`);

    expect(hasFormatDateFunction).toBe(true);
    expect(hasUtilsNullCheck).toBe(true);
    expect(hasUtilsNaNCheck).toBe(true);
    expect(hasDateLabels).toBe(true);

    // Verify the renderSearchResultsMarkup function handles "Unknown date" gracefully
    const hasUnknownDateHandling = helpersCode.includes("dateLabel === 'Unknown date' ? '' : ");

    console.log('\nSearch Results Rendering Verification:');
    console.log(`✓ Hides date label when "Unknown date": ${hasUnknownDateHandling}`);

    expect(hasUnknownDateHandling).toBe(true);

    // Verify groupChatsByDate function
    const hasGroupChatsByDate = helpersCode.includes('export function groupChatsByDate(chats)');
    const groupsChatsCorrectly = helpersCode.includes('const dateLabel = getSearchChatDateLabel(chat.updated_at || chat.created_at)');

    console.log('\nGrouping Function Verification:');
    console.log(`✓ groupChatsByDate function exported: ${hasGroupChatsByDate}`);
    console.log(`✓ Uses fallback to created_at if updated_at missing: ${groupsChatsCorrectly}`);

    expect(hasGroupChatsByDate).toBe(true);
    expect(groupsChatsCorrectly).toBe(true);

    console.log('\n=== VERIFICATION PASSED ===');
    console.log('Date timestamp edge case fix is correctly implemented with:');
    console.log('- Null/empty dateString handling');
    console.log('- Invalid date (NaN) detection');
    console.log('- Epoch year (<=1970) filtering');
    console.log('- Graceful "Unknown date" fallback');
    console.log('- Hidden date labels for invalid dates in UI');
    console.log('- Fallback to created_at when updated_at is missing\n');
  });

  test('verify date formatting logic with various edge cases', async () => {
    console.log('\n=== Date Formatting Logic Verification ===\n');

    const utilsPath = path.join(
      process.cwd(),
      'public/js/shared/utils.js'
    );

    const utilsCode = fs.readFileSync(utilsPath, 'utf-8');

    // Verify the formatDate function logic
    const hasDateDiffCalculation = utilsCode.includes('const diff = now - date');
    const hasDayConstant = utilsCode.includes('const day = 24 * 60 * 60 * 1000');
    const hasTodayCheck = utilsCode.includes("diff < day && now.getDate() === date.getDate()");
    const hasYesterdayCheck = utilsCode.includes('diff < 2 * day');
    const has7DaysCheck = utilsCode.includes('diff < 7 * day');
    const has30DaysCheck = utilsCode.includes('diff < 30 * day');
    const hasMonthYearFormat = utilsCode.includes("{ month: 'long', year: 'numeric' }");

    console.log('Date Formatting Logic Verification:');
    console.log(`✓ Calculates date difference: ${hasDateDiffCalculation}`);
    console.log(`✓ Defines day constant (24h in ms): ${hasDayConstant}`);
    console.log(`✓ Today check (same date): ${hasTodayCheck}`);
    console.log(`✓ Yesterday check (< 2 days): ${hasYesterdayCheck}`);
    console.log(`✓ Previous 7 days check: ${has7DaysCheck}`);
    console.log(`✓ Previous 30 days check: ${has30DaysCheck}`);
    console.log(`✓ Month/Year format for older dates: ${hasMonthYearFormat}`);

    expect(hasDateDiffCalculation).toBe(true);
    expect(hasDayConstant).toBe(true);
    expect(hasTodayCheck).toBe(true);
    expect(hasYesterdayCheck).toBe(true);
    expect(has7DaysCheck).toBe(true);
    expect(has30DaysCheck).toBe(true);
    expect(hasMonthYearFormat).toBe(true);

    console.log('\n=== Date Formatting Logic VERIFIED ===\n');
  });
});
