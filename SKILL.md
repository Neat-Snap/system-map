---
name: system-map
description: Map how a project is architected (what parts it has, what lives where, where it runs, what data it keeps, how the parts talk) as an interactive 3D dependency stack, one self-contained HTML file. Every part is a block resting on what it runs on or needs; platforms, data stores and outside services are visually distinct. Click a block to open it into its own 3D scene where its neighbours line up around it, its contents (tables, queues…) stand on top, and each connection says how the parts talk and what crosses. Use when the user asks to map, diagram, visualize or explain the architecture or infrastructure of a codebase or any part of it, or asks for a "system map" or "dependency stack".
---

# System map (3D architecture stack)

The output is one HTML file: a quiet 3D pile of blocks, like the xkcd "Dependency" comic. **Every block rests on what it runs on or needs.** Platforms and foundations are at the bottom, the parts that use them are on top.

It explains **how the system works, not how the code is laid out.** The reader is someone building with an agent. They don't need file names, function names or folder structure. They need to know:
- what the parts are and what each is responsible for
- what lives where: which process or platform each part runs in
- what data is kept and where (the schema at the level of entity groups)
- how the parts talk: HTTP, job queue, webhook, SQL read/write, vector search, LLM calls…, and what crosses each connection

## What the viewer does
- **Flows (the most important part):** a "how it works" menu, top-right, lists the stories you wrote in `flows`. Playing one:
  - keeps only the blocks the story touches, with the app's own parts in front and platforms, stores and services behind
  - moves a small block carrying what travels from part to part, one step at a time
  - leaves numbered threads behind it
  - narrates each step at the bottom; ‹ › or the arrow keys step through it, space pauses
  - in the stack, hovering a story in the menu lights up the blocks it passes through
  - inside a block's scene, the menu shows only the stories passing through that block ("passes here at step 4"), and playing one starts at that step
- **Overview:** the stack.
  - Platforms (dark), data stores (green, with disk stripes) and outside services (white) look different from the app's own parts (soft colours by group).
  - Foundations that nothing rests on stand in a low row in front.
  - Labels are tiny; a small legend sits bottom-left.
- **Hover:** a small pop-up with the name, role, one sentence, and what the block holds.
- **Click:** the block opens into its own 3D scene.
  - The rest of the stack sinks away and the block glides to the middle, showing its role and description.
  - What it rests on lines up below and what rests on it above (a curved row, or a ring when there are more than 6). Side partners from `edges` sit left and right.
  - The block's `contains` (tables, queues, buckets…) stand on its top. Each connection lands on the thing it touches, so a database scene shows who reads and writes which data.
  - Each connection is built from small blocks for what crosses it, badged with how (`r/w`, `write`, `HTTP`, `job`, `hook`, `vec`, `LLM`…). Arrows show which way data moves.
  - Neighbours connected to each other get thin grey threads.
  - Off-scene parts that two or more neighbours share appear faintly further out, with grey threads. This shows that, for example, all API parts meet in Postgres.
  - A caption at the bottom narrates one connection at a time. Hovering a neighbour shows what else it connects to.
  - Click a neighbour to walk there (a breadcrumb shows the path). Esc goes back a step; `0`, empty space or the title goes back to the stack.
- **Edit mode (`e`, or "edit" under the title):** the user changes the architecture on the map, then hands the changes to you.
  - Click a block to rename it, change its role or description, move it to another host, connect or disconnect it, leave a note, or remove it. "+ block" adds a block.
  - The map shows the result straight away. Added blocks are outlined green, changed ones amber, removed ones faded and crossed out.
  - "Copy for agent" copies a change request: numbered changes, plus the current context of every block they touch.
  - "Save for agent" (only when served by `serve.mjs`) writes `changes.md` and `changes.json` next to `map.json`.
- **Camera:**
  - drag rotates
  - shift-drag, right-drag or the arrow keys move the view
  - scroll zooms toward the cursor
  - `t` (or `#tour` in the URL) plays a tour for screen recordings

You only write `map.json`. Don't hand-write HTML.

Skill files: `~/.claude/skills/system-map/` (`build.mjs`, `shot.mjs`, `assets/`).
Output: `<project>/.system-map/<scope>/map.json` → `map.html` next to it. `<scope>` is a slug like `architecture`, `review-flow` or `infra`.

## 0. Scope
- **Default: the whole system's architecture.** Map apps and processes, their main responsibilities, data stores, queues, outside services and the platforms they're deployed to.
- **A zoomed slice:** one service or feature, at the level of its responsibilities (e.g. "review flow": intake → queue → worker → engine → GitHub).
- Aim for 15–30 blocks for a whole system, 8–20 for a slice.

## 1. Discover (cheap tools only)
Infrastructure is often decided outside the code, so read every source below. Each later one overrides the earlier ones:
1. **Code and config** (below).
2. **Written descriptions in the repo:**
   - `README*`, `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`
   - `docs/` pages about architecture, deployment, self-hosting, ops or runbooks; ADRs (`adr/`, `decisions/`)
   - mermaid or PlantUML diagrams in markdown, infra comments in compose and env files
   - env example comments, and hostnames in example URLs (`*.neon.tech`, `*.supabase.co`, `*.rds.amazonaws.com`, `*.upstash.io`, `cloud.qdrant.io`, `*.r2.cloudflarestorage.com`)
   - Note what a self-hosting guide says, but it describes *their* deploy, not necessarily production. Keep the two apart.
3. **The user's infra notes:** `<project>/.system-map/infra.md`. This is plain prose the user owns, e.g. "Postgres: Neon, eu-central. Hatchet: Hatchet Cloud. Worker: Hetzner box via Dokploy." It overrides everything else. Read it first if it exists. Never delete what's in it.
4. **What the user says in chat** about their infra: append it to `infra.md` (create the file if needed) so the next run knows it too.

Then, from code and config:
- **Where it runs:** read the deploy and infra configs:
  - `Dockerfile*`, `docker-compose*.yml`
  - `wrangler.*`, `vercel.json`, `netlify.toml`, `fly.toml`, `render.yaml`, `railway.*`
  - Terraform, k8s or Helm, `serverless.yml`, `sst.config.*`
  - CI workflows (`.github/workflows/*`): look for what gets built and where it's pushed or deployed
- **Outside services and stores:**
  - env var names in `.env.example` and the env schema (values are irrelevant): `DATABASE_URL`, `S3_*`, `REDIS_*`, `STRIPE_*`, `*_API_KEY`
  - SDKs in package manifests
- **Parts:** app entry points (`main`, `server`, `worker`), route registration, job and workflow definitions, queue names.
- **Data:** the schema file or migrations. Group the tables into 4–9 entity groups.
- **How they talk:** grep for fetch or HTTP clients, queue publish and consume, webhook routes, and which parts touch which tables.
- Check the result with at most **3 rounds** of screenshots.

## 2. Blocks
- `label`: 1–3 plain words, by responsibility ("Webhook intake", "Review engine"), never a file name.
- `kind`: the role in a few words ("HTTP API · container", "job", "main database", "job queue"). It is shown under the label in scenes.
- `description`: one plain sentence on what it does and why it exists.
- `layer`:
  - `platform`: where code runs or is deployed, e.g. Cloudflare Workers, Vercel, a Docker host, Kubernetes, Lambda, CI/CD
  - `data`: databases, caches, object storage, vector stores
  - `external`: third-party services the system calls or receives calls from (GitHub, Stripe, an LLM provider, auth, email), plus queues you don't run yourself
  - omit `layer` for the app's own parts, and give those a `group` instead (3–5 groups, e.g. `frontends`, `api`, `worker`)
- `contains` (for data stores, queues, buckets, and processes worth opening): what lives inside, as `[{ "id", "label", "sub" }]`. For a database, use entity groups with their tables in `sub` ("reviews", "review_run · review_finding").
- `weight` (default 1) widens a block. `tiny: true` only for a pillar holding up 1–2 blocks.

## 3. What rests on what (`on`) and how they talk (`uses`, `edges`)
`"on": [ids]`: what a block runs on or needs. **List the host first** (the process it lives in, or the platform). The block physically sits on its highest support, so:
- processes rest on their platform
- parts of a process rest on the process
- the rest of the list (data stores, outside services) shows up as connections

`uses`: one entry per `on` id, describing the connection:
```json
"uses": {
  "worker":   { "how": "runs", "what": ["review PR"] },
  "postgres": { "how": "readwrite", "what": ["reviews", "repos"], "note": "reserves credits first, records findings" },
  "qdrant":   { "how": "vector", "what": ["code"], "note": "indexes the checkout, then searches it by meaning" },
  "github":   { "how": "git", "what": ["clone", "PR diff", "review comments"] }
}
```
- `how`: one of
  - `runs` (hosted in or on)
  - `read`, `write`, `readwrite`
  - `http`, `webhook`, `queue` (puts jobs in), `job` (receives jobs)
  - `vector`, `llm`, `auth`, `notify`, `payments`, `git`, `storage`, `deploy`, `event`
- `what`: the data or messages that cross, in plain words. If the provider has `contains`, use those ids (e.g. `"reviews"`) and the scene lands the thread on that thing.
- `note`: one short line on why. The caption narrates it.
- `flow` (optional): 2–4 ordered steps instead of `what`, for the most interesting connections.

`edges`: talking between parts where neither rests on the other: dashboard → API over HTTP, GitHub → webhook intake, CI → hosting. Format: `{ "from", "to", "how", "what", "note" }`. Data moves from `from` to `to`.

Only claim what a source above says. Mark how you know, when it isn't code or config:
- `"source": "docs" | "notes" | "inferred"` on a block (default is code or config). The hover pop-up shows "from the docs", "from your infra notes" or "inferred, not confirmed".
- Use `inferred` sparingly, only for a strong hint such as a `*.neon.tech` example URL.
- When no source says where a store, queue or service runs, don't invent a platform. Set `"hostUnknown": true`: the pop-up says so, and the build lists it.
- When that happens, create or extend `infra.md` with a short "Unknown" section listing each one as a question ("Postgres: where is it hosted? (Neon, RDS, self-hosted on …)"), so the user can answer once. On the next run, turn the answers into platform blocks and put the block `on` them, with `"source": "notes"`.

## 4. Flows: how the system works
Write **3–5 flows**, the stories someone needs to understand the system. Pick the main user action, an async or background path, a payment or auth path, and a deploy. Each step is one hop:
```json
"flows": [
  { "id": "review", "title": "A pull request gets reviewed", "steps": [
    { "from": "github", "to": "intake", "how": "webhook", "what": "PR opened", "say": "GitHub sends a signed webhook when a PR is opened." },
    { "from": "intake", "to": "postgres", "how": "write", "what": "event + job", "say": "Saved together with a job in one transaction, so nothing is lost." }
  ] }
]
```
- `from` → `to` is the direction the thing moves (for a read, `from` is the store).
- `what` is 1–3 words, carried by the moving block.
- `say` is one plain sentence on what happens and why it is built that way. This is where the insight goes (retries, transactions, why a queue sits in between).
- Keep a flow to 13 steps or fewer, and trace it in code (enqueue calls, handlers, webhook routes). Don't guess.

## 5. `map.json` shape
```json
{
  "title": "acme · architecture",
  "tour": ["postgres", "api", "worker"],
  "roots": [
    { "id": "vercel", "label": "Vercel", "layer": "platform", "kind": "hosting", "description": "Serves the web app." },
    { "id": "postgres", "label": "Postgres", "layer": "data", "kind": "main database", "description": "All product data.",
      "contains": [ { "id": "orders", "label": "orders", "sub": "order · order_item" } ] },
    { "id": "stripe", "label": "Stripe", "layer": "external", "kind": "payments", "description": "Checkout and subscriptions." },
    { "id": "web", "label": "Storefront", "group": "frontends", "kind": "web app", "on": ["vercel", "postgres"], "description": "…",
      "uses": { "vercel": { "how": "runs", "what": ["Next.js app"] }, "postgres": { "how": "read", "what": ["orders"] } } }
  ],
  "edges": [ { "from": "stripe", "to": "web", "how": "webhook", "what": ["payment events"] } ]
}
```
`symbols` (optional, code-level maps only) is a catalog `{ name: { kind, sig, does } }` for when `what` lists function or type names. Architecture maps don't need it.

## 6. Build and check
```bash
cd ~/.claude/skills/system-map
node build.mjs <dir>/map.json <dir>/map.html
node shot.mjs <dir>/map.html /tmp/map.png
node shot.mjs <dir>/map.html /tmp/map-db.png --focus <database-id>
node shot.mjs <dir>/map.html /tmp/map-svc.png --focus <main-process-id>
node shot.mjs <dir>/map.html /tmp/map-hover.png --focus <id> --hover <neighbour-id>
node shot.mjs <dir>/map.html /tmp/map-flow.png --flow 0:5          # flow 0, step 6
```
Fix build errors (unknown ids). Look at the PNGs with Read and check:
- the overview reads as platforms → processes → parts, with stores and services in front
- the database scene shows which part touches which data
- a process scene shows its parts and what they share
- no label is a file name
- each flow's steps read as a story, without needing the code

`shot.mjs` loads Playwright from `~/explainers/node_modules`.

## 7. Serve it (so edits can be saved)
```bash
node ~/.claude/skills/system-map/serve.mjs <project>/.system-map [port=8765] [host=127.0.0.1]
```
This serves every map under that folder at `/<scope>/map.html` and lets edit mode save `changes.md` next to the map. A plain file:// or static server works too; the user then uses "copy for agent".

## 8. Applying map edits
When the user says "apply the system-map changes" (or pastes a change request that starts with "# Architecture changes"):
1. Read `<project>/.system-map/<scope>/changes.md`, or the pasted text. The JSON block lists the same changes as operations: `add`, `set`, `host`, `remove`, `connect`, `disconnect`, `note`.
2. Treat each change as an architecture decision to carry out in the code, config and infra. A "note" is the user's intent; follow it. If a change is ambiguous, risky or destructive (e.g. removing a data store), confirm it first.
3. Hosting facts the repo can't hold (e.g. "Qdrant runs on Dokploy") go into `infra.md`.
4. Update `map.json` to match what you actually did, not just what was asked. Rebuild, and check with screenshots.
5. Rename `changes.md` to `changes.applied-<date>.md`. The browser drops the handed-over edits by itself once the rebuilt map differs.
6. Report which changes you made, which you skipped and why.

## 9. Hand back
Reply with:
- the HTML path
- the scope and block count
- a 3–5 line plain summary of the architecture: where things run, the main flow, where data lives
- anything inferred or not visible in the repo (e.g. where the database is hosted), and that answering the questions in `infra.md` or in chat fills them in
- the controls: hover, click to open, click a neighbour to walk, drag to rotate, shift-drag to move, scroll to zoom, Esc to go back, `t` to tour, `e` to edit
