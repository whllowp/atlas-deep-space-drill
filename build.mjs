import { build } from 'esbuild';
import fs from 'node:fs/promises';

const css = await fs.readFile('src/style.css', 'utf8');
const tpl = await fs.readFile('src/index.template.html', 'utf8');

const result = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  target: ['chrome100'],
  minify: true,
  legalComments: 'none',
  write: false,
  logLevel: 'warning',
});

const js = result.outputFiles[0].text;
const html = tpl
  .replace('/*__CSS__*/', () => css)
  .replace('/*__JS__*/', () => js);

await fs.mkdir('dist', { recursive: true });
await fs.writeFile('dist/index.html', html, 'utf8');
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`built dist/index.html (${kb} KB)`);
