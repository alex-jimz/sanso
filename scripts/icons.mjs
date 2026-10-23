// Renders public/icon.svg into the PNG icons listed in the web app manifest.
// Run `npm run icons` after editing the SVG, then commit the PNGs.
// Uses resvg compiled to WebAssembly, so it needs no system image libraries.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { initWasm, Resvg } from '@resvg/resvg-wasm';

const outDir = 'public/icons';
// Must match the background colour in icon.svg.
const background = '#2f5d50';

await initWasm(await readFile(new URL(import.meta.resolve('@resvg/resvg-wasm/index_bg.wasm'))));
const svg = await readFile('public/icon.svg', 'utf8');

async function render(file, size, options = {}) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size }, ...options })
    .render()
    .asPng();
  await writeFile(`${outDir}/${file}`, png);
}

await mkdir(outDir, { recursive: true });
await render('icon-192.png', 192);
await render('icon-512.png', 512);
// Android crops maskable icons to the launcher's shape, so this one fills the
// rounded corners with the background colour. The artwork already sits inside
// the central safe zone.
await render('maskable-512.png', 512, { background });

console.log(`Icons written to ${outDir}/`);
