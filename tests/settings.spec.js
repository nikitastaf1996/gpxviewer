const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Settings Tab', () => {
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

  test('should toggle chart visibility', async ({ page }) => {
    await page.click('#bottom-nav button:has-text("Settings")');

    const elevationCheckbox = page.locator('label:has-text("Elevation Profile") + input');
    await expect(elevationCheckbox).toBeChecked();

    await elevationCheckbox.uncheck();
    await expect(elevationCheckbox).not.toBeChecked();

    // Check if it persists (partially testing persistence here too)
    await page.reload();
    await page.click('#bottom-nav button:has-text("Settings")');
    await expect(page.locator('label:has-text("Elevation Profile") + input')).not.toBeChecked();
  });

  test('should clear the library', async ({ page }) => {
    // First upload a file
    await page.click('#bottom-nav button:has-text("Library")');
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('label[title="Add GPX File"]').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.join(__dirname, '../samples/RK_gpx _2025-08-29_0734.gpx'));

    await expect(page.locator('#tab-analyze')).toBeVisible();

    // Go to settings and clear library
    await page.click('#bottom-nav button:has-text("Settings")');

    page.on('dialog', dialog => dialog.accept());
    await page.click('button:has-text("Clear Library")');

    // Check if library is empty
    await page.click('#bottom-nav button:has-text("Library")');
    await expect(page.locator('#saved-list')).toContainText('Your library is empty');

    // Check if analyze tab is reset
    await page.click('#bottom-nav button:has-text("Analyze")');
    await expect(page.locator('#analyze-fallback')).toBeVisible();
  });
});
