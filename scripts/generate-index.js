#!/usr/bin/env node
import { readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const clientDir = 'dist/client';
const assetsDir = join(clientDir, 'assets');

// Find CSS and main JS
const files = readdirSync(assetsDir);
const css = files.find(f => f.endsWith('.css')) || '';
const js = files.find(f => f.startsWith('index-') && f.endsWith('.js')) || '';

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
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/assets/${js}"></script>
  </body>
</html>`;

writeFileSync(join(clientDir, 'index.html'), html);
writeFileSync(join(clientDir, '_redirects'), '/* /index.html 200\n');

console.log(`✅ index.html generated (CSS: ${css}, JS: ${js})`);
