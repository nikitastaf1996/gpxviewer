const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('GPX Viewer Mass Import and Clear', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:8000');
    });

    test('should mass import GPX files from a ZIP archive and ignore non-GPX files', async ({ page }) => {
        const zipPath = path.resolve('test_runs.zip');

        // Go to Library
        await page.click('#bottom-nav button:has-text("Library")');

        // Upload ZIP
        await page.setInputFiles('#gpx-file', zipPath);

        // ZIP contains run1.gpx and run2.gpx (both copies of sample.gpx)
        // Wait for them to appear in the list.
        // It switches to Analyze tab, so we might need to go back or just check count (existence)
        await expect(page.locator('.run-card')).toHaveCount(2, { timeout: 10000 });

        const cardTexts = await page.locator('.run-card').allTextContents();
        expect(cardTexts.some(t => t.includes('Fenestrelle'))).toBe(true);
    });

    test('should clear the entire library', async ({ page }) => {
        const gpxPath = path.resolve('sample.gpx');

        // First upload something
        await page.click('#bottom-nav button:has-text("Library")');
        await page.setInputFiles('#gpx-file', gpxPath);

        // Wait for it to be in DOM
        await expect(page.locator('.run-card')).toHaveCount(1, { timeout: 10000 });

        // Go to Settings
        await page.click('#bottom-nav button:has-text("Settings")');

        // Click Clear Library and handle confirm
        page.on('dialog', dialog => dialog.accept());
        await page.click('button:has-text("Clear Library")');

        // Go back to Library and check if empty
        await page.click('#bottom-nav button:has-text("Library")');
        await expect(page.locator('.run-card')).not.toBeVisible();

        // Check IndexedDB is empty
        const isDbEmpty = await page.evaluate(async () => {
            const db = await new Promise((resolve) => {
                const request = indexedDB.open('GpxViewerDB', 1);
                request.onsuccess = (e) => resolve(e.target.result);
            });
            const transaction = db.transaction(['files', 'metadata'], 'readonly');
            const filesStore = transaction.objectStore('files');
            const metaStore = transaction.objectStore('metadata');

            const filesCount = await new Promise(r => {
                const req = filesStore.count();
                req.onsuccess = e => r(e.target.result);
            });
            const metaCount = await new Promise(r => {
                const req = metaStore.count();
                req.onsuccess = e => r(e.target.result);
            });
            return filesCount === 0 && metaCount === 0;
        });
        expect(isDbEmpty).toBe(true);
    });
});
