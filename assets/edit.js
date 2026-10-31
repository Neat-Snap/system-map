// Edit mode: change the architecture right on the map, then hand the changes to an agent.
// Edits are a list of small operations kept in the browser (localStorage). Before the viewer builds the stack they are
// applied to window.MAP, so the map always shows the architecture as you want it; changed blocks are tinted
// (new: green, changed: amber, removed: faded red). "Copy for agent" turns the list into a precise change request
// with the context an agent needs; "Save for agent" writes it next to map.json when the map is served by serve.mjs.
(() => {
  const M = window.MAP;
  if (!M) return;
  const KEY = 'sysmap:' + (window.MAP_PATH || M.title || 'map');
  const ORIG = JSON.parse(JSON.stringify(M));   // the architecture as built, for context and diffs
  let state = { built: window.MAP_BUILT, saved: false, ops: [] };
  try { state = { ...state, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch {}
  // the agent applied and rebuilt the map since these were handed over: start clean
  if (state.saved && state.built !== window.MAP_BUILT) state = { built: window.MAP_BUILT, saved: false, ops: [] };
  const persist = () => { state.built = window.MAP_BUILT; localStorage.setItem(KEY, JSON.stringify(state)); };

  // ---------- the model as a flat list (works for nested "children" maps too) ----------
  const roots = () => M.roots || (M.roots = [M.root]);
  const walk = (list, parent, out) => { for (const n of list) { out.push({ n, parent, list }); walk(n.children || [], n, out); } return out; };
  const find = (id) => walk(roots(), null, []).find((x) => x.n.id === id);
  const label = (id, src = M) => { const r = walk(src.roots || [src.root], null, []).find((x) => x.n.id === id); return r ? r.n.label : id; };
  const hostOf = (x) => (x.parent ? x.parent.id : (x.n.on || [])[0]);
  const mark = (n, k) => { n._ed = n._ed === 'new' ? 'new' : k; };

  function applyOp(o) {
    const x = o.id ? find(o.id) : null;
    switch (o.op) {
      case 'add': {
        const n = { id: o.id, label: o.label, kind: o.kind, description: o.description, _ed: 'new' };
        if (o.layer) n.layer = o.layer; else n.group = o.group || 'new';
        if (o.host) { n.on = [o.host]; n.uses = { [o.host]: { how: 'runs', what: [] } }; }
        roots().push(n); break;
      }
      case 'set': if (x) { for (const k of ['label', 'kind', 'description']) if (o[k] != null) x.n[k] = o[k]; mark(x.n, 'changed'); } break;
      case 'host': if (x) {
        const n = x.n, old = hostOf(x);
        if (x.parent) { x.list.splice(x.list.indexOf(n), 1); roots().push(n); }
        n.on = [o.to, ...(n.on || []).filter((h) => h !== old && h !== o.to)];
        n.uses = { ...(n.uses || {}) }; delete n.uses[old]; n.uses[o.to] = n.uses[o.to] || { how: 'runs', what: [] };
        n.hostUnknown = false; mark(n, 'changed'); break;
      }
      case 'remove': if (x) x.n._ed = 'removed'; break;
      case 'connect': (M.edges = M.edges || []).push({ from: o.from, to: o.to, how: o.how, what: o.what ? [o.what] : [], note: o.note, _ed: 'new' });
        { const a = find(o.from); if (a) mark(a.n, 'changed'); } break;
      case 'disconnect': {
        M.edges = (M.edges || []).filter((e) => !((e.from === o.a && e.to === o.b) || (e.from === o.b && e.to === o.a)));
        for (const [u, p] of [[o.a, o.b], [o.b, o.a]]) { const y = find(u); if (!y) continue;
          if ((y.n.on || []).includes(p) && hostOf(y) !== p) { y.n.on = y.n.on.filter((h) => h !== p); if (y.n.uses) delete y.n.uses[p]; mark(y.n, 'changed'); } }
        break;
      }
      case 'note': if (x) { x.n._note = o.text; if (!x.n._ed) x.n._ed = 'noted'; } break;
    }
  }
  for (const o of state.ops) { try { applyOp(o); } catch {} }

  // ---------- describing the changes, for people and for agents ----------
  const HOWW = { http: 'HTTP', webhook: 'webhook', queue: 'enqueues jobs', job: 'runs jobs', read: 'reads', write: 'writes', readwrite: 'reads + writes',
    vector: 'vector search', llm: 'LLM calls', auth: 'auth', notify: 'notifications', payments: 'payments', git: 'git', storage: 'file storage', deploy: 'deploys', event: 'events' };
  const KIND = { platform: 'platform', data: 'data store', external: 'outside service' };
  function line(o) {
    switch (o.op) {
      case 'add': return `Add **${o.label}** (${o.layer ? KIND[o.layer] : `app part, ${o.group || 'new group'}`}${o.kind ? `, ${o.kind}` : ''})${o.host ? `, running on ${label(o.host)}` : ''}${o.description ? `: ${o.description}` : ''}`;
      case 'set': return `Change **${label(o.id, ORIG)}**: ${['label', 'kind', 'description'].filter((k) => o[k] != null).map((k) => `${k === 'label' ? 'name' : k === 'kind' ? 'role' : 'what it does'} → "${o[k]}"`).join(', ')}`;
      case 'host': return `Move **${label(o.id)}** from ${o.from ? label(o.from, ORIG) : 'nowhere (host unknown)'} to run on **${label(o.to)}**`;
      case 'remove': return `Remove **${label(o.id)}**`;
      case 'connect': return `Connect **${label(o.from)}** → **${label(o.to)}** (${HOWW[o.how] || o.how}${o.what ? `: ${o.what}` : ''})${o.note ? `. ${o.note}` : ''}`;
      case 'disconnect': return `Remove the connection between **${label(o.a)}** and **${label(o.b)}**`;
      case 'note': return `Note on **${label(o.id)}**: ${o.text}`;
    }
    return JSON.stringify(o);
  }
  const plain = (s) => s.replace(/\*\*/g, '');
  // what an agent needs to know about every block a change touches, from the map as built
  function context() {
    const ids = new Set(state.ops.flatMap((o) => [o.id, o.from, o.to, o.a, o.b, o.host]).filter(Boolean));
    const all = walk(ORIG.roots || [ORIG.root], null, []);
    const out = [];
    for (const id of ids) {
      const x = all.find((y) => y.n.id === id); if (!x) continue;
      const n = x.n, host = x.parent ? x.parent.id : (n.on || [])[0];
      const uses = Object.entries(n.uses || {}).filter(([k]) => k !== host).map(([k, u]) => `${label(k, ORIG)} (${HOWW[u.how] || u.how}${(u.what || []).length ? `: ${u.what.join(', ')}` : ''})`);
      const usedBy = all.filter((y) => (y.n.on || []).includes(id) || y.parent?.id === id).map((y) => y.n.label);
      const talks = (ORIG.edges || []).filter((e) => e.from === id || e.to === id).map((e) => `${label(e.from, ORIG)} → ${label(e.to, ORIG)} (${HOWW[e.how] || e.how})`);
      out.push(`- **${n.label}**${n.kind ? ` (${n.kind})` : ''}${host ? `, runs on ${label(host, ORIG)}` : n.hostUnknown ? ', host unknown' : ''}. ${n.description || ''}`
        + (uses.length ? `\n  - uses: ${uses.join('; ')}` : '') + (usedBy.length ? `\n  - used by / hosts: ${usedBy.join(', ')}` : '')
        + (talks.length ? `\n  - talks: ${talks.join('; ')}` : '') + ((n.contains || []).length ? `\n  - holds: ${n.contains.map((c) => c.label).join(', ')}` : ''));
    }
    return out.join('\n');
  }
  function request() {
    const hosting = state.ops.some((o) => o.op === 'host' || (o.op === 'add' && o.layer === 'platform'));
    return `# Architecture changes: ${M.title || ''}

Made on the system map${window.MAP_PATH ? ` (\`${window.MAP_PATH}\`)` : ''}. Apply them:
1. Change the code, config and infra so the system matches. If a change is ambiguous or risky, ask before doing it.
2. Update map.json to match what you actually did, then rebuild map.html with the system-map skill.${hosting ? '\n3. Hosting facts that live outside the repo go into `.system-map/infra.md`.' : ''}

## Changes
${state.ops.map((o, i) => `${i + 1}. ${line(o)}`).join('\n')}

## Current architecture of what these touch
${context()}

<details><summary>operations (machine-readable)</summary>

\`\`\`json
${JSON.stringify(state.ops, null, 1)}
\`\`\`
</details>
`;
  }

  // ---------- UI ----------
  let api = null, card = null, bar = null, server = false;
  const E = window.SysmapEdit = { editing: false, ops: () => state.ops, request };
  const h = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; };
  const commit = (ops, focus) => {
    state.ops.push(...ops); state.saved = false; persist();
    sessionStorage.setItem(KEY + ':view', JSON.stringify({ editing: true, focus: focus ?? api.current()?.id, just: ops.map((o) => o.id || o.from || o.a) }));
    location.reload();
  };
  const blocks = () => api.all.filter((n) => n._ed !== 'removed');
  const options = (list, sel, empty) => (empty ? `<option value="">${empty}</option>` : '') + list.map((n) => `<option value="${n.id}" ${n.id === sel ? 'selected' : ''}>${api.esc(n.label)}</option>`).join('');
  const HOWS = ['http', 'readwrite', 'read', 'write', 'queue', 'job', 'webhook', 'vector', 'llm', 'auth', 'notify', 'payments', 'git', 'storage', 'deploy', 'event'];

  function closeCard() { card?.remove(); card = null; }
  function place(el, x, y) {
    document.body.appendChild(el);
    el.style.left = `${Math.max(10, Math.min(innerWidth - el.offsetWidth - 10, x + 14))}px`;
    el.style.top = `${Math.max(10, Math.min(innerHeight - el.offsetHeight - 10, y - 20))}px`;
  }
  // a block's card: rename, describe, move to another host, connect or disconnect, leave a note, remove
  E.open = (n, x, y) => {
    closeCard(); api.hideTip();
    const host = n.parent ? n.parent.id : (n.on || [])[0];
    const hosts = blocks().filter((m) => m !== n && (m.layer === 'platform' || !m.layer));
    const conns = [
      ...(n.on || []).filter((id) => id !== host).map((id) => ({ id, how: (n.uses || {})[id]?.how })),
      ...api.all.filter((m) => (m.on || []).includes(n.id) && (m.on[0] !== n.id)).map((m) => ({ id: m.id, how: (m.uses || {})[n.id]?.how })),
      ...api.edges.filter((e) => e.a === n || e.b === n).map((e) => ({ id: (e.a === n ? e.b : e.a).id, how: e.how, dir: e.a === n ? '→' : '←' })),
    ];
    card = h(`<div id="ecard"><div class="eh">${n._ed === 'new' ? 'new block' : 'edit block'}<button data-a="x">×</button></div>
      <label>name<input name="label" value="${api.esc(n.label)}"></label>
      <label>role<input name="kind" value="${api.esc(n.kind || '')}" placeholder="e.g. HTTP API · container"></label>
      <label>what it does<textarea name="description" rows="2">${api.esc(n.description || '')}</textarea></label>
      <label>runs on<select name="host">${options(hosts, host, n.hostUnknown ? 'unknown' : '(nothing)')}</select></label>
      <div class="sub">talks to</div>
      <div class="conns">${conns.map((c) => `<div>${c.dir || '·'} ${api.esc(api.byId.get(c.id).label)} <span>${api.esc(api.HOW[c.how] || c.how || '')}</span><button data-a="dc" data-id="${c.id}" title="remove this connection">×</button></div>`).join('') || '<em>nothing yet</em>'}</div>
      <div class="row"><select name="cto">${options(blocks().filter((m) => m !== n), '', '+ connect to…')}</select><select name="chow">${HOWS.map((k) => `<option>${k}</option>`).join('')}</select></div>
      <input name="cwhat" placeholder="what crosses (e.g. sessions, PR diff)">
      <label>note for the agent<textarea name="note" rows="2" placeholder="why, or what should change">${api.esc(n._note || '')}</textarea></label>
      <div class="acts"><button data-a="rm" class="danger">${n._ed === 'removed' ? 'removed' : 'remove block'}</button><button data-a="ok" class="primary">apply</button></div></div>`);
    const v = (k) => card.querySelector(`[name="${k}"]`).value.trim();
    card.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'x') return closeCard();
      if (b.dataset.a === 'dc') return commit([{ op: 'disconnect', a: n.id, b: b.dataset.id }]);
      if (b.dataset.a === 'rm') return commit([{ op: 'remove', id: n.id }], null);
      if (b.dataset.a === 'ok') {
        const ops = [], set = { op: 'set', id: n.id };
        for (const k of ['label', 'kind', 'description']) if (v(k) !== (n[k] || '')) set[k] = v(k);
        if (Object.keys(set).length > 2) ops.push(set);
        if (v('host') && v('host') !== (host || '')) ops.push({ op: 'host', id: n.id, from: host || null, to: v('host') });
        if (v('cto')) ops.push({ op: 'connect', from: n.id, to: v('cto'), how: v('chow'), what: v('cwhat') });
        if (v('note') !== (n._note || '')) ops.push({ op: 'note', id: n.id, text: v('note') });
        ops.length ? commit(ops) : closeCard();
      }
    });
    place(card, x, y);
    card.querySelector('input').focus();
  };
  // adding a block: what kind it is, where it runs, what it does
  function addCard() {
    closeCard();
    const hosts = blocks().filter((m) => m.layer === 'platform' || !m.layer);
    card = h(`<div id="ecard"><div class="eh">new block<button data-a="x">×</button></div>
      <label>name<input name="label" placeholder="e.g. Redis cache"></label>
      <label>is a<select name="type"><option value="">part of the app</option><option value="platform">platform (where things run)</option><option value="data">data store</option><option value="external">outside service</option></select></label>
      <label>group<select name="group">${api.groups.map((g) => `<option>${api.esc(g)}</option>`).join('')}<option value="new">new group</option></select></label>
      <label>role<input name="kind" placeholder="e.g. cache · container"></label>
      <label>what it does<textarea name="description" rows="2"></textarea></label>
      <label>runs on<select name="host">${options(hosts, '', '(nothing / unknown)')}</select></label>
      <div class="acts"><span></span><button data-a="ok" class="primary">add</button></div></div>`);
    const v = (k) => card.querySelector(`[name="${k}"]`).value.trim();
    card.querySelector('[name="type"]').addEventListener('change', (e) => { card.querySelector('[name="group"]').parentElement.style.display = e.target.value ? 'none' : ''; });
    card.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'x') return closeCard();
      if (!v('label')) return card.querySelector('[name="label"]').focus();
      const id = v('label').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Math.random().toString(36).slice(2, 5);
      commit([{ op: 'add', id, label: v('label'), layer: v('type') || undefined, group: v('type') ? undefined : v('group'), kind: v('kind'), description: v('description'), host: v('host') || undefined }], null);
    });
    place(card, 18, 120);
    card.querySelector('input').focus();
  }

  // the bar: what you changed, and handing it to the agent
  function drawBar() {
    bar?.remove(); bar = null;
    document.body.classList.toggle('editing', E.editing);
    if (!E.editing) return;
    bar = h(`<div id="ebar"><div class="bh"><b>editing</b> <span>click a block to change it</span></div>
      <ol>${state.ops.map((o, i) => `<li>${api.esc(plain(line(o)))}<button data-a="undo" data-i="${i}" title="drop this change">×</button></li>`).join('')}</ol>
      <div class="acts"><button data-a="add">+ block</button>${state.ops.length ? `<button data-a="copy" class="primary">copy for agent</button>${server ? '<button data-a="save" class="primary">save for agent</button>' : ''}<button data-a="clear">discard all</button>` : ''}<button data-a="done">done</button></div>
      <div class="msg">${state.saved ? 'handed to the agent. Tell it: "apply the system-map changes".' : ''}</div></div>`);
    bar.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const msg = bar.querySelector('.msg');
      if (b.dataset.a === 'add') return addCard();
      if (b.dataset.a === 'done') return E.toggle();
      if (b.dataset.a === 'undo') { state.ops.splice(+b.dataset.i, 1); return commit([]); }
      if (b.dataset.a === 'clear') { if (confirm('Discard all changes?')) { state.ops = []; commit([]); } return; }
      if (b.dataset.a === 'copy') {
        const text = request();
        try { await navigator.clipboard.writeText(text); }
        catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
        state.saved = true; persist(); msg.textContent = 'copied. Paste it to your agent.';
      }
      if (b.dataset.a === 'save') {
        const r = await fetch('/__sysmap/changes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ page: location.pathname, md: request(), ops: state.ops }) }).catch(() => null);
        if (r?.ok) { state.saved = true; persist(); msg.textContent = `saved to ${(await r.json()).file}. Tell your agent: "apply the system-map changes".`; }
        else msg.textContent = 'could not save; use copy instead.';
      }
    });
    document.body.appendChild(bar);
  }
  E.toggle = () => { E.editing = !E.editing; closeCard(); drawBar(); sessionStorage.setItem(KEY + ':view', JSON.stringify({ editing: E.editing })); };

  E.mount = (a) => {
    api = a;
    // tint what changed
    for (const n of api.all) if (n._ed) n._el.classList.add('ed-' + n._ed);
    const btn = h(`<button id="ebtn" title="edit the architecture (e)">edit</button>`);
    btn.addEventListener('click', () => E.toggle());
    document.body.appendChild(btn);
    if (state.ops.length) btn.dataset.n = state.ops.length;
    fetch('/__sysmap', { method: 'HEAD' }).then((r) => { server = r.ok; if (E.editing) drawBar(); }).catch(() => {});
    let view = {};
    try { view = JSON.parse(sessionStorage.getItem(KEY + ':view') || '{}'); } catch {}
    if (view.editing) { E.editing = true; drawBar(); }
    if (view.focus) api.setScene(view.focus);
    for (const id of view.just || []) api.byId.get(id)?._el.classList.add('just');
    sessionStorage.setItem(KEY + ':view', JSON.stringify({ editing: E.editing }));
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && card) { e.stopImmediatePropagation(); closeCard(); } }, true);
  };
})();
