const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('https://nominatim.openstreetmap.org/reverse*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ address: { city: 'Test City' } }),
      });
    });

    await page.goto('/');
    await page.evaluate(async () => {
      if (window.dbManager) {
        await window.dbManager.clearLibrary();
      }
    });
    await page.reload();
  });

  test('should persist uploaded runs after reload', async ({ page }) => {
    await page.click('#bottom-nav button:has-text("Library")');
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('label[title="Add GPX File"]').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.join(__dirname, '../samples/RK_gpx _2025-08-29_0734.gpx'));

    await expect(page.locator('#tab-analyze')).toBeVisible();

    // Reload the page
    await page.reload();

    // Check if run is still in library
    await page.click('#bottom-nav button:has-text("Library")');
    await expect(page.locator('.run-card')).toBeVisible();
    await expect(page.locator('.run-card')).toContainText('29 Aug 2025');
  });

  test('should persist settings after reload', async ({ page }) => {
    await page.click('#bottom-nav button:has-text("Settings")');
    const elevationCheckbox = page.locator('label:has-text("Elevation Profile") + input');
    await elevationCheckbox.uncheck();

    await page.reload();

    await page.click('#bottom-nav button:has-text("Settings")');
    await expect(page.locator('label:has-text("Elevation Profile") + input')).not.toBeChecked();
  });
});
