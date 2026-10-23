# Sanso: design notes

A living record of what the app does, why it's built this way, and what's next. Update it whenever a decision changes.

**Status:** step 1 of the build plan (setup) is done. Next is the design round.

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
- **Data:** stored on the phone in IndexedDB. The app asks the browser for persistent storage so the data isn't evicted.
- **Backup (planned):** the app copies its data as JSON files to a private GitHub repo, using a token that can only access that repo. This gives an off-phone copy with history.
- **Updates:** the app looks for a new version when it opens or comes back to the foreground, then offers an Update button. It never reloads on its own, so an update can't interrupt shopping or cooking.
- There is no server.

## Features

### Recipe book

- Each recipe has a title, thumbnail photo, tags, default portions, preparation time, total time (including waiting), a score out of 10, ingredients, steps and notes.
- Starting tags: meal, dessert, breakfast/snack, baking. The list can be filtered by tag.
- Ingredients are typed one per line, the way you'd say them: "600 g chicken breast", "3 garlic cloves", "salt". The app splits each line into amount, unit and name.

### Meal planner

- A calendar with lunch and dinner for each day.
- A planned meal has a recipe, a number of portions (1 by default, more for guests) and a state:
  - **To shop**, then **Ready to cook**, then **Cooked**.
  - **No cooking** (eating out, leftovers), with an optional note.
- When the same recipe fills two slots (say dinner and the next day's lunch), it's cooked once for both.

### Shopping list

- Built from the "To shop" meals I select, then edited freely: remove what I already have, add anything else.
- It has two parts:
  - **To buy:** ingredients given by weight or volume (g, kg, ml, l). Amounts are added up across meals and rounded up to whole packs when the pack size is known.
  - **Check what you have:** counted or vague amounts (cloves, pieces, spoons, a pinch) and products marked as staples. Each item has _Have it_ and _Buy_ buttons.
- Items are grouped by shop section in walking order: dry goods, then fridge, then freezer. The order can be changed, and later set per shop if Aldi and Lidl differ.

### Shop mode

- Tick items off as they go in the trolley. Finishing the shop moves those meals to "Ready to cook".

### Cooking mode

- Pick meals from the plan and get each recipe scaled to the total portions. The screen stays on, and finished meals are marked "Cooked".

### Products and prices

- The product list grows with use. Each product has a name, shop section, shop, pack size, price, link and a staple flag. Price per kg or litre is calculated.
- Each recipe ingredient links to a product. The app asks the first time it meets a new ingredient name, then matches it on its own.
- Aldi details are entered by hand: share a product page from Chrome to the app to fill in the name and link, then type the price and pack size.
- Offers: mark a product as on offer (price and end date) and the shopping list highlights it.
- No scraping. aldi.ie blocks automated requests, and the app doesn't try to get around that. Revisit if a source that allows automated access turns up.

## Data model (draft)

- **Recipe:** id, title, photo (resized thumbnail), tags, portions, prepMinutes, totalMinutes, score (0 to 10), ingredients, steps, notes, createdAt, updatedAt
- **Ingredient line:** text as typed, quantity, unit, name, productId (all optional except text)
- **Product:** id, name, sectionId, shop, packSize, packUnit, price, url, staple, offer (price, until)
- **Section:** id, name, order
- **Planned meal:** date, slot (lunch or dinner), recipeId, portions, state (toShop, ready, cooked, noCooking), note
- **Shopping list item:** productId or free text, quantity, unit, part (buy or check), source meals, done

## Later

Keep the data model open for these:

- Cost per portion, from product prices.
- Calories and macros per portion, from optional nutrition values per 100 g on products. Counted ingredients (garlic cloves, eggs) will need a weight per piece.
- Section order per shop.

## Build plan

1. Project setup, deploy pipeline and an installable placeholder.
2. Design: mockups of the main screens, then agree on the look and navigation.
3. Recipe book, with export and import of all data as a file, as a safety net until backups exist.
4. Meal planner, shopping list and shop mode.
5. Cooking mode.
6. Product prices, pack sizes, offers, and sharing Aldi pages to the app.
7. Automatic backup to a private repo.

## Development

- Node 24, pinned in `.tool-versions`. Main commands: `npm run dev`, `npm run check`, `npm test`, `npm run build`.
- The dev and preview servers listen on 127.0.0.1 only.
- Changes reach `main` only through pull requests, and merging one publishes it.
- Commits use the GitHub noreply address, set in the repo's own git config.
