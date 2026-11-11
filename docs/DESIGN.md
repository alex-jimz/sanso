# Sanso: design notes

A living record of what the app does, why it's built this way, and what's next. Update it whenever a decision changes.

**Status:** the first full version is built: recipe book, meal planner, shopping list with shop mode, cooking mode, products with prices and offers, sharing pages from Chrome, and backups. The design round was skipped on purpose to get a working app first; the look is a first pass and expected to change with use.

## Goals

- One place for recipes, the meal plan, the shopping list and cooking.
- Owned outright: no subscription, and no company that can shut it down. The app is a set of static files and the data stays mine.
- Made for the phone (Pixel, Chrome) and usable offline in the shop.
- Pretty, and quick to use. A step that feels tedious is a bug.
- Easy to change as I find out what's practical.

It's for a single user, so there's no sharing or multi-user sync.

## How it works

- **App:** an installable web app (PWA) written in Svelte 5 and TypeScript, built with Vite. Chrome installs it to the home screen, and it runs full-screen and offline.
- **Hosting:** GitHub Pages. GitHub Actions checks, builds and publishes the app whenever a change is merged into `main`. The site holds app code only, never personal data.
- **Data:** stored on the phone in IndexedDB (`src/lib/db.ts`), loaded into memory at startup (`src/lib/store.svelte.ts`). Each change updates the screen first and is then written to IndexedDB. The app asks the browser for persistent storage on the first change.
- **Navigation:** five tabs (Recipes, Plan, Shopping, Products, More) and hash routes such as `#/recipes/<id>`. Cook is `#/plan/cook`, opened from a banner on the Plan page; the Plan tab shows a dot while cooking. Addresses from before the move (`#/cook`, `#/more/products/...`) are rewritten on load (`src/lib/router.svelte.ts`). Routes are hash-based so GitHub Pages needs no rewrites. Bottom sheets add a history entry, so Android's back gesture closes them (`src/lib/ui.svelte.ts`).
- **Updates:** the app looks for a new version when it opens or comes back to the foreground, then offers an Update button. It never reloads on its own, so an update can't interrupt shopping or cooking.
- There is no server.

## Look

- Warm cream background (`#faf6f0`), white cards, deep green accent (`#2f5d50`, from the icon). Tokens live in `src/app.css`.
- Headings in Fraunces (self-hosted, so it works offline); everything else in the phone's system font.
- Icons from Lucide (`@lucide/svelte`), imported one per file.
- Meal states have fixed colours: To shop mustard, Ready to cook green, Cooked grey-green, No cooking plum.
- Shop sections are marked by kind: shelves (sand), fridge (blue), freezer (darker blue).

## Features

### Recipe book

- Each recipe has a title, photo, tags, portions, preparation time, total time (including waiting), a score out of 10, ingredients, steps and notes.
- Photos are shrunk on the phone to at most 1280 px (WebP), about 150 KB each.
- Starting tags: Meal, Dessert, Breakfast/snack, Baking. New tags can be added while editing a recipe.
- The list can be searched (titles, tags and ingredients), filtered by tag and sorted by score, newest, quickest or name.
- The recipe page scales ingredients with a portions stepper, keeping the wording ("3 garlic cloves" becomes "1½ garlic cloves", "1 onion" becomes "2 onions").

### Recipe PDF and photo crop

- The PDF button on a recipe makes an A4 PDF on the phone with pdf-lib (`src/lib/recipePdf.ts`, loaded only when used): photo across the top, title, tags, times, score and portions, the per-portion card, ingredients beside the steps, and notes. Ingredients use the portions set on the recipe page. It uses the PDF standard fonts (Times, Helvetica) so nothing is downloaded; characters they lack are swapped (⅓ -> 1/3) or dropped. Share sends it through Android's share menu; Save puts it in Downloads.
- Picking a recipe photo opens a crop sheet (`src/components/CropSheet.svelte`) at 4:3, the shape of the editor's preview: drag to move, pinch or slider to zoom. "Use whole photo" skips it, and Crop on the editor crops the current photo again.

### Ingredient lines

Typed one per line, the way you'd say them. `src/lib/ingredients.ts` reads:

- weights and volumes: "600 g chicken breast", "600g", "1.5kg", "200 ml", "1 l"
- counts and spoon-type units: "1 onion", "3 garlic cloves", "3 cloves garlic", "2 tbsp", "a pinch of salt"
- fractions, ranges and words: "½", "1 1/2", "2-3" (uses the upper value), "two", "half a lemon"
- tins and packs: "2 x 400 g tins chopped tomatoes", "1 (400 g) tin" (counted as 800 g and 400 g of chopped tomatoes)
- notes: "1 onion, finely chopped", "2 eggs (beaten)", "olive oil for frying"
- an amount after the name: "Pasta 100 g"
- a line ending in ":" is a group heading, as in "For the sauce:"
- choices with "or", in `src/lib/choices.ts`: "600 g chicken thighs or 600 g chicken breast". An alternative without an amount takes the first one's, so "1 kg potatoes or sweet potatoes" is 1 kg of either. "or" inside brackets or after a note stays part of the note: "1 onion (or 2 shallots)", "1 onion, chopped or grated".

### Ingredient options

- Each line offers one option per alternative and matching product, so "500 g ground beef" offers both Ground beef 10% fat and 20% fat. The first option is picked until another is.
- The recipe page keeps its picks on the recipe (`choices`), and they drive its calories and cost and the PDF. Planning a meal copies them; the meal sheet changes them for that meal only (`Meal.choices`). The shopping list and cooking use each meal's picks, and meals of one recipe with different picks are cooked separately.
- A pick is stored as an option key, `p:<product id>` or `n:<normalised name>`, so editing a recipe keeps picks that still exist and falls back to the first option for the rest.
- The first product picked for a name that nothing matched exactly becomes its usual pick (`usualFor`), so it's the default in every recipe that hasn't picked. The ingredient sheet can make any pick the usual one.
- Every ingredient on the recipe page opens the ingredient sheet (`IngredientSheet.svelte`): the matching products with kcal and cost per portion, "Pick another product" to search all products or make a new one, and "Fill in" when the pick is missing info. A product picked from the whole list gets the name as an alias, so it's offered in every recipe.
- Picking stores the product of every line in `choices`, not just lines with options, so linking more products to a name later doesn't change a recipe already set up.
- Each line shows a red sign when it has no product, and a yellow one when its product is missing nutrition, price or a weight the line needs (`lineStatus.ts`). The product name shows under the line when it differs from the ingredient or there are options.

### Meal planner

- A week view with lunch and dinner for each day.
- A planned meal has a recipe, portions (default from More > Portions per meal, 1 to start) and a state:
  - **To shop**, then **Ready to cook**, then **Cooked**.
  - **No cooking** (eating out, leftovers), with an optional note.
- From a dinner, one tap plans the next day's lunch as leftovers.
- A recipe can also be planned from its own page, for any slot in the next two weeks.

### Shopping list

- Made from the planned meals I pick; the meals still "To shop" are picked by default. Changing the meals later rebuilds the list but keeps my ticks, choices and manual items (`mergeDecisions` in `src/lib/shopping.ts`).
- Lines for the same product (or, without a product, the same name) are merged and scaled to each meal's portions.
- It has three parts:
  - **To buy:** amounts given by weight or volume. Rounded up to whole packs when the pack size is known, allowing 5% short (410 g is still one 400 g pack).
  - **Check what you have:** counts, spoons and vague amounts, and products set to "Ask first". Each has _Have it_ and _Buy_.
  - **Have at home:** what I said I have, hidden but restorable.
- Tap water is never listed. Products set to "Never" (salt, for example) are never listed.
- Items are grouped by shop section in walking order. Items with no section go under "Not sorted yet"; tapping one and picking a section creates a product, so the next list sorts it automatically. An item can also be linked to an existing product.
- Shows an estimated cost from product prices, using offer prices while an offer lasts.
- Things can be added by hand, with suggestions from the product list.

### Shop mode

- Big rows to tick off, in walking order. "Check what you have" items still undecided show as "only if needed".
- Finishing the shop moves the list's meals to "Ready to cook". Unticked items can be kept for next time.

### Cooking mode

- Pick meals from the coming days; today's ready meals and their leftovers are picked by default.
- Meals with the same recipe are cooked once, scaled to their total portions.
- Ingredients and steps can be ticked. The screen stays on (Wake Lock). Finishing marks the meals "Cooked".

### Products and prices

- A product has a name, shop section, shop (Aldi, Lidl or either), pack size (g, ml or pieces), price, link, how it's listed (Normal, Ask first, Never), offers, and the ingredient names it matches. Price per kg, litre or piece is calculated.
- **Offers** (`src/lib/offers.ts`) always run for one offer week, Thursday to the following Wednesday, as at Aldi and Lidl. Adding one means typing the price and picking the Thursday it starts: this week, next week or the week after. A new offer replaces any offer in the same week. A product keeps a list of offers, so this week's and next week's can both be set, and ended ones stay for the price graph. Products can be filtered by "On offer now" and "On offer next week".
- **Price history** (`src/lib/priceHistory.ts`, `src/components/PriceHistory.svelte`): `saveProduct` adds a point to the product's price log whenever the regular price changes, from the form or aldi.ie. The first change also records the old price from the day the product was added, and a second change on the same day replaces the first. The product page draws a step chart: the regular price as a green line, offers as red dips, upcoming offers faded, and the last five changes as text below.
- **Missing info** (`src/lib/missingInfo.ts`): a Products filter, with one chip per kind of detail and a count: price, pack size, nutrition, weights needed by recipe lines, section, photo. "Too little to count" products need no price or nutrition, products never put on the list need no section or photo, parts got from another product need no price or pack size, and products that break down into parts need no nutrition.
- Ingredient names are matched to products in `src/lib/matching.ts`. Exact matches come first: the name's usual pick, then every product with the same normalised name ("Carrots" and "Small carrots" for "carrots", shorter names first), then products with the name as an alias. Several products can share an alias; only one can be the usual pick.
- Then products whose name contains every word of the ingredient, as "Ground beef 10% fat" for "ground beef". The ingredient's last word must be the product's main noun: only numbers and words like fat, lean, fillets, skinless or pack may follow it, so "garlic" doesn't match Garlic bread. Words in front aren't checked, so "milk" matches Coconut milk; removing the dashed name on the product page records it in `notFor`. For products, the ingredient may also have words like boneless, lean or free range that the product name leaves out.
- Last, products found under common other names (`synonymPairs`: ground beef / beef mince, zucchini / courgette, cilantro / coriander...), as suggestions.
- **Sharing from Chrome:** Sanso is a share target (`share_target` in `vite.config.ts`). Sharing an aldi.ie or lidl.ie product page opens a new product with the name, shop, link and pack size filled in from the page title and URL (`src/lib/share.ts`). If the link is already known, it opens that product instead, to update the price or offer.
- **aldi.ie helper:** a bookmarklet (`src/lib/aldiBookmarklet.js`, wrapped by `src/lib/aldiHelper.ts`, installed from Products > Get prices and photos from aldi.ie). Run from Chrome's address bar on an aldi.ie product, search or offers page, it reads the product numbers from the page's `/product/<slug>-<sku>` links, asks `api.aldi.ie/v2/products/<sku>` for each (up to 60, four at a time, from the user's own browser as the page does), and opens Sanso at `#/aldi?d=<JSON>`. The fragment never reaches a server.
  - Sanso treats that data as untrusted (`src/lib/aldi.ts`): fields are validated one by one, photos must be https on `*.aldi.cx` or `*.aldi.ie`, links are rebuilt from a safe slug, and nothing is saved until I confirm on the review page.
  - One new product opens the product form, to pick its section. Otherwise the review page lists known products (matched by Aldi number or saved link) with their changes, ticked, and new ones, unticked.
  - Aldi sets price, pack size and photo; name, section, aliases and list mode stay mine. A was-price becomes an offer for the current offer week, because Aldi doesn't say when a price drop ends. The regular price is the was-price.
  - Aldi's field names are read defensively (`amountRelevantDisplay`, `wasPriceDisplay`, `comparisonDisplay`, `sellingSize`, `assets[].url`). They come from open-source scrapers, not from testing against the live site, so the review page has "Copy what aldi.ie sent" for fixing mismatches.
  - No background or scheduled fetching: aldi.ie blocks automated requests, and the app doesn't try to get around that. Lidl isn't covered.
- Product photos are shown from Aldi's image server (CSP `img-src https://*.aldi.cx`), not stored on the phone, so they may be missing offline. Shown in Products, the product form and shop mode.

### Calories, macros and cost per portion

- Products have optional nutrition per 100 g (per 100 ml for products sold in ml), or per piece when `nutritionPer` is "piece", for things recipes count like stock cubes. Per piece, a plain count needs no piece weight; a weighed line, or pricing a pack sold by weight, still does. Filling from basic foods switches back to per 100 g. The values: kcal, protein, fat and carbs, entered from the label or filled in from the basic foods table. Carbs follow EU labels, without fibre. An Open Food Facts barcode lookup was investigated and left for later.
- **Basic foods** (`src/lib/basicFoods.ts`, `src/lib/basicFoods.json`): about 100 fresh foods, raw meats and fish, and staples, for products without a label. Values per 100 g and typical weights (one medium onion, one clove, one tbsp) come from USDA FoodData Central SR Legacy (public domain). `scripts/basic-foods.mjs` generates the JSON from USDA's CSV files: each food names its USDA entry and portions exactly, and the script fails if one isn't found. Carbs are carbohydrate by difference minus fibre. Piece weights where USDA's American sizes are far from Irish ones (chicken breast, fish fillets) are left out.
  - A product's name suggests a food: an exact name or alias, or a food name the product's name contains as its main words (`wordMatch`), so "Irish brown onions" is Onion but "Garlic bread" isn't Garlic. Single words that end other foods' names (pepper, oil, mince) aren't aliases.
  - The product form's Nutrition card offers "Use values for <food>" and "Other basic food". Products > Missing info links to a page that fills in many at once: each product with missing nutrition or recipe weights gets its suggested food, which can be changed or unticked. Values already set are never replaced; a product with label values only gets missing weights.
- "Too little to count" (`negligible`) makes a product zero calories and zero cost, for salt and spices.
- Lines that aren't weighed need grams per unit (`weights`): `piece` for plain counts ("2 onions"), or the unit id (`clove`, `tbsp`, `bulb`...). The product form only asks for the units its recipe lines use. Tins, packs and jars default to the product's pack size. Millilitres and grams are taken as equal.
- The recipe page shows cost per portion and a ring chart of calories (`src/lib/macroChart.ts`): protein, fat and carbs as shares of their calories (4, 9 and 4 kcal per gram), with the total kcal in the middle, and the grams and shares beside it in blocks of the same colours (protein red, fat yellow, carbs green). The PDF draws the same ring from the same paths. Below is how many ingredients the numbers cover (`src/lib/nutrition.ts`, `src/components/PortionFacts.svelte`). A line counts for nutrition only with all four values. "What's missing" lists the other lines and opens their product, or a new product named after the ingredient.
- Cost is the share of the regular pack price that the recipe uses, not whole packs and not offer prices.

### Breakdowns: things cut up at home

- A product can **break down into** parts, such as a whole chicken into thighs, breast, drumsticks and a carcass (`src/lib/breakdown.ts`). Each part is a product of its own, with an amount per pack in grams or pieces and an optional **cost share** in percent, entered by hand. Parts without a share are free.
- Recipes link to the part ("600 g chicken thighs"). The part's **ways to get it** are the products that break down into it, plus the part itself if it has a pack size or price. A shop pack of thighs is linked as a one-part breakdown at 100%.
- On the shopping list, a part with ways goes under **Choose how to get** until a way is picked: one of the products, or Have it (in the freezer). The last way used is remembered on the part (`lastVia`) and highlighted next time; it already counts towards the list until confirmed.
- Choosing a product adds it to To buy with enough packs for the part that needs most (`partPacks`), lists the parts it's for, and says what's left over for the freezer. If a recipe also uses the product whole, the packs are added to that item. Tapping it lets you change a part's choice.
- Cost per portion prices a part by its cost share of the product it was last got from. Nutrition is the part's own, per 100 g, often generic values.
- There's no freezer stock. "Have it" is decided per list.

### Product photos

- A product can have a photo stored on the phone (`photoId`), shrunk to 800 px, which is shown instead of the aldi.ie image and goes into backups.
- Ways to add one without the gallery: **Paste photo** after Chrome's Copy image, or **Share image** to Sanso, which opens a page to pick the product. "Choose a file" is there too.
- The share target is a POST (`public/share-target.js`, loaded into the service worker). Pictures are kept in the `sanso-share` cache for the app; shared pages are passed on as `?title=…&text=…&url=…` as before.

### Recipe files

- More > Recipe files exports all recipes as schema.org Recipe JSON-LD, `{"@context": "https://schema.org", "@graph": [...]}`, with photos as data URLs (`src/lib/recipeFormat.ts`). Notes go in `description`, tags in `recipeCategory` and `keywords`, the score in `aggregateRating` out of 10, and each recipe gets `identifier: "sanso:<id>"`.
- Import reads a Sanso export, any schema.org Recipe JSON, or the JSON-LD blocks of a saved web page. It adds recipes and never replaces any. Recipes with a title already in the book start unticked.
- From other sources, only tags already in my tag list are kept, and ratings are ignored (they're the site's public rating, not mine). Photos that are only links aren't downloaded.

### Backups

- **GitHub:** copies everything to a private repository using a fine-grained token that can only read and write that repository's contents (`src/lib/backup.svelte.ts`). Each backup is one commit with `recipes.json`, `products.json`, `sections.json`, `plan.json`, `list.json`, `settings.json` and `photos/`. Only files whose git hash changed are uploaded. It refuses to back up to a public repository.
- Runs automatically 3 minutes after the last change, when the app goes to the background with changes pending, and when the phone comes back online. Restore replaces everything on the phone with the latest backup.
- **Connecting** first reads what the repository holds (`inspectGitHubBackup`), without changing it. If it has a backup and the phone is empty (a new install), it offers to restore. If both have data, it asks whether to restore or replace the backup. Only a token change for the same repository skips the question.
- A backup never replaces a `recipes.json` or `products.json` that has entries with an empty one (`refuseEmptyOverwrite`). That protects the backup from an empty phone, such as after Chrome's storage is cleared.
- **File:** export everything, photos included, as one JSON file, and import it again.

## Data model

Types are in `src/lib/types.ts`. Changing them needs a migration in `src/lib/db.ts`, because existing phones and backups hold the old shape.

- **Recipe:** id, title, photoId, tags, portions, prepMinutes, totalMinutes, score, ingredients (lines as typed), choices (option keys), steps, notes, createdAt, updatedAt
- **Product:** id, name, breakdown (productId, amount, unit g or pcs, costShare), lastVia, photoId, sectionId, shop, packSize, packUnit, price, url, sku, imageUrl, priceCheckedAt, listMode, aliases (names linked to it, can be shared), usualFor (names it's the usual pick for, one product per name), notFor (names it doesn't mean), offers (price, from, until; older versions stored one `offer` with only `until`, converted on load into the offer week it started in), priceLog (date, price), nutrition (kcal, protein, fat, carbs per 100 g or ml, or per piece), nutritionPer ("piece" or absent), negligible, weights (grams per unit id), createdAt, updatedAt
- **Section:** id, name, zone (ambient, fridge, freezer), order
- **Meal:** id (`date:slot`), date, slot, recipeId, portions, state, note, choices (option keys)
- **Shopping list:** mealIds, items, createdAt, shopping (in shop mode)
- **Shopping item:** id, key (`p:<product>`, `n:<name>` or `m:<id>` for manual), productId, name, part (buy, check, have), decided, amounts (mass, volume, count, other units, unspecified), sources (meal, recipe, scaled line), manual, note, sectionId, done, via (`self` or a product id), partPacks, forParts
- **Cooking session:** mealIds, startedAt, ticked
- **Settings:** defaultPortions, tags, backup (repo, token, lastBackupAt, lastError)

Ingredient lines are stored as text and parsed when needed, so the parser can improve without migrating data. Products are linked through aliases rather than per line.

## Security

- The site is public and holds no personal data. Personal data stays on the phone and, if set up, in a private repository.
- The backup token is stored on the phone and only sent to api.github.com. Production builds have a Content Security Policy that allows scripts only from the app and network requests only to the app and api.github.com.
- Links from typing or from other apps' share sheets are only used if they're http or https (`safeUrl`).
- All of the account's GitHub Pages sites share one origin, `alex-jimz.github.io`, and so share storage. Don't publish other Pages sites under this account that run code you don't trust, since they could read Sanso's data and token.

## Later

- Nutrition lookups: barcode scan (Chrome's BarcodeDetector) against Open Food Facts, pasting label text copied with Google Lens, and a bundled table of basic foods with typical piece weights from USDA FoodData Central (public domain). CoFID is a closer match for Irish food, but its CC BY-NC-SA licence complicates bundling it in a public repo.
- Calories per day in the planner.
- Section order per shop, if Aldi and Lidl differ.
- Several dishes per meal.
- Dark mode. Colours already come from CSS variables.

## Development

- Node 24, pinned in `.tool-versions`. Main commands: `npm run dev`, `npm run check`, `npm test`, `npm run build`, `npm run e2e`.
- `npm run e2e` builds the app and drives it in a Pixel 7-sized Chromium inside the official Playwright Docker image, with networking turned off. It checks the main flows and writes screenshots to `test-results/`. `e2e/fakes.cjs` stands in for GitHub's git API and for aldi.ie (pages, product API, images), and backups are tested across fresh browser profiles as separate phones.
- The dev and preview servers listen on 127.0.0.1 only.
- Changes reach `main` only through pull requests, and merging one publishes it.
- Commits use the GitHub noreply address, set in the repo's own git config.
