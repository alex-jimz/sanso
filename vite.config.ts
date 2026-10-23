/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the app from /<repository name>/, which the deploy
// workflow passes in as BASE_PATH. Local dev and tests run from /.
const base = process.env.BASE_PATH ?? '/';

// Shown in the app, so it's easy to tell which version is installed.
const buildId = process.env.GITHUB_SHA?.slice(0, 7) ?? 'dev';
const buildDate = new Date().toISOString().slice(0, 10);

export default defineConfig({
  base,
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
  // Local servers are reachable from this machine only.
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
  plugins: [
    svelte(),
    VitePWA({
      // Ask before switching to a new version, so an update never reloads the
      // app in the middle of shopping or cooking.
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Sanso',
        short_name: 'Sanso',
        description: 'Recipes, meal plan and shopping list.',
        lang: 'en',
        display: 'standalone',
        theme_color: '#fbf7f1',
        background_color: '#fbf7f1',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
