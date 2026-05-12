# Proposal: move-change-locks-to-config-tmp

## Motivation

The change lock directory is currently created next to the changes storage root (`.specd/change-locks`) instead of under the config temporary area. We need lock files to live under `configPath/tmp` so temporary runtime coordination data is centralized with other config-scoped temporary artifacts.

## Current behaviour

`FsChangeRepository` derives `_locksPath` from `path.dirname(changesPath)` and creates the directory with `fs.mkdir(..., { recursive: true })` during lock acquisition. With this project config, that resolves to `.specd/change-locks`, which is outside `.specd/config/tmp`.

## Proposed solution

Move lock directory resolution to the config temp area and standardize per-change lock directories under `<configPath>/tmp/change-locks/<change>.lock`. Keep existing locking semantics (per-change exclusive lock, stale lock cleanup, wait/retry behavior) unchanged.

## Specs affected

### New specs

_none_

### Modified specs

- `core:core/change-repository-port`: update repository storage contract language so fs lock directories are rooted in the config temp area rather than the changes storage parent.
  - Depends on (added): `core:core/config`
- `core:core/storage`: update storage behavior requirements to define lock directory placement under `configPath/tmp/change-locks`.
  - Depends on (added): `core:core/config`
- `core:core/config`: clarify/configure `configPath` as the anchor for temporary runtime artifacts used by core services (including change locks).
  - Depends on (added): none

## Impact

- Core filesystem repository implementation and composition wiring for change storage options.
- Lock-path-related tests in `@specd/core` that assert current `.specd/change-locks` behavior.
- No expected behavior change for lifecycle transitions or artifact validation semantics.
- No external API contract changes for CLI command shape.

## Technical context

During exploration we verified current behavior in `packages/core/src/infrastructure/fs/change-repository.ts`:

- `_locksPath` currently derives from `path.dirname(this._changesPath)`.
- lock root is created in `_acquireLock()` before creating `<name>.lock`.

We also confirmed runtime resolved `configPath` exists and is available from loaded config (`.specd/config` in this project), and the user explicitly requested lock placement under `tmp` inside that path. We considered two path conventions under config tmp and selected `<configPath>/tmp/change-locks/<change>.lock` as the direct interpretation of the request.

## Open questions

_none_
