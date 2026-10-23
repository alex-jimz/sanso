/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the app from /<repository name>/, which the deploy
// workflow passes in as BASE_PATH. Local dev and tests run from /.
const base = process.env.BASE_PATH ?? '/';

// Shown in the app, so it's easy to tell which version is installed.
const buildId = process.env.GITHUB_SHA?.slice(0, 7) ?? 'dev';
const buildDate = new Date().toISOString().slice(0, 10);

// The app holds a GitHub token for backups, so production builds only run
// their own scripts and only talk to themselves and api.github.com.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self' https://api.github.com data:",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function csp(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}" />`,
      ),
  };
}

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
    csp(),
    VitePWA({
      // Ask before switching to a new version, so an update never reloads the
      // app in the middle of shopping or cooking.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg'],
      workbox: {
        // Everything the app needs offline, fonts included.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
      manifest: {
        name: 'Sanso',
        short_name: 'Sanso',
        description: 'Recipes, meal plan and shopping list.',
        lang: 'en',
        display: 'standalone',
        theme_color: '#faf6f0',
        background_color: '#faf6f0',
        // Lets Chrome's Share menu send product pages to the app.
        share_target: {
          action: './',
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' },
        },
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
