import { test, expect, type Page } from '@playwright/test';

/** Open a view and fail the test on any uncaught page error. */
async function open(page: Page, hash: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/${hash}`);
  return errors;
}

test.describe('shell', () => {
  test('opens on the Life Cycle, and the menu uses the original #links', async ({ page }) => {
    const errors = await open(page, '');
    await expect(page.locator('#viewDash')).toBeVisible();
    await expect(page).toHaveTitle('Blueprint · Practice Layout');

    for (const [name, hash, title] of [
      ['Framework', '#cct', 'Blueprint · Performance Framework'],
      ['Safeguard Map', '#map', 'Blueprint · Business Codex · Safeguard Map'],
      ['Outcomes', '#outcomes', 'Blueprint · Performance Outcomes'],
      ['Practice', '#lifecycle', 'Blueprint · Practice Layout'],
    ] as const) {
      await page.getByRole('link', { name, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${hash}$`));
      await expect(page).toHaveTitle(title);
      await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute('aria-current', 'page');
    }
    expect(errors).toEqual([]);
  });

  test('an unknown link falls back to the Life Cycle', async ({ page }) => {
    await open(page, '#nonsense');
    await expect(page.locator('#viewDash')).toBeVisible();
  });

  test('every view shows the footer and top bar', async ({ page }) => {
    for (const h of ['#lifecycle', '#cct', '#map', '#outcomes']) {
      await open(page, h);
      await expect(page.locator('.topbar')).toBeVisible();
      await expect(page.locator('footer')).toContainText('Culture Blueprint');
    }
  });
});

test.describe('Life Cycle', () => {
  test('draws every connector, opens the drawer on click and closes it with Esc', async ({ page }) => {
    const errors = await open(page, '#lifecycle');
    await expect(page.locator('#lcEdges path.edge').first()).toBeAttached();
    expect(await page.locator('#lcEdges path.edge').count()).toBeGreaterThanOrEqual(25);

    await page.locator('#ops').click();
    await expect(page.locator('#drawer')).toHaveClass(/open/);
    await expect(page.locator('#drT')).toHaveText('OPS Skills Developing Center');
    await page.keyboard.press('Escape');
    await expect(page.locator('#drawer')).not.toHaveClass(/open/);
    expect(errors).toEqual([]);
  });

  test('zoom buttons change the scale and Fit restores it', async ({ page }) => {
    await open(page, '#lifecycle');
    await expect(page.locator('#zVal')).toHaveText('93%');
    await page.locator('#zIn').click();
    await expect(page.locator('#zVal')).toHaveText('107%');
    await page.locator('#zOut').click();
    await page.locator('#zOut').click();
    await expect(page.locator('#zVal')).toHaveText('81%');
    await page.locator('#zFit').click();
    await expect(page.locator('#zVal')).toHaveText('93%');
  });
});

test.describe('CCT Framework', () => {
  test('draws the connectors and fits the board to the window', async ({ page }) => {
    const errors = await open(page, '#cct');
    await expect(page.locator('#cctEdges path.edge').first()).toBeAttached();
    expect(await page.locator('#cctEdges path.edge').count()).toBe(18);
    const label = (await page.locator('#zVal').textContent())!;
    expect(parseInt(label, 10)).toBeLessThanOrEqual(100);
    expect(parseInt(label, 10)).toBeGreaterThanOrEqual(50);
    expect(errors).toEqual([]);
  });

  test('the legend highlights one dimension and toggles off', async ({ page }) => {
    await open(page, '#cct');
    await page.locator('#dLegend [data-d="care"]').click();
    await expect(page.locator('#cctBoard')).toHaveClass(/dimming/);
    await expect(page.locator('.dim-chip.d-care').first()).toHaveClass(/sel/);
    await page.locator('#dLegend [data-d="care"]').click();
    await expect(page.locator('#cctBoard')).not.toHaveClass(/dimming/);
  });
});

test.describe('CCT Outcomes (this browser, no database)', () => {
  test('shows every area (Administration split into sub-areas) and pillar, saves a promise and keeps it after a reload', async ({ page }) => {
    const errors = await open(page, '#outcomes');
    await expect(page.locator('#ox-matrix .cell')).toHaveCount(27);
    await expect(page.locator('#ox-hero-stats')).toContainText('0 / 27');
    await expect(page.locator('.cell[data-leaf="human-resources"][data-p="care"]')).toBeVisible();

    const cell = page.locator('.cell[data-leaf="team-1"][data-p="care"]');
    await cell.getByRole('button', { name: /Open Team 1, Care/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Promise').fill('Every customer feels cared for');
    await dialog.getByLabel('Standard', { exact: true }).fill('Bedside manner');
    await dialog.getByLabel('Outcome', { exact: true }).fill('Customers rate care 4.5 or higher');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(cell).toContainText('Every customer feels cared for');
    await expect(cell).toContainText('Customers rate care 4.5 or higher');
    await expect(page.locator('#ox-hero-stats')).toContainText('1 / 27');

    await page.reload();
    await expect(page.locator('.cell[data-leaf="team-1"][data-p="care"]')).toContainText('Every customer feels cared for');
    expect(errors).toEqual([]);
  });

  test('the editor dialog saves a changed status', async ({ page }) => {
    await open(page, '#outcomes');
    await page.locator('.cell[data-leaf="team-4"][data-p="time"]').getByRole('button', { name: /Open Team 4, Time/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Outcome', { exact: true }).fill('Reports in 2 hours');
    await dialog.getByLabel('Status').selectOption({ label: 'At risk' });
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.cell[data-leaf="team-4"][data-p="time"]')).toContainText('At risk');
  });
});

test.describe('Safeguard Map', () => {
  async function drag(page: Page, from: string, to: string) {
    const a = (await page.locator(from).first().boundingBox())!;
    const b = (await page.locator(to).first().boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2 + 20, a.y + a.height / 2 + 20, { steps: 4 });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
    await page.mouse.up();
  }

  test('starts with the default layout and coverage numbers', async ({ page }) => {
    const errors = await open(page, '#map');
    await expect(page.locator('#ringbox svg')).toBeVisible();
    await expect(page.locator('#gapN')).toHaveText('11');
    await expect(page.locator('#cov')).toContainText('SOPs not placed7');
    await expect(page.locator('#trayChips .sopchip')).toHaveCount(12);
    expect(errors).toEqual([]);
  });

  test('clicking a value opens its details and traces its links; Esc clears', async ({ page }) => {
    await open(page, '#map');
    await page.locator('#ringbox [data-open="value:resp"]').click();
    await expect(page.locator('#sgDrawer')).toHaveClass(/open/);
    await expect(page.locator('#sgDrT')).toHaveText('Mutual respect');
    await expect(page.locator('#ringbox .pnode.lit')).toHaveCount(3);
    await page.keyboard.press('Escape');
    await expect(page.locator('#sgDrawer')).not.toHaveClass(/open/);
    await expect(page.locator('#ringbox .lit')).toHaveCount(0);
  });

  test('dragging an SOP onto a practice links it; Save keeps it across a reload', async ({ page }) => {
    await open(page, '#map');
    await page.locator('#vPillars').click();
    await expect(page.locator('#saveState')).toHaveText('Saved');
    await drag(page, '#trayChips [data-dragsop="2"]', '#viewPillars .ptag[data-drop="P5"]');
    await expect(page.locator('#viewPillars .ptag[data-drop="P5"] [data-dragsop="2"]').first()).toBeVisible();
    await expect(page.locator('#saveState')).toHaveText('Unsaved changes');
    await page.locator('#bSave').click();
    await expect(page.locator('#saveState')).toHaveText('Saved');
    await expect(page.locator('#toast')).toHaveText('Saved in this browser');

    await page.reload(); // the app remembers the last view, so it reopens on Pillars
    await expect(page.locator('#viewPillars .pillar').first()).toBeVisible();
    await expect(page.locator('#viewPillars .ptag[data-drop="P5"] [data-dragsop="2"]').first()).toBeVisible();
  });

  test('dragging a practice onto another value, then Reset restores the default', async ({ page }) => {
    await open(page, '#map');
    await page.locator('#vPillars').click();
    await drag(page, '#viewPillars .ptag[data-from="V:qual"][data-dragprac="P6"] .pid', '#viewPillars .pillar[data-drop="V:resp"] .pl-h');
    await expect(page.locator('#viewPillars .pillar[data-drop="V:resp"] [data-dragprac="P6"]')).toBeVisible();
    await expect(page.locator('#viewPillars .pillar[data-drop="V:qual"] [data-dragprac="P6"]')).toHaveCount(0);
    await page.locator('#mmBtn').click();
    await page.locator('#bReset').click();
    await page.getByRole('button', { name: 'Reset layout' }).click(); // the app's own confirm dialog, not the browser's
    await expect(page.locator('#viewPillars .pillar[data-drop="V:qual"] [data-dragprac="P6"]')).toBeVisible();
    await expect(page.locator('#saveState')).toHaveText('Saved'); // reset is saved straight away, no second step
  });

  test('the gap list jumps to the library filtered to gaps', async ({ page }) => {
    await open(page, '#map');
    await page.locator('#gapBtn').click();
    await page.locator('#cov [data-gapf="sops"]').click();
    await expect(page.locator('#dockGaps')).toBeChecked();
    await expect(page.locator('#trayChips .sopchip:not([hidden])')).toHaveCount(7);
  });
});
