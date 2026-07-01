const { test, expect } = require('@playwright/test');
const path = require('path');

// Verifies the app works completely offline after a first online load.
// See Task 10 in TODO.md.

test.describe('Offline Mode', () => {
  test.beforeEach(async ({ page }) => {
    // Mock Nominatim (geocoder) so tests don't depend on network.
    await page.route('https://nominatim.openstreetmap.org/reverse*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ address: { city: 'Test City' } }),
      });
    });
    // Allow OSM tile requests to pass through (they're cached by the offline
    // tile layer on first view, then served from cache when offline).
    await page.goto('/');
    await page.evaluate(async () => {
      if (window.dbManager) await window.dbManager.clearLibrary();
    });
    await page.reload();
  });

  test('app loads and displays a previously-imported run while offline', async ({ page, context }) => {
    // 1. Online: import a run
    await page.click('#bottom-nav button:has-text("Library")');
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('label[title="Add GPX File"]').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.join(__dirname, '../samples/RK_gpx _2025-08-29_0734.gpx'));
    await expect(page.locator('#tab-analyze')).toBeVisible();
    // Wait for charts to render and tiles to begin caching.
    await expect(page.locator('#elevation-chart')).toBeVisible();
    await page.waitForTimeout(2500);

    // 2. Go offline
    await context.setOffline(true);

    // 3. Reload
    await page.reload();

    // 4. Verify offline badge, library has the run, analyze works.
    await expect(page.locator('.offline-badge')).toBeVisible();

    await page.click('#bottom-nav button:has-text("Library")');
    await expect(page.locator('.run-card')).toBeVisible();

    await page.click('.run-card');
    await expect(page.locator('#tab-analyze')).toBeVisible();
    await expect(page.locator('#elevation-chart')).toBeVisible();
    await expect(page.locator('#stats')).toBeVisible();
    await expect(page.locator('.stat-item:has-text("Distance") .stat-value')).not.toContainText('-');

    await context.setOffline(false);
  });

  test('trends tab works offline', async ({ page, context }) => {
    // Online: import a run
    await page.click('#bottom-nav button:has-text("Library")');
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('label[title="Add GPX File"]').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.join(__dirname, '../samples/RK_gpx _2025-08-29_0734.gpx'));
    await expect(page.locator('#tab-analyze')).toBeVisible();

    // Wait a moment for data to settle.
    await page.waitForTimeout(1500);

    // Go offline
    await context.setOffline(true);

    // Trends tab should render fully from cached state.
    await page.click('#bottom-nav button:has-text("Trends")');
    await expect(page.locator('#trends-content')).toBeVisible();
    await expect(page.locator('#global-trends-chart')).toBeVisible();
    await expect(page.locator('.stat-card:has-text("Runs") .stat-value').first()).toContainText('1');

    await context.setOffline(false);
  });

  test('offline badge appears and disappears with connectivity', async ({ page, context }) => {
    await page.goto('/');
    // Initially online (assume test env is online by default).
    await expect(page.locator('.offline-badge')).toBeHidden();

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.offline-badge')).toBeVisible();

    await context.setOffline(false);
    // Trigger an 'online' event by reloading; badge should hide again.
    await page.reload();
    await expect(page.locator('.offline-badge')).toBeHidden();
  });
});
