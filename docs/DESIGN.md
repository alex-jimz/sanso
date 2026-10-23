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
- **Navigation:** five tabs (Recipes, Plan, Shopping, Cook, More) and hash routes such as `#/recipes/<id>`, so GitHub Pages needs no rewrites. Bottom sheets add a history entry, so Android's back gesture closes them (`src/lib/ui.svelte.ts`).
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

### Ingredient lines

Typed one per line, the way you'd say them. `src/lib/ingredients.ts` reads:

- weights and volumes: "600 g chicken breast", "600g", "1.5kg", "200 ml", "1 l"
- counts and spoon-type units: "1 onion", "3 garlic cloves", "3 cloves garlic", "2 tbsp", "a pinch of salt"
- fractions, ranges and words: "½", "1 1/2", "2-3" (uses the upper value), "two", "half a lemon"
- tins and packs: "2 x 400 g tins chopped tomatoes", "1 (400 g) tin" (counted as 800 g and 400 g of chopped tomatoes)
- notes: "1 onion, finely chopped", "2 eggs (beaten)", "olive oil for frying"
- an amount after the name: "Pasta 100 g"
- a line ending in ":" is a group heading, as in "For the sauce:"

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

- A product has a name, shop section, shop (Aldi, Lidl or either), pack size (g, ml or pieces), price, link, how it's listed (Normal, Ask first, Never), an optional offer (price and end date), and the ingredient names it matches. Price per kg, litre or piece is calculated.
- Ingredient names are matched to products by a normalised name ("Fresh Tomatoes" and "tomato" match), or by an alias learned when I link an item. An alias belongs to one product only.
- **Sharing from Chrome:** Sanso is a share target (`share_target` in `vite.config.ts`). Sharing an aldi.ie or lidl.ie product page opens a new product with the name, shop, link and pack size filled in from the page title and URL (`src/lib/share.ts`). If the link is already known, it opens that product instead, to update the price or offer.
- No scraping. aldi.ie blocks automated requests, and the app doesn't try to get around that. Revisit if a source that allows automated access turns up.

### Backups

- **GitHub:** copies everything to a private repository using a fine-grained token that can only read and write that repository's contents (`src/lib/backup.svelte.ts`). Each backup is one commit with `recipes.json`, `products.json`, `sections.json`, `plan.json`, `list.json`, `settings.json` and `photos/`. Only files whose git hash changed are uploaded. It refuses to back up to a public repository.
- Runs automatically 3 minutes after the last change, when the app goes to the background with changes pending, and when the phone comes back online. Restore replaces everything on the phone with the latest backup.
- **File:** export everything, photos included, as one JSON file, and import it again.

## Data model

Types are in `src/lib/types.ts`. Changing them needs a migration in `src/lib/db.ts`, because existing phones and backups hold the old shape.

- **Recipe:** id, title, photoId, tags, portions, prepMinutes, totalMinutes, score, ingredients (lines as typed), steps, notes, createdAt, updatedAt
- **Product:** id, name, sectionId, shop, packSize, packUnit, price, url, listMode, aliases, offer (price, until), createdAt, updatedAt
- **Section:** id, name, zone (ambient, fridge, freezer), order
- **Meal:** id (`date:slot`), date, slot, recipeId, portions, state, note
- **Shopping list:** mealIds, items, createdAt, shopping (in shop mode)
- **Shopping item:** id, key (`p:<product>`, `n:<name>` or `m:<id>` for manual), productId, name, part (buy, check, have), decided, amounts (mass, volume, count, other units, unspecified), sources (meal, recipe, scaled line), manual, note, sectionId, done
- **Cooking session:** mealIds, startedAt, ticked
- **Settings:** defaultPortions, tags, backup (repo, token, lastBackupAt, lastError)

Ingredient lines are stored as text and parsed when needed, so the parser can improve without migrating data. Products are linked through aliases rather than per line.

## Security

- The site is public and holds no personal data. Personal data stays on the phone and, if set up, in a private repository.
- The backup token is stored on the phone and only sent to api.github.com. Production builds have a Content Security Policy that allows scripts only from the app and network requests only to the app and api.github.com.
- Links from typing or from other apps' share sheets are only used if they're http or https (`safeUrl`).
- All of the account's GitHub Pages sites share one origin, `alex-jimz.github.io`, and so share storage. Don't publish other Pages sites under this account that run code you don't trust, since they could read Sanso's data and token.

## Later

- Cost per portion, from product prices.
- Calories and macros per portion, from optional nutrition values per 100 g on products. Counted ingredients (garlic cloves, eggs) will need a weight per piece.
- Section order per shop, if Aldi and Lidl differ.
- Several dishes per meal.
- Dark mode. Colours already come from CSS variables.

## Development

- Node 24, pinned in `.tool-versions`. Main commands: `npm run dev`, `npm run check`, `npm test`, `npm run build`, `npm run e2e`.
- `npm run e2e` builds the app and drives it in a Pixel 7-sized Chromium inside the official Playwright Docker image, with networking turned off. It checks the main flows and writes screenshots to `test-results/`.
- The dev and preview servers listen on 127.0.0.1 only.
- Changes reach `main` only through pull requests, and merging one publishes it.
- Commits use the GitHub noreply address, set in the repo's own git config.
