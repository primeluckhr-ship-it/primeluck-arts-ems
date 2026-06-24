#!/usr/bin/env node
import { readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const clientDir = 'dist/client';
const assetsDir = join(clientDir, 'assets');

const files = readdirSync(assetsDir);
const css = files.find(f => f.endsWith('.css')) || '';
const js = files.find(f => f.startsWith('index-') && f.endsWith('.js')) || '';

// Minimal $_TSR bootstrap required by TanStack Start client
// without this window.$_TSR is undefined and the app throws "Invariant failed"
const tsrBootstrap = `
  window.$_TSR = {
    buffer: [],
    initialized: false,
    h: function() {},
    t: new Map(),
    router: {
      matches: [],
      lastMatchId: null,
      manifest: { routes: {} },
      dehydratedData: {}
    }
  };
  // Process any buffered calls once router is ready
  window.$_TSR_READY = true;
`.trim();

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#2d1b69" />
    <title>PrimeLuck Arts Academy</title>
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="icon" href="/icon-192.svg" type="image/svg+xml" />
    ${css ? `<link rel="stylesheet" href="/assets/${css}" />` : ''}
    <script>${tsrBootstrap}</script>
  </head>
  <body>
    <script type="module" src="/assets/${js}"></script>
  </body>
</html>`;

writeFileSync(join(clientDir, 'index.html'), html);
writeFileSync(join(clientDir, '_redirects'), '/* /index.html 200\n');

console.log(`✅ index.html with $_TSR bootstrap (CSS: ${css}, JS: ${js})`);
