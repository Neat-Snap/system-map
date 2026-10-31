// Validate a map.json and bundle it with the viewer into one self-contained HTML file.
// Usage: node build.mjs <map.json> <out.html>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const [input, output] = process.argv.slice(2);
if (!input || !output) { console.error('usage: node build.mjs <map.json> <out.html>'); process.exit(2); }

const map = JSON.parse(fs.readFileSync(input, 'utf8'));
const roots = map.roots || (map.root ? [map.root] : []);
const errors = [], warnings = [], ids = new Set(), nodes = [];
if (!roots.length) errors.push('map needs "roots" (or "root")');
const walk = (n, trail) => {
  const where = [...trail, n.id ?? '?'].join(' > ');
  if (!n.id) errors.push(`block without id at ${where}`);
  else if (ids.has(n.id)) errors.push(`duplicate id "${n.id}"`);
  ids.add(n.id); nodes.push(n);
  if (!n.label) errors.push(`block "${where}" has no label`);
  if ((n.children || []).length > 8) warnings.push(`"${n.id}" holds ${n.children.length} blocks side by side; the stack gets very wide`);
  (n.children || []).forEach((c) => walk(c, [...trail, n.id]));
};
roots.forEach((r) => walk(r, []));
for (const n of nodes) for (const id of n.on || []) if (!ids.has(id)) errors.push(`"${n.id}".on: unknown id "${id}"`);
for (const n of nodes) for (const id of Object.keys(n.uses || {})) {
  if (!ids.has(id)) errors.push(`"${n.id}".uses: unknown id "${id}"`);
  else if (!(n.on || []).includes(id) && !(n.children || []).length) warnings.push(`"${n.id}".uses "${id}" but "${id}" is not in its "on" list`);
}
const syms = map.symbols || {};
const missing = [...new Set(nodes.flatMap((n) => Object.values(n.uses || {}).flatMap((u) => (u.what || []).filter((w) => typeof w === 'string' && !syms[w]))))];
if (map.symbols && missing.length) warnings.push(`${missing.length} symbol(s) in "uses" have no "symbols" entry: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}`);
const withUses = nodes.filter((n) => n.on?.length && !n.uses).length;
if (withUses) warnings.push(`${withUses} block(s) have "on" but no "uses"; their connections show as bare lines`);
for (const e of map.edges || []) for (const end of ['from', 'to']) if (!ids.has(e[end])) errors.push(`edge ${e.from} → ${e.to}: unknown ${end} id "${e[end]}"`);
for (const n of nodes) if (n.source && !['code', 'config', 'docs', 'notes', 'inferred'].includes(n.source)) errors.push(`"${n.id}".source must be code, config, docs, notes or inferred`);
const unk = nodes.filter((n) => n.hostUnknown).map((n) => n.id);
if (unk.length) warnings.push(`host unknown for: ${unk.join(', ')}; ask the user and record it in infra.md next to map.json`);
if (nodes.length > 45) warnings.push(`${nodes.length} blocks; above ~40 the labels get small`);
warnings.forEach((w) => console.warn('warn:', w));
if (errors.length) { errors.forEach((e) => console.error('error:', e)); process.exit(1); }

const read = (f) => fs.readFileSync(path.join(dir, 'assets', f), 'utf8');
const json = JSON.stringify(map).replace(/</g, '\\u003c');
const title = String(map.title || roots[0].label).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const html = read('template.html')
  .replace('__TITLE__', () => title)
  .replace('/*MAP*/', () => `window.MAP = ${json};`)
  .replace('/*VIEWER*/', () => read('viewer.js'));
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
fs.writeFileSync(output, html);
console.log(`wrote ${output} (${nodes.length} blocks, ${(map.edges || []).length} extra connections)`);
