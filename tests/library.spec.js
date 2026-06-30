const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Library Tab', () => {
  test.beforeEach(async ({ page }) => {
    // Mock Nominatim API
    await page.route('https://nominatim.openstreetmap.org/reverse*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ address: { city: 'Test City' } }),
      });
    });

    await page.goto('/');
    // Clear IndexedDB before each test to ensure a clean state
    await page.evaluate(async () => {
      if (window.dbManager) {
        await window.dbManager.clearLibrary();
      }
    });
    await page.reload();
  });

  test('should display empty library placeholder', async ({ page }) => {
    await page.click('#bottom-nav button:has-text("Library")');
    await expect(page.locator('#saved-list')).toContainText('Your library is empty');
  });

  test('should upload a GPX file', async ({ page }) => {
    await page.click('#bottom-nav button:has-text("Library")');

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('label[title="Add GPX File"]').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.join(__dirname, '../samples/RK_gpx _2025-08-29_0734.gpx'));

    // Should automatically switch to Analyze tab
    await expect(page.locator('#tab-analyze')).toBeVisible();

    // Check if it's in the library
    await page.click('#bottom-nav button:has-text("Library")');
    await expect(page.locator('.run-card')).toBeVisible();
    await expect(page.locator('.run-card')).toContainText('29 Aug');
    // Geocoding is now background process, wait a bit for it to finish
    await expect(page.locator('.run-card')).toContainText('Test City', { timeout: 10000 });
  });

  test('should upload a ZIP archive', async ({ page }) => {
    await page.click('#bottom-nav button:has-text("Library")');

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('label[title="Import ZIP"]').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.join(__dirname, '../samples/01-runkeeper-data-export-83821822-2026-06-14-011218.zip'));

    // Wait for import to complete
    await expect(page.locator('#tab-analyze')).toBeVisible();

    await page.click('#bottom-nav button:has-text("Library")');
    const runCards = page.locator('.run-card');
    await expect(runCards).toHaveCount(58); // The zip contains 58 gpx files
  });

  test('should delete a run', async ({ page }) => {
    // First upload a file
    await page.click('#bottom-nav button:has-text("Library")');
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('label[title="Add GPX File"]').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.join(__dirname, '../samples/RK_gpx _2025-08-29_0734.gpx'));

    await page.click('#bottom-nav button:has-text("Library")');
    await expect(page.locator('.run-card')).toBeVisible();

    // Delete the run
    await page.click('.delete-btn-ghost');
    await expect(page.locator('.run-card')).not.toBeVisible();
    await expect(page.locator('#saved-list')).toContainText('Your library is empty');
  });

  test('should group runs by month and year', async ({ page }) => {
    await page.click('#bottom-nav button:has-text("Library")');

    // Upload two files from different months (August and October 2025)
    const files = [
      '../samples/RK_gpx _2025-08-29_0734.gpx',
      '../samples/RK_gpx _2025-10-22_0933.gpx'
    ];

    for (const file of files) {
        const fileChooserPromise = page.waitForEvent('filechooser');
        await page.locator('label[title="Add GPX File"]').click();
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles(path.join(__dirname, file));
        await page.click('#bottom-nav button:has-text("Library")');
    }

    await expect(page.locator('#saved-list .month-header')).toHaveCount(2);
    await expect(page.locator('#saved-list .month-header').first()).toContainText('October 2025');
    await expect(page.locator('#saved-list .month-header').last()).toContainText('August 2025');
  });
});
