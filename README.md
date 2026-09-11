# dsh-approval-bash-highlight

[![verify](https://github.com/evanw0211/dsh-approval-bash-highlight/actions/workflows/verify.yml/badge.svg)](https://github.com/evanw0211/dsh-approval-bash-highlight/actions/workflows/verify.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Shell syntax highlighting for DSH **command approval cards**.

While an approval is pending, the shipped card looks the command up in the
settled Chat Node list — where it does not exist yet — so the command area
renders **empty at exactly the moment you have to read it**. This plugin takes
over the single `conversation.approval.detail` slot, resolves the pending command
by exact `callId` from `snapshot.legacy.runningCalls`, and renders it as a
highlighted code block: line breaks and indentation preserved, wrapped at token
boundaries, colored through the token variables the theme already ships.

- **Presentation only** — it never joins, escapes, or truncates the command.
- **Exact-match correlation only** — no ambiguous fallback. A wrong command
  inside an approval prompt is worse than none.
- **No new dependency** — it reuses the theme's existing `--shiki-token-*` variables.

For the analysis behind it (with measured evidence) see
[docs/upstream-analysis.md](docs/upstream-analysis.md).

## Requirements

| | |
|---|---|
| DSH | verified against the `0.1.5-rc.x` line (`@deepseek-ai/dsh` 0.1.5-rc.1 launcher, `0.1.5-rc.2` packages) |
| Node | ≥ 18 |
| Install path A | `pnpm` on `PATH` — `dsh plugin` forwards to it |

Not published to npm. Install from this repository.

## Install

### A. As a profile dependency (pnpm)

```sh
dsh plugin --profile web add github:evanw0211/dsh-approval-bash-highlight
```

The manifest declares `dsh.bundle.patch`, so the dependency is reconciled into
`dsh.profile.bundles` and the shipped `cordis.patch.yml` inserts the Loader row by
package name, resolved from the profile's `node_modules`. A local checkout works
the same way (`... add /path/to/dsh-approval-bash-highlight`).

> This is the intended path, but it was **not** exercised in the verification run
> recorded in [docs/verification.md](docs/verification.md) — that host had no
> pnpm. Install path B is what was verified live.

### B. In place, without pnpm

Add to `$DSH_HOME/profiles/<name>/cordis.patch.yml`, with your own checkout path:

```yaml
- insert:
    - id: approval-bash-highlight
      name: /absolute/path/to/dsh-approval-bash-highlight/lib/index.js
```

The Loader and the client scanner both accept a path row; the browser half is
found through the nearest ancestor `package.json`. With `patchReload: live` the
running host recomposes without a restart. **Refresh the page** afterwards —
client bundles are only rebuilt by a dev watcher, so an already-open tab keeps
the old graph.

## Verify

```sh
git clone https://github.com/evanw0211/dsh-approval-bash-highlight
cd dsh-approval-bash-highlight
node build.mjs            # client.js -> lib/client.js
node verify-install.mjs   # 41 checks
```

`verify-install.mjs` drives the built bundle through the **real**
`@deepseek-ai/dsh-client-modules` `ClientModuleSystem` — the same code the browser
runs — with `react` supplied as the shell's platform seed. No browser and no
running host required. CI runs the same two commands plus a generated-artifact
drift check.

The live-host proof (the running host discovering the package and serving those
exact bytes) is in [docs/verification.md](docs/verification.md).

## Uninstall

Remove the `insert` entry from `$DSH_HOME/profiles/<name>/cordis.patch.yml`. For a
pnpm install, also:

```sh
dsh plugin --profile web remove dsh-approval-bash-highlight
```

## Documentation

| | |
|---|---|
| [docs/upstream-analysis.md](docs/upstream-analysis.md) | the defect, the measured evidence, and the suggested upstream fix |
| [docs/verification.md](docs/verification.md) | the offline checks and the live-host proof |
| [docs/development.md](docs/development.md) | layout, build, slot contract, dynamic-plugin form, pitfalls, limitations |

## License

[MIT](LICENSE) © Evan Wang
