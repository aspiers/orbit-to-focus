import { expect, test } from '@playwright/test';
import { angle, last, open } from './helpers.ts';

test.describe('the mount', () => {
  // At Sydney the wedge once tipped the polar axis 124 degrees, past the horizontal, so it pointed at the north
  // celestial pole under the ground. It should rise from the horizon nearer its pole by the latitude.
  for (const [place, lat, lon] of [['Sydney', -33.9, 151.2], ['Greenwich', 51.4769, 0]] as const) {
    test(`tilts the polar axis up to the celestial pole at ${place} and tracks the target`, async ({ page }) => {
      await open(page, `#lesson=12&loc=${lat},${lon}`, new Date('2026-10-16T08:00:00Z')); // Vega is up from both
      await expect(page.locator('#panel .step')).toHaveText(/^12 of/);
      const r = (Math.abs(lat) * Math.PI) / 180, pole = [0, Math.sin(r), lat < 0 ? Math.cos(r) : -Math.cos(r)]; // x east, y up, z south
      await expect.poll(async () => angle((await last(page)).polar!, pole), { timeout: 10000 }).toBeLessThan(0.5);
      await page.waitForTimeout(3000); // the fly-to ends
      const { scope } = await last(page), view = page.viewportSize()!;
      expect(scope).not.toBeNull();
      expect(scope![0]).toBeGreaterThan(0); expect(scope![0]).toBeLessThan(view.width);
      expect(scope![1]).toBeGreaterThan(0); expect(scope![1]).toBeLessThan(view.height);
      await page.getByRole('tab', { name: 'Telescope' }).click();
      await expect(page.locator('#panel .kv', { hasText: 'axis' })).toHaveText('on axis'); // time runs at 10 min/s
    });
  }
});
