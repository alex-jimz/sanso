// End-to-end check of the built app in a Pixel 7-sized Chromium.
// Writes screenshots, contact sheets and report.txt to /out.
const fs = require('fs');
const { chromium, devices } = require('playwright-core');
const { start } = require('./server.cjs');
const { seed, testPhoto } = require('./seed.cjs');

const BASE = 'http://127.0.0.1:4173/sanso/';
const OUT = '/out';
const shots = [];
const steps = [];
const problems = [];

function check(ok, message) {
  steps.push(`${ok ? 'ok  ' : 'FAIL'} ${message}`);
  if (!ok) problems.push(`check failed: ${message}`);
}

async function shot(page, name) {
  await page.waitForTimeout(350);
  const buf = await page.screenshot();
  fs.writeFileSync(`${OUT}/${name}.png`, buf);
  shots.push({ name, buf });
}

async function contactSheets(browser) {
  const page = await browser.newPage({
    viewport: { width: 1866, height: 1200 },
    deviceScaleFactor: 1,
  });
  for (let i = 0; i < shots.length; i += 3) {
    const figures = shots
      .slice(i, i + 3)
      .map(
        (s) =>
          `<figure style="margin:0"><img style="width:600px;display:block;border-radius:10px" src="data:image/png;base64,${s.buf.toString('base64')}"><figcaption style="font:600 18px sans-serif;padding:8px 2px">${s.name}</figcaption></figure>`,
      )
      .join('');
    await page.setContent(
      `<body style="margin:0;background:#d9d4cc;display:flex;gap:12px;padding:12px">${figures}</body>`,
    );
    await page.waitForTimeout(150);
    fs.writeFileSync(`${OUT}/sheet-${i / 3 + 1}.png`, await page.screenshot({ fullPage: true }));
  }
  await page.close();
}

async function toastText(page) {
  const toast = page.locator('.toast');
  await toast.waitFor();
  return toast.innerText();
}

async function run(page) {
  // First run: empty recipe book.
  await page.goto(BASE);
  await page.getByRole('heading', { name: 'Your recipe book is empty' }).waitFor();
  check(true, 'first run shows the empty recipe book');

  await page.evaluate(seed);
  await page.reload();
  await page.locator('.recipe').first().waitFor();
  check((await page.locator('.recipe').count()) === 7, 'sample recipes are listed');
  await shot(page, '1 Recipes');

  await page.getByRole('button', { name: 'Dessert', exact: true }).click();
  check((await page.locator('.recipe').count()) === 2, 'the Dessert tag filters to 2 recipes');
  await page.getByRole('button', { name: 'All', exact: true }).click();

  // New recipe with a photo.
  await page.getByRole('button', { name: 'Recipe', exact: true }).click();
  await page.getByPlaceholder('Chicken curry').fill('Chickpea curry');
  const png = Buffer.from(await page.evaluate(testPhoto), 'base64');
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'curry.png', mimeType: 'image/png', buffer: png });
  await page.locator('.photo img').waitFor();
  await page.getByRole('button', { name: 'Meal', exact: true }).click();
  await page.getByPlaceholder('20', { exact: true }).fill('15');
  await page.getByPlaceholder('45', { exact: true }).fill('35');
  await page.getByRole('radio', { name: '8', exact: true }).click();
  await page
    .locator('textarea')
    .nth(0)
    .fill(
      '2 tins chickpeas\n400 ml coconut milk\n1 onion, chopped\n3 garlic cloves\n2 tsp curry powder\n200 g spinach\n150 g basmati rice',
    );
  await page
    .locator('textarea')
    .nth(1)
    .fill(
      'Soften the onion and garlic.\nAdd the spices, chickpeas and coconut milk and simmer for 15 minutes.\nStir in the spinach and serve with rice.',
    );
  await page.locator('.preview').scrollIntoViewIfNeeded();
  await shot(page, '2 Recipe editor');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('heading', { name: 'Chickpea curry' }).waitFor();
  check(
    (await page.locator('.ingredients li').count()) === 7,
    'the saved recipe shows its 7 ingredients',
  );
  await page.getByRole('button', { name: 'Increase portions' }).click();
  await page.getByRole('button', { name: 'Increase portions' }).click();
  check(
    (await page.locator('.ingredients').innerText()).includes('800 ml coconut milk'),
    'scaling 2 to 4 portions doubles 400 ml',
  );
  check(
    (await page.locator('.ingredients').innerText()).includes('6 garlic cloves'),
    'scaling keeps "garlic cloves" wording',
  );
  check(
    (await page.locator('.ingredients').innerText()).includes('2 onions, chopped'),
    'scaling 1 onion up says "2 onions"',
  );
  await shot(page, '3 Recipe');

  await page.getByRole('button', { name: 'Add to plan' }).click();
  await page.getByRole('dialog').waitFor();
  await page.locator('.days li').nth(3).locator('.slot').first().click();
  check((await toastText(page)).startsWith('Planned for'), 'a recipe can be planned from its page');
  await page.getByRole('dialog').waitFor({ state: 'detached' });

  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('heading', { name: 'Recipes', exact: true }).waitFor();
  check(
    page.url().endsWith('#/recipes') || page.url().endsWith('/sanso/'),
    'Back returns to the recipe book',
  );

  // Plan.
  await page.getByRole('link', { name: 'Plan' }).click();
  await page.locator('.day').first().waitFor();
  await shot(page, '4 Plan');
  await page.locator('.day.today .slot').nth(1).click();
  await page.getByRole('dialog').waitFor();
  await shot(page, '5 Meal sheet');
  await page.goBack();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  check(page.url().includes('#/plan'), 'the back gesture closes the sheet and stays on Plan');

  // Shopping list.
  await page.getByRole('link', { name: 'Shopping' }).click();
  await page.getByRole('button', { name: 'Make a list' }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: /Make the list/ }).click();
  await page.getByRole('heading', { name: 'Check what you have' }).waitFor();
  const listText = await page.locator('.page').innerText();
  check(
    listText.includes('Irish chicken fillets'),
    'chicken breast is matched to its product through an alias',
  );
  check(!/sea salt/i.test(listText), 'salt is never listed');
  check(/not sorted yet/i.test(listText), 'unknown items are grouped as Not sorted yet');
  check(listText.includes('Offer'), 'the mince offer is highlighted');
  await shot(page, '6 Shopping list');

  await page
    .locator('.group')
    .filter({ hasText: 'Not sorted yet' })
    .locator('.item .row')
    .filter({ hasText: 'Spinach' })
    .click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('radio', { name: 'Fruit & veg' }).click();
  await shot(page, '7 Item sheet');
  await page.goBack();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  const veg = await page.locator('.group').filter({ hasText: 'Fruit & veg' }).innerText();
  check(veg.includes('Spinach'), 'choosing a section moves Spinach into Fruit & veg');

  await page.locator('.check-list li').first().getByRole('button', { name: 'Have it' }).click();

  // Shop mode.
  await page.getByRole('button', { name: 'Start shopping' }).click();
  await page.getByRole('heading', { name: 'In the shop' }).waitFor();
  for (let i = 0; i < 3; i++) await page.locator('.shop-row').nth(i).click();
  check((await page.locator('.shop-row.done').count()) === 3, 'ticked items are marked');
  await shot(page, '8 In the shop');
  await page.getByRole('button', { name: 'Finish shopping' }).click();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  check(
    (await toastText(page)).includes('ready to cook'),
    'finishing the shop makes the meals ready to cook',
  );

  // Cooking.
  await page.getByRole('link', { name: 'Cook' }).click();
  await page.getByRole('heading', { name: 'Cook', exact: true }).waitFor();
  check(
    (await page.locator('.check.on').count()) === 2,
    "today's dinner and tomorrow's leftovers are preselected",
  );
  await page.getByRole('button', { name: /Start cooking/ }).click();
  await page.getByRole('heading', { name: 'Cooking', exact: true }).waitFor();
  check(
    (await page.locator('.dish').innerText()).includes('2 portions'),
    'two meals of one recipe are cooked once, for 2 portions',
  );
  await page.locator('.ticks button').first().click();
  await page.locator('.steps button').first().click();
  await shot(page, '9 Cooking');
  await page.getByRole('button', { name: 'Done cooking' }).click();
  check((await toastText(page)).includes('cooked'), 'finishing cooking marks the meals as cooked');

  // More, products.
  await page.getByRole('link', { name: 'More' }).click();
  await page.getByRole('heading', { name: 'More', exact: true }).waitFor();
  await shot(page, '10 More');

  await page.getByRole('link', { name: /Shop sections/ }).click();
  await page.getByRole('heading', { name: 'Shop sections' }).waitFor();
  await page.getByRole('button', { name: 'Move Tins & jars up' }).click();
  const firstSection = await page.locator('.section-row .row-title').first().innerText();
  check(firstSection === 'Tins & jars', 'shop sections can be reordered');
  await page.getByRole('button', { name: 'Back', exact: true }).click();

  await page.getByRole('link', { name: /Backup/ }).click();
  await page.getByRole('heading', { name: 'Private GitHub repository' }).waitFor();
  check(
    await page.getByRole('button', { name: 'Save and back up' }).isVisible(),
    'the backup page offers the GitHub setup',
  );
  await page.getByRole('button', { name: 'Back', exact: true }).click();

  await page.getByRole('link', { name: /Products/ }).click();
  await page.getByText('Irish beef mince').click();
  await page.getByRole('heading', { name: 'Product', exact: true }).waitFor();
  await shot(page, '11 Product');

  // Offline: the installed app and its data must work with no signal in the shop.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.context().setOffline(true);
  await page.goto(`${BASE}#/recipes`);
  await page.locator('.recipe').first().waitFor();
  check((await page.locator('.recipe').count()) === 8, 'offline, the app opens with all 8 recipes');
  await page.context().setOffline(false);

  // A page shared from Chrome's Share menu.
  const title = encodeURIComponent('Specially Selected Irish Beef Burgers 454g | ALDI.IE');
  const url = encodeURIComponent(
    'https://www.aldi.ie/product/irish-beef-burgers-000000000000123456',
  );
  await page.goto(`${BASE}?title=${title}&url=${url}`);
  await page.getByRole('heading', { name: 'New product' }).waitFor();
  check(
    (await page.getByPlaceholder('Basmati rice').inputValue()) ===
      'Specially Selected Irish Beef Burgers',
    'a shared Aldi page fills in the product name',
  );
  check(
    (await page.getByPlaceholder('500', { exact: true }).inputValue()) === '454',
    'and the pack size',
  );
  await shot(page, '12 Shared product');

  const csp = await page.evaluate(() => window.__csp ?? []);
  for (const violation of csp) problems.push(`CSP violation: ${violation}`);
}

async function main() {
  const server = await start();
  const browser = await chromium.launch();
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    deviceScaleFactor: 1.5,
    locale: 'en-IE',
    timezoneId: 'Europe/Dublin',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning')
      problems.push(`console ${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  await context.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  try {
    await run(page);
  } catch (error) {
    problems.push(`stopped: ${error.message.split('\n')[0]}`);
    await shot(page, 'x Failure').catch(() => {});
  }
  await contactSheets(browser);
  fs.writeFileSync(
    `${OUT}/report.txt`,
    [...steps, '', 'Problems:', ...(problems.length ? problems : ['none'])].join('\n'),
  );
  await browser.close();
  server.close();
  process.exitCode = problems.length ? 1 : 0;
}

main();
