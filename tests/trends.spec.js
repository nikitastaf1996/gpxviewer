const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Trends Tab', () => {
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

  test('should display empty trends placeholder', async ({ page }) => {
    await page.click('#bottom-nav button:has-text("Trends")');
    await expect(page.locator('#trends-empty')).toBeVisible();
    await expect(page.locator('#trends-content')).not.toBeVisible();
  });

  test('should display lifetime stats after upload', async ({ page }) => {
    // Upload a file
    await page.click('#bottom-nav button:has-text("Library")');
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('label[title="Add GPX File"]').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.join(__dirname, '../samples/RK_gpx _2025-08-29_0734.gpx'));

    await page.click('#bottom-nav button:has-text("Trends")');
    await expect(page.locator('#trends-content')).toBeVisible();
    await expect(page.locator('.stat-card:has-text("Runs") .stat-value')).toContainText('1');

    const distanceText = await page.locator('.stat-card:has-text("Total Distance") .stat-value').textContent();
    const distanceValue = parseFloat(distanceText);
    expect(distanceValue).toBeGreaterThan(0);
  });

  test('should aggregate stats for multiple runs', async ({ page }) => {
     // Upload two files
     await page.click('#bottom-nav button:has-text("Library")');
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

     await page.click('#bottom-nav button:has-text("Trends")');
     await expect(page.locator('.stat-card:has-text("Runs") .stat-value')).toContainText('2');
  });

  test('should display the global trends chart', async ({ page }) => {
    await page.click('#bottom-nav button:has-text("Library")');
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('label[title="Add GPX File"]').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.join(__dirname, '../samples/RK_gpx _2025-08-29_0734.gpx'));

    await page.click('#bottom-nav button:has-text("Trends")');
    await expect(page.locator('#global-trends-chart')).toBeVisible();
  });

  test('should display monthly breakdown charts when expanded', async ({ page }) => {
    await page.click('#bottom-nav button:has-text("Library")');
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('label[title="Add GPX File"]').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.join(__dirname, '../samples/RK_gpx _2025-08-29_0734.gpx'));

    await page.click('#bottom-nav button:has-text("Trends")');

    // Find a month group and expand it
    const monthHeader = page.locator('.monthly-breakdowns-list .month-header').first();
    await monthHeader.click();

    // Check if the chart inside becomes visible
    const monthChart = page.locator('.monthly-breakdowns-list canvas').first();
    await expect(monthChart).toBeVisible();
  });
});
