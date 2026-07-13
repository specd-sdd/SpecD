# Tasks: eliminate-git-hardcoding

## 1. VCS Adapter Base and Concrete Implementations

- [x] 1.1 Convert `VcsAdapter` from interface to abstract class
      `packages/core/src/application/ports/vcs-adapter.ts`: `VcsAdapter` — convert interface to abstract class with protected constructor receiving `cwd` and static `detect(cwd)` method
      Approach: update base class to declare constructor, make `rootDir()` return string synchronously, and define `identity(): Promise<VcsIdentity>`
      (Req: Abstract class base, identity resolves version control identity)
- [x] 1.2 Implement synchronous root caching in `GitVcsAdapter`
      `packages/core/src/infrastructure/git/vcs-adapter.ts`: `GitVcsAdapter` — update constructor to accept optional `rootDir` and store it in private field
      Approach: `rootDir()` returns the cached field if present, otherwise executes `git rev-parse --show-toplevel` synchronously using `execSync`
      (Req: Abstract class base)
- [x] 1.3 Implement `identity()` in `GitVcsAdapter`
      `packages/core/src/infrastructure/git/vcs-adapter.ts`: `GitVcsAdapter` — add `identity()` method
      Approach: call `git config user.name` and `git config user.email` to resolve identity, returning `{ name, email, provider: 'git' }`
      (Req: identity resolves version control identity)
- [x] 1.4 Implement `identity()` and caching in `HgVcsAdapter`
      `packages/core/src/infrastructure/hg/vcs-adapter.ts`: `HgVcsAdapter` — update constructor and add `identity()`
      Approach: caching logic same as git; identity runs `hg config ui.username`, parsing `Name <email>` when present and otherwise returning `{ name, email: '', provider: 'hg' }`
      (Req: Abstract class base, identity resolves version control identity)
- [x] 1.5 Implement `identity()` and caching in `SvnVcsAdapter`
      `packages/core/src/infrastructure/svn/vcs-adapter.ts`: `SvnVcsAdapter` — update constructor and add `identity()`
      Approach: caching logic same as git; identity runs `svn info --show-item last-changed-author` and returns `{ name, email: '', provider: 'svn' }`
      (Req: Abstract class base, identity resolves version control identity)
- [x] 1.6 Update `NullVcsAdapter` for synchronous rootDir and identity
      `packages/core/src/infrastructure/null/vcs-adapter.ts`: `NullVcsAdapter` — update `rootDir()` and add `identity()`
      Approach: `rootDir()` throws `Error` immediately; `identity()` resolves to `{ name: "unknown", email: "", provider: "null" }`
      (Req: Null fallback implementation)

## 2. VCS Actor Resolver and Port Refactoring

- [x] 2.1 Create new `VcsActorResolver`
      `packages/core/src/infrastructure/vcs-actor-resolver.ts`: `VcsActorResolver` — implement `ActorResolver` delegating to `VcsAdapter`
      Approach: define class wrapping constructor-injected `VcsAdapter` and calling `vcsAdapter.identity()` in `identity()`
      (Req: Implementation of ActorResolver port)
- [x] 2.2 Remove deprecated actor resolvers
      `packages/core/src/infrastructure/git/actor-resolver.ts`, `packages/core/src/infrastructure/hg/actor-resolver.ts`, `packages/core/src/infrastructure/svn/actor-resolver.ts`: Remove files
      Approach: delete files; these are no longer needed as `VcsActorResolver` generalizes them
      (Req: Deprecated)
- [x] 2.3 Refactor actor resolver composition factory
      `packages/core/src/composition/actor-resolver.ts`: `createVcsActorResolver` — change signature and factory instantiation
      Approach: accept `VcsAdapter` in `createVcsActorResolver(vcsAdapter)`, instantiate `VcsActorResolver` wrapping it, or return `NullActorResolver` when the adapter is `NullVcsAdapter`
      (Req: VCS adapter composition)
- [x] 2.4 Update composition resolver wiring
      `packages/core/src/composition/composition-resolver.ts`: `resolveActorResolver` — wiring
      Approach: pass resolved `vcsAdapter` to `createVcsActorResolver`
      (Req: VCS adapter composition)

## 3. Config Loader and CWD Bounding

- [x] 3.1 Update config loader constructor to accept `rootPath`
      `packages/core/src/infrastructure/fs/config-loader.ts`: `FsConfigLoader` — update constructor and bounds checks
      Approach: inject resolved `rootPath` data and use it for boundary checks instead of walking/detecting git directly
      (Req: Factory signature and return type, Storage path containment)
- [x] 3.2 Update config loader composition entrypoint
      `packages/core/src/composition/config-loader.ts`: Rename `createConfigLoader` to `createDefaultConfigLoader`
      Approach: resolve `VcsAdapter` only to derive `rootPath`, then instantiate `FsConfigLoader` with that boundary
      (Req: Factory signature and return type)
- [x] 3.3 Update CLI config loader imports
      `packages/cli/src/load-config.ts`: Update import references
      Approach: change `createConfigLoader` to `createDefaultConfigLoader`
      (Req: Factory signature and return type)
- [x] 3.4 Update SDK host context imports
      `packages/sdk/src/composition/host-context.ts`: Update import references
      Approach: change `createConfigLoader` to `createDefaultConfigLoader`
      (Req: openSpecdHost)

## 4. Code Graph and File Discovery

- [x] 4.1 Update `discoverFiles` and index options
      `packages/code-graph/src/application/use-cases/discover-files.ts`: `discoverFiles` — add `vcsRoot` option and update walk boundary
      Approach: accept adapter-resolved `vcsRoot: string | null` in options; use it to bound path walk and resolve `.gitignore` files without local repository-marker probing, with `null` passed explicitly outside VCS
      (Req: Multi-workspace file discovery, .gitignore handling for codeRoot)
- [x] 4.2 Update workspace integration to forward `vcsRoot`
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: `indexCodeGraph` — pass `vcsRoot` to discovery
      Approach: derive `vcsRoot` from `VcsAdapter.rootDir()` in the indexing flow and forward `string | null` to `discoverFiles()` without omission
      (Req: WorkspaceIndexTarget)

## 5. Tests

- [x] 5.1 Add tests for `VcsActorResolver`
      `packages/core/test/infrastructure/vcs-actor-resolver.spec.ts`: New test file
      Approach: verify interface implementation and delegation to `VcsAdapter` mock
      (Req: Implementation of ActorResolver port)
- [x] 5.2 Update `GitVcsAdapter` tests
      `packages/core/test/infrastructure/git/vcs-adapter.spec.ts`: `GitVcsAdapter` tests
      Approach: test identity resolution and synchronous root caching
      (Req: identity resolves version control identity)
- [x] 5.3 Add `HgVcsAdapter`, `SvnVcsAdapter`, and `NullVcsAdapter` tests
      `packages/core/test/infrastructure/hg/vcs-adapter.spec.ts`, `packages/core/test/infrastructure/svn/vcs-adapter.spec.ts`, `packages/core/test/infrastructure/null/vcs-adapter.spec.ts`: adapter tests
      Approach: cover Mercurial parsing rules, Subversion last-changed-author identity mapping, and null adapter sentinel behavior
      (Req: identity resolves version control identity, Null fallback implementation)
- [x] 5.4 Update `createVcsAdapter` and actor-resolver composition tests
      `packages/core/test/composition/vcs-adapter.spec.ts`, `packages/core/test/composition/actor-resolver.spec.ts`: composition tests
      Approach: cover built-in probe order, null fallback behavior, custom provider precedence, and lazy actor resolution through `VcsAdapter`
      (Req: VCS adapter composition)
- [x] 5.5 Update config loader tests
      `packages/core/test/infrastructure/fs/config-loader.spec.ts`: `FsConfigLoader` tests
      Approach: update tests to pass `rootPath` directly and keep VCS adapter mocking limited to `createDefaultConfigLoader` factory tests
      (Req: Storage path containment)
- [x] 5.6 Update CLI and SDK host-context tests
      `packages/cli` tests and `packages/sdk/test/composition/host-context.spec.ts`: bootstrap tests
      Approach: cover `createDefaultConfigLoader` imports, forced/discovery mode wiring, and host bootstrap alignment
      (Req: Factory signature and return type, openSpecdHost)
- [x] 5.7 Update discover-files and workspace-indexing tests
      `packages/code-graph/test/application/use-cases/discover-files.spec.ts`: `discoverFiles` tests
      `packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts`: indexing tests
      Approach: add test cases for adapter-resolved root boundaries, explicit `vcsRoot: null`, gitignore resolution, forwarding through indexing, and absence of local repository-marker probing
      (Req: .gitignore handling for codeRoot, WorkspaceIndexTarget)

## 6. Manual Verification

- [x] 6.1 Verify project status and graph index E2E
      `manual`: Verify `node packages/cli/dist/index.js project status --format toon` and `node packages/cli/dist/index.js graph index --format toon` work under VCS and non-VCS directories
      Approach: run the CLI entrypoints directly and verify no errors are thrown during VCS detection, actor resolution, config loading, or code-graph root propagation
