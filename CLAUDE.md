# CLAUDE.md

Context for Claude Code sessions in this repository. Keep it short and current: update it in
the same pull request whenever a decision below changes.

## Project

Workflows is a web-based workflow editor with a dark, minimal UI. Users add blocks (Start / End,
Step, Decision), free text, and connectors that route orthogonally *around* other blocks.
Decision outputs get labels (Yes, No, Option N). Blocks and lines can be recolored and edited.

It runs four ways, all from the same `public/` folder:

- **Node server**: `npm start` → http://localhost:3000. Saves to `data/*.json` via `/api/workflows`.
- **GitHub Pages**: static, at https://bglk21.github.io/workflows/. No server, so it saves to localStorage.
- **Docker**: `ghcr.io/bglk21/workflows`, data in the `/data` volume, plus `docker-compose.yml`.
- **PWA**: installable on Android, iOS and desktop, and opens offline (`manifest.webmanifest`, `sw.js`).

## Layout

| Path | What |
| --- | --- |
| `server.js` | Static server and JSON API. No dependencies. Exits cleanly on SIGTERM. |
| `public/js/app.js` | Editor: rendering, pointer and touch input, inspector, menus, inline editing, history. |
| `public/js/router.js` | Connector routing: A* over a sparse grid built from block edges, with a bend penalty. |
| `public/js/model.js` | Data model, `normalizeDoc` (validates untrusted JSON), sample workflow, helpers. |
| `public/js/api.js` | Storage: the server API when present, else localStorage. |
| `public/js/export-png.js` | PNG export (clones the SVG with computed styles inlined). |
| `public/js/version.js` | **Generated** from `package.json` by `scripts/sync-version.js`. Don't edit by hand. |
| `public/sw.js` | Service worker: network first with an offline fallback. Never caches `/api/`. |
| `test/` | `node:test` tests (router, model, server, PWA files, version sync). |

## Commands

```bash
npm start            # run locally
npm test             # all tests
npm run lint         # ESLint (the only dev dependency)
npm version minor --no-git-tag-version   # bump version; also regenerates public/js/version.js
```

## How we work

- **Open pull requests without asking**, then tell the user to approve and merge. Watch the
  checks and fix failures.
- `main` is protected by a ruleset: changes go in through pull requests only, with no force
  pushes or deletion. Work on the session's feature branch.
- **Semantic versioning.** A new feature is a minor bump, a fix or polish is a patch bump.
  Bump in the same pull request. When a new version reaches `main`, `release.yml` tags `vX.Y.Z`,
  creates a GitHub Release and publishes Docker tags `X.Y.Z` and `X.Y` (and `X` from 1.0 on).
- If a feature pull request is still open, add follow-up changes to it instead of opening a new
  one. If it was merged, start again from `main`.
- Before pushing, run `npm test` and `npm run lint`, and check UI changes in headless Chromium
  (Playwright is preinstalled in cloud sessions) on **desktop and a phone profile** (iPhone 13).
- Say plainly what was verified and what wasn't (for example, "not tested on a real iPhone").

## Code conventions

- **Guard clauses, minimal nesting.** Return early instead of using `if/else` pyramids.
- No runtime dependencies, no build step, plain ES modules. Match the surrounding style.
- Escape anything user-provided that goes into HTML (`escapeHtml`). Validate imports with `normalizeDoc`.
- New app files must be added to the `SHELL` list in `public/sw.js`. A test checks this.

## UI decisions so far

- Dark theme, colors as CSS variables in `styles.css`.
- Top bar, left to right:
  - **workflow name ▾** (switcher: search, recent workflows, ＋ New workflow; opened with Ctrl+K),
  - **⋯** (Rename, Export JSON, Export PNG, Import JSON, Install app, Delete),
  - shape buttons in the order **Start / End, Step, Decision, Text** (labels hide below 1180 px),
  - undo / redo / fit,
  - version, save status and `?`.
- The help panel shows on the first visit, can be dismissed (remembered per browser) and reopens with `?`.
- Block text scales with block size. Ctrl (or Cmd) while resizing keeps the proportions.
- Phones (≤ 760 px):
  - two-row top bar, with the side panel and menus as bottom sheets,
  - pinch to zoom,
  - connection dots only react on a selected block.
- The example workflow on first run is called "New workflow".
- Docker Compose example has no Watchtower or other optional services.

## Not done yet (ideas discussed)

- A home screen with workflow thumbnails (mockup option B) was not chosen; option C was built instead.
- No `CHANGELOG.md` yet. Release notes are generated on GitHub Releases.
- Renovate opens many separate update pull requests. Grouping them into one weekly pull request was offered but not set up.
