import { expect, test, type Locator, type Page } from '@playwright/test';
import { ladder, open, settle, START } from './helpers.ts';

const speed = (page: Page) => page.locator('#speed');
const clock = (page: Page) => page.locator('#clock');

type Box = { left: number; top: number; right: number; bottom: number };
// The boxes of the elements a selector matches, leaving out hidden ones.
const boxes = (page: Page, selector: string | Locator) => (typeof selector === 'string' ? page.locator(selector) : selector).evaluateAll((els) => els
  .map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height)
  .map(({ left, top, right, bottom }) => ({ left, top, right, bottom })));
const fmt = (b: Box) => `[${[b.left, b.top, b.right, b.bottom].map(Math.round).join(', ')}]`;
const near = (p: Box, q: Box, gap: number) => p.left < q.right + gap && q.left < p.right + gap && p.top < q.bottom + gap && q.top < p.bottom + gap;
// HUD parts that must keep apart, by at least the gap in px.
const apart: [string, string, number][] = [
  ['#timebar', '#ladder > *', 0], // a time bar wrapping onto another row once hid it behind the zoom buttons
  ['#timebar', '#panel', 12],
  ['#ladder > *', '#eyebox', 0], // the zoom buttons and scale note on short screens
  ['#timebar', '#eyebox', 0], // the camera view sits below the time bar on phones
  ['#ladder > *', '#readout', 0], // on phones the readout wraps onto three rows
  ['#readout', '#eyebox', 12], // the readout's fixed right edge once ignored the camera view's padding
  ['#panel', '#ladder > *', 0], // on short landscape screens the strip of zoom buttons once ran on under the panel
  ['#panel', '#readout', 0],
  ['#panel', '#eyebox', 0],
  ['#timebar', '#readout', 0],
];
const PHONES = [[360, 640], [375, 667], [390, 844], [412, 915], [430, 932]]; // portrait
const LANDSCAPE = [[667, 375], [844, 390], [932, 430]];

test.describe('controls', () => {
  test('the address restores the state on reload', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('tab', { name: 'Telescope' }).click();
    await page.getByRole('radio', { name: 'Refractor' }).check();
    await page.getByRole('radio', { name: 'Equatorial mode' }).check();
    await page.getByRole('tab', { name: 'Sky & place' }).click();
    await page.getByRole('checkbox', { name: 'See through the ground' }).check();
    await ladder(page, 'Your site');
    await expect(page).toHaveURL(/lesson=3.*view=site/);
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Sky & place' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('checkbox', { name: 'See through the ground' })).toBeChecked();
    await page.getByRole('tab', { name: 'Telescope' }).click();
    await expect(page.getByRole('radio', { name: 'Refractor' })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Equatorial mode' })).toBeChecked();
    await page.getByRole('tab', { name: 'Guide' }).click();
    await expect(page.locator('#panel .step')).toHaveText(/^3 of/);
    await expect(page.locator('#ladder button[aria-current=true]')).toContainText('Your site');
  });

  test('keyboard shortcuts change the time, layers and place', async ({ page }) => {
    await open(page);
    await speed(page).selectOption({ label: '10 min / s' });
    await page.locator('#view').click();
    await page.keyboard.press(']');
    await expect(speed(page)).toHaveValue('3600');
    await page.keyboard.press('[');
    await page.keyboard.press('[');
    await expect(speed(page)).toHaveValue('60');
    await page.keyboard.press('\\');
    await expect(page.getByRole('button', { name: /Backwards/ })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press(' ');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await page.keyboard.press('G');
    await page.getByRole('tab', { name: 'Sky & place' }).click();
    await expect(page.getByRole('checkbox', { name: 'See through the ground' })).toBeChecked();
    // From Greenwich, the default, to the next place in the list.
    await page.keyboard.press('P');
    await expect(page.getByRole('combobox', { name: 'Choose a place' })).toHaveValue('1');
    await page.keyboard.press('4');
    await expect(page.locator('#panel .step')).toHaveText(/^4 of/);
    await page.keyboard.press('PageDown');
    await expect(page.locator('#panel .step')).toHaveText(/^5 of/);
  });

  test('? shows and hides the shortcut list', async ({ page }) => {
    await open(page);
    const list = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await page.keyboard.press('?');
    await expect(list).toBeVisible();
    await expect(list.getByText('Track the target on or off')).toBeVisible();
    await page.keyboard.press('?');
    await expect(list).toBeHidden();
    await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
    await expect(list).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(list).toBeHidden();
  });

  test('the date picker sets the clock', async ({ page }) => {
    await open(page);
    await page.keyboard.press(' ');
    await page.keyboard.press('T');
    const dialog = page.getByRole('dialog', { name: 'Date and time' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('UTC').fill('2031-03-04T05:06');
    await dialog.getByRole('button', { name: 'Set', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(clock(page)).toHaveText('2031-03-04 05:06 UTC');
    await clock(page).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('UTC')).toHaveValue('2031-03-04T05:06');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  });

  // 1 week/s at the telescope is a blur; each zoom band caps the speed as you enter it.
  test('zooming in slows time to the band limit', async ({ page }) => {
    await open(page);
    await expect(speed(page)).toHaveValue('604800');
    await ladder(page, 'Earth & sky');
    await expect(speed(page)).toHaveValue('3600');
    await ladder(page, 'Telescope');
    await expect(speed(page)).toHaveValue('600');
    await speed(page).selectOption({ label: '1 day / s' }); // a faster speed picked afterwards is left alone
    await page.waitForTimeout(500);
    await expect(speed(page)).toHaveValue('86400');
  });

  // A number gaining a digit, a button changing its label or a target with a longer name once nudged everything
  // after it sideways, or onto another row.
  test('the time bar and readout keep their layout as values change', async ({ page }) => {
    test.setTimeout(90_000); // every target at five sizes
    await open(page);
    const corners = () => page.locator('#timebar > *, #readout .kv').evaluateAll((els) => els.flatMap((e) => {
      const r = e.getBoundingClientRect();
      return [r.left, r.top];
    }));
    // The furthest any of them moved. Fixed widths in ch still differ from the text's own width by a 64th of a pixel.
    const moved = async (from: number[]) => Math.max(...(await corners()).map((v, i) => Math.abs(v - from[i])));
    const playPause = page.getByRole('button', { name: /^(Pause|Play)$/ }), direction = page.getByRole('button', { name: /Forwards|Backwards/ });
    await playPause.click();
    const before = await corners();
    await playPause.click();
    await direction.click();
    expect(await moved(before)).toBeLessThan(0.5);
    await playPause.click();
    // Vega at other times: angles with other signs and numbers of digits, azimuth N to NW.
    await page.getByRole('tab', { name: 'Sky & place' }).click();
    for (const when of ['2026-01-01T00:00', '2026-07-01T12:00', '2026-04-09T09:41', '2026-10-17T03:30']) {
      await page.getByLabel('Set date and time in UTC').fill(when);
      await page.waitForTimeout(300); // the readout refreshes 8 times a second
      expect(await moved(before)).toBeLessThan(0.5);
    }
    // Every target, at desktop and phone widths: the phone's readout wraps onto several rows, and some targets
    // are below the horizon now, which adds a warning.
    await page.getByRole('tab', { name: 'Telescope' }).click();
    const target = page.getByRole('combobox', { name: 'Target', exact: true });
    // The time bar takes one row at 1280 px, two at 1024 and three at 900. At 1200 x 630 and 1280 x 650 the zoom
    // buttons, even without their hints, once ran on over the camera view.
    for (const [width, height] of [[1920, 1080], [1280, 800], [1280, 720], [1024, 768], [900, 700], [1200, 630], [1280, 650], [768, 1024], ...PHONES, ...LANDSCAPE]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(300);
      for (const [a, b, gap] of apart) {
        const [as, bs] = await Promise.all([boxes(page, a), boxes(page, b)]);
        const hits = as.flatMap((p) => bs.filter((q) => near(p, q, gap)).map((q) => `${fmt(p)} ${fmt(q)}`));
        expect.soft(hits, `${width} x ${height}: ${a} and ${b} ${gap ? `closer than ${gap} px` : 'overlap'}`).toEqual([]);
      }
    }
    for (const [width, height] of [[1280, 800], [1024, 768], [390, 844], [360, 640], [667, 375]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(300);
      const start = await corners();
      for (let i = 0; i < await target.locator('option').count(); i++) {
        await target.selectOption({ index: i });
        await page.waitForTimeout(300);
        expect(await moved(start), `${width} px, ${await page.locator('#readout .name').textContent()}`).toBeLessThan(0.5);
      }
    }
  });

  // Phones fold the hour angle and sidereal time away, so the step that teaches them says where they went.
  test('the meridian step tells phones where hour angle and sidereal time are', async ({ page }) => {
    await open(page, '#lesson=8');
    await expect(page.getByRole('heading', { name: 'The meridian' })).toBeVisible();
    const note = page.locator('#lessonBody').getByText('On a phone, tap');
    for (const [width, height] of [[1280, 800], [768, 1024], [390, 844], [667, 375]]) {
      await page.setViewportSize({ width, height });
      if (width >= 700) await expect(note, `${width} x ${height}`).toBeHidden();
      else await expect(note, `${width} x ${height}`).toBeVisible();
    }
  });

  test('on phones the hidden panel can be shown again', async ({ page }) => {
    await open(page);
    const tabs = page.locator('#panel [role=tablist]');
    for (const [width, height] of [[390, 844], [360, 740]]) {
      await page.setViewportSize({ width, height });
      await page.getByRole('button', { name: 'Hide' }).click();
      await expect(tabs).toBeHidden();
      const show = page.getByRole('button', { name: 'Show' });
      // The hidden panel once sat at the top of the screen, behind the time bar.
      const [b] = await boxes(page, '#panel header button[aria-expanded]');
      expect(b.left >= 0 && b.top >= 0 && b.right <= width && b.bottom <= height, `${width} x ${height}: ${fmt(b)} off screen`).toBe(true);
      for (const hud of ['#timebar', '#ladder > *', '#readout', '#eyebox']) {
        const hits = (await boxes(page, hud)).filter((q) => near(b, q, 0)).map(fmt);
        expect(hits, `${width} x ${height}: the show button ${fmt(b)} under ${hud}`).toEqual([]);
      }
      expect(await show.evaluate((e) => {
        const r = e.getBoundingClientRect();
        return e.contains(document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2));
      }), `${width} x ${height}: something covers the show button`).toBe(true);
      await show.click();
      await expect(tabs).toBeVisible();
    }
    // And from the keyboard.
    await page.getByRole('button', { name: 'Hide' }).focus();
    await page.keyboard.press('Enter');
    await expect(tabs).toBeHidden();
    await expect(page.getByRole('button', { name: 'Show' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(tabs).toBeVisible();
  });
});

// The HUD on phones, as a touch screen shows it: every part clear of the others and on the screen, readable, tappable
// and leaving a real area of sky, with the panel open and hidden, on three guide steps.
for (const [width, height] of [...PHONES, ...LANDSCAPE]) {
  const landscape = width > height;
  test.describe(`phone ${width} x ${height}`, () => {
    test.use({ viewport: { width, height }, isMobile: true, hasTouch: true });
    test('the HUD stays clear, on screen and tappable', async ({ page }) => {
      await open(page);
      const steps = [1, 13, 21];
      for (const step of steps) {
        while (+(await page.locator('#panel .step').textContent())!.split(' ')[0] < step) await page.keyboard.press('PageDown');
        for (const hidden of [false, true]) {
          if (hidden) await page.getByRole('button', { name: 'Hide' }).tap({ force: true });
          await page.waitForTimeout(300);
          const m = await page.evaluate(measureHud);
          const where = `${width} x ${height}, step ${step}, panel ${hidden ? 'hidden' : 'open'}`;
          expect.soft(m.overlaps, `${where}: HUD parts overlap`).toEqual([]);
          expect.soft(m.off, `${where}: controls off screen`).toEqual([]);
          expect.soft(m.covered, `${where}: controls under something else`).toEqual([]);
          expect.soft(m.small, `${where}: touch targets under 38 px`).toEqual([]);
          expect.soft(m.spill, `${where}: content outside its box`).toEqual([]);
          expect.soft(m.cue, `${where}: the zoom strip scrolls with no fade at its cut-off end`).toBe(true);
          expect.soft(m.sky, `${where}: tallest clear band of sky, % of the screen`).toBeGreaterThanOrEqual(landscape ? (hidden ? 62 : 58) : hidden ? 65 : 44);
          // The compact layout: each part is one row, and slim.
          expect.soft(m.timeRows, `${where}: time bar controls on one row`).toBe(1);
          expect.soft(m.h.timebar, `${where}: time bar height`).toBeLessThanOrEqual(52);
          expect.soft(m.h.readout, `${where}: readout height`).toBeLessThanOrEqual(34);
          expect.soft(m.h.chip, `${where}: visible height of a zoom chip`).toBeLessThanOrEqual(34);
          expect.soft(m.h.eyebox, `${where}: camera view height`).toBeLessThanOrEqual(92);
          expect.soft(m.headRows, `${where}: panel title row, tabs and buttons on one row`).toBe(1);
          expect.soft(m.h.head, `${where}: panel height above its content`).toBeLessThanOrEqual(48);
          if (!hidden) {
            const next = (await page.getByRole('button', { name: 'Next', exact: true }).boundingBox())!;
            expect.soft(next.y + next.height, `${where}: bottom of the guide's Next button, unscrolled`).toBeLessThanOrEqual(height);
          }
          if (hidden) await page.getByRole('button', { name: 'Show' }).tap({ force: true });
        }
      }
    });

    // What the compact layout folds away stays within a tap's reach.
    test('the folded time controls and coordinates open on a tap', async ({ page }) => {
      await open(page);
      const inView = async (loc: Locator, what: string) => {
        for (const b of await boxes(page, loc)) {
          expect(b.left >= 0 && b.top >= 0 && b.right <= width && b.bottom <= height, `${what} ${fmt(b)} off screen`).toBe(true);
          expect(b.bottom - b.top >= 38 || b.right - b.left >= 38, `${what} ${fmt(b)} too small to tap`).toBe(true);
        }
      };
      await page.getByRole('button', { name: 'Pause', exact: true }).tap();
      await expect(clock(page)).not.toHaveText('2026-10-16 20:00 UTC');
      const more = page.getByRole('button', { name: 'More controls' }), pop = page.getByRole('group', { name: 'More controls' });
      await expect(more).toHaveAttribute('aria-expanded', 'false');
      await more.tap();
      await expect(pop).toBeVisible();
      await expect(more).toHaveAttribute('aria-expanded', 'true');
      await inView(pop.getByRole('button'), 'popover button');
      await inView(pop, 'popover');
      await expect(pop.getByText('Sidereal time')).toBeVisible();
      await expect(pop.getByText('Sun altitude')).toBeVisible();
      const direction = pop.getByRole('button', { name: /Forwards|Backwards/ });
      await direction.tap();
      await expect(direction).toHaveAttribute('aria-pressed', 'true');
      await expect(pop).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(pop).toBeHidden();
      await more.tap();
      await page.touchscreen.tap(width / 2, height / 2);
      await expect(pop).toBeHidden();
      await more.tap();
      await pop.getByRole('button', { name: 'Now' }).tap();
      await expect(pop).toBeHidden();
      await expect(clock(page)).toHaveText('2026-10-16 20:00 UTC');
      // The bar itself has no second copy of these controls on screen.
      await expect(page.getByRole('button', { name: 'Now' })).toHaveCount(0);

      const extra = page.locator('#readout .extra'), moreCoords = page.getByRole('button', { name: 'More coordinates' });
      await expect(extra.first()).toBeHidden();
      await inView(moreCoords, 'readout button');
      await moreCoords.tap();
      await expect(moreCoords).toHaveAttribute('aria-expanded', 'true');
      for (const e of await extra.all()) await expect(e).toBeVisible();
      await inView(page.locator('#readout'), 'open readout');
      expect(await boxes(page, '#readout .extra').then((bs) => bs.length)).toBe(3);
      await expect(page.locator('#readout')).toContainText(/RA .*Dec .*Hour angle .*Latitude/);
      const [r] = await boxes(page, '#readout'), [p] = await boxes(page, '#panel');
      expect(near(r, p, 0), `open readout ${fmt(r)} over the panel ${fmt(p)}`).toBe(false);
      await moreCoords.tap();
      await expect(extra.first()).toBeHidden();
    });
  });
}

// Guide step 1 shows the whole of Earth's orbit: wherever the Earth is in the year it is on screen and clear of the
// camera view, and the orbit's labels, which hang off to the right of their points, stay on screen. The field of view
// is fixed vertically, so on portrait phones the orbit once ran off both sides, under the camera view.
for (const [width, height] of [[360, 640], [390, 844], [667, 375], [768, 1024], [1280, 800]]) {
  test.describe(`${width} x ${height}`, () => {
    test.use({ viewport: { width, height }, isMobile: width < 1000, hasTouch: width < 1000 });
    test('guide step 1 fits the orbit beside the camera view', async ({ page }) => {
      for (let month = 0; month < 12; month += 2) {
        await open(page, '', new Date(START.getTime() + month * 30.44 * 86400e3));
        await settle(page);
        const m = await page.evaluate(() => {
          const e = document.querySelector('#eyebox')!.getBoundingClientRect();
          const labels = [...document.querySelectorAll<HTMLElement>('.lbl.l-solar')].filter((l) => +getComputedStyle(l).opacity > 0.03)
            .map((l) => { const b = l.getBoundingClientRect(); return { text: l.textContent!, left: b.left, top: b.top, right: b.right, bottom: b.bottom }; });
          return { earth: window.__otf.last()!.earth!, eye: { left: e.left, top: e.top, right: e.right, bottom: e.bottom }, labels };
        });
        const [x, y, r] = m.earth, where = `month ${month}: Earth at [${[x, y, r].map(Math.round)}]`;
        expect.soft(x - r >= 0 && x + r <= width && y - r >= 0 && y + r <= height, `${where} off screen`).toBe(true);
        const gap = Math.hypot(Math.max(m.eye.left - x, 0, x - m.eye.right), Math.max(m.eye.top - y, 0, y - m.eye.bottom));
        expect.soft(gap, `${where}, under the camera view ${fmt(m.eye)}`).toBeGreaterThan(r);
        for (const l of m.labels) {
          expect.soft(l.left >= 0 && l.right <= width && l.top >= 0 && l.bottom <= height, `month ${month}: label ${l.text} ${fmt(l)} off screen`).toBe(true);
        }
      }
    });
  });
}

// Runs in the page. The zoom strip's buttons count as the part of them the strip shows; scrolled panel content is the
// panel's own business.
function measureHud() {
  const vis = (e: Element) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const rect = (e: Element) => {
    const r = e.getBoundingClientRect(), strip = e.parentElement?.id === 'ladder' ? e.parentElement.getBoundingClientRect() : null;
    return strip ? [Math.max(r.left, strip.left), r.top, Math.min(r.right, strip.right), r.bottom] : [r.left, r.top, r.right, r.bottom];
  };
  const name = (e: Element) => (e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 20);
  const parts: [string, Element[]][] = ['#timebar', '#ladder > *', '#readout', '#eyebox', '#panel'].map((q) => [q, [...document.querySelectorAll(q)].filter(vis)]);
  const hit = (a: number[], b: number[]) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const overlaps: string[] = [];
  parts.forEach(([qa, as], i) => parts.slice(i + 1).forEach(([qb, bs]) => as.forEach((a) => bs.forEach((b) => {
    if (hit(rect(a), rect(b))) overlaps.push(`${qa} ${name(a)} [${rect(a).map(Math.round)}] and ${qb} ${name(b)} [${rect(b).map(Math.round)}]`);
  }))));
  const strip = document.getElementById('ladder')!;
  const scrolls = strip.scrollWidth > strip.clientWidth + 1;
  const controls = [...document.querySelectorAll('#timebar button, #timebar select, #ladder button, #readoutMore, #eyebox canvas, #panel header button, #panel [role=tab], #panel [role=tabpanel] button')].filter(vis);
  const off: string[] = [], covered: string[] = [], small: string[] = [];
  for (const e of controls) {
    const r = rect(e), inPanelBody = !!e.closest('[role=tabpanel]');
    if (inPanelBody) continue;
    if (e.closest('#ladder') && scrolls) continue;
    if (r[0] < -1 || r[1] < -1 || r[2] > innerWidth + 1 || r[3] > innerHeight + 1) off.push(`${name(e)} [${r.map(Math.round)}]`);
    else {
      const top = document.elementFromPoint((r[0] + r[2]) / 2, (r[1] + r[3]) / 2);
      if (!top || !(e.contains(top) || top.contains(e))) covered.push(`${name(e)} under ${top?.id || top?.className || top?.tagName}`);
    }
  }
  for (const e of controls) {
    const b = e.getBoundingClientRect();
    if (!e.matches('canvas') && (b.height < 38 || b.width < 38)) small.push(`${name(e)} ${Math.round(b.width)} x ${Math.round(b.height)}`);
  }
  // Text spilling out of a box: any descendant outside the bounds of the part that holds it.
  const spill: string[] = [];
  for (const root of document.querySelectorAll('#timebar, #readout, #eyebox, #ladder button, #panel header')) {
    // On phones the panel's header has no box of its own: its buttons sit in the panel's grid beside the tabs.
    if (getComputedStyle(root).display === 'contents') continue;
    const R = root.getBoundingClientRect();
    for (const e of root.querySelectorAll('*')) {
      // The readout's button is taller than the row, for a bigger tap target.
      if (!vis(e) || e.closest('#readoutMore')) continue;
      const r = e.getBoundingClientRect();
      if (r.left < R.left - 1 || r.right > R.right + 1 || r.top < R.top - 1 || r.bottom > R.bottom + 1) spill.push(`${name(e)} in ${root.id || name(root)}`);
    }
  }
  const mask = getComputedStyle(strip).maskImage;
  const cue = !scrolls || (mask !== 'none' && mask !== '');
  // A row is clear sky when the widest gap between HUD boxes on it is at least a third of the screen.
  const rects = parts.flatMap(([, es]) => es.map(rect));
  let best = 0, run = 0;
  for (let y = 0; y < innerHeight; y += 4) {
    let x = 0, gap = 0;
    for (const [l, , r] of rects.filter((b) => b[1] <= y && y < b[3]).sort((p, q) => p[0] - q[0])) { gap = Math.max(gap, l - x); x = Math.max(x, r); }
    run = Math.max(gap, innerWidth - x) >= innerWidth / 3 ? run + 4 : 0;
    best = Math.max(best, run);
  }
  // The compact layout. Rows: the controls' vertical centres lie within a few px of each other. A zoom chip's tap box
  // is taller than the chip you see, by its transparent top and bottom borders.
  const oneRow = (es: Element[]) => { const c = es.map((e) => { const r = e.getBoundingClientRect(); return (r.top + r.bottom) / 2; }); return Math.max(...c) - Math.min(...c) <= 8 ? 1 : 2; };
  const height = (q: string) => { const e = document.querySelector(q); return e && vis(e) ? e.getBoundingClientRect().height : 0; };
  const chip = document.querySelector('#ladder button')!, chipBorder = parseFloat(getComputedStyle(chip).borderTopWidth);
  const panel = document.getElementById('panel')!, body = document.querySelector('#panel [role=tabpanel]');
  const h = {
    timebar: height('#timebar'), readout: height('#readout'), eyebox: height('#eyebox'), chip: chip.getBoundingClientRect().height - 2 * chipBorder,
    // Where the panel's content starts, or its own height when the panel is hidden.
    head: body && vis(body) ? body.getBoundingClientRect().top - panel.getBoundingClientRect().top : panel.getBoundingClientRect().height,
  };
  const timeRows = oneRow([...document.querySelectorAll('#timebar > *')].filter(vis));
  const headRows = oneRow([...document.querySelectorAll('#panel header button, #panel [role=tablist]')].filter(vis));
  return { overlaps, off, covered, small, spill, cue, h, timeRows, headRows, sky: Math.round((100 * best) / innerHeight) };
}
