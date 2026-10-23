# Sanso

Recipes, meal plan and shopping list in one app for the phone. It's a web app (PWA) that installs from Chrome and works offline.

- **Recipes:** ingredients, steps, notes, photo, tags, times and a score out of 10. Ingredients scale to any number of portions.
- **Plan:** lunch and dinner for each day, with each meal marked To shop, Ready to cook, Cooked or No cooking.
- **Shopping:** a list made from the planned meals, sorted in the order you walk through the shop, with pack sizes, prices and offers.
- **Cook:** the recipes for the meals you pick, scaled and cooked once even when they cover two meals, with the screen kept on.

Design and plans: [docs/DESIGN.md](docs/DESIGN.md).

## Install on Android

Open [alex-jimz.github.io/sanso](https://alex-jimz.github.io/sanso/) in Chrome, then use the ⋮ menu to add it to the home screen.

To add a product from aldi.ie or lidl.ie, open its page in Chrome, tap Share and pick Sanso.

## Development

Needs Node 24 (see `.tool-versions`).

```sh
npm install
npm run dev           # dev server at http://127.0.0.1:5173
npm run check         # type-check
npm test              # unit tests
npm run build         # production build in dist/
npm run e2e           # build, then check the main flows in a phone-sized browser (needs Docker)
npm run format        # format all files
npm run icons         # re-render the PNG icons after editing public/icon.svg
```

## Releasing

Changes reach `main` through pull requests. Merging one runs `.github/workflows/deploy.yml`, which checks, tests, builds and publishes the app to GitHub Pages. Installed copies offer the new version the next time they're opened.
