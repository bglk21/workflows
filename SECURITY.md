# Security policy

## Supported versions

Only the **latest release** gets security fixes. Fixes ship as a new patch or minor version. They
reach the Docker image (`ghcr.io/bglk21/workflows`) and the [demo](https://bglk21.github.io/workflows/)
through the normal release process.

| Version                | Supported |
| ---------------------- | --------- |
| Latest release         | ✅        |
| Older releases         | ❌ (please update) |

## Reporting a vulnerability

**Please do not report security vulnerabilities in public issues, pull requests or discussions.**

Report them privately through GitHub:

1. Go to the repository's **[Security tab → Report a vulnerability](https://github.com/bglk21/workflows/security/advisories/new)**.
2. Describe the issue and include, as far as you can:
   - the affected version (shown in the app's top bar or help panel) and how you run it
     (demo, Node server, Docker or installed app),
   - steps to reproduce, or a proof of concept,
   - what an attacker could achieve (impact),
   - any suggested fix.

What to expect:

- An acknowledgement within **7 days**.
- An assessment and, if the report is confirmed, a fix or a mitigation plan within **30 days**,
  depending on severity and complexity.
- Credit in the release notes and the security advisory, unless you prefer to stay anonymous.

Please give us a reasonable chance to fix the issue before you disclose it publicly.

## Scope

In scope, for example:

- the Node server (`server.js`): path traversal, API input handling, denial of service,
- cross-site scripting through workflow content or imported JSON files,
- the service worker or PWA serving or caching content it shouldn't,
- the Docker image and the GitHub Actions workflows in this repository.

Out of scope:

- The demo storing workflows unencrypted in the browser's localStorage. This is by design: data
  never leaves the browser.
- Issues that need an attacker who already controls the user's browser, device or server.
- The Node server having no login. It is meant for local or trusted networks and listens on
  `127.0.0.1` by default. Don't expose it to the internet without a reverse proxy that adds
  authentication.
- Vulnerabilities in third-party services (GitHub, GitHub Pages, GHCR) themselves.

## How this project stays secure

- CodeQL code scanning and dependency review run on every pull request.
- Renovate keeps GitHub Actions, the Docker base image and dev dependencies up to date.
- The app has no runtime npm dependencies, and the container runs as a non-root user.
