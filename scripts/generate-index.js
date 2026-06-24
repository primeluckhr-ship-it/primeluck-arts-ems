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
    <link rel="icon" type="image/png" href="data:image/png;base64,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" />
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
