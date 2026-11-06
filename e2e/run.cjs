// End-to-end check of the built app in a Pixel 7-sized Chromium.
// Writes screenshots, contact sheets and report.txt to /out.
const fs = require('fs');
const { chromium, devices } = require('playwright-core');
const { start } = require('./server.cjs');
const { seed, testPhoto } = require('./seed.cjs');
const { aldiProducts, fakeGitHub, installAldi, productLink, setAldiPrice } = require('./fakes.cjs');

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
    await page.getByRole('button', { name: 'Connect', exact: true }).isVisible(),
    'the backup page offers the GitHub setup',
  );
  await page.getByRole('button', { name: 'Back', exact: true }).click();

  await page.getByRole('link', { name: /Products/ }).click();
  await page.getByText('Irish beef mince').click();
  await page.getByRole('heading', { name: 'Product', exact: true }).waitFor();
  await shot(page, '11 Product');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await portionFacts(page);

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
  await page.getByRole('button', { name: 'Cancel' }).click();

  await aldi(page);
  await recipeFiles(page);
  await collectCsp(page);
}

// Calories, macros and cost per portion, and filling in a missing product from the recipe.
async function portionFacts(page) {
  await page.goto(`${BASE}#/recipes/tikka`);
  await page.getByRole('heading', { name: 'Chicken tikka masala' }).waitFor();
  const card = page.locator('.facts');
  const before = await card.innerText();
  // 400 g chicken, 150 g yoghurt, 400 g tomatoes, 100 ml cream and 200 g rice, over 2 portions.
  const kcal = Math.round((424 + 108 + 84 + 193 + 704) / 2);
  check(before.includes(String(kcal)), `the recipe shows ${kcal} kcal per portion`);
  check(/Protein\s*63 g/.test(before), 'and 63 g protein');
  // €3.99 chicken, €0.35 yoghurt, €0.55 tomatoes, €0.52 cream, €0.38 rice.
  check(before.includes('€2.89'), 'and €2.89 per portion');
  check(before.includes('From 5 of 9 ingredients'), 'and how many ingredients it covers');
  await card.scrollIntoViewIfNeeded();
  await shot(page, '11b Per portion');

  await page.getByRole('button', { name: /From 5 of 9/ }).click();
  await page.getByRole('dialog').waitFor();
  const sheet = await page.getByRole('dialog').innerText();
  check(
    sheet.includes('2 tsp garam masala') && sheet.includes('Not linked to a product yet'),
    'the sheet says what is missing for each ingredient',
  );
  await shot(page, '11c What is missing');

  await page.getByRole('button', { name: /3 garlic cloves/ }).click();
  await page.getByRole('heading', { name: 'New product' }).waitFor();
  check(
    (await page.getByPlaceholder('Basmati rice').inputValue()) === 'Garlic',
    'tapping an unlinked ingredient starts a product with its name',
  );
  check(
    (await page.locator('.weight-row').innerText()).includes('1 clove'),
    'the product form asks for the weight of a clove',
  );
  await page.getByLabel('Calories per 100 g').fill('149');
  await page.getByLabel('Protein per 100 g').fill('6,4');
  await page.getByLabel('Fat per 100 g').fill('0.5');
  await page.getByLabel('Carbs per 100 g').fill('31');
  await page.locator('.weight-row input').fill('5');
  await page.locator('.nutrients').scrollIntoViewIfNeeded();
  await shot(page, '11d Product nutrition');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await page.getByRole('heading', { name: 'Chicken tikka masala' }).waitFor();
  const after = await page.locator('.facts').innerText();
  // Plus 15 g of garlic, 22 kcal, over 2 portions: 768.
  check(after.includes(String(Math.round(kcal + 22.35 / 2))), 'the garlic adds its calories');
  check(
    after.includes('Calories from 6 of 9 ingredients, cost from 5'),
    'garlic without a price counts for calories only',
  );
}

// A whole chicken that breaks down into thighs and drumsticks, on a fresh phone.
async function breakdown(browser, github) {
  const page = await newPhone(browser, github);
  await page.goto(BASE);
  await page.getByRole('heading', { name: 'Your recipe book is empty' }).waitFor();
  await page.evaluate(async () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const now = new Date().toISOString();
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('sanso', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['recipes', 'meals'], 'readwrite');
      tx.objectStore('recipes').put({
        id: 'thighs',
        title: 'Roast thighs and drumsticks',
        tags: ['Meal'],
        portions: 2,
        ingredients: ['600 g chicken thighs', '4 drumsticks', '1 onion'],
        steps: ['Roast everything for 45 minutes.'],
        notes: '',
        createdAt: now,
        updatedAt: now,
      });
      tx.objectStore('meals').put({
        id: `${day}:dinner`,
        date: day,
        slot: 'dinner',
        recipeId: 'thighs',
        state: 'toShop',
        portions: 2,
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await page.locator('.recipe').first().waitFor();

  // The whole chicken and its parts.
  await page.goto(`${BASE}#/more/products/new?name=${encodeURIComponent('Whole chicken XL')}`);
  await page.getByRole('heading', { name: 'New product' }).waitFor();
  await page.getByPlaceholder('500', { exact: true }).fill('2200');
  await page.getByPlaceholder('1.89').fill('7.99');
  await page.getByRole('button', { name: /It breaks down into parts/ }).click();
  await page.getByRole('dialog').getByRole('searchbox').fill('Chicken thighs');
  await page.getByRole('button', { name: 'New product “Chicken thighs”' }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  const thighRow = page.locator('.part').filter({ hasText: 'Chicken thighs' });
  await thighRow.getByPlaceholder('450').fill('450');
  await page.getByLabel('Cost share of Chicken thighs, in percent').fill('30');
  await page.getByRole('button', { name: 'Add a part' }).click();
  await page.getByRole('dialog').getByRole('searchbox').fill('Drumsticks');
  await page.getByRole('button', { name: 'New product “Drumsticks”' }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  const drumRow = page.locator('.part').filter({ hasText: 'Drumsticks' });
  await drumRow.getByRole('button', { name: 'pieces' }).click();
  await drumRow.getByPlaceholder('2', { exact: true }).fill('2');
  await page.getByLabel('Cost share of Drumsticks, in percent').fill('15');
  check(
    (await page.locator('.page').innerText()).includes('Cost shares add up to 45%'),
    'the form adds up the cost shares',
  );
  await drumRow.scrollIntoViewIfNeeded();
  await shot(page, '17 Breaks down into');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('heading', { name: 'Products' }).waitFor();

  await page.getByText('Chicken thighs').click();
  await page.getByRole('heading', { name: 'Product', exact: true }).waitFor();
  const ways = await page.locator('.ways').innerText();
  check(
    ways.includes('Whole chicken XL') && ways.includes('450 g per pack · 30% of the cost'),
    'the part lists the whole chicken as a way to get it',
  );
  await page.getByRole('button', { name: 'Cancel' }).click();

  // Parts are priced by their share: 600 g thighs at 30% of €7.99 per 450 g, and
  // 4 drumsticks at 15% per 2, over 2 portions.
  await page.goto(`${BASE}#/recipes/thighs`);
  await page.getByRole('heading', { name: 'Roast thighs and drumsticks' }).waitFor();
  const facts = await page.locator('.facts').innerText();
  check(facts.includes('€2.80'), 'the recipe costs €2.80 per portion from the cost shares');

  // The shopping list asks how to get each part.
  await page.goto(`${BASE}#/shopping`);
  await page.getByRole('button', { name: 'Make a list' }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: /Make the list/ }).click();
  await page.getByRole('heading', { name: 'Choose how to get' }).waitFor();
  const thighChoice = page.locator('.choose-list li').filter({ hasText: 'Chicken thighs' });
  const thighWay = thighChoice.getByRole('button', { name: /Whole chicken XL/ });
  check(
    (await thighWay.innerText()).includes('2 × 2.2 kg · €15.98'),
    'each way shows how many to buy and what it costs',
  );
  await shot(page, '18 Choose how to get');
  await thighWay.click();
  await page
    .locator('.choose-list li')
    .filter({ hasText: 'Drumsticks' })
    .getByRole('button', { name: /Whole chicken XL/ })
    .click();
  await page.getByRole('heading', { name: 'Choose how to get' }).waitFor({ state: 'detached' });
  const chickenRow = page.locator('.item').filter({ hasText: 'Whole chicken XL' });
  let row = await chickenRow.innerText();
  check(
    row.includes('2 × 2.2 kg') &&
      row.includes('For 600 g Chicken thighs, 4 Drumsticks') &&
      row.includes('€15.98'),
    'two whole chickens cover the thighs and drumsticks',
  );
  check(row.includes('Also gives 300 g Chicken thighs'), 'and the list says what is left over');
  await shot(page, '19 Bought for parts');

  // Changing a choice: the thighs are in the freezer after all.
  await chickenRow.locator('.row').click();
  await page.getByRole('dialog').waitFor();
  await page
    .getByRole('dialog')
    .locator('.covered')
    .filter({ hasText: 'Chicken thighs' })
    .getByRole('button', { name: 'Change' })
    .click();
  await page.goBack();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  const again = page.locator('.choose-list li').filter({ hasText: 'Chicken thighs' });
  check(
    (await again.locator('.way[aria-pressed="true"]').innerText()).includes('Whole chicken XL') &&
      (await again.innerText()).includes('what you chose last time'),
    'a reopened choice suggests the way chosen last time',
  );
  await again.getByRole('button', { name: /Have it/ }).click();
  row = await chickenRow.innerText();
  check(
    row.includes('For 4 Drumsticks') && row.includes('Also gives 900 g Chicken thighs'),
    'with thighs at home, the chickens are only for the drumsticks',
  );

  // A photo pasted from the clipboard.
  const photo = await page.evaluate(testPhoto);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await page.goto(`${BASE}#/more/products`);
  await page.getByText('Chicken thighs').click();
  await page.getByRole('heading', { name: 'Product', exact: true }).waitFor();
  await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'image/png' });
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  }, photo);
  await page.getByRole('button', { name: 'Paste photo' }).click();
  await page.locator('.photo .product-photo.own').waitFor();
  check(true, 'a picture copied in Chrome can be pasted onto a product');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('heading', { name: 'Products' }).waitFor();
  check(
    (await page
      .locator('li')
      .filter({ hasText: 'Chicken thighs' })
      .locator('.product-photo.own')
      .count()) === 1,
    'the pasted photo is saved with the product',
  );

  // Pictures and pages shared from Chrome arrive as a POST the service worker handles.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.evaluate(
    ({ base64, action }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const file = new File([bytes], 'drumsticks.png', { type: 'image/png' });
      const form = document.createElement('form');
      form.method = 'POST';
      form.enctype = 'multipart/form-data';
      form.action = action;
      const input = document.createElement('input');
      input.type = 'file';
      input.name = 'image';
      const files = new DataTransfer();
      files.items.add(file);
      input.files = files.files;
      form.append(input);
      document.body.append(form);
      form.submit();
    },
    { base64: photo, action: `${BASE}share` },
  );
  await page.getByRole('heading', { name: 'Add a photo' }).waitFor();
  await shot(page, '20 Shared picture');
  await page.getByRole('button', { name: 'Drumsticks' }).click();
  await page.getByRole('heading', { name: 'Product', exact: true }).waitFor();
  await page.locator('.photo .product-photo.own').waitFor();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('heading', { name: 'Products' }).waitFor();
  check(
    (await page
      .locator('li')
      .filter({ hasText: 'Drumsticks' })
      .locator('.product-photo.own')
      .count()) === 1,
    'a picture shared from Chrome is saved on the product picked for it',
  );

  await page.evaluate((action) => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.enctype = 'multipart/form-data';
    form.action = action;
    for (const [name, value] of [
      ['title', 'Specially Selected Irish Beef Burgers 454g | ALDI.IE'],
      ['url', 'https://www.aldi.ie/product/irish-beef-burgers-000000000000123456'],
    ]) {
      const input = document.createElement('input');
      input.name = name;
      input.value = value;
      form.append(input);
    }
    document.body.append(form);
    form.submit();
  }, `${BASE}share`);
  await page.getByRole('heading', { name: 'New product' }).waitFor();
  check(
    (await page.getByPlaceholder('Basmati rice').inputValue()) ===
      'Specially Selected Irish Beef Burgers',
    'a page shared through the new share target still becomes a product',
  );
  await collectCsp(page);
}

async function collectCsp(page) {
  const csp = await page.evaluate(() => window.__csp ?? []);
  for (const violation of csp) problems.push(`CSP violation: ${violation}`);
}

/** Waits for a toast with this text. */
async function seeToast(page, text) {
  try {
    await page.locator('.toast').filter({ hasText: text }).waitFor();
    return true;
  } catch {
    return false;
  }
}

/** Runs the aldi.ie helper on the aldi.ie page that is open, as tapping the bookmark would. */
async function runHelper(page, bookmark) {
  await page.addScriptTag({ content: decodeURIComponent(bookmark.slice('javascript:'.length)) });
  await page.waitForURL((url) => url.href.startsWith(BASE));
}

async function aldi(page) {
  await page.goto(`${BASE}#/more/products`);
  await page.getByRole('link', { name: /Get prices and photos from aldi.ie/ }).click();
  await page.getByRole('heading', { name: 'Prices from aldi.ie' }).waitFor();
  await page.getByRole('button', { name: 'Show the helper’s text' }).click();
  const bookmark = await page.locator('textarea.code').inputValue();
  check(bookmark.startsWith('javascript:'), 'the helper page shows the bookmark');
  await shot(page, '13 Aldi helper');

  // A product page for something Sanso doesn't know yet opens the product form.
  await page.goto(`https://www.aldi.ie${productLink(aldiProducts['000000000000282766'])}`);
  await runHelper(page, bookmark);
  await page.getByRole('heading', { name: 'New product' }).waitFor();
  check(
    (await page.getByPlaceholder('Basmati rice').inputValue()) === 'Cucina Penne Pasta',
    'the helper fills in the brand and name',
  );
  check(
    (await page.getByPlaceholder('500', { exact: true }).inputValue()) === '1000',
    'and the pack size',
  );
  check((await page.getByPlaceholder('1.89').inputValue()) === '0.99', 'and the price');
  await page.locator('.photo img').waitFor();
  await page.getByRole('radio', { name: 'Pasta, rice & grains' }).click();
  await shot(page, '14 From aldi.ie, one product');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  check(await seeToast(page, 'Cucina Penne Pasta added'), 'the new product is saved');

  // When the API doesn't answer, the helper reads the size and price off the page,
  // and not those of the other products further down it.
  await page.goto(`https://www.aldi.ie${productLink(aldiProducts['000000000000400333'])}`);
  await runHelper(page, bookmark);
  await page.getByRole('heading', { name: 'New product' }).waitFor();
  check(
    (await page.getByPlaceholder('500', { exact: true }).inputValue()) === '1000' &&
      (await page.getByRole('button', { name: 'ml', exact: true }).getAttribute('aria-pressed')) ===
        'true',
    'without the API, the helper reads “1 l” off the page as 1000 ml',
  );
  check(
    (await page.getByPlaceholder('1.89').inputValue()) === '1.15',
    'and the price from the page',
  );
  check(
    await page.getByRole('button', { name: 'Copy what aldi.ie sent' }).isVisible(),
    'the product form offers to copy what aldi.ie sent',
  );
  await shot(page, '14b From aldi.ie, page only');
  await page.getByRole('button', { name: 'Cancel' }).click();

  // A week later the penne drops in price, and the offers page has two new products.
  setAldiPrice('000000000000282766', 79, 99);
  await page.goto('https://www.aldi.ie/products/super-savers');
  await runHelper(page, bookmark);
  await page.getByRole('heading', { name: 'From aldi.ie' }).waitFor();
  await page.locator('.row img').first().waitFor();
  const known = page.locator('.list').first();
  check(
    (await known.innerText()).includes('On offer at €0.79'),
    'a price drop on a known product shows as an offer',
  );
  check(
    (await page.locator('.row[aria-pressed=true]').count()) === 1,
    'only known products start ticked',
  );
  await page.locator('.row').filter({ hasText: 'Farmdale Irish Free Range Eggs' }).click();
  await shot(page, '15 From aldi.ie, offers page');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  check(await seeToast(page, 'Updated 1, added 1'), 'saving updates one product and adds one');
  await page.getByRole('heading', { name: 'Products' }).waitFor();
  check(
    (await page.locator('.row').filter({ hasText: 'Cucina Penne Pasta' }).innerText()).includes(
      '€0.79',
    ),
    'the products list shows the offer price',
  );
  const photos = await page
    .locator('img.product-photo')
    .evaluateAll((imgs) => imgs.filter((img) => img.complete && img.naturalWidth > 0).length);
  check(photos === 2, 'the products list shows the two Aldi photos');
  await page.locator('.row').filter({ hasText: 'Farmdale' }).scrollIntoViewIfNeeded();
  await shot(page, '16 Products with photos');

  // A link to #/aldi made by anyone else only ever shows a review page.
  await page.goto(`${BASE}#/aldi?d=${encodeURIComponent('{"v":1,"items":[{"sku":"1"}]}')}`);
  await page.getByRole('heading', { name: 'Nothing to add' }).waitFor();
  check(
    !(await page.getByRole('button', { name: 'Save' }).isEnabled()),
    'a link with no usable products can’t save anything',
  );
}

async function recipeFiles(page) {
  await page.goto(`${BASE}#/more`);
  await page.getByRole('link', { name: /Recipe files/ }).click();
  await page.getByRole('heading', { name: 'Recipe files' }).waitFor();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export recipes' }).click(),
  ]);
  const exported = fs.readFileSync(await download.path());
  const doc = JSON.parse(exported.toString('utf8'));
  check(
    doc['@context'] === 'https://schema.org' && doc['@graph'].length === 8,
    'the export has all 8 recipes as schema.org',
  );
  const curry = doc['@graph'].find((r) => r.name === 'Chickpea curry');
  check(/^data:image\//.test(curry?.image ?? ''), 'with the photo inlined');

  const input = page.locator('input[type=file]');
  await input.setInputFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/json',
    buffer: exported,
  });
  await page.getByRole('heading', { name: 'Found 8 recipes' }).waitFor();
  check(
    (await page.getByText('Already in your book').count()) === 8 &&
      !(await page.getByRole('button', { name: /^Import/ }).isEnabled()),
    're-importing the export adds nothing by default',
  );
  await page.getByRole('button', { name: 'Cancel' }).click();

  await input.setInputFiles({
    name: 'lemon-cake.html',
    mimeType: 'text/html',
    buffer: Buffer.from(lemonCakePage),
  });
  await page.getByRole('heading', { name: 'Found 1 recipe' }).waitFor();
  await shot(page, '17 Recipe import');
  await page.getByRole('button', { name: 'Import 1 recipe' }).click();
  await page.getByRole('heading', { name: 'Recipes', exact: true }).waitFor();
  check((await page.locator('.recipe').count()) === 9, 'a recipe web page imports as a 9th recipe');
  await page.getByText('Lemon & Ricotta Cake').click();
  await page.getByRole('heading', { name: 'Lemon & Ricotta Cake' }).waitFor();
  check(
    (await page.locator('.ingredients li').count()) === 3,
    'the imported recipe has its ingredients',
  );
}

const lemonCakePage = `<!doctype html><html><head><title>Lemon cake</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Recipe",
"name":"Lemon &amp; Ricotta Cake","image":"https://example.com/cake.jpg","recipeYield":"8 slices",
"prepTime":"PT20M","cookTime":"PT45M","recipeCategory":"Dessert","keywords":"cake, lemon",
"recipeIngredient":["200 g ricotta","2 lemons","150 g sugar"],
"recipeInstructions":[{"@type":"HowToStep","text":"Mix everything."},{"@type":"HowToStep","text":"Bake for 45 minutes."}]}
</script></head><body></body></html>`;

/** Backups with fresh phones: a first backup, a restore on a new install, and the empty-phone guard. */
async function backups(browser, github) {
  const repo = 'alex-jimz/sanso-data';
  const connect = async (page) => {
    await page.getByPlaceholder('alex-jimz/sanso-data').fill(repo);
    await page.getByPlaceholder('github_pat_…').fill('test-token');
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
  };

  // Phone A has the sample data and backs it up to an empty repository.
  const a = await newPhone(browser, github);
  await a.goto(BASE);
  await a.getByRole('heading', { name: 'Your recipe book is empty' }).waitFor();
  await a.evaluate(seed);
  await a.goto(`${BASE}#/more/backup`);
  await a.reload();
  await connect(a);
  check(await seeToast(a, 'Backup is set up'), 'connecting an empty repository backs up');
  check(github.file('recipes.json')?.length === 7, 'the repository has the 7 recipes');
  const commits = github.commits();

  // Phone B is a new install: connecting offers to restore instead of backing up.
  const b = await newPhone(browser, github);
  await b.goto(`${BASE}#/more/backup`);
  await connect(b);
  await b.getByRole('heading', { name: 'Restore your backup?' }).waitFor();
  check(
    (await b.getByRole('dialog').innerText()).includes('7 recipes'),
    'a new install is offered the backup, with what it holds',
  );
  await shot(b, '18 Restore on a new install');
  await b.getByRole('button', { name: 'Restore', exact: true }).click();
  check(await seeToast(b, 'Restored 7 recipes'), 'restoring brings back the 7 recipes');
  check(
    github.commits() === commits && github.file('recipes.json')?.length === 7,
    'connecting and restoring leave the backup untouched',
  );

  // Connecting again with data on the phone asks which copy to keep.
  await b.getByRole('button', { name: 'Turn off' }).click();
  await b.getByRole('button', { name: 'Turn off', exact: true }).last().click();
  await connect(b);
  await b.getByRole('heading', { name: 'This repository already has a backup' }).waitFor();
  await shot(b, '19 Backup choice');
  await b.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  check(
    await b.getByRole('button', { name: 'Connect', exact: true }).isVisible(),
    'cancelling the choice saves nothing',
  );

  // Phone C has backups set up but no data, as after clearing Chrome's storage.
  const c = await newPhone(browser, github);
  await c.goto(BASE);
  await c.getByRole('heading', { name: 'Your recipe book is empty' }).waitFor();
  await c.evaluate(
    async ({ repo, token }) => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('sanso', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(
          { defaultPortions: 1, tags: ['Meal'], backup: { repo, token } },
          'settings',
        );
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { repo, token: 'test-token' },
  );
  await c.goto(`${BASE}#/more/backup`);
  await c.reload();
  await c.getByRole('button', { name: 'Back up now' }).click();
  check(
    await seeToast(c, 'This phone has no recipes'),
    'an empty phone refuses to replace a backup that has recipes',
  );
  check(
    github.commits() === commits && github.file('recipes.json')?.length === 7,
    'and the backup keeps its 7 recipes',
  );
  for (const page of [a, b, c]) {
    await collectCsp(page);
    await page.context().close();
  }
}

/** A fresh Pixel-sized browser profile: its own storage, as on another phone. */
async function newPhone(browser, github, options = {}) {
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    deviceScaleFactor: 1.5,
    locale: 'en-IE',
    timezoneId: 'Europe/Dublin',
    ...options,
  });
  await context.route('https://api.github.com/**', github.handle);
  await installAldi(context);
  await context.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('console', (m) => {
    // GitHub answers 409 for a repository with no commits yet; Sanso expects it.
    if (m.text().includes('status of 409')) return;
    // The fake API fails on purpose for the milk, so the helper reads the page instead.
    if (
      page.url().startsWith('https://www.aldi.ie/') &&
      /000000000000400333|Failed to fetch|status of 404|ERR_FAILED/.test(m.text())
    )
      return;
    if (m.type() === 'error' || m.type() === 'warning')
      problems.push(`console ${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  return page;
}

async function main() {
  const server = await start();
  const browser = await chromium.launch();
  const github = fakeGitHub({ token: 'test-token', repo: 'alex-jimz/sanso-data' });
  const page = await newPhone(browser, github);
  let current = page;
  try {
    await run(page);
    await backups(browser, github);
    await breakdown(browser, github);
  } catch (error) {
    problems.push(`stopped: ${error.message.split('\n')[0]}`);
    for (const context of browser.contexts()) for (const p of context.pages()) current = p;
    await shot(current, 'x Failure').catch(() => {});
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
