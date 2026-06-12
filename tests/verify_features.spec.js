const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

test.describe('GPX Viewer Features', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080');
  });

  test('should have a sidebar and a map with fullscreen control', async ({ page }) => {
    await expect(page.locator('#sidebar')).toBeVisible();
    await expect(page.locator('#map')).toBeVisible();
    await expect(page.locator('.leaflet-control-fullscreen')).toBeVisible();
  });

  test('should save and display uploaded GPX file in sidebar', async ({ page }) => {
    const gpxContent = '<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Jules"><trk><name>Test Track</name><trkseg><trkpt lat="45.0" lon="9.0"></trkpt><trkpt lat="45.1" lon="9.1"></trkpt></trkseg></trk></gpx>';
    const filePath = path.join(__dirname, 'test.gpx');
    fs.writeFileSync(filePath, gpxContent);

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('#gpx-file'),
    ]);
    await fileChooser.setFiles(filePath);

    await expect(page.locator('.sidebar-item span', { hasText: 'test.gpx' })).toBeVisible();
    await page.reload();
    await expect(page.locator('.sidebar-item span', { hasText: 'test.gpx' })).toBeVisible();
    fs.unlinkSync(filePath);
  });

  test('should delete a saved GPX file from sidebar', async ({ page }) => {
    await page.evaluate(() => {
        const gpxData = '<?xml version="1.0"?><gpx></gpx>';
        localStorage.setItem('gpxFiles', JSON.stringify({ 'delete-me.gpx': gpxData }));
    });
    await page.reload();
    await expect(page.locator('.sidebar-item span', { hasText: 'delete-me.gpx' })).toBeVisible();
    await page.click('.delete-btn');
    await expect(page.locator('.sidebar-item span', { hasText: 'delete-me.gpx' })).not.toBeVisible();
  });
});
