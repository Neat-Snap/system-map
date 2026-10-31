# system-map

A Claude Code skill that maps a project's architecture as an interactive 3D dependency stack: one self-contained HTML file, no dependencies.

- **Stack:** every part is a block resting on what it runs on or needs. Platforms, data stores and outside services each look different from the app's own parts.
- **How it works:** play flows ("a pull request gets reviewed") step by step. A small block carries what moves from part to part, and each step is narrated in plain words.
- **Scenes:** click a block to open it. Its neighbours line up around it, what it holds (tables, queues) stands on top, and each connection says how the parts talk and what crosses.

## Install

```bash
git clone git@github.com:Neat-Snap/system-map.git ~/.claude/skills/system-map
```

Then ask Claude Code to "map the architecture of this repo". The agent writes `.system-map/<scope>/map.json` and builds it:

```bash
node ~/.claude/skills/system-map/build.mjs map.json map.html
```

`shot.mjs` takes screenshots for checking and needs Playwright.

## Controls

- Drag rotates. Shift-drag, right-drag or the arrow keys move the view. Scroll zooms toward the cursor.
- Hover for details. Click a block to open it, and click a neighbour to walk there. Esc goes back.
- Use the "how it works" menu (top-right) to play flows. ‹ › steps through them and space pauses.
