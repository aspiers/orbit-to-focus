import { expect, test, type Page } from '@playwright/test';
import { ladder, open } from './helpers.ts';

const speed = (page: Page) => page.locator('#speed');
const clock = (page: Page) => page.locator('#clock');

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

  test('keyboard shortcuts change the time and layers', async ({ page }) => {
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

  // A number gaining a digit or a button changing its label once nudged everything after it sideways.
  test('the time bar and readout keep their layout as values change', async ({ page }) => {
    await open(page);
    const lefts = () => page.locator('#timebar > *, #readout .kv').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left * 10) / 10));
    const playPause = page.getByRole('button', { name: /^(Pause|Play)$/ }), direction = page.getByRole('button', { name: /Forwards|Backwards/ });
    await playPause.click();
    const before = await lefts();
    await playPause.click();
    await direction.click();
    expect(await lefts()).toEqual(before);
    await playPause.click();
    // Vega at other times: angles with other signs and numbers of digits, azimuth N to NW. (Only the target's
    // name is allowed to move what follows it.)
    await page.getByRole('tab', { name: 'Sky & place' }).click();
    for (const when of ['2026-01-01T00:00', '2026-07-01T12:00', '2026-04-09T09:41', '2026-10-17T03:30']) {
      await page.getByLabel('Set date and time in UTC').fill(when);
      await page.waitForTimeout(300); // the readout refreshes 8 times a second
      expect(await lefts()).toEqual(before);
    }
  });
});
