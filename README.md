# Sanso

Recipes, meal plan and shopping list in one app for the phone. It's a web app (PWA) that installs from Chrome and works offline.

Design and plans: [docs/DESIGN.md](docs/DESIGN.md).

## Install on Android

Open [alex-jimz.github.io/sanso](https://alex-jimz.github.io/sanso/) in Chrome, then use the ⋮ menu to add it to the home screen.

## Development

Needs Node 24 (see `.tool-versions`).

```sh
npm install
npm run dev           # dev server at http://127.0.0.1:5173
npm run check         # type-check
npm test              # unit tests
npm run build         # production build in dist/
npm run format        # format all files
npm run icons         # re-render the PNG icons after editing public/icon.svg
```

## Releasing

Changes reach `main` through pull requests. Merging one runs `.github/workflows/deploy.yml`, which checks, tests, builds and publishes the app to GitHub Pages. Installed copies offer the new version the next time they're opened.
