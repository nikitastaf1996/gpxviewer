const { test, expect } = require('@playwright/test');
const path = require('path');

// Smoke test for the workspace analysis optimizations (Tasks 1, 2, 3).
// Verifies:
//  - Task 1: stats banner shows context-aware fields per chart type
//  - Task 2: scrubber drag updates zoom range (throttling is internal)
//  - Task 3: dual polylines (background + highlighted) exist on the map

test.describe('Workspace Analysis Optimizations', () => {
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

    await page.click('#bottom-nav button:has-text("Library")');
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('label[title="Add GPX File"]').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.join(__dirname, '../samples/RK_gpx _2025-08-29_0734.gpx'));
  });

  test('Task 1: elevation mode shows only Dist + Ele in stats banner', async ({ page }) => {
    await page.click('button[title="Expand Elevation"]');
    await expect(page.locator('#fullscreen-analysis-workspace')).toBeVisible();

    const banner = page.locator('#workspace-stats-banner');
    // Dist + Ele visible
    await expect(banner.locator('.w-stat', { hasText: 'Dist' })).toBeVisible();
    await expect(banner.locator('.w-stat', { hasText: 'Ele' })).toBeVisible();
    // Pace + GAP hidden
    await expect(banner.locator('.w-stat', { hasText: 'Pace' })).toBeHidden();
    await expect(banner.locator('.w-stat', { hasText: 'GAP' })).toBeHidden();
  });

  test('Task 1: pace mode shows Dist + Pace + GAP (no Ele)', async ({ page }) => {
    await page.click('button[title="Expand Pace"]');
    await expect(page.locator('#fullscreen-analysis-workspace')).toBeVisible();

    const banner = page.locator('#workspace-stats-banner');
    await expect(banner.locator('.w-stat', { hasText: 'Dist' })).toBeVisible();
    await expect(banner.locator('.w-stat', { hasText: 'Pace' })).toBeVisible();
    await expect(banner.locator('.w-stat', { hasText: 'GAP' })).toBeVisible();
    await expect(banner.locator('.w-stat', { hasText: 'Ele' })).toBeHidden();
  });

  test('Task 1: combo mode shows Dist + Pace + Ele (no GAP)', async ({ page }) => {
    await page.click('button[title="Expand Combo"]');
    await expect(page.locator('#fullscreen-analysis-workspace')).toBeVisible();

    const banner = page.locator('#workspace-stats-banner');
    await expect(banner.locator('.w-stat', { hasText: 'Dist' })).toBeVisible();
    await expect(banner.locator('.w-stat', { hasText: 'Pace' })).toBeVisible();
    await expect(banner.locator('.w-stat', { hasText: 'Ele' })).toBeVisible();
    await expect(banner.locator('.w-stat', { hasText: 'GAP' })).toBeHidden();
  });

  test('Task 1: stats banner shows segment-average fallback on open', async ({ page }) => {
    await page.click('button[title="Expand Elevation"]');
    await expect(page.locator('#fullscreen-analysis-workspace')).toBeVisible();
    // Dist value should be a non-zero km range string (e.g. "X.XX km")
    const distVal = await page.locator('#workspace-stats-banner .w-stat:has-text("Dist") .w-stat-value').textContent();
    expect(distVal).toMatch(/km$/);
    expect(distVal).not.toMatch(/^0\.00 km$/);
  });

  test('Task 3: dual polylines exist on the workspace map', async ({ page }) => {
    await page.click('button[title="Expand Elevation"]');
    await expect(page.locator('#fullscreen-analysis-workspace')).toBeVisible();
    // Wait a tick for Alpine init + map setup
    await page.waitForTimeout(500);

    const result = await page.evaluate(() => {
      const ws = document.getElementById('fullscreen-analysis-workspace');
      // Alpine component instance is accessible via the __x property
      const cmp = ws && ws._x_dataStack ? ws._x_dataStack[0] : null;
      if (!cmp) return { ok: false, reason: 'no component' };
      return {
        ok: true,
        hasBackground: !!cmp.backgroundPolyline,
        hasHighlighted: !!cmp.highlightedPolyline,
        bgOptions: cmp.backgroundPolyline ? cmp.backgroundPolyline.options : null,
        hlOptions: cmp.highlightedPolyline ? cmp.highlightedPolyline.options : null,
        bgLatLngsLen: cmp.backgroundPolyline ? cmp.backgroundPolyline.getLatLngs().length : 0,
        hlLatLngsLen: cmp.highlightedPolyline ? cmp.highlightedPolyline.getLatLngs().length : 0,
      };
    });
    expect(result.ok).toBeTruthy();
    expect(result.hasBackground).toBeTruthy();
    expect(result.hasHighlighted).toBeTruthy();
    expect(result.bgOptions.color).toBe('#6c757d');
    expect(result.hlOptions.color).toBe('#0062ff');
    expect(result.hlOptions.weight).toBeGreaterThan(result.bgOptions.weight);
    // Background covers the full route; highlighted starts at full range too.
    expect(result.bgLatLngsLen).toBeGreaterThan(1);
    expect(result.hlLatLngsLen).toBeGreaterThan(1);
  });

  test('Task 2: scrubber drag updates zoom range + highlighted polyline', async ({ page }) => {
    await page.click('button[title="Expand Elevation"]');
    await expect(page.locator('#fullscreen-analysis-workspace')).toBeVisible();
    await page.waitForTimeout(500);

    const slider = page.locator('#workspace-chart-slider');
    const box = await slider.boundingBox();
    expect(box).toBeTruthy();

    // Query the actual end-handle pixel position from the chart's x-scale so we
    // grab the handle precisely (the chart area has internal padding, so the
    // handle is not at the canvas edge).
    const handlePos = await page.evaluate(() => {
      const ws = document.getElementById('fullscreen-analysis-workspace');
      const cmp = ws._x_dataStack[0];
      const { start, end } = Alpine.store('app').zoomRange;
      const chart = cmp.sliderChart;
      const xs = chart.scales.x.getPixelForValue(chart.data.datasets[0].data[start].x);
      const xe = chart.scales.x.getPixelForValue(chart.data.datasets[0].data[end].x);
      return {
        beforeStart: start,
        beforeEnd: end,
        dataLen: Alpine.store('app').activeProcessedData.length,
        xStartPixel: xs,
        xEndPixel: xe,
      };
    });

    // Target: drag the end handle leftward to 60% of the way between start and end.
    const targetEndPixel = handlePos.xStartPixel + (handlePos.xEndPixel - handlePos.xStartPixel) * 0.6;
    const startX = box.x + handlePos.xEndPixel;
    const startY = box.y + box.height / 2;
    const endX = box.x + targetEndPixel;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move((startX + endX) / 2, startY, { steps: 8 });
    await page.mouse.move(endX, startY, { steps: 8 });
    await page.mouse.up();
    // Let any pending rAF flush land.
    await page.waitForTimeout(200);

    const after = await page.evaluate(() => {
      const ws = document.getElementById('fullscreen-analysis-workspace');
      const cmp = ws._x_dataStack[0];
      return {
        afterStart: Alpine.store('app').zoomRange.start,
        afterEnd: Alpine.store('app').zoomRange.end,
        hlLen: cmp.highlightedPolyline ? cmp.highlightedPolyline.getLatLngs().length : 0,
        bgLen: cmp.backgroundPolyline ? cmp.backgroundPolyline.getLatLngs().length : 0,
      };
    });

    // The end bound should have moved left (shrunk).
    expect(after.afterEnd).toBeLessThan(handlePos.beforeEnd);
    // Start unchanged when dragging only the end handle.
    expect(after.afterStart).toBe(handlePos.beforeStart);
    // Highlighted polyline now covers fewer points than the full background.
    expect(after.hlLen).toBeLessThan(after.bgLen);
    expect(after.hlLen).toBeGreaterThan(0);
  });

  test('Task 2: scrubber has touch-action:none for mobile gesture isolation', async ({ page }) => {
    await page.click('button[title="Expand Elevation"]');
    await expect(page.locator('#fullscreen-analysis-workspace')).toBeVisible();
    const touchAction = await page.evaluate(() => {
      const el = document.getElementById('workspace-chart-slider');
      return window.getComputedStyle(el).touchAction;
    });
    expect(touchAction).toBe('none');
  });
});
