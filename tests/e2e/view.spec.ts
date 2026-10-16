import { expect, test } from '@playwright/test';
import { METRE } from '../../src/constants.ts';
import { angle, last, ladder, open, pause, settle, since } from './helpers.ts';

test.describe('the 3D view', () => {
  // Rebuilding the telescope once re-aimed the camera, which re-ran the rebuild dozens of times (3.6 s a step).
  test('slider steps and correction toggles finish in under 100 ms', async ({ page }) => {
    await open(page);
    await pause(page);
    await ladder(page, 'Inside the tube');
    await settle(page); // the rebuild re-aims the camera only once it is inside the tube
    await page.getByRole('tab', { name: 'Telescope' }).click();
    const ms = await page.evaluate(() => {
      const slider = document.querySelector<HTMLInputElement>('#focal')!;
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      const time = (f: () => void) => { const t0 = performance.now(); f(); return performance.now() - t0; };
      const steps = [270, 280, 290, 300].map((v) => time(() => { setValue.call(slider, String(v)); slider.dispatchEvent(new Event('input', { bubbles: true })); }));
      const box = [...document.querySelectorAll<HTMLInputElement>('#panel input[type=checkbox]')].find((b) => b.closest('label')?.textContent?.includes('doublet'))!;
      return [...steps, time(() => box.click()), time(() => box.click())];
    });
    expect(ms).toHaveLength(6);
    expect(Math.max(...ms)).toBeLessThan(100);
  });

  // The guide's first step opens at 1 week/s, where the mount's opening slew can never catch its target. That
  // slew once kept the page drawing at 60 fps for good.
  test('draws nothing while paused and idle, and about 30 fps with only time running', async ({ page }) => {
    await open(page);
    // The opening fly-to, then the 1.5 s of full-rate frames after each change. At 10 min/s the slew ends.
    for (const [speed, wait] of [['1 week / s', 5000], ['10 min / s', 2500]] as const) {
      await page.locator('#speed').selectOption({ label: speed });
      await page.waitForTimeout(wait);
      const a = (await last(page)).frame;
      await page.waitForTimeout(2000);
      const running = ((await last(page)).frame - a) / 2;
      expect(running, speed).toBeGreaterThan(20);
      expect(running, speed).toBeLessThan(40);
    }
    await pause(page);
    await page.waitForTimeout(2000);
    const b = (await last(page)).frame;
    await page.waitForTimeout(2000);
    expect((await last(page)).frame).toBe(b);
  });

  // Dragging down once raised the camera until the ground rule tilted the view and pushed the telescope off.
  test('keeps the telescope where it is on screen while dragging in a ground view', async ({ page }) => {
    await open(page);
    await pause(page);
    await ladder(page, 'Telescope');
    const settled = await settle(page), start = settled.scope!;
    expect(start).not.toBeNull();
    const box = (await page.locator('#view').boundingBox())!;
    const [x, y] = [box.x + box.width * 0.6, box.y + box.height * 0.3];
    await page.mouse.move(x, y);
    await page.mouse.down();
    const seen: [number, number][] = [];
    for (const [dx, dy] of [[0, 60], [0, 120], [0, 200], [80, 200], [-120, 100], [-120, -150]]) {
      await page.mouse.move(x + dx, y + dy, { steps: 4 });
      await page.waitForTimeout(100);
      seen.push((await last(page)).scope!);
    }
    expect(angle(settled.fwd, (await last(page)).fwd)).toBeGreaterThan(5); // the drag did turn the view
    await page.mouse.up();
    for (const p of seen) expect(Math.hypot(p[0] - start[0], p[1] - start[1])).toBeLessThan(3);
  });

  // Dragging up once stopped where the camera met the ground, short of the zenith (by 43 degrees for a low
  // target at Your site). Now the camera comes in towards the telescope along the ground instead.
  for (const [target, link] of [['a high target', 'ra=284.505&dec=46.836'], ['a low target', 'ra=325&dec=-20']]) {
    for (const view of ['Your site', 'Telescope']) {
      test(`dragging up at ${view} shows the zenith over ${target}, and dragging back undoes it`, async ({ page }) => {
        await open(page, `#lesson=21&view=site&speed=600&target=Custom&${link}&layers=ecl,hor,con,names,labels`);
        await pause(page);
        await ladder(page, view);
        const settled = await settle(page), start = settled.scope!;
        type Frame = typeof settled;
        const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
        const topEdge = (f: Frame) => (Math.asin(dot(f.fwd, f.up)) * 180) / Math.PI + f.fov / 2;
        const height = (f: Frame) => dot(f.pos.map((p, i) => p - settled.pos[i]), settled.up) / METRE; // metres
        const box = (await page.locator('#view').boundingBox())!;
        const [x, y] = [box.x + box.width * 0.6, box.y + box.height * 0.9];
        const frames: Frame[] = [];
        const dragTo = async (dy: number) => { await page.mouse.move(x, y - dy); await page.waitForTimeout(40); frames.push(await last(page)); };
        // Up in small steps until the zenith shows, so the drag back retraces it exactly.
        await page.mouse.move(x, y);
        await page.mouse.down();
        let dy = 0;
        while (dy < 600 && !(frames.length && topEdge(frames.at(-1)!) >= 90)) await dragTo((dy += 5));
        await page.mouse.up();
        const top = frames.at(-1)!, up = frames.splice(0);
        await page.waitForTimeout(1500);
        const released = await last(page);
        await page.mouse.down();
        while (dy > 0) await dragTo((dy = Math.max(0, dy - 20)));
        await page.mouse.up();
        if (target === 'a low target') expect(top.fov).toBeLessThan(51); // the narrowest view, the hardest case
        expect(topEdge(top)).toBeGreaterThanOrEqual(90);
        for (const f of [...up, released, ...frames]) {
          expect(Math.hypot(f.scope![0] - start[0], f.scope![1] - start[1])).toBeLessThan(3);
          expect(Math.abs(f.fov - settled.fov)).toBeLessThan(0.1);
        }
        // Once down at the ground the camera only moves along it, never lower.
        expect(height(top) - Math.min(...up.map(height))).toBeLessThan(0.002);
        expect(angle(top.fwd, released.fwd)).toBeLessThan(0.5); // no snapping back after letting go
        const back = [released, ...frames];
        expect(Math.max(...back.slice(1).map((f, i) => angle(back[i].fwd, f.fwd)))).toBeLessThan(8); // no jumps
        expect(angle(frames.at(-1)!.fwd, settled.fwd)).toBeLessThan(0.5);
        expect(Math.hypot(...frames.at(-1)!.pos.map((p, i) => p - settled.pos[i])) / METRE).toBeLessThan(0.02);
      });
    }
  }

  // The framing rules used to keep easing the view back to their goal whenever you weren't zooming.
  test('a view dragged inside the tube stays where it was left', async ({ page }) => {
    await open(page);
    await pause(page);
    // The refractor's longer tube puts its cut-away inside the zoom band where the side-on rule applies.
    await page.getByRole('tab', { name: 'Telescope' }).click();
    await page.getByRole('radio', { name: 'Refractor' }).check();
    await ladder(page, 'Inside the tube');
    const before = await settle(page);
    const box = (await page.locator('#view').boundingBox())!;
    const [x, y] = [box.x + box.width * 0.6, box.y + box.height * 0.5];
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 150, y + 60, { steps: 10 });
    await page.waitForTimeout(300); // still holding: the last move is drawn, and no rule acts during a drag
    const dragged = await last(page);
    await page.mouse.up();
    expect(angle(before.fwd, dragged.fwd)).toBeGreaterThan(10);
    await page.waitForTimeout(2500);
    const after = await last(page);
    expect(angle(dragged.fwd, after.fwd)).toBeLessThan(0.5);
  });

  // A noisy 'up' once spun the camera round by up to 40 000 degrees a second between frames; a smooth flight
  // stays under 200.
  const fastestTurn = (frames: { t: number; fwd: number[]; up: number[] }[]) =>
    Math.max(...frames.slice(1).map((f, i) => Math.max(angle(frames[i].fwd, f.fwd), angle(frames[i].up, f.up)) / ((f.t - frames[i].t) / 1000)));

  test('guide 11 flies to the meridian slice without jitter', async ({ page }) => {
    await open(page, '#lesson10'); // the old link form, which every version reads
    await page.waitForTimeout(5000);
    const from = (await last(page)).frame;
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.locator('#panel .step')).toHaveText(/^11 of/);
    await page.waitForTimeout(6500);
    const frames = await since(page, from);
    expect(frames.length).toBeGreaterThan(60);
    expect(fastestTurn(frames)).toBeLessThan(500);
  });

  test('guide 13 widens the view smoothly as the star moves', async ({ page }) => {
    await open(page, '#lesson13');
    await expect(page.locator('#panel .step')).toHaveText(/^13 of/);
    await page.waitForTimeout(4000);
    await page.locator('#speed').selectOption({ label: '10 min / s' });
    const from = (await last(page)).frame;
    await page.waitForTimeout(3000);
    const fov = (await since(page, from)).map((f) => f.fov);
    expect(Math.max(...fov) - Math.min(...fov)).toBeGreaterThan(1); // the test means something only if it zooms
    expect(Math.max(...fov.slice(1).map((f, i) => Math.abs(f - fov[i])))).toBeLessThan(0.5);
  });
});
