# Proposal: eliminate-git-hardcoding

## Motivation

Several places in the codebase hardcode `git` commands instead of going through the `VcsAdapter` port. This prevents specd from working with non-git VCS (hg, svn) in those code paths and duplicates VCS detection logic across the composition layer.

## Current behaviour

- `config-loader.ts` calls `git rev-parse --show-toplevel` directly to find the VCS root for config discovery
- `workspace-integration.ts` in code-graph checks for a `.git/` directory to find the repo root for gitignore resolution
- `actor-resolver.ts` composition duplicates the exact same `git rev-parse --is-inside-work-tree` detection that `vcs-adapter.ts` already performs
- The `VcsAdapter` port has no concept of identity — actor identity resolution is handled by a completely separate port (`ActorResolver`) with its own duplicated VCS detection

## Proposed solution

1. Add `identity(): Promise<ActorIdentity>` to the `VcsAdapter` port interface
2. Implement `identity()` in all four VCS adapters (git, hg, svn, null)
3. Refactor actor-resolver composition to receive a `VcsAdapter` instance instead of doing its own VCS detection
4. Fix `config-loader.ts` to use `VcsAdapter.rootDir()` instead of `git rev-parse`
5. Rename `createConfigLoader` to `createDefaultConfigLoader` to clarify it's the default (FS-backed) factory

## Specs affected

### New specs

None.

### No-op specs (no behavioral change, tracked for implementation coverage)

- `cli:entrypoint`: No behavioral change — CLI still discovers config the same way. Implementation update: `load-config.ts` import rename.
- `cli:host-context`: No behavioral change — CLI host bootstrap unchanged. Implementation update: same import rename.

### Modified specs

- `core:vcs-adapter-port`: Add `identity()` method to the interface
  - Depends on (added): none
  - Depends on (removed): none

- `core:vcs-adapter`: Updated factory contract to reflect that VcsAdapter now includes identity resolution
  - Depends on (added): none
  - Depends on (removed): none

- `core:actor-resolver-port`: Remove the "Decoupled from VcsAdapter" requirement — composition now receives VcsAdapter for detection
  - Depends on (added): none
  - Depends on (removed): none

- `core:actor-resolver`: Composition factory refactored to receive a VcsAdapter instead of doing independent VCS detection
  - Depends on (added): none
  - Depends on (removed): none

- `core:vcs-actor-resolver`: New spec — single `VcsActorResolver` class that receives `VcsAdapter` in constructor and delegates `resolve()` to `.identity()`
  - Depends on (added): core:vcs-adapter-port, core:actor-resolver-port
  - Depends on (removed): none

- `core:actor-resolver-git`: Eliminated — replaced by `VcsActorResolver` + `GitVcsAdapter`
  - Depends on (added): none
  - Depends on (removed): none

- `core:actor-resolver-hg`: Eliminated — replaced by `VcsActorResolver` + `HgVcsAdapter`
  - Depends on (added): none
  - Depends on (removed): none

- `core:actor-resolver-svn`: Eliminated — replaced by `VcsActorResolver` + `SvnVcsAdapter`
  - Depends on (added): none
  - Depends on (removed): none

- `core:actor-provider`: Simplified — no longer needs per-VCS actor provider registrations
  - Depends on (added): none
  - Depends on (removed): none

- `core:config-loader`: FsConfigLoaderOptions gains optional vcsAdapter field; VCS root discovery uses VcsAdapter.rootDir() instead of git rev-parse; `createConfigLoader` renamed to `createDefaultConfigLoader`
  - Depends on (added): core:vcs-adapter-port
  - Depends on (removed): none

- `core:config`: Update VCS root detection references (".git/" → VcsAdapter) and git repo bounding for config discovery
  - Depends on (added): core:vcs-adapter-port
  - Depends on (removed): none

- `code-graph:indexer`: Use case receives VcsAdapter, resolves rootDir(), passes resolved path to discoverFiles()
  - Depends on (added): none
  - Depends on (removed): none

- `code-graph:workspace-integration`: Update .gitignore handling to use VcsAdapter.rootDir() for finding VCS root instead of walking up for .git/
  - Depends on (added): core:vcs-adapter-port
  - Depends on (removed): none

## Impact

### Spec deltas

- `core:vcs-adapter-port` — add `identity()` requirement
- `core:vcs-adapter` — update factory contract
- `core:actor-resolver-port` — remove "Decoupled from VcsAdapter" requirement
- `core:actor-resolver` — refactor composition contract
- `core:vcs-actor-resolver` — new spec: `VcsActorResolver` wrapping `VcsAdapter.identity()`
- `core:actor-resolver-git` — elimination delta
- `core:actor-resolver-hg` — elimination delta
- `core:actor-resolver-svn` — elimination delta
- `core:actor-provider` — simplify (no per-VCS registrations)
- `core:config-loader` — rename `createConfigLoader` → `createDefaultConfigLoader`; update VCS root references
- `core:config` — update git/VCS root bounding references
- `core:composition` — update `createConfigLoader` references
- `sdk:host-context` — update `createConfigLoader` references
- `code-graph:indexer` — use case receives VcsAdapter, caller resolves rootDir, passes to discoverFiles
- `code-graph:workspace-integration` — update `.gitignore` handling references
- `cli:entrypoint` — no-op
- `cli:host-context` — no-op

### Code changes

- **core package**:
  - `src/application/ports/vcs-adapter.ts` — add `identity()` to interface
  - `src/infrastructure/git/vcs-adapter.ts` — implement `identity()`
  - `src/infrastructure/hg/vcs-adapter.ts` — implement `identity()`
  - `src/infrastructure/svn/vcs-adapter.ts` — implement `identity()`
  - `src/infrastructure/null/vcs-adapter.ts` — implement `identity()`
  - `src/composition/actor-resolver.ts` — refactor to receive VcsAdapter
  - `src/composition/composition-resolver.ts` — wiring adjustments for actor resolver
  - `src/composition/config-loader.ts` — rename `createConfigLoader` → `createDefaultConfigLoader`
  - `src/infrastructure/fs/config-loader.ts` — accept VcsAdapter; use VcsAdapter.rootDir()
  - `src/infrastructure/vcs-actor-resolver.ts` — new: `VcsActorResolver` wrapping `VcsAdapter.identity()`
  - `src/infrastructure/git/actor-resolver.ts` — eliminated
  - `src/infrastructure/hg/actor-resolver.ts` — eliminated
  - `src/infrastructure/svn/actor-resolver.ts` — eliminated
- **code-graph package**:
  - `src/application/use-cases/index-code-graph.ts` — receives VcsAdapter, resolves rootDir(), passes to discoverFiles()
- **cli package**:
  - `src/load-config.ts` — update import
- **sdk package**:
  - Re-export `createDefaultConfigLoader`

## Technical context

- `VcsAdapter` gets `identity(): Promise<ActorIdentity>` (named `identity()`, not `vcsIdentity()`)
- `ActorResolver` port stays separate (identity may come from non-VCS sources like SSO/env vars in the future)
- `VcsActorResolver` implements `ActorResolver` port — receives `VcsAdapter` in constructor, delegates `resolve()` to `.identity()`
- The "Decoupled from VcsAdapter" requirement in `core:actor-resolver-port` is removed/updated; the port remains clean, only `VcsActorResolver` knows about VCS
- `NullVcsAdapter.identity()` returns `{ name: 'unknown', email: '', provider: 'null' }`
- `PrivacyActorResolver` stays as a decorator wrapping `ActorResolver`
- `FsConfigLoaderOptions` gets an optional `vcsAdapter?: VcsAdapter` field in its `startDir` variant
- `createDefaultConfigLoader` (composition) resolves VcsAdapter if not provided: `options.vcsAdapter ?? await createVcsAdapter(options.startDir)`
- `FsConfigLoader` receives VcsAdapter in constructor, uses it in `load()` for root detection

## Open questions

None.
