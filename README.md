# Workflows

A simple, web-based workflow editor with a dark look.

> ### ▶ Try the demo: **https://bglk21.github.io/workflows/**
>
> The demo runs entirely in your browser (hosted on GitHub Pages), with nothing to install. It is a
> **demo**: your workflows are saved only in that browser on that device (localStorage). They are not
> uploaded, shared or backed up, and clearing the site's data deletes them. Use **⋯ → Export JSON**
> to keep a copy.
>
> To keep workflows on your own machine or server, run it with [Node](#run) or [Docker](#docker).

| How to run           | Where workflows are saved           | Best for                    |
| -------------------- | ----------------------------------- | --------------------------- |
| [Demo in the browser](https://bglk21.github.io/workflows/) | Your browser only (localStorage) | Trying it out |
| [Node](#run) (`npm start`) | `data/` folder on that machine | Local use, development |
| [Docker](#docker)    | The `/data` volume                  | Self-hosting                |
| [Install as an app](#install-as-an-app-pwa) | Same as where you installed it from | Phone or desktop app feel |

## Features

- Blocks: **Step**, **Decision** (diamond) and **Start / End**, each with its own text and color.
- Connections: drag from a dot on a block's edge to another block. Lines are routed
  orthogonally and go around other blocks instead of through them.
- Decisions: connections leaving a decision get labels (`Yes`, `No`, `Option 3`, …) that you can
  rename and recolor.
- Free text: double-click empty space (or use **T Text**) and drag it anywhere.
- Undo/redo, zoom/pan (pinch on touch screens), export/import as JSON, export as PNG image.
- Works on phones: two-row toolbar and a bottom sheet for editing.
- Installable as an app (PWA) on Android, iPhone and desktop; opens offline once installed.
- Auto-saves as you work.

## Run

Requires Node.js 18+. No dependencies to install.

```bash
npm start
```

Open http://localhost:3000. An example workflow named "New workflow" is created on first run.

Options (environment variables):

| Variable             | Default     | Purpose                         |
| -------------------- | ----------- | ------------------------------- |
| `PORT`               | `3000`      | Port to listen on               |
| `HOST`               | `127.0.0.1` | Use `0.0.0.0` to share on a LAN |
| `WORKFLOWS_DATA_DIR` | `./data`    | Where workflow JSON is stored   |

## Versioning and releases

Workflows uses [semantic versioning](https://semver.org) (`MAJOR.MINOR.PATCH`). The version in
`package.json` is the single source of truth.

| Change                                  | Bump    | Command                                    |
| --------------------------------------- | ------- | ------------------------------------------ |
| Bug fix, no behavior change for users   | `PATCH` | `npm version patch --no-git-tag-version`   |
| New feature, backwards compatible       | `MINOR` | `npm version minor --no-git-tag-version`   |
| Breaking change (e.g. saved file format) | `MAJOR` | `npm version major --no-git-tag-version`   |
| Pre-release                             | e.g. `1.2.0-beta.1` | `npm version prerelease --preid beta --no-git-tag-version` |

`npm version` also updates `public/js/version.js`, which shows the version in the app's top bar
(a test fails if the two drift apart). To release, include the version bump in a pull request. When it is merged into `main`,
`.github/workflows/release.yml`:

1. creates the git tag `vX.Y.Z` and a GitHub Release with generated release notes
   (marked as pre-release for versions like `1.2.0-beta.1`), and
2. publishes Docker images tagged `X.Y.Z`, `X.Y` and `X` (`X` is skipped for `0.x` versions).

Merges that don't change the version only update the `latest` Docker tag.

## Install as an app (PWA)

Workflows can be installed to the home screen and opens in its own window, also offline.
Installing needs https (e.g. the GitHub Pages site) or `localhost`.

- **Android / Chrome / Edge:** `⋯` → **Install app**, or the browser menu → *Install app*.
- **iPhone / iPad:** open the site in Safari → Share → **Add to Home Screen**.

The service worker (`public/sw.js`) loads everything from the network first and only falls back to
its cache when offline, so new releases show up on the next launch. The API is never cached: when
the Node server or Docker container is unreachable, the app uses the browser's own storage instead,
and those changes are not synced back to the server.

Icons in `public/icons/` are rendered from `public/icon.svg`; the maskable one keeps the artwork
inside Android's round safe zone.

## Docker

A ready-made image is published to GitHub Container Registry:
`ghcr.io/bglk21/workflows` (amd64 and arm64).

```bash
docker run -d -p 3000:3000 -v workflows-data:/data ghcr.io/bglk21/workflows:latest
```

Or with Docker Compose, using the included `docker-compose.yml` (copy it anywhere and adjust
the port or volume as needed):

```bash
docker compose up -d      # start → http://localhost:3000
docker compose pull && docker compose up -d   # update to the newest image
```

Workflows are stored in the `/data` volume, so they survive updates.

| Tag            | Meaning                                         |
| -------------- | ----------------------------------------------- |
| `latest`       | Newest build of `main`                          |
| `sha-<commit>` | A specific commit                               |
| `1.2.3`, `1.2`, `1` | Releases (see *Versioning and releases*); `1` is skipped for `0.x` |

**Staying up to date:** `.github/workflows/docker.yml` rebuilds and pushes the image on every push
to `main`, on `v*` tags, and weekly (to pick up base-image security fixes). Pull requests only
build and smoke-test it.

To build locally instead of pulling, replace `image:` with `build: .` in `docker-compose.yml`.

## GitHub Pages (the demo)

The [demo](https://bglk21.github.io/workflows/) is the same app served as a static site. Without
the Node server it saves workflows in the browser's localStorage (per browser, per device) instead
of `data/`.

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
| Resize block        | Drag the square in the selected block's corner; text scales along. Hold `Ctrl` to keep proportions |
| Pan / zoom          | Drag empty space (or `Space`+drag) / mouse wheel; on touch screens drag with one finger / pinch |
| Delete              | `Delete` / `Backspace`                                 |
| Switch or create a workflow | Click the workflow name at the top (or `Ctrl+K`), type to search, `↑`/`↓` + `Enter`; **＋ New workflow** at the bottom |
| Rename / export (JSON, PNG) / import / install / delete | `⋯` menu next to the workflow name |
| Show help again     | `?` button in the top-right corner                     |
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
| `Docker` (`docker.yml`)                    | Pull requests, `main`, `v*` tags, weekly | Builds the image; publishes it to GHCR (not on PRs) |
| `Release` (`release.yml`)                  | `main`                  | Tags `vX.Y.Z`, creates a GitHub Release and versioned Docker images when `package.json`'s version is new |
| CodeQL (GitHub default setup)              | Pull requests, `main`   | Security scanning                                     |
