// Turns the Vite single-file build into the artifact body: the publisher adds its own
// doctype, html, head and body wrapper, so keep only what sits inside head and body.
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const inner = (tag) => html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*)</${tag}>`))[1];
const head = inner('head').replace(/<meta charset[^>]*>\s*/, '').replace(/<meta name="viewport"[^>]*>\s*/, '');
writeFileSync(new URL('../dist/orbit-to-focus.html', import.meta.url), `${head.trim()}\n${inner('body').trim()}\n`);
console.log(`artifact body ${(html.length / 1024).toFixed(0)} KB`);
