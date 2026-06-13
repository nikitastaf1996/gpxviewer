import { test, expect } from '@playwright/test';

test('should load the app and show the header', async ({ page }) => {
  await page.goto('http://localhost:8080');
  await expect(page.locator('h1')).toContainText('GPX Viewer for Runners');
});
