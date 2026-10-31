// 3D dependency stack: every part is a block resting on the parts it is built on (foundations at the bottom).
// Blocks are styled by layer: platforms (where things run), data stores, outside services, and the app's own parts.
// Hover a block for a small pop-up. Click it to open it into its own 3D scene: the rest of the stack sinks away,
// its neighbours line up above and below, whatever it holds (tables, queues…) stands on top of it, and every
// connection says how the parts talk and what crosses. Click a neighbour to walk there; Esc goes back.
// Drag rotates, shift / right drag moves, scroll zooms toward the cursor. Reads window.MAP.
(() => {
  const M = window.MAP;
  const GAP = 8, H = 64, MIN_W = 72;
  const HUES = [262, 212, 30, 340, 96, 196, 300, 56];

  // ---------- model ----------
  const roots = M.roots || [M.root];
  const byId = new Map(), all = [];
  const index = (n, parent, level) => {
    n.parent = parent; n.level = level; n.children = n.children || []; n.group = n.group || parent?.group;
    byId.set(n.id, n); all.push(n);
    n.children.forEach((c) => index(c, n, level + 1));
  };
  roots.forEach((r) => index(r, null, 0));
  const supportsOf = (n) => [n.parent, ...(n.on || []).map((id) => byId.get(id))].filter(Boolean);
  const restingOn = new Map(all.map((n) => [n, []]));
  for (const n of all) for (const s of supportsOf(n)) restingOn.get(s).push(n);
  const closure = (n, next) => {
    const seen = new Set(), stack = [...next(n)];
    while (stack.length) { const x = stack.pop(); if (!seen.has(x)) { seen.add(x); stack.push(...next(x)); } }
    seen.delete(n); return seen;
  };
  const holdsUp = new Map(all.map((n) => [n, closure(n, (x) => restingOn.get(x))]));
  const edges = (M.edges || []).filter((e) => byId.has(e.from) && byId.has(e.to)).map((e) => ({ ...e, a: byId.get(e.from), b: byId.get(e.to) }));

  const groups = [...new Set(all.map((n) => n.group).filter(Boolean))];
  const colors = (g) => {
    const i = groups.indexOf(g);
    if (i < 0) return { front: '#e6e8eb', top: '#f5f6f7', side: '#c9cdd2' };
    const h = HUES[i % HUES.length];
    return { front: `hsl(${h} 30% 88%)`, top: `hsl(${h} 36% 95%)`, side: `hsl(${h} 22% 76%)` };
  };

  // ---------- layout: blocks stack like the xkcd dependency comic ----------
  // Every block sits on its main support (the highest one), which makes a tree sized like a flame graph:
  // a block is at least as wide as everything resting on it. A block resting on several side-by-side
  // siblings spans exactly across them. Other supports show up as connection lines when a block is focused.
  // Nothing floats and nothing rests on a block it doesn't depend on.
  const textW = (s, px) => s.length * px * 0.58;
  const lvl = (n, seen = new Set()) => {
    if (n._lvl != null) return n._lvl;
    if (seen.has(n)) return 0;   // cycle guard
    seen.add(n);
    const s = supportsOf(n);
    return (n._lvl = s.length ? 1 + Math.max(...s.map((x) => lvl(x, seen))) : 0);
  };
  all.forEach((n) => lvl(n));
  const ownW = (n) => (n.tiny ? 26 : Math.max(MIN_W, textW(n.label, 10) + 22, 90 * Math.sqrt(n.weight || 1)));
  const right = (n) => n._l + n._w;
  const TOP = { _kids: [], _spanners: [] };   // virtual owner of the foundations
  for (const n of all) { n._kids = []; n._spanners = []; }
  const byLevel = [...all].sort((a, b) => a._lvl - b._lvl);
  // pass 1: every block hangs under its main support (highest level, first listed on ties)
  for (const n of byLevel) {
    const sup = supportsOf(n);
    n._tp = sup.length ? [...sup].sort((a, b) => b._lvl - a._lvl)[0] : TOP;
    n._tp._kids.push(n);
  }
  // pass 2: a block resting on several side-by-side siblings that nothing else stands on spans across them
  for (const n of byLevel) {
    const sup = supportsOf(n);
    if (sup.length < 2 || n.tiny) continue;
    const owner = sup[0]._tp;
    const ok = sup.every((x) => x._tp === owner && !x._spanOn && !x._spannedBy && x._kids.every((k) => k === n) && !x.tiny);
    if (!ok) continue;
    n._tp._kids.splice(n._tp._kids.indexOf(n), 1);
    n._tp = null; n._spanOn = sup; owner._spanners.push(n);
    sup.forEach((x) => (x._spannedBy = n));
  }
  // keep each spanner's supports next to each other
  const group = (owner) => {
    for (const sp of owner._spanners) {
      const first = Math.min(...sp._spanOn.map((x) => owner._kids.indexOf(x)));
      const moved = owner._kids.filter((k) => sp._spanOn.includes(k)), rest = owner._kids.filter((k) => !sp._spanOn.includes(k));
      rest.splice(Math.min(first, rest.length), 0, ...moved); owner._kids = rest;
    }
  };
  const kidsWidth = (n) => n._kids.reduce((s, k) => s + k._span, 0) + GAP * Math.max(0, n._kids.length - 1);
  const measure = (n) => {
    group(n);
    n._kids.forEach(measure); n._spanners.forEach(measure);
    for (const sp of n._spanners) {   // supports widen so the spanner never overhangs a neighbour
      const have = sp._spanOn.reduce((s, x) => s + x._span, 0) + GAP * (sp._spanOn.length - 1);
      if (sp._span > have) { const extra = (sp._span - have) / sp._spanOn.length; sp._spanOn.forEach((x) => { x._span += extra; x._w = x._span; }); }
    }
    n._span = Math.max(ownW(n), kidsWidth(n));
    n._w = n.tiny ? 26 : n._span;
    n._h = n.tiny ? 92 : H * (n.height || 1);
    n._d = Math.max(60, 128 - n._lvl * 12);
  };
  const place = (n, left, base) => {
    n._l = left + (n._span - n._w) / 2; n._y = base;
    let x = left + (n._span - kidsWidth(n)) / 2;
    for (const k of n._kids) { place(k, x, base + n._h); x += k._span + GAP; }
    n._spanners.forEach((sp) => {
      const lo = Math.min(...sp._spanOn.map((x) => x._l)), hi = Math.max(...sp._spanOn.map(right));
      const top = Math.max(...sp._spanOn.map((x) => x._y + x._h));
      sp._spanOn.forEach((x) => { x._h = top - x._y; });   // shorter supports stretch up to meet it
      sp._span = Math.max(sp._span, hi - lo); sp._w = sp._span;
      place(sp, (lo + hi) / 2 - sp._span / 2, top);
    });
  };
  group(TOP); TOP._kids.forEach(measure); TOP._spanners.forEach(measure);
  for (const sp of TOP._spanners) {
    const have = sp._spanOn.reduce((s, x) => s + x._span, 0) + GAP * (sp._spanOn.length - 1);
    if (sp._span > have) { const extra = (sp._span - have) / sp._spanOn.length; sp._spanOn.forEach((x) => { x._span += extra; x._w = x._span; }); }
  }
  // foundations nothing rests on (lone services, stores) stand in a low row in front of the pile instead of widening it
  const loose = TOP._kids.filter((r) => !r._kids.length && !r._spanners.length && !r._spannedBy);
  const main = TOP._kids.filter((r) => !loose.includes(r));
  let x0 = 0;
  for (const r of (main.length ? main : loose)) { place(r, x0, 0); x0 += r._span + GAP * 2; }
  if (main.length && loose.length) {
    const rowW = loose.reduce((s, r) => s + r._span, 0) + GAP * 2 * (loose.length - 1);
    let lx = (x0 - GAP * 2) / 2 - rowW / 2;
    const backZ = Math.max(...main.map((r) => r._d)) / 2 + 70 + Math.max(...loose.map((r) => r._d)) / 2;
    for (const r of loose) { place(r, lx, 0); r._z = backZ; lx += r._span + GAP * 2; }
  }
  TOP._spanners.forEach((sp) => {
    const lo = Math.min(...sp._spanOn.map((x) => x._l)), hi = Math.max(...sp._spanOn.map(right));
    const top = Math.max(...sp._spanOn.map((x) => x._y + x._h));
    sp._spanOn.forEach((x) => { x._h = top - x._y; });
    sp._span = Math.max(sp._span, hi - lo); sp._w = sp._span;
    place(sp, (lo + hi) / 2 - sp._span / 2, top);
  });
  const minX = Math.min(...all.map((n) => n._l)), maxX = Math.max(...all.map(right));
  for (const n of all) n._z = n._z || 0;
  const W = maxX - minX, HT = Math.max(...all.map((n) => n._y + n._h)), cx = (minX + maxX) / 2, cy = HT / 2;
  const touches = (a, b) => a._l < right(b) - 1 && right(a) > b._l + 1;   // physically under/over each other

  // ---------- 3D boxes ----------
  const world = document.getElementById('world'), stage = document.getElementById('stage');
  const div = (cls, parent, style = {}) => { const d = document.createElement('div'); d.className = cls; Object.assign(d.style, style); parent?.appendChild(d); return d; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const centerOf = (n) => [n._l + n._w / 2 - cx, -(n._y + n._h / 2 - cy)];   // block center in world (CSS) coords
  const FACES = { front: 'front', back: 'side back', right: 'side right', left: 'side left', top: 'top', bottom: 'side bottom' };
  // layers: platforms (where things run), data stores, outside services, and the app's own parts (coloured by group)
  const LAYER = {
    platform: { front: '#4b5563', top: '#636d7c', side: '#3b4350' },
    data: { front: 'hsl(152 32% 80%)', top: 'hsl(152 36% 91%)', side: 'hsl(152 24% 67%)' },
    external: { front: '#f1f1ee', top: '#fafaf8', side: '#dcdcd7' },
  };
  const LAYER_NAME = { platform: 'platform', data: 'data store', external: 'outside service' };
  const blockColors = (n) => LAYER[n.layer] || colors(n.group);
  function makeBox(cls, parent, html, labelOn) {
    const b = div(cls, parent), f = {};
    for (const [k, c] of Object.entries(FACES)) f[k] = div('face ' + c, b);
    for (const k of labelOn) f[k].innerHTML = html;
    b._faces = f; return b;
  }
  function sizeBox(b, w, h, d) {
    const set = (el, fw, fh, t) => Object.assign(el.style, { left: `${-fw / 2}px`, top: `${-fh / 2}px`, width: `${fw}px`, height: `${fh}px`, transform: t });
    const f = b._faces;
    set(f.front, w, h, `translateZ(${d / 2}px)`);
    set(f.back, w, h, `rotateY(180deg) translateZ(${d / 2}px)`);
    set(f.right, d, h, `rotateY(90deg) translateZ(${w / 2}px)`);
    set(f.left, d, h, `rotateY(-90deg) translateZ(${w / 2}px)`);
    set(f.top, w, d, `rotateX(90deg) translateZ(${h / 2}px)`);
    set(f.bottom, w, d, `rotateX(-90deg) translateZ(${h / 2}px)`);
  }
  const floor = div('floor', world, { width: `${W + 260}px`, height: '260px', left: `${-(W + 260) / 2}px`, top: '-130px',
    transform: `translateY(${cy}px) rotateX(90deg)` });
  const sceneFloor = div('floor scenefloor hidden', world);
  for (const n of all) {
    const c = blockColors(n), [x, y] = centerOf(n);
    const b = makeBox('box' + (n.tiny ? ' vertical' : '') + (n.layer ? ` layer-${n.layer}` : ''), world,
      `<span class="name">${esc(n.label)}</span>${n.kind ? `<span class="kd">${esc(n.kind)}</span>` : ''}${n.description ? `<span class="ds">${esc(n.description)}</span>` : ''}`, ['front', 'back']);
    b.style.setProperty('--front', c.front); b.style.setProperty('--top', c.top); b.style.setProperty('--side', c.side);
    b.dataset.id = n.id; n._el = b; n._pos = [x, y, n._z];
  }
  const stackPose = (n) => {
    n._el.classList.toggle('vertical', !!n.tiny);
    sizeBox(n._el, n._w, n._h, n._d);
    n._el.style.transform = `translate3d(${n._pos[0]}px, ${n._pos[1]}px, ${n._pos[2]}px)`;
  };
  all.forEach(stackPose);
  // a tiny legend for the layers that appear
  const legend = document.getElementById('legend');
  const usedLayers = Object.keys(LAYER).filter((k) => all.some((n) => n.layer === k));
  if (usedLayers.length) legend.innerHTML = ['app', ...usedLayers].map((k) => {
    const c = k === 'app' ? colors(groups[0]) : LAYER[k];
    return `<span><i style="background:${c.front};box-shadow:2px -2px 0 ${c.side}"></i>${k === 'app' ? 'app parts' : LAYER_NAME[k]}</span>`;
  }).join('');

  // ---------- camera: rotate (drag), move (shift / right drag), zoom toward the cursor (wheel) ----------
  const HOME = { rx: -18, ry: -22 };
  const cam = { rx: HOME.rx, ry: HOME.ry, s: 1, tx: 0, ty: 0, px: 0, py: 0 };
  let zoom = 1, anim = null, lastInput = performance.now();
  const fitScale = (w, h, fw = 0.78, fh = 0.62) => Math.min(innerWidth * fw / (w + 60), innerHeight * fh / (h + 60), 3.2);
  const apply = () => { world.style.transform = `translate(${cam.px}px, ${cam.py}px) scale(${cam.s * zoom}) rotateX(${cam.rx}deg) rotateY(${cam.ry}deg) translate3d(${cam.tx}px, ${cam.ty}px, 0)`; };
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  function flyTo(target, ms = 750) {
    const from = { ...cam }, t0 = performance.now();
    cancelAnimationFrame(anim?.raf);
    anim = {};
    const step = (t) => {
      const k = ease(Math.min(1, (t - t0) / ms));
      for (const key of Object.keys(target)) cam[key] = from[key] + (target[key] - from[key]) * k;
      apply();
      if (k < 1) anim.raf = requestAnimationFrame(step); else anim = null;
    };
    anim.raf = requestAnimationFrame(step);
  }
  const overview = () => ({ s: fitScale(W, HT), tx: 0, ty: 0, px: 0, py: 0 });

  // ---------- scene: a block opened into its own space ----------
  // The rest of the stack sinks away. The block moves to the middle; what it rests on lines up below, what rests
  // on it above (a curved row, or a ring when there are many). If the block holds things (tables, queues, buckets),
  // they stand on its top and each connection lands on the thing it touches. Connections are built from small
  // blocks for what crosses them, badged with how (read / write / HTTP / job / webhook …), with arrows for the
  // direction data moves. Neighbours that are connected to each other get a thin grey thread too.
  const below = (n) => supportsOf(n);
  const above = (n) => restingOn.get(n);
  const talks = (n) => edges.filter((e) => e.a === n || e.b === n);
  const COL = { prov: ['#d99a17', '#fbe3b0'], user: ['#3b7cff', '#d4e2ff'], talk: ['#8b6cf0', '#e3dbfb'] };
  const GLYPH = { fn: 'ƒ', type: 'T', schema: '{}', const: '=', class: 'C', table: '▤', endpoint: '⇄', event: '⚡', env: '$' };
  const HOW = { read: 'read', write: 'write', readwrite: 'r/w', http: 'HTTP', webhook: 'hook', queue: 'queue', job: 'job', vector: 'vec',
    llm: 'LLM', auth: 'auth', notify: 'msg', payments: 'pay', git: 'git', runs: 'runs', deploy: 'ship', storage: 'S3', call: 'call', types: 'T', event: 'event' };
  const VERBW = { read: 'reads', write: 'writes', readwrite: 'reads + writes', vector: 'indexes + searches', queue: 'enqueues', job: 'runs' };
  // which way data moves, relative to the thread drawn from the provider (or edge source) to the user (or edge target)
  const FLOW = { read: 'fwd', job: 'fwd', webhook: 'fwd', deploy: 'fwd', runs: 'none', write: 'back', queue: 'back', notify: 'back',
    readwrite: 'both', http: 'both', llm: 'both', vector: 'both', git: 'both', auth: 'both', payments: 'both', storage: 'both' };
  const SYM = M.symbols || {};
  const ROW_Y = 300;
  const lerp3 = (p, q, t) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: p.z + (q.z - p.z) * t });
  let current = null, history = [], links = [], side = [], chips = [], tiles = [], marks = [];
  let hotLink = null, hotNode = null, userHot = false, narrIdx = -1, lastNarr = 0;
  const nbSize = (m) => ({ w: Math.max(130, Math.min(230, textW(m.label, 12) + 50)), h: 62, d: 90 });
  const caption = document.getElementById('caption');
  const containedBy = new Map();   // "postgres:reviews" -> { label, sub }
  for (const n of all) for (const c of n.contains || []) containedBy.set(`${n.id}:${c.id}`, c);

  // what a small block shows: badge + label, and a second line (tables, signature, fields)
  function describe(t, step, i, how, owner) {
    if (step) return { name: t, glyph: String(i + 1), sub: '', does: '' };
    if (typeof t === 'object') return { name: t.name || t.label, glyph: HOW[how] || '·', sub: t.sub || '', does: t.does || '' };
    const c = owner && containedBy.get(`${owner.id}:${t}`);
    if (c) return { name: c.label, glyph: HOW[how] || '·', sub: c.sub || '', does: '', tile: t };
    const s = SYM[t];
    if (s) return { name: t, glyph: GLYPH[s.kind] || '·', sub: s.sig || (s.fields ? s.fields.join(' · ') : ''), does: s.does || '', kind: s.kind };
    return { name: t, glyph: HOW[how] || '', sub: '', does: '' };
  }
  function itemsOf(info, max, owner) {
    if (info.flow?.length) return info.flow.map((t, i) => ({ ...describe(t, true, i), step: true }));
    const what = info.what || [];
    const shown = what.slice(0, max).map((t) => describe(t, false, 0, info.how, owner));
    if (what.length > max) shown.push({ name: `+${what.length - max} more`, glyph: '', sub: '', more: true, from: max });
    return shown;
  }
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  function chipDims(item) {
    const name = clip(item.name, item.compact ? 26 : 34), sub = clip(item.sub || '', 46);
    const badge = item.glyph ? textW(item.glyph, 9) + 22 : 0;
    return { name, sub, w: Math.round(Math.max(textW(name, 10.5) * 1.1 + badge + 18, sub ? textW(sub, 9) * 1.1 + 20 : 0)), h: sub ? 40 : 28 };
  }
  function blockOf(cls, item, p, col, delay) {
    const { name, sub, w, h } = chipDims(item), d = 26;
    const c = div(cls + (item.step ? ' step' : '') + (item.more ? ' more' : ''), world, { transform: `translate3d(${p.x}px, ${p.y}px, ${p.z}px)` });
    c.style.setProperty('--c', col[0]); c.style.setProperty('--cl', col[1]);
    const bb = div('bb', c), pop = div('pop', bb, { animationDelay: `${delay}ms` });
    pop._faces = {};
    for (const [k, fc] of Object.entries(FACES)) pop._faces[k] = div('face ' + fc, pop);
    const face = `<span class="cn">${item.glyph ? `<i>${esc(item.glyph)}</i>` : ''}${esc(name)}</span>${sub ? `<span class="cs">${esc(sub)}</span>` : ''}`;
    pop._faces.front.innerHTML = pop._faces.back.innerHTML = face;
    sizeBox(pop, w, h, d);
    if (item.does) div('ann', pop, { top: `${h / 2 + 7}px`, transform: `translateX(-50%) translateZ(${d / 2}px)` }).textContent = item.does;
    c._bb = bb; c._item = item; c._w = w; c._h = h;
    return c;
  }
  const makeChip = (item, link, p, delay) => { const c = blockOf('chip', item, p, link.col, delay); c._link = link; chips.push(c); return c; };
  // how far a box reaches along a direction (so small blocks never overlap the blocks at either end)
  const reach = (u, w, h, d) => Math.abs(u.x) * w / 2 + Math.abs(u.y) * h / 2 + Math.abs(u.z) * d / 2;
  function chainNeed(items, u, a, b) {
    return items.reduce((s, it) => { const c = chipDims(it); return s + 2 * reach(u, c.w, c.h + 18, 26) + 14; }, 0)
      + reach(u, a.w, a.h, a.d) + reach(u, b.w, b.h, b.d) + 32;
  }
  function buildChips(L, items, delay0) {
    for (const c of L.chips) { c.classList.add('out'); setTimeout(() => c.remove(), 350); }
    chips = chips.filter((c) => c._link !== L);
    L.chips = items.map((it, i) => makeChip(it, L, L.a, delay0 + i * 80));
    const len = Math.hypot(L.b.x - L.a.x, L.b.y - L.a.y, L.b.z - L.a.z) || 1;
    const u = { x: (L.b.x - L.a.x) / len, y: (L.b.y - L.a.y) / len, z: (L.b.z - L.a.z) / len };
    const ext = L.chips.map((c) => reach(u, c._w, c._h + 18, 26));   // +18: room for the note under a block
    const s0 = reach(u, L.a.w, L.a.h, L.a.d) + 16, s1 = len - reach(u, L.b.w, L.b.h, L.b.d) - 16;
    const need = ext.reduce((s, e) => s + 2 * e, 0) + 14 * (ext.length - 1);
    const gap = Math.max(4, Math.min(40, (s1 - s0 - need) / Math.max(1, ext.length + 1)));
    let s = s0 + Math.max(gap, (s1 - s0 - need - gap * (ext.length - 1)) / 2);
    if (L.busy && items === L.compact) s = L.from === current ? s1 - need : s0;   // collapsed: right next to the neighbour
    L.chips.forEach((c, i) => {
      s += ext[i];
      c._t = s / len;
      const p = lerp3(L.a, L.b, c._t);
      c.style.transform = `translate3d(${p.x}px, ${p.y}px, ${p.z}px)`;
      s += ext[i] + gap;
    });
    L.shown = items;
    L.chips.forEach((c) => c.classList.toggle('hot', hotLink === L));
  }
  function setHot(L) {
    if (L === hotLink) return;
    const prev = hotLink; hotLink = L;
    if (prev) prev.chips.forEach((c) => c.classList.remove('hot'));
    if (L) L.chips.forEach((c) => c.classList.add('hot'));
    narrate();
  }
  function narrate() {
    if (!current) { caption.classList.remove('show'); return; }
    const L = hotLink;
    if (hotNode && !L) {   // hovering a neighbour: who else it is connected to in this scene
      const others = side.filter((s) => s.a === hotNode || s.b === hotNode).map((s) => (s.a === hotNode ? s.b : s.a));
      caption.innerHTML = `<b>${esc(hotNode.label)}</b>${others.length ? ` <span>also connects to</span> ${others.map((o) => `<b>${esc(o.label)}</b>`).join('<span>, </span>')}` : ` <span>${esc(hotNode.description || '')}</span>`}`;
    } else if (!L) {
      const n = current;
      caption.innerHTML = `<b>${esc(n.label)}</b>${n.description ? ` <span>${esc(n.description)}</span>` : ''}`;
    } else {
      const how = L.info.how, v = VERBW[how];
      const tile = L.tile ? containedBy.get(`${current.id}:${L.tile}`) : null;
      const left = L.flowDir === 'back' ? L.to : L.from, right = L.flowDir === 'back' ? L.from : L.to;
      const mid = tile ? `<span>${esc(v || HOW[how] || 'uses')}</span> <code>${esc(tile.label)}</code> <span>in</span>`
        : `<span>${L.flowDir === 'both' ? '↔' : L.flowDir === 'none' ? 'runs on' : '→'}</span>`;
      caption.innerHTML = tile ? `<b>${esc(L.to.label)}</b> ${mid} <b>${esc(L.from.label)}</b>${L.info.note ? `<em>${esc(L.info.note)}</em>` : ''}`
        : `<b>${esc(left.label)}</b> ${mid} <b>${esc(right.label)}</b>${HOW[how] ? ` <span class="pill">${esc(HOW[how])}</span>` : ''}${L.info.note ? `<em>${esc(L.info.note)}</em>` : ''}`;
    }
    caption.classList.add('show');
  }

  function clearScene() {
    for (const c of [...chips, ...tiles]) { c.classList.add('out'); setTimeout(() => c.remove(), 350); }
    marks.forEach((m) => m.remove());
    chips = []; tiles = []; marks = []; links = []; side = []; hotLink = null; hotNode = null;
  }
  // up to 6 neighbours: a gently curved row; more: a ring around the centre block (half a step off the front)
  function row(list, pose, y, dir, gap = 60) {
    if (!list.length) return 0;
    if (list.length > 6) {
      const sizes = list.map(nbSize);
      const R = Math.max(480, (1.3 * sizes.reduce((s, z) => s + z.w + 70, 0)) / (2 * Math.PI));
      list.forEach((m, i) => { const a = Math.PI / list.length + (i * 2 * Math.PI) / list.length + (dir < 0 ? 0.3 : 0);
        pose.set(m, { x: R * Math.sin(-a + Math.PI), y, z: R * Math.cos(-a + Math.PI), ...sizes[i] }); });
      return R;
    }
    const sizes = list.map(nbSize);
    const total = sizes.reduce((s, z) => s + z.w, 0) + gap * (list.length - 1);
    let x = -total / 2;
    list.forEach((m, i) => {
      const cxm = x + sizes[i].w / 2; x += sizes[i].w + gap;
      pose.set(m, { x: cxm, y, z: -(cxm * cxm) / 2400, ...sizes[i] });
    });
    return total / 2;
  }

  function setScene(n, push = true) {
    if (!n) return toStack();
    endFlow();
    if (push && current && current !== n) history.push(current);
    current = n;
    document.body.classList.add('scene');
    hideTip();
    const byX = (a, b) => a._l + a._w / 2 - (b._l + b._w / 2);   // keep the stack's left-to-right order
    const provs = [...below(n)].sort(byX), users = above(n).filter((m) => !provs.includes(m)).sort(byX);
    const talkers = talks(n).map((e) => (e.a === n ? e.b : e.a)).filter((m) => m !== n && !provs.includes(m) && !users.includes(m));
    const busy = provs.length + users.length + talkers.length > 5;
    const pose = new Map();

    // things that live in the centre block stand on its top, in up to two rows
    const own = n.contains || [];
    const tileItems = own.map((c) => ({ name: c.label, sub: c.sub || '', glyph: '', tileId: c.id }));
    const tileDims = tileItems.map(chipDims);
    const perRow = own.length > 4 ? Math.ceil(own.length / 2) : own.length;
    const rowsW = [0, 1].map((r) => tileDims.slice(r * perRow, r * perRow + perRow).reduce((s, d) => s + d.w + 14, -14));
    const side2 = (k) => (k > 1 && k <= 6 ? k : 0);
    const fw = Math.max(240, Math.min(340, textW(n.label, 15) + 90), Math.min(600, 120 * Math.max(side2(provs.length), side2(users.length))), Math.max(...rowsW) + 50);
    const fd = own.length ? (own.length > perRow ? 200 : 120) : 150, fh = 104;
    pose.set(n, { x: 0, y: 0, z: 0, w: fw, h: fh, d: fd });
    const tilePos = new Map();
    tileItems.forEach((it, i) => {
      const r = Math.floor(i / perRow), inRow = tileDims.slice(r * perRow, r * perRow + perRow), j = i - r * perRow;
      const x0 = -rowsW[r] / 2 + inRow.slice(0, j).reduce((s, d) => s + d.w + 14, 0) + inRow[j].w / 2;
      const two = own.length > perRow, z = two ? (r === 0 ? -fd / 2 + 28 : fd / 2 - 28) : 0;
      tilePos.set(it.tileId, { x: x0 + (two && r === 0 ? 30 : 0), y: -fh / 2 - tileDims[i].h / 2 - (two && r === 0 ? 26 : 0), z, w: tileDims[i].w, h: tileDims[i].h, d: 26 });
    });
    // each chain lands on its own spot of the centre block (or on the thing inside it that it touches)
    const anchor = (m, isProv) => {
      const list = isProv ? provs : users, k = list.length, i = list.indexOf(m);
      const x = side2(k) ? (-0.5 + (i + 0.5) / k) * fw * 0.84 : 0;
      return { x, y: isProv ? fh / 2 : -fh / 2, z: 0, w: 30, h: 0, d: 0 };
    };
    const infoOf = (from, to) => (to.uses || {})[from.id] || {};
    const shownItems = (info, owner) => (busy ? itemsOf(info, 1, owner).slice(0, 1) : itemsOf(info, 3, owner));
    const fits = (list, isProv) => list.every((m) => {
      const a = isProv ? pose.get(m) : anchor(m, false), b = isProv ? anchor(m, true) : pose.get(m);
      const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len, z: (b.z - a.z) / len };
      return chainNeed(shownItems(isProv ? infoOf(m, n) : infoOf(n, m), isProv ? m : n), u, a, b) <= len;
    });
    const chainW = (list, isProv) => Math.max(0, ...list.map((m) => Math.max(0, ...shownItems(isProv ? infoOf(m, n) : infoOf(n, m), isProv ? m : n).map((it) => chipDims(it).w))));
    const gp = Math.max(60, chainW(provs, true) - 30), gu = Math.max(60, chainW(users, false) - 30);
    const lift = own.length ? 60 : 0;   // room for the things standing on top
    let yp = ROW_Y, yu = ROW_Y + lift, hp = row(provs, pose, yp, 1, gp), hu = row(users, pose, -yu, -1, gu);
    for (let k = 0; k < 10 && !fits(provs, true); k++) hp = row(provs, pose, (yp += 70), 1, gp);
    for (let k = 0; k < 10 && !fits(users, false); k++) hu = row(users, pose, -(yu += 70), -1, gu);
    // side partners sit far enough out for their whole chain
    const talkNeed = talkers.map((m) => { const e = talks(n).find((x) => x.a === m || x.b === m);
      return fw / 2 + nbSize(m).w / 2 + 70 + itemsOf({ how: e.how, what: e.what || [] }, 3).reduce((s, it) => s + chipDims(it).w + 24, 0); });
    const ht = Math.max(Math.max(hp, hu, fw / 2) + 260, ...talkNeed);
    talkers.forEach((m, i) => pose.set(m, { x: (i % 2 ? -1 : 1) * ht, y: 0, z: -Math.floor(i / 2) * 160, ...nbSize(m) }));

    // shared blocks: off-scene parts that two or more neighbours connect to, shown faintly further out
    const near = new Set(pose.keys()); near.delete(n);
    const linked = (a, b) => supportsOf(a).includes(b) || supportsOf(b).includes(a) || edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
    const ghosts = all.filter((m) => !pose.has(m)).map((m) => ({ m, k: [...near].filter((x) => linked(m, x)).length }))
      .filter((g) => g.k >= 2).sort((a, b) => b.k - a.k).slice(0, 4).map((g) => g.m);
    const gy = -(users.length ? yu : 60) - 230;
    const gsz = ghosts.map((m) => ({ ...nbSize(m), h: 48, d: 70 }));
    let gx = -(gsz.reduce((s2, z) => s2 + z.w + 80, -80)) / 2;
    ghosts.forEach((m, i) => { pose.set(m, { x: gx + gsz[i].w / 2, y: gy, z: -260, ...gsz[i], ghost: true }); gx += gsz[i].w + 80; });

    for (const m of all) {
      const el = m._el, p = pose.get(m);
      el.classList.remove('focus', 'prov', 'user', 'talk', 'on', 'gone', 'vertical', 'ghost');
      if (!p) {   // everything else sinks away
        el.classList.add('gone'); if (m.tiny) el.classList.add('vertical');
        sizeBox(el, m._w, m._h, m._d);
        el.style.transform = `translate3d(${m._pos[0]}px, ${m._pos[1] + 900}px, -400px)`;
        continue;
      }
      el.classList.add('on', m === n ? 'focus' : provs.includes(m) ? 'prov' : users.includes(m) ? 'user' : p.ghost ? 'ghost' : 'talk');
      sizeBox(el, p.w, p.h, p.d);
      el.style.transform = `translate3d(${p.x}px, ${p.y}px, ${p.z}px)`;
    }
    floor.classList.add('hidden');
    const fr = Math.max(hp, hu, 300) * 2 + 400;
    Object.assign(sceneFloor.style, { width: `${fr}px`, height: `${fr * 0.6}px`, left: `${-fr / 2}px`, top: `${-fr * 0.3}px`,
      transform: `translateY(${(provs.length ? yp + 31 : 52) + 2}px) rotateX(90deg)` });
    sceneFloor.classList.remove('hidden');

    clearScene();
    const focusCol = ['#2a63d6', '#ffffff'];
    tileItems.forEach((it, i) => {
      const t = blockOf('chip tile', it, tilePos.get(it.tileId), focusCol, 300 + i * 60);
      t.dataset.tile = it.tileId; tiles.push(t);
    });
    const endEl = (p, m) => (p === pose.get(m) ? m._el : (() => { const e = div('mk', world, { transform: `translate3d(${p.x}px, ${p.y}px, ${p.z}px)` }); marks.push(e); return e; })());
    const link = (from, to, info, col, a, b, extra = {}) => {
      const how = info.how;
      let flowDir = FLOW[how] || (col === COL.talk ? 'fwd' : 'both');
      const L = { from, to, info, col, a, b, busy, flowDir, chips: [], ...extra };
      L.ends = [endEl(a, from), endEl(b, to)];
      L.items = extra.items || itemsOf(info, busy ? 4 : 6, from);
      L.compact = extra.items || (busy ? L.items.slice(0, 1).map((it) => ({ ...it, sub: '', does: '', compact: true, from: 0,
        name: it.name + ((info.what || info.flow || []).length > 1 ? `  +${(info.what || info.flow).length - 1}` : '') })) : L.items.slice(0, 3));
      buildChips(L, L.compact, 420 + links.length * 60);
      links.push(L);
    };
    provs.forEach((m) => link(m, n, infoOf(m, n), COL.prov, pose.get(m), anchor(m, true)));
    users.forEach((m) => {
      const info = infoOf(n, m), what = info.what || [];
      const hits = what.filter((w) => tilePos.has(w)), rest = what.filter((w) => !tilePos.has(w));
      // one thread per thing it touches inside the centre block
      hits.forEach((id, i) => link(n, m, { ...info, what: [], note: i === 0 ? info.note : '' }, COL.user, tilePos.get(id), pose.get(m),
        { tile: id, items: busy ? [] : [{ name: VERBW[info.how] || HOW[info.how] || 'uses', glyph: HOW[info.how] || '', sub: '' }] }));
      if (rest.length || !hits.length) link(n, m, { ...info, what: rest }, COL.user, anchor(m, false), pose.get(m));
    });
    talks(n).forEach((e) => { if (pose.has(e.a) && pose.has(e.b)) link(e.a, e.b, { how: e.how, what: e.what || (e.label ? [e.label] : []), flow: e.flow, note: e.note }, COL.talk, pose.get(e.a), pose.get(e.b)); });
    // neighbours connected to each other
    const onScene = new Set(pose.keys()); onScene.delete(n);
    for (const x of onScene) for (const y of supportsOf(x)) if (onScene.has(y)) side.push({ a: y, b: x, info: (x.uses || {})[y.id] || {}, ghost: ghosts.includes(x) || ghosts.includes(y) });
    for (const e of edges) if (onScene.has(e.a) && onScene.has(e.b) && e.a !== n && e.b !== n) side.push({ a: e.a, b: e.b, info: e, ghost: ghosts.includes(e.a) || ghosts.includes(e.b) });
    narrIdx = -1; lastNarr = performance.now() + 900;
    narrate();

    title.innerHTML = [M.title || '', ...history.map((h) => h.label), n.label].filter(Boolean).map(esc).join(' <i>›</i> ');
    const half = Math.max(hp, hu, fw / 2, talkers.length ? ht + 120 : 0);
    const top = ghosts.length ? gy - 40 : users.length ? -yu - 30 : -70 - lift, bot = provs.length ? yp + 30 : 70;
    zoom = 1;
    flyTo({ s: fitScale(2 * half + 200, bot - top + 160, 0.92, 0.84), tx: 0, ty: -(top + bot) / 2, rx: -16, ry: -10, px: 0, py: 0 }, 900);
  }

  function toStack() {
    endFlow();
    current = null; history = [];
    document.body.classList.remove('scene');
    clearScene(); narrate();
    for (const m of all) { m._el.classList.remove('focus', 'prov', 'user', 'talk', 'on', 'gone', 'ghost'); stackPose(m); }
    floor.classList.remove('hidden'); sceneFloor.classList.add('hidden');
    title.textContent = M.title || '';
    zoom = 1;
    flyTo({ ...overview(), rx: HOME.rx, ry: HOME.ry }, 900);
  }
  const back = () => { if (!current) return; const prev = history.pop(); prev ? setScene(prev, false) : toStack(); };

  // ---------- every frame: narrate, billboard the small blocks, draw the threads ----------
  const svg = document.getElementById('lines');
  const NSVG = 'http://www.w3.org/2000/svg';
  const mk = (tag, attrs, parent) => { const el = document.createElementNS(NSVG, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); parent.appendChild(el); return el; };
  const defs = mk('defs', {}, svg), layerG = mk('g', {}, svg);
  const arrowId = (color) => {
    const id = 'a' + color.replace(/[^a-z0-9]/gi, '');
    if (!svg.querySelector('#' + id)) {
      const m = mk('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 9, markerHeight: 9, markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse' }, defs);
      mk('path', { d: 'M0,1 L9,5 L0,9 z', fill: color }, m);
    }
    return `url(#${id})`;
  };
  const NARRATE_MS = 3600;
  const ease1 = (v, target) => v + (target - v) * 0.16;   // per-frame easing so highlights fade instead of blinking
  const ctr = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  function frame(t) {
    // walk through the connections one at a time unless the pointer is on something
    if (tour && current && !userHot && links.length && t - lastNarr > NARRATE_MS) {
      lastNarr = t;
      narrIdx = (narrIdx + 1) % (links.length + 1);
      setHot(narrIdx < links.length ? links[narrIdx] : null);
    }
    // a slow sway while idle keeps the 3D readable; any input stops it
    if ((current || flow) && !anim && !drag && t - lastInput > 4000) { cam.ry = -10 + 12 * Math.sin((t - lastInput - 4000) / 5200); apply(); }
    for (const c of chips) if (!c.classList.contains('tile')) c._bb.style.transform = `rotateY(${-cam.ry}deg)`;
    layerG.innerHTML = '';
    if (current) {
      const [fx, fy] = ctr(current._el);
      // neighbours connected to each other: thin grey curves bowing away from the centre
      for (const s of side) {
        const [x1, y1] = ctr(s.a._el), [x2, y2] = ctr(s.b._el);
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = mx - fx, dy = my - fy, dl = Math.hypot(dx, dy) || 1;
        const hot = hotNode && (s.a === hotNode || s.b === hotNode);
        s.op = ease1(s.op ?? 0.7, hotLink ? 0.2 : hot ? 0.95 : 0.6);
        mk('path', { d: `M${x1},${y1} Q${mx + (dx / dl) * 70},${my + (dy / dl) * 70} ${x2},${y2}`, fill: 'none', stroke: hot ? '#5b6167' : '#b4b8bd',
          'stroke-width': hot ? 1.8 : 1.1, opacity: s.op }, layerG);
      }
      for (const L of links) {
        const pts = [L.ends[0], ...L.chips, L.ends[1]].map(ctr).map((p) => p.join(','));
        const hot = hotLink === L, faded = (hotLink && !hot) || (hotNode && L.from !== hotNode && L.to !== hotNode);
        const color = L.col[0], arrow = arrowId(color), f = L.flowDir;
        L.op = ease1(L.op ?? 0.75, faded ? 0.14 : links.length > 8 && !hot ? 0.4 : 0.8);
        L.sw = ease1(L.sw ?? 1.4, hot ? 2.6 : 1.4);
        mk('polyline', { points: pts.join(' '), fill: 'none', stroke: color, 'stroke-width': L.sw, opacity: L.op, 'stroke-linejoin': 'round',
          ...(f === 'fwd' || f === 'both' ? { 'marker-end': arrow } : {}), ...(f === 'back' || f === 'both' ? { 'marker-start': arrow } : {}) }, layerG);
      }
      for (const L of links) for (const c of L.chips) c.classList.toggle('faded', !!hotLink && hotLink !== L);
      for (const tl of tiles) tl.classList.toggle('hot', !!hotLink && hotLink.tile === tl.dataset.tile);
    }
    drawFlow();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- flows: how the system works, one step at a time ----------
  // A flow is a named story ("a pull request gets reviewed"). Only the blocks it touches stay: the app's own
  // parts in a front row, platforms / stores / outside services in a raised back row, both in order of first
  // appearance. A small block carrying what moves travels from part to part; finished steps leave a numbered
  // grey thread, the current one is blue. The caption says what happens and why.
  const FLOWS = (M.flows || []).map((f) => ({ ...f, steps: f.steps.filter((s) => byId.has(s.from) && byId.has(s.to)) })).filter((f) => f.steps.length);
  const flowSvg = document.getElementById('flowlines'), flowG = mk('g', {}, flowSvg), flowDefs = mk('defs', {}, flowSvg);
  const flowMenu = document.getElementById('flows');
  let flow = null;
  const flowArrow = (() => { const m = mk('marker', { id: 'fa', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 10, markerHeight: 10, markerUnits: 'userSpaceOnUse', orient: 'auto' }, flowDefs);
    mk('path', { d: 'M0,1 L9,5 L0,9 z', fill: '#3b7cff' }, m); return 'url(#fa)'; })();
  if (FLOWS.length) {
    flowMenu.innerHTML = `<div class="fh">how it works</div>` + FLOWS.map((f, i) => `<button data-i="${i}">${esc(f.title)}<span>${f.steps.length} steps</span></button>`).join('');
    flowMenu.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) startFlow(FLOWS[+b.dataset.i]); });
  }
  function endFlow() {
    if (!flow) return;
    clearTimeout(flow.timer); flow.packet?.remove();
    for (const m of all) m._el.classList.remove('active', 'was');
    flowMenu.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
    document.body.classList.remove('flowing'); caption.classList.remove('show', 'ctl');
    flowG.innerHTML = ''; flow = null;
  }
  function startFlow(f) {
    if (current) { clearScene(); current = null; history = []; document.body.classList.remove('scene'); }
    endFlow();
    document.body.classList.add('flowing'); hideTip();
    flowMenu.querySelectorAll('button').forEach((b) => b.classList.toggle('on', FLOWS[+b.dataset.i] === f));
    const order = [];
    for (const s of f.steps) for (const id of [s.from, s.to]) { const m = byId.get(id); if (!order.includes(m)) order.push(m); }
    const pose = new Map();
    const lay = (list, y, z) => {
      const sizes = list.map((m) => ({ ...nbSize(m), h: 70, d: 90 }));
      const total = sizes.reduce((s2, q) => s2 + q.w, 0) + 110 * Math.max(0, list.length - 1);
      let x = -total / 2;
      list.forEach((m, i) => { pose.set(m, { x: x + sizes[i].w / 2, y, z, ...sizes[i] }); x += sizes[i].w + 110; });
      return total;
    };
    const own = order.filter((m) => !m.layer), infra = order.filter((m) => m.layer);
    const w1 = lay(own, 0, 150), w2 = lay(infra, own.length ? -210 : 0, own.length ? -230 : 0);
    for (const m of all) {
      const el = m._el, p = pose.get(m);
      el.classList.remove('focus', 'prov', 'user', 'talk', 'on', 'gone', 'vertical', 'ghost', 'active', 'was');
      if (!p) { el.classList.add('gone'); if (m.tiny) el.classList.add('vertical'); sizeBox(el, m._w, m._h, m._d);
        el.style.transform = `translate3d(${m._pos[0]}px, ${m._pos[1] + 900}px, -400px)`; continue; }
      el.classList.add('on'); sizeBox(el, p.w, p.h, p.d); el.style.transform = `translate3d(${p.x}px, ${p.y}px, ${p.z}px)`;
    }
    floor.classList.add('hidden');
    const fr = Math.max(w1, w2) + 500;
    Object.assign(sceneFloor.style, { width: `${fr}px`, height: `${fr * 0.5}px`, left: `${-fr / 2}px`, top: `${-fr * 0.25}px`, transform: `translateY(37px) rotateX(90deg)` });
    sceneFloor.classList.remove('hidden');
    title.innerHTML = `${esc(M.title || '')} <i>›</i> ${esc(f.title)}`;
    flow = { f, pose, idx: -1, playing: true, timer: 0, packet: null };
    zoom = 1;
    flyTo({ s: fitScale(Math.max(w1, w2) + 120, own.length ? 420 : 200, 0.92, 0.7), tx: 0, ty: own.length ? 100 : 0, rx: -20, ry: -8, px: 0, py: 0 }, 900);
    setTimeout(() => flow && flowStep(0), 950);
  }
  const topOf = (p) => ({ x: p.x, y: p.y - p.h / 2 - 34, z: p.z });
  function flowStep(i) {
    if (!flow) return;
    const { f, pose } = flow, n = f.steps.length;
    i = Math.max(0, Math.min(n - 1, i));
    clearTimeout(flow.timer);
    flow.idx = i;
    const s = f.steps[i], a = byId.get(s.from), b = byId.get(s.to);
    for (const m of all) m._el.classList.remove('active', 'was');
    for (const t of f.steps.slice(0, i)) { byId.get(t.from)._el.classList.add('was'); byId.get(t.to)._el.classList.add('was'); }
    a._el.classList.add('active'); b._el.classList.add('active');
    // the small block carrying what moves
    flow.packet?.remove();
    const item = { name: s.what || '', glyph: HOW[s.how] || '', sub: '' };
    const pk = blockOf('chip packet', item, topOf(pose.get(a)), COL.user, 0);
    flow.packet = pk;
    requestAnimationFrame(() => requestAnimationFrame(() => { const q = topOf(pose.get(b)); pk.style.transform = `translate3d(${q.x}px, ${q.y}px, ${q.z}px)`; }));
    caption.innerHTML = `<div class="fc"><button data-a="prev" ${i === 0 ? 'disabled' : ''}>‹</button><span class="fn">${i + 1} / ${n}</span>
      <button data-a="play">${flow.playing ? '❚❚' : '▶'}</button><button data-a="next" ${i === n - 1 ? 'disabled' : ''}>›</button></div>
      <div><b>${esc(a.label)}</b> <span>→</span> <b>${esc(b.label)}</b>${HOW[s.how] ? ` <span class="pill">${esc(HOW[s.how])}</span>` : ''}</div>
      ${s.say ? `<em>${esc(s.say)}</em>` : ''}`;
    caption.classList.add('show', 'ctl');
    if (flow.playing && i < n - 1) flow.timer = setTimeout(() => flowStep(i + 1), Math.max(2600, 1400 + (s.say || '').length * 32));
    else if (i === n - 1) flow.playing = false;
  }
  caption.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || !flow) return;
    if (b.dataset.a === 'prev') { flow.playing = false; flowStep(flow.idx - 1); }
    if (b.dataset.a === 'next') { flow.playing = false; flowStep(flow.idx + 1); }
    if (b.dataset.a === 'play') { flow.playing = !flow.playing; flowStep(flow.idx >= flow.f.steps.length - 1 && flow.playing ? 0 : flow.idx); }
  });
  function drawFlow() {
    flowG.innerHTML = '';
    if (!flow || flow.idx < 0) return;
    for (const pk of [flow.packet]) if (pk) pk._bb.style.transform = `rotateY(${-cam.ry}deg)`;
    flow.f.steps.slice(0, flow.idx + 1).forEach((s, k) => {
      if (s.from === s.to) return;
      const cur = k === flow.idx, age = flow.idx - k, last = flow.idx === flow.f.steps.length - 1 && !flow.playing;
      if (age > 3 && !last) return;   // only the recent steps; the whole trail shows on the last step
      const [x1, y1] = ctr(byId.get(s.from)._el), [x2, y2] = ctr(byId.get(s.to)._el);
      const qx = (x1 + x2) / 2, qy = Math.min(y1, y2) - 46 - (k % 3) * 16;
      mk('path', { d: `M${x1},${y1} Q${qx},${qy} ${x2},${y2}`, fill: 'none', stroke: cur ? '#3b7cff' : '#bfc4c9', 'stroke-width': cur ? 2.4 : 1.3,
        opacity: cur ? 0.95 : last ? 0.7 : 0.85 - age * 0.18, ...(cur ? { 'marker-end': flowArrow } : {}) }, flowG);
      const mx = 0.25 * x1 + 0.5 * qx + 0.25 * x2, my = 0.25 * y1 + 0.5 * qy + 0.25 * y2;
      mk('circle', { cx: mx, cy: my, r: 8.5, fill: cur ? '#3b7cff' : '#fff', stroke: cur ? '#3b7cff' : '#c4c8cd' }, flowG);
      const tx = mk('text', { x: mx, y: my + 3.5, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 600, fill: cur ? '#fff' : '#7b8188' }, flowG);
      tx.textContent = String(k + 1);
    });
  }

  // ---------- pointer ----------
  const tip = document.getElementById('tip'), title = document.getElementById('title');
  let drag = null, hovered = null, pendHot = { l: null, n: null, t: 0 };
  stage.addEventListener('contextmenu', (e) => e.preventDefault());
  stage.addEventListener('pointerdown', (e) => {
    lastInput = performance.now();
    const pan = e.shiftKey || e.button === 1 || e.button === 2;
    drag = { x: e.clientX, y: e.clientY, rx: cam.rx, ry: cam.ry, px: cam.px, py: cam.py, pan, moved: false };
  });
  addEventListener('pointermove', (e) => {
    lastInput = performance.now();
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      if (!drag.moved) { drag.moved = true; stage.classList.add(drag.pan ? 'panning' : 'dragging'); cancelAnimationFrame(anim?.raf); anim = null; hideTip(); }
      if (drag.pan) { cam.px = drag.px + dx; cam.py = drag.py + dy; }
      else { cam.ry = drag.ry + dx * 0.3; cam.rx = Math.max(-75, Math.min(-8, drag.rx - dy * 0.25)); }
      apply();
      return;
    }
    const chip = e.target.closest?.('.chip');
    const b = e.target.closest?.('.box'), n = b && !b.classList.contains('gone') ? byId.get(b.dataset.id) : null;
    if (n !== hovered) { hovered?._el.classList.remove('hover'); hovered = n; n?._el.classList.add('hover'); }
    const isTile = chip?.classList.contains('tile');
    const hl = chip && !isTile ? chip._link : isTile ? links.find((L) => L.tile === chip.dataset.tile) || null : null;
    const hn = !chip && n && current && n !== current ? n : null;
    if (hl !== pendHot.l || hn !== pendHot.n) {
      clearTimeout(pendHot.t);
      pendHot = { l: hl, n: hn, t: setTimeout(() => {
        if (hl || hn) { userHot = true; hotNode = hn; setHot(hl); narrate(); }
        else if (userHot) { userHot = false; hotNode = null; setHot(null); narrate(); }
      }, hl || hn ? 70 : 260) };
    }
    if (chip) showChipTip(chip, e.clientX, e.clientY); else if (n) showTip(n, e.clientX, e.clientY); else hideTip();
  });
  addEventListener('pointerup', (e) => {
    const wasDrag = drag?.moved; drag = null; stage.classList.remove('dragging', 'panning');
    if (wasDrag || !e.target.closest || e.button === 2) return;
    const b = e.target.closest('.box'), n = b && !b.classList.contains('gone') ? byId.get(b.dataset.id) : null;
    if (e.target.closest('.chip')) return;
    if (n) { if (n !== current) setScene(n); }
    else if (current && e.target.closest('#stage')) toStack();
  });
  stage.addEventListener('wheel', (e) => {
    e.preventDefault(); lastInput = performance.now();
    const next = Math.max(0.3, Math.min(6, zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0012))));
    const f = next / zoom, ox = innerWidth / 2 + cam.px, oy = innerHeight * 0.52 + cam.py;   // keep the point under the cursor in place
    cam.px += (e.clientX - ox) * (1 - f); cam.py += (e.clientY - oy) * (1 - f);
    zoom = next; apply();
  }, { passive: false });
  addEventListener('keydown', (e) => {
    lastInput = performance.now();
    if (flow) {
      if (e.key === 'ArrowRight') { flow.playing = false; return flowStep(flow.idx + 1); }
      if (e.key === 'ArrowLeft') { flow.playing = false; return flowStep(flow.idx - 1); }
      if (e.key === ' ') { e.preventDefault(); flow.playing = !flow.playing; return flowStep(flow.idx); }
      if (e.key === 'Escape') return toStack();
    }
    const P = 60, arrows = { ArrowLeft: [P, 0], ArrowRight: [-P, 0], ArrowUp: [0, P], ArrowDown: [0, -P] };
    if (arrows[e.key]) { cam.px += arrows[e.key][0]; cam.py += arrows[e.key][1]; apply(); }
    else if (e.key === 'Escape' || e.key === 'Backspace') back();
    else if (e.key === '0') toStack();
    else if (e.key === 't') toggleTour();
  });
  title.addEventListener('click', () => toStack());

  const placeTip = (x, y) => {
    tip.style.display = 'block';
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = `${Math.min(innerWidth - w - 10, x + 16)}px`;
    tip.style.top = `${Math.min(innerHeight - h - 10, y + 16)}px`;
  };
  function showTip(n, x, y) {
    const up = holdsUp.get(n).size, down = below(n).length;
    const inside = (n.contains || []).map((c) => c.label);
    tip.innerHTML = `<b>${esc(n.label)}</b>${n.kind ? `<span class="k">${esc(n.kind)}</span>` : ''}
      ${n.description ? `<p>${esc(n.description)}</p>` : ''}${inside.length ? `<div class="sig">holds: ${inside.map(esc).join(' · ')}</div>` : ''}
      <div class="m">${n.layer ? `${LAYER_NAME[n.layer]} · ` : ''}${up ? `holds up ${up}` : 'nothing on top'} · ${down ? `rests on ${down}` : 'foundation'}${n !== current ? ' · click to open' : ''}</div>`;
    placeTip(x, y);
  }
  function showChipTip(c, x, y) {
    const it = c._item;
    if (c.classList.contains('tile')) {
      const who = links.filter((L) => L.tile === c.dataset.tile).map((L) => `${esc(L.to.label)} <span class="k">${esc(VERBW[L.info.how] || HOW[L.info.how] || '')}</span>`);
      tip.innerHTML = `<b>${esc(it.name)}</b>${it.sub ? `<div class="sig">${esc(it.sub)}</div>` : ''}<p>${who.length ? who.join('<br>') : 'nothing in this scene touches it'}</p>`;
      return placeTip(x, y);
    }
    const L = c._link;
    if (it.more || it.compact) {
      const rest = (L.info.what || L.info.flow || []).slice(it.from || 0).map((w) => describe(w, false, 0, L.info.how, current).name);
      tip.innerHTML = `<b>${rest.map(esc).join('<br>')}</b><div class="m">${esc(L.from.label)} → ${esc(L.to.label)}</div>`;
    } else {
      tip.innerHTML = `<b class="${it.kind ? 'mono' : ''}">${esc(it.name)}</b>${it.kind ? `<span class="k">${esc(it.kind)}</span>` : ''}
        ${it.sub ? `<div class="sig">${esc(it.sub)}</div>` : ''}${it.does ? `<p>${esc(it.does)}</p>` : ''}${L.info.note ? `<p>${esc(L.info.note)}</p>` : ''}
        <div class="m">${esc(L.from.label)} → ${esc(L.to.label)}</div>`;
    }
    placeTip(x, y);
  }
  const hideTip = () => { tip.style.display = 'none'; };

  // ---------- tour (for screen recordings) ----------
  let tour = null;
  function toggleTour() {
    if (tour) { clearInterval(tour); tour = null; toStack(); return; }
    const list = M.tour?.length ? M.tour.map((id) => byId.get(id)).filter(Boolean)
      : [...all].sort((a, b) => holdsUp.get(b).size - holdsUp.get(a).size).slice(0, 5);
    let i = 0;
    const step = () => { const n = list[i++ % (list.length + 1)]; if (n) { history = []; setScene(n, false); } else toStack(); };
    step(); tour = setInterval(step, M.tourMs || 9000);
  }

  title.textContent = M.title || '';
  document.title = M.title || roots[0].label;
  window.__map = { focus: (id) => setScene(byId.get(id) || null), view: (rx, ry) => { cam.rx = rx; cam.ry = ry; apply(); }, tour: toggleTour,
    hover: (id) => {
      const n = byId.get(id), r = n._el.getBoundingClientRect();
      hovered = n; n._el.classList.add('hover');
      if (current && n !== current) { userHot = true; hotNode = n; setHot(null); narrate(); } else showTip(n, r.left, r.top);
    },
    flow: (i, step) => { startFlow(FLOWS[i || 0]); if (step != null) setTimeout(() => { flow.playing = false; flowStep(step); }, 1000); },
    link: (fromId, toId) => { const L = links.find((l) => l.from.id === fromId && l.to.id === toId); if (L) { userHot = true; setHot(L); } } };
  Object.assign(cam, overview()); apply();
  if (location.hash === '#tour') toggleTour();
})();
