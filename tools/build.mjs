// Inlines the sources into one page: dist/orbit-to-eyepiece.html (artifact body, no <html> wrapper)
// and dist/index.html (a full document for opening locally).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const unexport = (s) => s.replace(/^export /gm, '');
const app = src('app.js');
const imports = app.match(/^import .*$/gm).join('\n');
const code = [imports, unexport(src('astro.js')), unexport(src('optics.js')), src('data.js'), app.replace(/^import .*$/gm, '')].join('\n');
const page = src('page.html').replace('/*APP*/', () => code);

const out = new URL('../dist/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('orbit-to-eyepiece.html', out), page);
writeFileSync(new URL('index.html', out), `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${page}\n</body>\n</html>\n`);
console.log(`built ${(page.length / 1024).toFixed(0)} KB`);
