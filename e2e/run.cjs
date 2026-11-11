// End-to-end check of the built app in a Pixel 7-sized Chromium.
// Writes screenshots, contact sheets and report.txt to /out.
const fs = require('fs');
const zlib = require('zlib');
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
  // A tall phone photo, kept whole: it must fill the preview, not show only its top.
  const tall = Buffer.from(
    await page.evaluate(async () => {
      const canvas = new OffscreenCanvas(900, 1600);
      const g = canvas.getContext('2d');
      const grad = g.createLinearGradient(0, 0, 0, 1600);
      grad.addColorStop(0, '#d9822b');
      grad.addColorStop(1, '#2f5d50');
      g.fillStyle = grad;
      g.fillRect(0, 0, 900, 1600);
      const bytes = new Uint8Array(await (await canvas.convertToBlob()).arrayBuffer());
      let binary = '';
      for (const b of bytes) binary += String.fromCharCode(b);
      return btoa(binary);
    }),
    'base64',
  );
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'tall.png', mimeType: 'image/png', buffer: tall });
  await page.getByRole('heading', { name: 'Crop photo' }).waitFor();
  await page.getByRole('button', { name: 'Use whole photo' }).click();
  await page.locator('.photo img').waitFor();
  const frameBox = await page.locator('button.photo').boundingBox();
  const imgBox = await page.locator('.photo img').boundingBox();
  check(
    Math.abs(frameBox.height - imgBox.height) < 4 && Math.abs(frameBox.y - imgBox.y) < 3,
    `a tall photo fills the editor preview (frame ${Math.round(frameBox.y)}+${Math.round(frameBox.height)}, photo ${Math.round(imgBox.y)}+${Math.round(imgBox.height)})`,
  );

  // A new photo, cropped.
  const png = Buffer.from(await page.evaluate(testPhoto), 'base64');
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'curry.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('heading', { name: 'Crop photo' }).waitFor();
  const frame = page.locator('.frame');
  await frame.locator('img').waitFor();
  await page.getByLabel('Zoom', { exact: true }).fill('1.6');
  const box = await frame.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30, { steps: 5 });
  await page.mouse.up();
  await shot(page, '2a Crop photo');
  await page.getByRole('dialog').getByRole('button', { name: 'Crop', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await page.waitForFunction(() => {
    const img = document.querySelector('.photo img');
    return img && img.complete && img.naturalWidth > 0;
  });
  const cropped = await page
    .locator('.photo img')
    .evaluate((img) => ({ w: img.naturalWidth, h: img.naturalHeight }));
  check(
    Math.abs(cropped.w / cropped.h - 4 / 3) < 0.01 && cropped.w <= 1280,
    `the cropped photo is 4:3 (${cropped.w}×${cropped.h})`,
  );
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

  // A PDF of the recipe, at the 4 portions shown.
  const curryPdf = await savePdf(page, 'curry');
  check(curryPdf.name === 'Chickpea curry.pdf', 'the PDF is named after the recipe');
  check(curryPdf.hasImage, 'the PDF holds the photo');

  await page.getByRole('button', { name: 'Add to plan' }).click();
  await page.getByRole('dialog').waitFor();
  await page.locator('.days li').nth(3).locator('.slot').first().click();
  await page.locator('.toast').filter({ hasText: 'Planned for' }).waitFor();
  check(true, 'a recipe can be planned from its page');
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

  // Cooking, opened from the Plan page.
  await page.getByRole('link', { name: 'Plan' }).click();
  await page.getByRole('heading', { name: 'Plan', exact: true }).waitFor();
  check(
    (await page.locator('.cook-banner').innerText()).includes('Dinner:'),
    "the Plan page offers to cook today's dinner",
  );
  await page.locator('.cook-banner').click();
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
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('heading', { name: 'Plan', exact: true }).waitFor();
  check(
    (await page.locator('.cook-banner').innerText()).includes('Cooking now') &&
      (await page.getByLabel('Cooking in progress').count()) === 1,
    'while cooking, the Plan page and its tab lead back to the recipes',
  );
  await page.locator('.cook-banner').click();
  await page.getByRole('heading', { name: 'Cooking', exact: true }).waitFor();
  check(
    (await page.locator('.ticks button.done').count()) === 2,
    'going back to cooking keeps the ticks',
  );
  await page.getByRole('button', { name: 'Done cooking' }).click();
  check(await seeToast(page, 'marked as cooked'), 'finishing cooking marks the meals as cooked');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('heading', { name: 'Plan', exact: true }).waitFor();

  // Products has its own tab, and addresses from before the move still work.
  await page.getByRole('link', { name: 'Products' }).click();
  await page.getByRole('heading', { name: 'Products', exact: true }).waitFor();
  check(
    (await page.locator('nav.tabbar a[aria-current="page"]').innerText()).includes('Products'),
    'Products is a tab',
  );
  await page.goto(`${BASE}#/more/products`);
  await page.getByRole('heading', { name: 'Products', exact: true }).waitFor();
  check(page.url().endsWith('#/products'), 'the old Products address opens the Products tab');
  await page.goto(`${BASE}#/cook`);
  await page.getByRole('heading', { name: 'Cook', exact: true }).waitFor();
  check(page.url().endsWith('#/plan/cook'), 'the old Cook address opens Cook in Plan');
  await page.goto(`${BASE}#/recipes`);

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
  check(
    (await card.locator('.ring path').count()) === 3 &&
      (await card.locator('.ring').innerHTML()).includes(`>${kcal}<`),
    'a ring shows protein, fat and carbs, with the calories in the middle',
  );
  const legend = (await card.locator('.legend').innerText()).replace(/\s+/g, ' ');
  check(
    /Protein 63 g \d+%/.test(legend) &&
      /Fat \d+ g \d+%/.test(legend) &&
      /Carbs \d+ g \d+%/.test(legend),
    `the grams and shares sit next to the ring (${legend})`,
  );
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

  await page
    .getByRole('dialog')
    .getByRole('button', { name: /3 garlic cloves/ })
    .click();
  const picker = page.getByRole('dialog', { name: '3 garlic cloves' });
  await picker.getByText('None of your products matches “garlic” yet.').waitFor();
  check(true, 'tapping an unlinked ingredient opens its product picker');
  await picker.getByRole('button', { name: 'Pick a product or make one' }).click();
  check(
    (await picker.getByRole('searchbox').inputValue()) === 'Garlic',
    'the search starts with the ingredient’s name',
  );
  await picker.getByRole('button', { name: 'New product “Garlic”' }).click();
  await page.getByRole('heading', { name: 'Product', exact: true }).waitFor();
  check(
    (await page.getByPlaceholder('Basmati rice').inputValue()) === 'Garlic',
    'making a product opens it, named after the ingredient',
  );
  check(
    (await page.locator('.weight-row').innerText()).includes('1 clove'),
    'the product form asks for the weight of a clove',
  );
  check(
    await page.getByRole('button', { name: 'Use values for Garlic' }).isVisible(),
    'the form offers the basic food values for garlic',
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
  await savePdf(page, 'tikka');
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
  await page.goto(`${BASE}#/products/new?name=${encodeURIComponent('Whole chicken XL')}`);
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
  await page.goto(`${BASE}#/products`);
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

/** Makes a recipe's PDF from its page and saves it to /out. */
async function savePdf(page, name) {
  await page.getByRole('button', { name: 'Make a PDF' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByText(/ KB$/).waitFor();
  if (name === 'curry') await shot(page, '3a Recipe PDF');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    sheet.getByRole('button', { name: 'Save' }).click(),
  ]);
  const path = `${OUT}/${name}.pdf`;
  await download.saveAs(path);
  await page.goBack();
  await sheet.waitFor({ state: 'detached' });
  const bytes = fs.readFileSync(path);
  check(bytes.subarray(0, 5).toString() === '%PDF-', `the ${name} PDF is a PDF file`);
  return { name: download.suggestedFilename(), hasImage: bytes.includes('/DCTDecode') };
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
  await page.goto(`${BASE}#/products`);
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

/** The text drawn in a PDF made by pdf-lib, as lowercase hex, which is how it writes text. */
function pdfHexText(bytes) {
  const raw = bytes.toString('latin1');
  let out = '';
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      out += zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
    } catch {
      out += m[1];
    }
  }
  return out.toLowerCase();
}

const hex = (text) => Buffer.from(text, 'latin1').toString('hex');

// Ingredient options: "or" lines, and products matched by the words in their names.
async function ingredientOptions(browser, github) {
  const page = await newPhone(browser, github);
  await page.goto(BASE);
  await page.getByRole('heading', { name: 'Your recipe book is empty' }).waitFor();
  await page.evaluate(async () => {
    const now = new Date().toISOString();
    const product = (id, name, packSize, packUnit, price, nutrition) => ({
      id,
      name,
      shop: 'aldi',
      packSize,
      packUnit,
      price,
      nutrition,
      listMode: 'auto',
      aliases: [],
      createdAt: now,
      updatedAt: now,
    });
    const recipe = (id, title, ingredients) => ({
      id,
      title,
      tags: ['Meal'],
      portions: 2,
      ingredients,
      steps: ['Cook everything.'],
      notes: '',
      createdAt: now,
      updatedAt: now,
    });
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('sanso', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['recipes', 'products'], 'readwrite');
      for (const r of [
        recipe('tray', 'Chicken tray bake', [
          '600 g chicken thighs OR 600 g chicken breast',
          '1 kg potatoes or sweet potatoes',
          '1 onion',
        ]),
        recipe('chilli', 'Beef chilli', ['500 g ground beef', '400 g kidney beans', '200 ml milk']),
      ])
        tx.objectStore('recipes').put(r);
      for (const p of [
        product('thighs', 'Chicken thighs', 1000, 'g', 5, {
          kcal: 180,
          protein: 18,
          fat: 12,
          carbs: 0,
        }),
        product('breast', 'Chicken breast', 1000, 'g', 8, {
          kcal: 110,
          protein: 23,
          fat: 2,
          carbs: 0,
        }),
        product('b10', 'Ground beef 10% fat', 500, 'g', 4, {
          kcal: 176,
          protein: 20,
          fat: 10,
          carbs: 0,
        }),
        product('b20', 'Ground beef 20% fat', 500, 'g', 3, {
          kcal: 254,
          protein: 17,
          fat: 20,
          carbs: 0,
        }),
        product('coconut', 'Coconut milk', 400, 'ml', 1.2, {
          kcal: 197,
          protein: 2,
          fat: 20,
          carbs: 3,
        }),
      ])
        tx.objectStore('products').put(p);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await page.locator('.recipe').first().waitFor();

  // An "or" line: the first option is picked to start with.
  await page.goto(`${BASE}#/recipes/tray`);
  await page.getByRole('heading', { name: 'Chicken tray bake' }).waitFor();
  const ingredients = page.locator('.ingredients');
  const chicken = ingredients.locator('li').nth(0);
  let text = await chicken.innerText();
  check(
    text.includes('600 g chicken thighs') && !/OR/.test(text) && text.includes('2 options'),
    'an “or” line shows its first option, with a button for the others',
  );
  check(
    (await ingredients.locator('li').nth(1).innerText()).includes('1 kg potatoes'),
    'an alternative without an amount is still a choice',
  );
  // 600 g thighs: 1080 kcal and €3.00, over 2 portions.
  let facts = await page.locator('.facts').innerText();
  check(facts.includes('540') && facts.includes('€1.50'), 'calories and cost use the first option');
  await shot(page, '21 Ingredient options');

  await chicken.getByRole('button').click();
  const sheet = page.getByRole('dialog');
  await sheet.waitFor();
  text = await sheet.innerText();
  check(
    text.includes('540 kcal · €1.50 per portion') && text.includes('330 kcal · €2.40 per portion'),
    'the picker shows each option’s calories and cost per portion',
  );
  await shot(page, '22 Choose an ingredient');
  await sheet.getByRole('button', { name: /^Chicken breast/ }).click();
  await sheet.waitFor({ state: 'detached' });
  facts = await page.locator('.facts').innerText();
  check(
    facts.includes('330') &&
      facts.includes('€2.40') &&
      (await chicken.innerText()).includes('breast'),
    'picking chicken breast changes the line, the calories and the cost',
  );
  await savePdf(page, 'tray');
  const tray = fs.readFileSync(`${OUT}/tray.pdf`);
  const drawn = pdfHexText(tray);
  check(
    drawn.includes(hex('breast')) && !drawn.includes(hex('thighs')),
    'the PDF lists the picked option only',
  );

  // Planned meals start with the recipe's picks.
  await page.getByRole('button', { name: 'Add to plan' }).click();
  await page.getByRole('dialog').waitFor();
  await page.locator('.days li').nth(0).locator('.slot').nth(1).click();
  await page.locator('.toast').filter({ hasText: 'Planned for' }).waitFor();
  await page.getByRole('dialog').waitFor({ state: 'detached' });

  // Two products whose names contain "ground beef".
  await page.goto(`${BASE}#/recipes/chilli`);
  await page.getByRole('heading', { name: 'Beef chilli' }).waitFor();
  const beef = ingredients.locator('li').nth(0);
  check(
    (await beef.innerText()).includes('Ground beef 10% fat · 2 options'),
    '“ground beef” matches both beef products by their names',
  );
  await beef.getByRole('button').click();
  await sheet.waitFor();
  await sheet.getByRole('button', { name: /Ground beef 20% fat/ }).click();
  check(
    await seeToast(page, 'Ground beef 20% fat is now the usual pick for “ground beef”'),
    'the first product picked for a name becomes its usual pick',
  );
  // 500 g of 20% beef is 1270 kcal, and 200 ml milk matched to coconut milk 394, over 2 portions.
  facts = await page.locator('.facts').innerText();
  check(facts.includes('832'), 'the 20% beef’s calories are used');

  // Coconut milk isn't milk: remove the name from the product.
  await page.goto(`${BASE}#/products/coconut`);
  await page.getByRole('button', { name: 'Don’t offer it for “milk”' }).click();
  await page.locator('.alias.removed').waitFor();
  await shot(page, '23 Not offered for');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForURL((url) => !url.href.includes('/coconut'));
  await page.goto(`${BASE}#/recipes/chilli`);
  await page.getByRole('heading', { name: 'Beef chilli' }).waitFor();
  facts = await page.locator('.facts').innerText();
  check(
    facts.includes('635') && facts.includes('From 1 of 3 ingredients'),
    'milk no longer counts as coconut milk',
  );
  await page.getByRole('button', { name: 'Add to plan' }).click();
  await page.getByRole('dialog').waitFor();
  await page.locator('.days li').nth(1).locator('.slot').nth(1).click();
  await page.locator('.toast').filter({ hasText: 'Planned for' }).waitFor();
  await page.getByRole('dialog').waitFor({ state: 'detached' });

  // A meal can pick differently from the recipe.
  await page.goto(`${BASE}#/plan`);
  await page.locator('.day.today .slot').nth(1).click();
  const meal = page.getByRole('dialog', { name: 'Today · Dinner' });
  await meal.getByText('Ingredients for this meal').waitFor();
  await meal.getByRole('button', { name: /g chicken breast/ }).click();
  const picker = page.getByRole('dialog', { name: /g chicken breast/ });
  await picker.getByRole('button', { name: /^Chicken thighs/ }).click();
  await picker.waitFor({ state: 'detached' });
  check(
    (await meal.innerText()).includes('300 g chicken thighs'),
    'the meal sheet changes the pick for that meal',
  );
  await shot(page, '24 Meal options');
  await page.goBack();
  await meal.waitFor({ state: 'detached' });
  await page.goto(`${BASE}#/recipes/tray`);
  check(
    (await page.locator('.ingredients li').nth(0).innerText()).includes('breast'),
    'and the recipe keeps its own pick',
  );

  // The list follows each meal's picks.
  await page.goto(`${BASE}#/shopping`);
  await page.getByRole('button', { name: 'Make a list' }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: /Make the list/ }).click();
  await page.locator('.item').first().waitFor();
  const list = await page.locator('.page').innerText();
  check(
    list.includes('Chicken thighs') && !list.includes('Chicken breast'),
    'the list has the meal’s chicken thighs, not the recipe’s breast',
  );
  check(
    list.includes('Ground beef 20% fat') && !list.includes('10% fat'),
    'and the beef that was picked',
  );
  check(list.includes('Potatoes') && !list.includes('Coconut milk'), 'and the other ingredients');
  await shot(page, '25 List from picks');

  // The editor shows how the options read.
  await page.goto(`${BASE}#/recipes/tray/edit`);
  const preview = await page.locator('.preview').innerText();
  check(
    preview.includes('or 600 g') &&
      preview.includes('Chicken breast') &&
      preview.includes('or 1 kg'),
    'the editor’s preview lists each alternative and its product',
  );
  await collectCsp(page);
  await page.context().close();
}

/** Offer weeks, the next-week filter, the price graph and the missing-info filter, on a fresh phone. */
async function offersPrices(browser, github) {
  const page = await newPhone(browser, github);
  await page.goto(BASE);
  await page.getByRole('heading', { name: 'Your recipe book is empty' }).waitFor();
  await page.evaluate(async () => {
    const iso = (offset) => {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const created = new Date(Date.now() - 90 * 86400000).toISOString();
    const nutrition = { kcal: 100, protein: 5, fat: 2, carbs: 10 };
    const product = (id, name, extra) => ({
      id,
      name,
      shop: 'aldi',
      sectionId: 'grains',
      listMode: 'auto',
      aliases: [],
      createdAt: created,
      updatedAt: created,
      ...extra,
    });
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('sanso', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['recipes', 'products'], 'readwrite');
      tx.objectStore('recipes').put({
        id: 'stew',
        title: 'Beef stew',
        tags: [],
        portions: 2,
        ingredients: ['500 g irish beef mince', '3 garlic cloves', '1 onion'],
        steps: ['Cook.'],
        notes: '',
        createdAt: created,
        updatedAt: created,
      });
      for (const p of [
        // Saved by an older version: one offer with only an end date, set today for 7 days.
        product('mince', 'Irish beef mince', {
          packSize: 500,
          packUnit: 'g',
          price: 4.29,
          nutrition,
          offer: { price: 3.49, until: iso(6) },
          priceLog: [
            { date: iso(-80), price: 3.99 },
            { date: iso(-30), price: 4.29 },
          ],
          offers: undefined,
        }),
        product('rice', 'Basmati rice', { packSize: 1000, packUnit: 'g', price: 1.89, nutrition }),
        product('garlic', 'Garlic', { packSize: 250, packUnit: 'g', price: 0.69 }),
        product('onion', 'Onion', {}),
        product('salt', 'Sea salt', { negligible: true, listMode: 'skip', sectionId: undefined }),
      ])
        tx.objectStore('products').put(p);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.goto(`${BASE}#/products`);
  await page.reload();
  await page.getByRole('heading', { name: 'Products' }).waitFor();
  const chip = (name) => page.locator('.tools .chip', { hasText: new RegExp(`^${name}`) });
  const rowNames = async () =>
    (await page.locator('.row .row-title').allInnerTexts()).map((t) => t.trim());

  // An offer saved by an older version still counts, as a 7-day offer.
  await chip('On offer now').click();
  check(
    JSON.stringify(await rowNames()) === '["Irish beef mince"]' &&
      (await page.locator('.row .pill.offer').first().innerText()).includes('€3.49'),
    'an offer saved by the old version shows under On offer now',
  );

  // Adding an offer: pick the Thursday it starts, and the end is set.
  await page.goto(`${BASE}#/products/rice`);
  await page.getByRole('button', { name: 'Add an offer' }).click();
  await page.getByPlaceholder('1.49').fill('1.49');
  const weeks = page.locator('.weeks .week');
  check((await weeks.count()) === 3, 'an offer can start this week or in the next two');
  const nextWeek = page.locator('.weeks .week', { hasText: 'Next week' });
  await nextWeek.click();
  const nextThu = (await nextWeek.locator('.week-day').innerText()).trim();
  const ends = await page.locator('.offer-card .field .hint').innerText();
  check(
    /^Thu \d+ \w{3}$/.test(nextThu) && /^Ends Wednesday \d+ \w{3}\.$/.test(ends.trim()),
    `the offer starts on a Thursday and ends on the Wednesday after (${nextThu}, ${ends.trim()})`,
  );
  await shot(page, '24 Adding an offer');
  await page.getByRole('button', { name: 'Add offer' }).click();
  const offerRow = page.locator('.offer-row');
  check(
    (await offerRow.count()) === 1 && (await offerRow.innerText()).includes('Next week'),
    'the offer is listed as next week’s',
  );
  // The regular price goes up too.
  await page.getByPlaceholder('1.89').fill('1.99');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('heading', { name: 'Products' }).waitFor();

  await chip('On offer next week').click();
  let names = await rowNames();
  check(
    names.includes('Basmati rice') &&
      (await page.locator('.row', { hasText: 'Basmati rice' }).innerText()).includes(
        'Next week €1.49',
      ),
    'On offer next week lists the rice with its offer price',
  );
  await chip('On offer now').click();
  check(!(await rowNames()).includes('Basmati rice'), 'next week’s offer isn’t on now');

  // The price graph: the rice went up today and has next week's offer ahead.
  await page.goto(`${BASE}#/products/rice`);
  const history = page.locator('.card', { hasText: 'Price history' });
  await history.waitFor();
  let historyText = await history.innerText();
  check(
    historyText.includes('Up to €1.99') &&
      historyText.includes('from €1.89') &&
      historyText.includes('Offer €1.49') &&
      historyText.includes('usually €1.99'),
    'the price history lists the price rise and the coming offer',
  );
  check(
    (await history.locator('path.price').count()) >= 1 &&
      (await history.locator('path.dip.future').count()) === 1,
    'the graph draws the price, with the coming offer as a faded dip',
  );
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.goto(`${BASE}#/products/mince`);
  await history.waitFor();
  historyText = await history.innerText();
  check(
    historyText.includes('Up to €4.29') && historyText.includes('Offer €3.49'),
    'the mince graph shows its earlier rise and the offer on now',
  );
  check(
    (await page.locator('.offer-row').innerText()).includes('On now'),
    'the old offer can be edited as an offer on now',
  );
  await history.scrollIntoViewIfNeeded();
  await shot(page, '25 Price history');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('heading', { name: 'Products' }).waitFor();

  // Missing info, with a chip for each kind of detail.
  await chip('Missing info').click();
  names = await rowNames();
  check(
    !names.includes('Sea salt') && names.includes('Onion') && names.includes('Garlic'),
    'Missing info leaves out salt, which needs nothing',
  );
  const missingChip = (name) => page.locator('.missing-chips .chip', { hasText: name });
  await missingChip('Nutrition').click();
  check(
    JSON.stringify((await rowNames()).sort()) === '["Garlic","Onion"]',
    'the Nutrition chip shows only products without nutrition',
  );
  await missingChip('Weights').click();
  check(
    JSON.stringify((await rowNames()).sort()) === '["Garlic","Onion"]',
    'the Weights chip shows products whose recipe lines need a weight',
  );
  await missingChip('Price').click();
  check(JSON.stringify(await rowNames()) === '["Onion"]', 'the Price chip shows the onion');
  check(
    (await page.locator('.row', { hasText: 'Onion' }).innerText()).includes(
      'No price, pack size, nutrition, weights, photo',
    ),
    'each row says what it’s missing',
  );
  await missingChip('Anything').click();
  await shot(page, '26 Missing info');
  await collectCsp(page);
  await page.context().close();
}

/** Filling in fresh produce from the basic foods table, on a fresh phone. */
async function basicFoodsFill(browser, github) {
  const page = await newPhone(browser, github);
  await page.goto(BASE);
  await page.getByRole('heading', { name: 'Your recipe book is empty' }).waitFor();
  await page.evaluate(async () => {
    const now = new Date().toISOString();
    const product = (id, name, extra = {}) => ({
      id,
      name,
      shop: 'aldi',
      sectionId: 'veg',
      listMode: 'auto',
      aliases: [],
      createdAt: now,
      updatedAt: now,
      ...extra,
    });
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('sanso', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['recipes', 'products'], 'readwrite');
      tx.objectStore('recipes').put({
        id: 'soup',
        title: 'Leek and potato soup',
        tags: [],
        portions: 2,
        ingredients: ['2 leeks', '3 potatoes', '1 onion', '2 carrots', '3 garlic cloves'],
        steps: ['Cook.'],
        notes: '',
        createdAt: now,
        updatedAt: now,
      });
      for (const p of [
        product('onion', 'Irish brown onions', { aliases: ['onion'] }),
        product('carrot', 'Loose carrots', { aliases: ['carrot'] }),
        product('leek', 'Leeks'),
        product('potato', 'Rooster potatoes', { aliases: ['potato'] }),
        // Its own label values stay; only the clove weight is added.
        product('garlic', 'Garlic', { nutrition: { kcal: 150, protein: 6, fat: 1, carbs: 30 } }),
        product('bread', 'Garlic bread'),
      ])
        tx.objectStore('products').put(p);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.goto(`${BASE}#/products`);
  await page.reload();
  await page.getByRole('heading', { name: 'Products' }).waitFor();
  await page.locator('.tools .chip', { hasText: /^Missing info/ }).click();
  await page.getByRole('link', { name: /Fill in nutrition for fresh food/ }).click();
  await page.getByRole('heading', { name: 'Basic foods' }).waitFor();

  const ready = page.locator('section', { hasText: 'Ready to fill in' });
  const readyText = await ready.innerText();
  check(
    /Irish brown onions\s*As Onion\s*40 kcal · P 1.1 g · F 0.1 g · C 7.6 g · 1 piece 110 g/.test(
      readyText,
    ),
    'the onions are matched to Onion, with its values and piece weight',
  );
  check(
    readyText.includes('Leeks') &&
      readyText.includes('Rooster potatoes') &&
      readyText.includes('Loose carrots'),
    'leeks, potatoes and carrots are matched too',
  );
  check(
    /Garlic\s*As Garlic\s*1 clove 3 g/.test(readyText) &&
      !/Garlic\s*As Garlic\s*149 kcal/.test(readyText),
    'garlic with its own nutrition only gets the clove weight',
  );
  const noMatch = await page.locator('section', { hasText: 'No match' }).innerText();
  check(noMatch.includes('Garlic bread'), 'Garlic bread isn’t taken for garlic');
  await shot(page, '27 Basic foods');

  // Garlic bread can still be given a food by hand; skip it and the carrots instead.
  await page.getByRole('button', { name: 'Skip Loose carrots' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  check(await seeToast(page, 'Filled in 4 products'), 'saving fills in the ticked products');
  await page.getByRole('heading', { name: 'Products' }).waitFor();

  await page.goto(`${BASE}#/products/onion`);
  check(
    (await page.getByLabel('Calories per 100 g').inputValue()) === '40' &&
      (await page.locator('.weight-row', { hasText: '1 piece' }).locator('input').inputValue()) ===
        '110',
    'the onion now has its calories and the weight of one onion',
  );
  await page.getByRole('button', { name: 'Cancel' }).click();

  // In the form: the carrots get their values from the suggestion button.
  await page.goto(`${BASE}#/products/carrot`);
  await page.getByRole('button', { name: 'Use values for Carrot' }).click();
  check(
    (await page.getByLabel('Calories per 100 g').inputValue()) === '41' &&
      (await page.locator('.filled').innerText()).includes('Carrots, raw'),
    'the form fills in a suggested food and says where the values come from',
  );
  await page.locator('.nutrients').scrollIntoViewIfNeeded();
  await shot(page, '28 Product from basic foods');
  await page.getByRole('button', { name: 'Other basic food' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByPlaceholder('Search, like onion or chicken').fill('parsnip');
  await sheet.getByRole('button', { name: /^Parsnip/ }).click();
  check(
    (await page.getByLabel('Calories per 100 g').inputValue()) === '75',
    'another food can be picked from the table',
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('heading', { name: 'Products' }).waitFor();

  await page.goto(`${BASE}#/recipes/soup`);
  const facts = await page.locator('.facts').innerText();
  check(
    facts.includes('Calories from 5 of 5 ingredients') || facts.includes('From 5 of 5'),
    `the soup counts all five ingredients for calories (${facts.split('\n').at(-1)})`,
  );
  await page.locator('.facts').scrollIntoViewIfNeeded();
  await shot(page, '29 Soup per portion');
  await collectCsp(page);
  await page.context().close();
}

/** Nutrition per piece for a stock cube, on a fresh phone. */
async function perPiece(browser, github) {
  const page = await newPhone(browser, github);
  await page.goto(BASE);
  await page.getByRole('heading', { name: 'Your recipe book is empty' }).waitFor();
  await page.evaluate(async () => {
    const now = new Date().toISOString();
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('sanso', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['recipes', 'products'], 'readwrite');
      tx.objectStore('recipes').put({
        id: 'broth',
        title: 'Quick broth',
        tags: [],
        portions: 2,
        ingredients: ['2 stock cubes'],
        steps: ['Dissolve in boiling water.'],
        notes: '',
        createdAt: now,
        updatedAt: now,
      });
      tx.objectStore('products').put({
        id: 'cubes',
        name: 'Chicken stock cubes',
        shop: 'aldi',
        listMode: 'auto',
        aliases: ['stock cube'],
        packSize: 12,
        packUnit: 'pcs',
        price: 0.6,
        createdAt: now,
        updatedAt: now,
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.goto(`${BASE}#/products/cubes`);
  await page.reload();
  await page.getByRole('heading', { name: 'Product', exact: true }).waitFor();
  check(
    (await page.locator('.weight-row', { hasText: '1 piece' }).count()) === 1,
    'per 100 g, "2 stock cubes" needs the weight of one cube',
  );
  await page.getByRole('button', { name: 'Per piece', exact: true }).click();
  check(
    (await page.locator('.weight-row').count()) === 0,
    'per piece, the cube weight isn’t needed',
  );
  for (const [label, value] of [
    ['Calories', '20'],
    ['Protein', '0.5'],
    ['Fat', '1.2'],
    ['Carbs', '1.8'],
  ])
    await page.getByLabel(`${label} per piece`).fill(value);
  await page.locator('.nutrients').scrollIntoViewIfNeeded();
  await shot(page, '31 Nutrition per piece');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('heading', { name: 'Products', exact: true }).waitFor();

  await page.goto(`${BASE}#/recipes/broth`);
  const facts = await page.locator('.facts').innerText();
  check(
    /\b20\b/.test(facts) &&
      /1 of 1|all/i.test(facts) &&
      (await page.locator('.status').count()) === 0,
    `two cubes for 2 portions give 20 kcal a portion, and the line is complete (${facts.replace(/\s+/g, ' ')})`,
  );
  await page.goto(`${BASE}#/products/cubes`);
  check(
    (await page
      .getByRole('button', { name: 'Per piece', exact: true })
      .getAttribute('aria-pressed')) === 'true' &&
      (await page.getByLabel('Calories per piece').inputValue()) === '20',
    'the product keeps its values per piece',
  );
  await collectCsp(page);
  await page.context().close();
}

/** A fresh Pixel-sized browser profile: its own storage, as on another phone. */
/** Picking an ingredient's product on the recipe page, and the red and yellow signs, on a fresh phone. */
async function ingredientMatching(browser, github) {
  const page = await newPhone(browser, github);
  await page.goto(BASE);
  await page.getByRole('heading', { name: 'Your recipe book is empty' }).waitFor();
  await page.evaluate(async () => {
    const now = new Date().toISOString();
    const full = { kcal: 350, protein: 8, fat: 1, carbs: 77 };
    const product = (id, name, extra = {}) => ({
      id,
      name,
      shop: 'aldi',
      listMode: 'auto',
      aliases: [],
      createdAt: now,
      updatedAt: now,
      ...extra,
    });
    const priced = { packSize: 1000, packUnit: 'g', price: 2, nutrition: full };
    const recipe = (id, title, ingredients) => ({
      id,
      title,
      tags: ['Meal'],
      portions: 2,
      ingredients,
      steps: ['Cook everything.'],
      notes: '',
      createdAt: now,
      updatedAt: now,
    });
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('sanso', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['recipes', 'products'], 'readwrite');
      tx.objectStore('recipes').put(
        recipe('risotto', 'Carrot risotto', ['300 g rice', '2 carrots', '1 tsp saffron']),
      );
      tx.objectStore('recipes').put(recipe('pilaf', 'Pilaf', ['300 g rice']));
      for (const p of [
        product('carrots', 'Carrots', {
          ...priced,
          nutrition: { kcal: 41, protein: 1, fat: 0.2, carbs: 7 },
          weights: { piece: 60 },
        }),
        product('small', 'Small carrots', priced),
        product('organic', 'Organic carrots', priced),
        product('basmati', 'Basmati rice', priced),
        product('brown', 'Brown rice', { nutrition: full }),
        product('arborio', 'Arborio', priced),
      ])
        tx.objectStore('products').put(p);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await page.locator('.recipe').first().waitFor();

  await page.goto(`${BASE}#/recipes/risotto`);
  await page.getByRole('heading', { name: 'Carrot risotto' }).waitFor();
  const lines = page.locator('.ingredients li');
  const rice = lines.nth(0);
  const carrots = lines.nth(1);
  const saffron = lines.nth(2);
  check(
    (await carrots.innerText()).includes('Carrots · 3 options') &&
      (await carrots.locator('.status').count()) === 0,
    'carrots match all three carrot products, and need nothing',
  );
  check(
    (await saffron.locator('.status.unlinked').count()) === 1 &&
      (await saffron.innerText()).includes('No product yet'),
    'an ingredient with no product gets the red sign',
  );
  check(
    (await page.locator('.signs-key').innerText()).includes('Product missing info'),
    'a key under the ingredients explains the signs',
  );
  await page.locator('.signs-key').scrollIntoViewIfNeeded();
  await shot(page, '30 Ingredient signs');

  await carrots.getByRole('button').click();
  const sheet = page.getByRole('dialog');
  await sheet.waitFor();
  const offered = await sheet.locator('.row-title').allInnerTexts();
  check(
    ['Carrots', 'Small carrots', 'Organic carrots'].every((n) => offered.includes(n)) &&
      offered[0] === 'Carrots',
    `the sheet offers every carrot product, Carrots first (${offered.join(', ')})`,
  );
  await page.goBack();
  await sheet.waitFor({ state: 'detached' });

  // Rice: two products match by name; Arborio is picked from the whole list.
  await rice.getByRole('button').click();
  await sheet.waitFor();
  check(
    (await sheet.locator('.row-title').allInnerTexts()).join('|') === 'Basmati rice|Brown rice',
    'rice offers both rice products',
  );
  await shot(page, '31 Pick a product');
  await sheet.getByRole('button', { name: 'Pick another product' }).click();
  const search = sheet.getByRole('searchbox');
  check((await search.inputValue()) === 'Rice', 'the search starts with “Rice”');
  await search.fill('arb');
  await shot(page, '32 Search products');
  await sheet.getByRole('button', { name: /^Arborio/ }).click();
  check(
    await seeToast(page, 'Arborio is now the usual pick for “rice”'),
    'a product picked from the whole list is linked, and becomes the usual pick',
  );
  await sheet.waitFor({ state: 'detached' });
  check(
    (await rice.innerText()).includes('Arborio · 3 options'),
    'the recipe uses Arborio, and offers it with the other two',
  );

  // Another recipe starts with the usual pick; picking Brown rice there shows the yellow sign.
  await page.goto(`${BASE}#/recipes/pilaf`);
  await page.getByRole('heading', { name: 'Pilaf' }).waitFor();
  const pilafRice = page.locator('.ingredients li').nth(0);
  check((await pilafRice.innerText()).includes('Arborio'), 'another recipe starts with Arborio');
  await pilafRice.getByRole('button').click();
  await sheet.waitFor();
  await sheet.getByRole('button', { name: /^Brown rice/ }).click();
  await sheet.waitFor({ state: 'detached' });
  check(
    (await pilafRice.locator('.status.incomplete').count()) === 1 &&
      (await pilafRice.innerText()).includes('needs price'),
    'a product missing its price gets the yellow sign',
  );
  await pilafRice.getByRole('button').click();
  await sheet.waitFor();
  check(
    (await sheet.innerText()).includes('Fill in Brown rice'),
    'the sheet offers to fill in the missing price',
  );
  await sheet.getByRole('button', { name: /Use Brown rice for “rice”/ }).click();
  check(
    await seeToast(page, 'Brown rice is now the usual pick for “rice”'),
    'a pick can become the usual one',
  );
  await page.goBack();
  await sheet.waitFor({ state: 'detached' });
  await page.goto(`${BASE}#/recipes/risotto`);
  await page.getByRole('heading', { name: 'Carrot risotto' }).waitFor();
  check(
    (await page.locator('.ingredients li').nth(0).innerText()).includes('Arborio'),
    'the risotto keeps its own pick',
  );
  await collectCsp(page);
  await page.context().close();
}

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
    await ingredientOptions(browser, github);
    await offersPrices(browser, github);
    await basicFoodsFill(browser, github);
    await ingredientMatching(browser, github);
    await perPiece(browser, github);
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
