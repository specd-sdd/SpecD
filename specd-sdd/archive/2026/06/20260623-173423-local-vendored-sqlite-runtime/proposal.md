# Proposal: local-vendored-sqlite-runtime

## Motivation

`packages/code-graph-electron/vendor/better-sqlite3/` is committed to git, including JS
sources copied from npm and a prebuilt macOS arm64 `better_sqlite3.node`. That duplicates
what `pnpm install` already provides, pollutes `git status` with node-gyp intermediates
after local rebuilds, and stores a platform-specific native binary that is wrong on other
OS/arch combinations.

## Current behaviour

`@specd/code-graph-electron` vendors a physically separate `better-sqlite3` tree under
`vendor/better-sqlite3/` so Electron does not collapse back into the shared pnpm store
path used by CLI and API. The vendored tree is tracked in git, including:

- copied package sources (`lib/`, `deps/`, nested `node_modules/bindings`, etc.)
- `build/Release/better_sqlite3.node` (currently Mach-O arm64)

`sync-vendored-sqlite.mjs` already copies the canonical workspace `better-sqlite3`
package on build, and `rebuild-vendored-sqlite-electron.mjs` rebuilds the addon against
the Electron version used by `studio-desktop`. `studio-desktop` already runs the rebuild
from `prestart` and `build`.

Despite those scripts, contributors still inherit a committed vendor snapshot and see
untracked node-gyp intermediates whenever they rebuild locally.

## Proposed solution

Stop tracking `packages/code-graph-electron/vendor/` in git. Treat the vendored tree as a
local generated artifact:

- **sync** copies canonical `better-sqlite3` from `node_modules` into `vendor/` during
  `@specd/code-graph-electron` build
- **rebuild** compiles `vendor/.../better_sqlite3.node` for the desktop Electron target
  when needed (`studio-desktop` `prestart` / `build`, or explicit rebuild script)
- rebuild cache metadata uses `electronVersion`, `platform`, and `arch` instead of
  machine-specific absolute paths

Keep the physical vendor-copy pattern and runtime isolation from pnpm. Do not add a
monorepo-wide `postinstall` rebuild; CLI/API contributors should not pay native compile
cost unless they work on desktop.

## Specs affected

### New specs

- none

### Modified specs

- `code-graph-electron:composition`: define that the vendored sqlite tree is generated
  locally rather than committed to git, and that rebuild cache metadata is
  platform-aware.
  - Depends on (added): none
  - Depends on (removed): none

- `studio-desktop:main-kernel-lifecycle`: clarify that desktop startup prepares a
  locally generated vendored sqlite runtime (not a git-tracked tree) and document the
  desktop contributor expectation for first-time native rebuild.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

Affected areas:

- `.gitignore` (root)
- `packages/code-graph-electron/package.json`, scripts, README, and tests
- `apps/specd-studio-desktop/package.json` (script wiring review only; behaviour largely
  unchanged)
- `docs/studio/packages.md` (desktop onboarding / toolchain notes)

No change to graph semantics, IPC contracts, or CLI/API runtime paths. External
dependency versions remain the same; only distribution and generation workflow change.

## Technical context

Discovery confirmed:

- vendoring is still required because pnpm aliases collapse to the same
  `.pnpm/better-sqlite3@...` path; Electron and Node would otherwise share the wrong
  native addon
- `sync-vendored-sqlite.mjs` preserves an existing Electron `.node` across sync when
  metadata and binary are present
- current `.electron-build.json` stores an absolute `binaryPath`, which is fragile for
  cache invalidation across machines
- `studio-desktop` already exposes `rebuild:graph-sqlite-electron` and runs it from
  `prestart` and `build`
- committed `.node` is Mach-O arm64 only

Alternatives rejected:

- commit only the `.node` binary — still platform-specific
- remove vendor and rely on npm install alone — pnpm path collapse
- global `postinstall` rebuild — penalizes non-desktop contributors

## Open questions

None at proposal stage. Whether `package.json` `files` continues to include `vendor/` for
workspace packaging is deferred to `design.md`; the tree will still exist on disk after
build even when gitignored.
