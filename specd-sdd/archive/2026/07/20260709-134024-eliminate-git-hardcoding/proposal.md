# Proposal: eliminate-git-hardcoding

## Motivation

Several places in the codebase hardcode `git` commands instead of going through the `VcsAdapter` port. This prevents specd from working with non-git VCS (hg, svn) in those code paths and duplicates VCS detection logic across the composition layer.

## Current behaviour

- `config-loader.ts` calls `git rev-parse --show-toplevel` directly to find the VCS root for config discovery
- `workspace-integration.ts` in code-graph checks for a `.git/` directory to find the repo root for gitignore resolution
- `actor-resolver.ts` composition duplicates the exact same `git rev-parse --is-inside-work-tree` detection that `vcs-adapter.ts` already performs
- The `VcsAdapter` port has no concept of identity — actor identity resolution is handled by a completely separate port (`ActorResolver`) with its own duplicated VCS detection

## Proposed solution

1. Add `identity(): Promise<VcsIdentity>` (where `VcsIdentity` includes name, email, provider) to the `VcsAdapter` port interface
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

- `core:vcs-adapter-port`: Convert `VcsAdapter` from interface to abstract class; add static `detect()` method returning null by default; update `rootDir()` to return string synchronously; add `identity()` returning `VcsIdentity`
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

- `core:vcs-actor-resolver`: New spec — single `VcsActorResolver` class that receives `VcsAdapter` in constructor and delegates `identity()` to `.identity()`
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

- `core:config-loader`: ConfigLoader port converted from interface to abstract class accepting a VcsAdapter in its constructor; `createConfigLoader` renamed to `createDefaultConfigLoader`; FsConfigLoader updated to extend ConfigLoader
  - Depends on (added): core:vcs-adapter-port
  - Depends on (removed): none

- `core:config`: Update VCS root detection references (".git/" → VcsAdapter) and git repo bounding for config discovery
  - Depends on (added): core:vcs-adapter-port
  - Depends on (removed): none

- `code-graph:indexer`: Use case options (`IndexOptions`) gets optional `vcsRoot` field; `discoverFiles()` gets optional `vcsRoot` option; `findGitRoot` renamed to `findVcsRoot` probing `.git`, `.hg`, `.svn`; add `.hg/` and `.svn/` to the built-in default exclude patterns.
  - Depends on (added): none
  - Depends on (removed): none

- `code-graph:workspace-integration`: Add optional `vcsRoot` to `IndexOptions` and `discoverFiles()`; update `.gitignore` handling to use the provided `vcsRoot` or search síncronamente for `.git`, `.hg`, `.svn` instead of walking up only for `.git/`
  - Depends on (added): none
  - Depends on (removed): none

- `cli:entrypoint`: Update `createConfigLoader` reference to `createDefaultConfigLoader`
  - Depends on (added): none
  - Depends on (removed): none

- `cli:host-context`: Update `createConfigLoader` reference to `createDefaultConfigLoader`
  - Depends on (added): none
  - Depends on (removed): none

- `core:composition`: Update `createConfigLoader` reference to `createDefaultConfigLoader`
  - Depends on (added): none
  - Depends on (removed): none

- `sdk:host-context`: Update `createConfigLoader` reference to `createDefaultConfigLoader`
  - Depends on (added): none
  - Depends on (removed): none

## Impact

### Spec deltas

- `core:vcs-adapter-port` — convert VcsAdapter to abstract class; add static detect(); add identity(); make rootDir() synchronous
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
- `code-graph:indexer` — add optional vcsRoot to IndexOptions; add .hg/ and .svn/ to default excludes
- `code-graph:workspace-integration` — add optional vcsRoot to discoverFiles() and IndexOptions; update .gitignore root discovery
- `cli:entrypoint` — no-op
- `cli:host-context` — no-op

### Code changes

- **core package**:
  - `src/application/ports/vcs-adapter.ts` — convert VcsAdapter to abstract class, add static detect(), add identity(), make rootDir() synchronous
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
  - `src/application/use-cases/index-code-graph.ts` — accept vcsRoot in IndexOptions, pass it to discoverFiles()
- **cli package**:
  - `src/load-config.ts` — update import
- **sdk package**:
  - Re-export `createDefaultConfigLoader`

## Technical context

- `VcsAdapter` is converted to an abstract class: `export abstract class VcsAdapter { constructor(protected readonly cwd: string) {} ... }`
- `VcsAdapter` defines a synchronous `rootDir(): string` method returning the repository root directory
- `VcsAdapter` gets static `detect(cwd: string): Promise<VcsAdapter | null>` returning `null` by default, which concrete subclasses override by resolving the root directory asynchronously and instantiating themselves
- `VcsAdapter` gets `identity(): Promise<VcsIdentity>` (named `identity()`, not `vcsIdentity()`), returning `{ name: string, email: string, provider: string }`
- Concrete VCS adapters (git, hg, svn) accept an optional `rootDir` in their constructors: `constructor(cwd: string, rootDir?: string)`. If `rootDir` is provided, it is stored; otherwise, they fall back to resolving it synchronously (using `gitSync`, `hgSync`, `svnSync`).
- `ActorResolver` port stays separate (identity may come from non-VCS sources like SSO/env vars in the future)
- `VcsActorResolver` implements `ActorResolver` port — receives `VcsAdapter` in constructor, delegates `identity()` to `VcsAdapter.identity()`
- The "Decoupled from VcsAdapter" requirement in `core:actor-resolver-port` is removed/updated; the port remains clean, only `VcsActorResolver` knows about VCS
- `NullVcsAdapter.identity()` returns `{ name: 'unknown', email: '', provider: 'null' }`
- `PrivacyActorResolver` stays as a decorator wrapping `ActorResolver`
- `ConfigLoader` port is converted to a generic abstract class: `export abstract class ConfigLoader<TOptions extends ConfigLoaderOptions = ConfigLoaderOptions> { constructor(protected readonly vcsAdapter: VcsAdapter, protected readonly options: TOptions) {} ... }`
- `ConfigLoaderOptions` is introduced as a base interface for all configuration loader options
- `FsConfigLoader` extends `ConfigLoader<FsConfigLoaderOptions>` (where `FsConfigLoaderOptions` extends `ConfigLoaderOptions`) and receives both `VcsAdapter` and `FsConfigLoaderOptions` in its constructor, passing them to `super(vcsAdapter, options)`
- `createDefaultConfigLoader` (composition) resolves the `VcsAdapter` if not provided in options: `options.vcsAdapter ?? await createVcsAdapter(options.startDir ?? dirname(options.configPath))` and passes it along with the options to the `FsConfigLoader` constructor.

## Open questions

None.
