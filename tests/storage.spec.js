const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('GPX Viewer Storage', () => {
    test.beforeEach(async ({ page }) => {
        // Serve the application
        await page.goto('http://localhost:8000');
    });

    test('should upload and save a GPX file to IndexedDB', async ({ page }) => {
        const filePath = path.join(__dirname, '..', 'sample.gpx');

        // Wait for list to load (initially empty or from previous tests)
        await page.waitForSelector('#saved-list');

        // Upload file
        await page.setInputFiles('#gpx-file', filePath);

        // Check if it appears in the list - Fenestrelle is in sample.gpx
        await expect(page.locator('.run-card')).toContainText('Fenestrelle', { timeout: 10000 });

        // Reload and check if it's still there (Persistence)
        await page.reload();
        await page.waitForSelector('.run-card');
        await expect(page.locator('.run-card')).toContainText('Fenestrelle');

        // Verify IndexedDB exists
        const dbExists = await page.evaluate(async () => {
            const dbs = await window.indexedDB.databases();
            return dbs.some(db => db.name === 'GpxViewerDB');
        });
        expect(dbExists).toBe(true);
    });

    test('should migrate data from localStorage to IndexedDB', async ({ page }) => {
        // Ensure clean state for migration test
        await page.evaluate(async () => {
            const dbs = await window.indexedDB.databases();
            dbs.forEach(db => window.indexedDB.deleteDatabase(db.name));
        });

        // Seed localStorage
        await page.evaluate(() => {
            localStorage.setItem('gpxMetadata', JSON.stringify({
                'legacy.gpx': {
                    date: '2023-01-01T00:00:00.000Z',
                    distance: 10,
                    avgPace: 5,
                    lat: 0,
                    lon: 0,
                    city: 'Legacy City'
                }
            }));
            localStorage.setItem('gpxFiles', JSON.stringify({
                'legacy.gpx': '<?xml version="1.0"?><gpx></gpx>'
            }));
            localStorage.setItem('gpxViewerSettings', JSON.stringify({
                elevation: false,
                pace: true,
                combo: true,
                climb: true,
                splits: true
            }));
        });

        // Reload to trigger migration
        await page.reload();
        await page.waitForSelector('.run-card');

        // Check if legacy data is visible
        await expect(page.locator('.run-card')).toContainText('Legacy City');

        // Check settings migration
        await page.click('button:has-text("Settings")');
        const elevationCheckbox = page.locator('label:has-text("Elevation Profile") + input');
        await expect(elevationCheckbox).not.toBeChecked();

        // Verify 'migrated' flag in IndexedDB
        const isMigrated = await page.evaluate(async () => {
            return new Promise((resolve) => {
                const request = indexedDB.open('GpxViewerDB', 1);
                request.onsuccess = (e) => {
                    const db = e.target.result;
                    const transaction = db.transaction(['settings'], 'readonly');
                    const getRequest = transaction.objectStore('settings').get('migrated');
                    getRequest.onsuccess = () => resolve(getRequest.result);
                };
            });
        });
        expect(isMigrated).toBe(true);
    });

    test('should delete a GPX file', async ({ page }) => {
        const filePath = path.join(__dirname, '..', 'sample.gpx');

        // Use the nav button to go to Library
        await page.click('#bottom-nav button:has-text("Library")');

        await page.setInputFiles('#gpx-file', filePath);

        // Wait for it to appear
        const card = page.locator('.run-card').filter({ hasText: 'Fenestrelle' });
        await expect(card).toContainText('Fenestrelle');

        // It might have switched to Analyze tab automatically, switch back to Library to delete
        await page.click('#bottom-nav button:has-text("Library")');

        // Delete
        await card.locator('.delete-btn').click();
        await expect(page.locator('.run-card')).not.toBeVisible();

        // Reload and check
        await page.reload();
        await expect(page.locator('.run-card')).not.toBeVisible();
    });
});
