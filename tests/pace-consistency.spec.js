const { test, expect } = require('@playwright/test');
const path = require('path');

// Regression test for https://github.com/nikitastaf1996/gpxviewer/issues/pace-divergence
//
// Bug: the Library card showed one pace value (computed by
// gpxUtils.parseGpxMetadata using 2D Haversine distance and
// endTime - startTime) while the Analyse tab's "Total" pace chip
// showed a different value (computed by Leaflet.GPX using 3D distance
// and sum of |Δt| between consecutive trackpoints).
//
// Fix: parseGpxMetadata now uses the same 3D distance + sum|Δt|
// accounting as Leaflet.GPX, so the stored metadata agrees with the
// values the analyse tab derives from the live GPX.
//
// This test imports each sample GPX, reads the pace text from the
// library card and from the analyse "Total" pace chip, and asserts
// they are byte-for-byte identical.

const SAMPLES = [
  'RK_gpx _2025-08-29_0734.gpx',
  'RK_gpx _2025-10-22_0933.gpx',
];

test.describe('Pace consistency between Library and Analyse', () => {
  for (const sampleFile of SAMPLES) {
    test(`library card pace matches analyse "Total" pace for ${sampleFile}`, async ({ page }) => {
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

      // Upload sample — app auto-switches to the Analyse tab.
      await page.click('#bottom-nav button:has-text("Library")');
      const fileChooserPromise = page.waitForEvent('filechooser');
      await page.locator('label[title="Add GPX File"]').click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(path.join(__dirname, '..', 'samples', sampleFile));

      // Wait for the analyse tab to settle (Leaflet.GPX loaded event fires async).
      await expect(page.locator('.pace-chip.total-pace .pace-chip-value')).not.toContainText('-', { timeout: 10000 });

      const analysePace = (await page.locator('.pace-chip.total-pace .pace-chip-value').textContent()).trim();

      // Switch to library and read the pace from the run card.
      await page.click('#bottom-nav button:has-text("Library")');
      await expect(page.locator('.run-card')).toBeVisible();

      // The pace is the last <span> inside .run-meta-info on the card.
      const cardPace = (await page.locator('.run-card .run-meta-info span').last().textContent()).trim();

      expect(cardPace, `Library card pace should equal analyse Total pace`).toBe(analysePace);
    });
  }
});
