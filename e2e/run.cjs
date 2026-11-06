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
