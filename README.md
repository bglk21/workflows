# Workflows

A simple, web-based workflow editor with a dark look.

- Blocks: **Step**, **Decision** (diamond) and **Start / End**, each with its own text and color.
- Connections: drag from a dot on a block's edge to another block. Lines are routed
  orthogonally and go around other blocks instead of through them.
- Decisions: connections leaving a decision get labels (`Yes`, `No`, `Option 3`, …) that you can
  rename and recolor.
- Free text: double-click empty space (or use **T Text**) and drag it anywhere.
- Undo/redo, zoom/pan, export/import as JSON. Workflows auto-save to `data/`.

## Run

Requires Node.js 18+. No dependencies to install.

```bash
npm start
```

Open http://localhost:3000. A "Getting started" workflow is created on first run.

Options (environment variables):

| Variable             | Default     | Purpose                         |
| -------------------- | ----------- | ------------------------------- |
| `PORT`               | `3000`      | Port to listen on               |
| `HOST`               | `127.0.0.1` | Use `0.0.0.0` to share on a LAN |
| `WORKFLOWS_DATA_DIR` | `./data`    | Where workflow JSON is stored   |

## GitHub Pages

The app also runs as a static site. Without the Node server it saves workflows in the
browser's localStorage (per browser, per device) instead of `data/`.

`.github/workflows/pages.yml` runs the tests and deploys `public/` on every push to `main`
(or manually via **Actions → Deploy to GitHub Pages → Run workflow**). One-time setup:
**Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Using it

| Action              | How                                                    |
| ------------------- | ------------------------------------------------------ |
| Move block / text   | Drag it                                                |
| Connect blocks      | Drag from a dot on a block onto another block          |
| Edit text / label   | Double-click, or select and press `Enter`              |
| Color, label, shape | Select it and use the panel on the right               |
| Resize block        | Drag the square in the selected block's corner         |
| Pan / zoom          | Drag empty space (or `Space`+drag) / mouse wheel       |
| Delete              | `Delete` / `Backspace`                                 |
| Undo / redo         | `Ctrl+Z` / `Ctrl+Shift+Z`                               |
| Duplicate           | `Ctrl+D`                                               |

## Project layout

```
server.js           Static file server + JSON API (/api/workflows)
public/index.html   App shell
public/css/         Styles
public/js/app.js    Editor (rendering, interaction, inspector)
public/js/router.js Obstacle-avoiding orthogonal connector routing (A*)
public/js/model.js  Workflow data model, validation, sample workflow
test/               node:test tests
```

## Test and lint

```bash
npm install   # dev tools only (ESLint); the app itself has no dependencies
npm test
npm run lint
```

## Checks on GitHub

| Workflow                                   | Runs on                 | What it does                                          |
| ------------------------------------------ | ----------------------- | ----------------------------------------------------- |
| `CI` (`ci.yml`)                            | Pull requests, `main`   | ESLint, and tests on Node 20 and 22                   |
| `Dependency review` (`dependency-review.yml`) | Pull requests        | Fails if a change adds a dependency with a high/critical vulnerability |
| `Deploy to GitHub Pages` (`pages.yml`)     | `main`                  | Tests, then publishes `public/`                       |
| CodeQL (GitHub default setup)              | Pull requests, `main`   | Security scanning                                     |
