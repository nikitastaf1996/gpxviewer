import { test, expect } from '@playwright/test';
import path from 'path';

test('should load GPX and show stats', async ({ page }) => {
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));

  await page.goto('http://localhost:8080');

  // Check initial state
  await expect(page.locator('h1')).toContainText('GPX Viewer for Runners');

  // Upload a GPX file
  const filePath = path.resolve('public/sample.gpx');
  await page.setInputFiles('#gpx-file', filePath);

  // Wait for stats to be calculated
  // StatsBar uses .stat-value
  const distValue = page.locator('.stat-item:has-text("Distance") .stat-value');

  // Wait until it doesn't contain '-'
  await expect(distValue).not.toHaveText('-', { timeout: 15000 });

  const distanceText = await distValue.innerText();
  console.log('Distance Text:', distanceText);
  const distance = parseFloat(distanceText);
  expect(distance).toBeGreaterThan(0);

  // Open charts sidebar
  await page.click('#charts-toggle');
  await expect(page.locator('.sidebar-right')).toHaveClass(/active/);

  // Check if charts are rendered (canvas elements)
  const charts = page.locator('canvas');
  await expect(charts).toHaveCount(5); // Elevation, Pace/GAP, Combo, Hills, Splits

  // Check Hill Matrix
  await expect(page.locator('.hill-matrix')).toBeVisible();
});
