const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('GPX Viewer Mass Import and Clear', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:8000');
    });

    test('should mass import GPX files from a ZIP archive using dedicated button', async ({ page }) => {
        const zipPath = path.resolve('test_runs.zip');

        // Go to Library
        await page.click('#bottom-nav button:has-text("Library")');

        // Upload ZIP using dedicated zip-file input
        await page.setInputFiles('#zip-file', zipPath);

        // Check if progress bar appears
        const progressText = page.locator('text=Importing...');
        await expect(progressText).toBeVisible();

        // ZIP contains run1.gpx and run2.gpx (both copies of sample.gpx)
        // Wait for them to appear in the list.
        await expect(page.locator('.run-card')).toHaveCount(2, { timeout: 15000 });

        const cardTexts = await page.locator('.run-card').allTextContents();
        expect(cardTexts.some(t => t.includes('Fenestrelle'))).toBe(true);

        // Progress bar should eventually disappear
        await expect(progressText).not.toBeVisible();
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
