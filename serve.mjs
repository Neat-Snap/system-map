// Serves a folder of system maps and lets edit mode save changes next to a map.
// node serve.mjs <dir> [port=8765] [host=127.0.0.1]
// POST /__sysmap/changes {page, md, ops} writes <map folder>/changes.md and changes.json for the agent to apply.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(process.argv[2] || '.'), port = +(process.argv[3] || 8765), host = process.argv[4] || '127.0.0.1';
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.md': 'text/markdown; charset=utf-8', '.js': 'text/javascript' };
const inside = (p) => p === root || p.startsWith(root + path.sep);
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__sysmap') return res.end('ok');
  if (url.pathname === '/__sysmap/changes' && req.method === 'POST') {
    let body = ''; req.on('data', (c) => { body += c; if (body.length > 2e6) req.destroy(); });
    return req.on('end', () => {
      try {
        const { page, md, ops } = JSON.parse(body);
        const dir = path.dirname(path.resolve(root, '.' + decodeURIComponent(page)));
        if (!inside(dir) || !fs.existsSync(dir)) throw new Error('bad page');
        fs.writeFileSync(path.join(dir, 'changes.md'), md); fs.writeFileSync(path.join(dir, 'changes.json'), JSON.stringify(ops, null, 2));
        res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ file: path.join(dir, 'changes.md') }));
      } catch (e) { res.statusCode = 400; res.end(String(e.message)); }
    });
  }
  let p = path.resolve(root, '.' + decodeURIComponent(url.pathname));
  if (!inside(p)) { res.statusCode = 403; return res.end(); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'map.html');
  if (!fs.existsSync(p)) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('content-type', TYPES[path.extname(p)] || 'application/octet-stream'); res.setHeader('cache-control', 'no-store');
  fs.createReadStream(p).pipe(res);
}).listen(port, host, () => console.log(`system maps: http://${host}:${port}/`));
