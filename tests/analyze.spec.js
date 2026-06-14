const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Analyze Tab', () => {
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

    // Upload a file to have something to analyze
    await page.click('#bottom-nav button:has-text("Library")');
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('label[title="Add GPX File"]').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.join(__dirname, '../samples/RK_gpx _2025-08-29_0734.gpx'));

    // Automatically switches to Analyze tab
  });

  test('should display stats for the active run', async ({ page }) => {
    await expect(page.locator('#stats')).toBeVisible();
    await expect(page.locator('.stat-item:has-text("Distance") .stat-value')).not.toContainText('-');
    await expect(page.locator('.stat-item:has-text("Total Time") .stat-value')).not.toContainText('-');
    await expect(page.locator('.stat-item:has-text("Pace") .stat-value')).not.toContainText('-');
  });

  test('should display the map', async ({ page }) => {
    await expect(page.locator('#map')).toBeVisible();
    await expect(page.locator('.leaflet-container')).toBeVisible();
  });

  test('should display charts', async ({ page }) => {
    await expect(page.locator('#elevation-chart')).toBeVisible();
    await expect(page.locator('#pace-chart')).toBeVisible();
    await expect(page.locator('#combo-chart')).toBeVisible();
    await expect(page.locator('#climb-chart')).toBeVisible();
    await expect(page.locator('#splits-chart')).toBeVisible();
  });

  test('should respect chart visibility settings', async ({ page }) => {
    // Go to settings and hide elevation chart
    await page.click('#bottom-nav button:has-text("Settings")');
    await page.uncheck('label:has-text("Elevation Profile") + input');

    await page.click('#bottom-nav button:has-text("Analyze")');
    await expect(page.locator('#wrapper-elevation')).not.toBeVisible();
    await expect(page.locator('#wrapper-pace')).toBeVisible();
  });

  test('should switch run when selected from library', async ({ page }) => {
    // Upload another run
    await page.click('#bottom-nav button:has-text("Library")');
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('label[title="Add GPX File"]').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.join(__dirname, '../samples/RK_gpx _2025-10-22_0933.gpx'));

    // Check if the date in the header or some stat changed (if possible)
    // For now, just check if we are on the analyze tab
    await expect(page.locator('#tab-analyze')).toBeVisible();

    // Verify it changed by checking library selection
    await page.click('#bottom-nav button:has-text("Library")');
    await page.click('.run-card:has-text("29 Aug 2025")');
    await expect(page.locator('#tab-analyze')).toBeVisible();
  });
});
