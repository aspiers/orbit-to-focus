import { expect, type Page } from '@playwright/test';
import type { FrameInfo } from '../../src/testHook.ts';

declare global { interface Window { __otf: { log: FrameInfo[]; last(): FrameInfo | null; since(frame: number): FrameInfo[] } } }

// A fixed clock start, so the sky (Vega high in the west from London) is the same on every run. Only Date is
// fixed; timers and animation frames run as normal, and the app's own clock moves on from there.
export const START = new Date('2026-10-16T20:00:00Z');

export async function open(page: Page, hash = '') {
  await page.clock.setFixedTime(START);
  await page.goto('/' + hash);
  await page.waitForFunction(() => window.__otf?.last());
}

export const last = (page: Page) => page.evaluate(() => window.__otf.last()!);
export const since = (page: Page, frame: number) => page.evaluate((f) => window.__otf.since(f), frame);

// Waits for a fly-to to end: the camera stops moving between two looks 300 ms apart (time paused or slow).
export async function settle(page: Page, timeout = 8000) {
  const end = Date.now() + timeout;
  let a = await last(page);
  for (;;) {
    await page.waitForTimeout(300);
    const b = await last(page);
    if (angle(a.fwd, b.fwd) < 0.02 && Math.hypot(...b.pos.map((p, i) => p - a.pos[i])) < 1e-9 + 1e-5 * Math.hypot(...b.pos)) return b;
    if (Date.now() > end) throw new Error('the view never settled');
    a = b;
  }
}

// Angle between two unit vectors, in degrees.
export const angle = (a: number[], b: number[]) => (Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) * 180) / Math.PI;

export async function pause(page: Page) {
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
}

export const ladder = (page: Page, name: string) => page.locator('#ladder button', { hasText: name }).click();
