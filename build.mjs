import { build } from 'esbuild';
import fs from 'node:fs/promises';

const css = await fs.readFile('src/style.css', 'utf8');
const consoleCss = await fs.readFile('src/console.css', 'utf8');
const tpl = await fs.readFile('src/index.template.html', 'utf8');
const consoleTpl = await fs.readFile('src/console.template.html', 'utf8');

async function bundle(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    target: ['chrome100'],
    minify: true,
    legalComments: 'none',
    write: false,
    logLevel: 'warning',
  });
  return result.outputFiles[0].text;
}

const [mainJs, consoleJs] = await Promise.all([
  bundle('src/main.js'),
  bundle('src/console.js'),
]);

const html = tpl
  .replace('/*__CSS__*/', () => css)
  .replace('/*__JS__*/', () => mainJs);

const consoleHtml = consoleTpl
  .replace('/*__CSS__*/', () => consoleCss)
  .replace('/*__JS__*/', () => consoleJs);

await fs.mkdir('dist', { recursive: true });
await fs.writeFile('dist/index.html', html, 'utf8');
await fs.writeFile('dist/console.html', consoleHtml, 'utf8');
console.log(`built dist/index.html (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
console.log(`built dist/console.html (${(Buffer.byteLength(consoleHtml) / 1024).toFixed(0)} KB)`);
