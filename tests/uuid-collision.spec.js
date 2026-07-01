const { test, expect } = require('@playwright/test');
const path = require('path');

// Verifies Task 1: re-importing the same GPX file keeps both runs (no overwrite,
// no prompt). Runs are now keyed by UUID, not filename.

test.describe('UUID collision behavior', () => {
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
      if (window.dbManager) await window.dbManager.clearLibrary();
    });
    await page.reload();
  });

  // Helper: upload a GPX file. Clears the file input first so the `change`
  // event fires even when uploading the SAME file twice (browsers don't fire
  // change if the input already holds the same filename).
  async function uploadGpx(page, filePath) {
    await page.click('#bottom-nav button:has-text("Library")');
    await page.evaluate(() => {
      const input = document.getElementById('gpx-file');
      if (input) input.value = '';
    });
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('label[title="Add GPX File"]').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(filePath);
    await expect(page.locator('#tab-analyze')).toBeVisible();
  }

  test('importing the same file twice keeps both runs', async ({ page }) => {
    const filePath = path.join(__dirname, '../samples/RK_gpx _2025-08-29_0734.gpx');
    await uploadGpx(page, filePath);
    await uploadGpx(page, filePath);

    await page.click('#bottom-nav button:has-text("Library")');
    await page.waitForTimeout(500);
    const runCards = page.locator('.run-card');
    await expect(runCards).toHaveCount(2);
  });

  test('each run has a unique UUID id in IndexedDB', async ({ page }) => {
    const filePath = path.join(__dirname, '../samples/RK_gpx _2025-08-29_0734.gpx');
    await uploadGpx(page, filePath);
    await uploadGpx(page, filePath);

    await page.click('#bottom-nav button:has-text("Library")');
    await page.waitForTimeout(500);

    const ids = await page.evaluate(async () => {
      const all = await window.dbManager.getAll('metadata');
      return Object.keys(all);
    });
    expect(ids.length).toBe(2);
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const id of ids) {
      expect(id).toMatch(uuidRe);
    }
    expect(ids[0]).not.toBe(ids[1]);
  });

  test('deleting one of two duplicate-filename runs leaves the other intact', async ({ page }) => {
    const filePath = path.join(__dirname, '../samples/RK_gpx _2025-08-29_0734.gpx');
    await uploadGpx(page, filePath);
    await uploadGpx(page, filePath);

    await page.click('#bottom-nav button:has-text("Library")');
    await page.waitForTimeout(500);
    await expect(page.locator('.run-card')).toHaveCount(2);

    // Delete the first one.
    await page.locator('.run-card .delete-btn-ghost').first().click();
    await expect(page.locator('.run-card')).toHaveCount(1);

    // The remaining one should still display correctly.
    await expect(page.locator('.run-card')).toContainText('29 Aug');
  });
});
