// Screenshot a built map, optionally hovering a block or from another camera angle (for checking the result).
// Usage: node shot.mjs <map.html> <out.png> [--hover <id>] [--focus <id>] [--view <rx>,<ry>] [--size 1600x900]
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const [input, output] = args;
const opt = (k) => { const i = args.indexOf(k); return i > 0 ? args[i + 1] : undefined; };
const [w, h] = (opt('--size') || '1600x900').split('x').map(Number);

let playwright;
for (const base of [process.cwd(), path.join(os.homedir(), 'explainers')]) {
  try { playwright = createRequire(path.join(base, 'package.json'))('playwright'); break; } catch {}
}
if (!playwright) { console.error('playwright not found (expected in ~/explainers/node_modules)'); process.exit(1); }

const browser = await playwright.chromium.launch();
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto('file://' + path.resolve(input));
if (opt('--view')) await page.evaluate(([x, y]) => window.__map.view(x, y), opt('--view').split(',').map(Number));
if (opt("--flow")) { const [fi, st] = opt("--flow").split(":").map(Number); await page.evaluate(([fi, st]) => window.__map.flow(fi, st), [fi, st]); await page.waitForTimeout(2600); }
if (opt("--focus")) { await page.evaluate((id) => window.__map.focus(id), opt("--focus")); await page.waitForTimeout(2000); }
if (opt('--hover')) await page.evaluate((id) => window.__map.hover(id), opt('--hover'));
await page.waitForTimeout(600);
await page.screenshot({ path: output });
await browser.close();
console.log('wrote', output);
