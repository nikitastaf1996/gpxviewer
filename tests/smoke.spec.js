import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('http://localhost:8080/');
  await expect(page).toHaveTitle(/Simple GPX Viewer/);
});

test('header is visible', async ({ page }) => {
  await page.goto('http://localhost:8080/');
  const header = page.locator('header h1');
  await expect(header).toBeVisible();
  await expect(header).toHaveText('GPX Viewer for Runners');
});
