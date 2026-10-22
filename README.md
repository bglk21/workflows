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
build and smoke-test it. To have running containers update themselves, uncomment the optional
`watchtower` service in `docker-compose.yml`.

To build locally instead of pulling, replace `image:` with `build: .` in `docker-compose.yml`.

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
| New / rename / export / import / delete workflow | `⋯` menu next to the workflow picker |
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
