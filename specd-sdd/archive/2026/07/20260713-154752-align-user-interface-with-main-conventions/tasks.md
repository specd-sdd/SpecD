# Tasks: align-user-interface-with-main-conventions

## 1. Merge baseline

- [x] 1.1 Merge `main` into the feature branch
      Git worktree: merge commit — bring post-2026-07-03 mainline changes into the branch
      Approach: run a normal `git merge main`; do not copy selected main files or recreate incoming commits manually, and do not accept wholesale deletions of branch-only Studio workspaces, specs, metadata ownership, or package manifests
      (Req: preserve branch-only behavior)
- [x] 1.2 Classify and resolve non-generated merge conflicts
      Core, SDK, CLI, API, client, desktop, and package files — choose mainline composition while retaining branch-only capabilities
      Approach: keep cleanly merged files unchanged; resolve only conflict markers by using incoming mainline composition as the base and porting branch-only behavior onto it; defer generated hashes and lock artifacts
      (Req: resolver-based canonical composition)
- [x] 1.3 Finish and record the resolved merge before convention follow-up edits
      Git index and merge state — create the merge result that contains conflict resolutions
      Approach: verify no unmerged paths remain and commit the merge boundary before making separate branch-alignment edits when repository policy permits separate commits
      (Req: normal merge provenance)
- [x] 1.4 Preserve branch-only spec and workspace files
      `specs/api`, `specs/client`, `specs/studio-desktop`, `specs/ui`, Studio apps and packages — reject mainline deletions caused only by branch topology
      Approach: compare each deletion against the branch capability list before staging
      (Req: preserve API, client, desktop, and UI contracts)

## 2. Core composition

- [x] 2.1 Resolve the kernel conflict on top of main's composition resolver
      `packages/core/src/composition/kernel.ts`: `createKernel` — retain branch-only kernel groups while accepting main's resolver model
      Approach: use the incoming `CompositionResolver` unchanged and wire only the UI branch capabilities missing from main
      (Req: Composition Layer, Kernel construction)
- [x] 2.2 Wire branch-only factories into the resolved kernel
      `packages/core/src/composition/kernel.ts`: Studio artifact, batch-validation, and log groups — expose retained use cases
      Approach: reuse resolver-returned instances so standalone and kernel factories receive equivalent dependencies
      (Req: Kernel, Composition Layer)
- [x] 2.3 Reconcile core public exports
      `packages/core/src/composition/index.ts`, `packages/core/src/index.ts` — export resolver, registries, default loader, repository factories, and retained branch factories
      Approach: remove exports for kernel internals and graph-store APIs; preserve named ESM exports and public JSDoc
      (Req: Coding Conventions, Composition Layer)
- [x] 2.4 Update kernel integration tests
      `packages/core/test/composition/kernel.spec.ts` and branch capability tests — verify main's resolver plus UI branch groups
      Approach: assert retained use cases are exposed and share resolver dependencies without testing main-owned internals again
      (Req: Kernel, Composition Layer)

## 3. Configuration and VCS

- [x] 3.1 Adopt the async default config loader factory
      `packages/core/src/composition/config-loader.ts`: `createDefaultConfigLoader` — use VCS detection before constructing `FsConfigLoader`
      Approach: await `createVcsAdapter`, pass its root or null, and preserve forced/discovery modes
      (Req: Config Loader)
- [x] 3.2 Remove Git commands from filesystem config discovery
      `packages/core/src/infrastructure/fs/config-loader.ts`: `FsConfigLoader` — consume the injected root boundary
      Approach: remove `git rev-parse` execution; walk only to the supplied VCS root and support null-VCS discovery
      (Req: Config Loader, Config)
- [x] 3.3 Align structured adapter configuration
      `packages/core/src/application/specd-config.ts`, config parsing — retain mainline normalized adapter bindings and warnings
      Approach: preserve compatibility normalization at the loader boundary and opaque non-fs adapter config
      (Req: Config)
- [x] 3.4 Test merged config behavior
      `packages/core/test/infrastructure/fs/config-loader.spec.ts` and config tests — cover branch config compatibility on main's loader
      Approach: verify forced/discovered modes, warnings, and structured bindings without adding new VCS behavior
      (Req: Config Loader, Config)

## 4. Branch-only core factories

- [x] 4.1 Port change artifact read factories
      `get-change-artifact.ts`, `get-read-only-change-artifact.ts` — add dependency-first constructors and resolver-backed convenience factories
      Approach: inject change/read-only repositories; preserve missing-artifact and immutable-view behavior
      (Req: Get Change Artifact, Get Read Only Change Artifact)
- [x] 4.2 Port artifact save factory
      `packages/core/src/composition/use-cases/save-change-artifact.ts` — compose repository and content hashing through resolver dependencies
      Approach: preserve optimistic revision checks and artifact hash updates
      (Req: Save Change Artifact)
- [x] 4.3 Port artifact outline factory
      `packages/core/src/composition/use-cases/outline-change-artifact.ts` — inject parser registry and artifact reader
      Approach: compose the existing use case without filesystem construction inside the factory
      (Req: Outline Change Artifact)
- [x] 4.4 Port batch validation factory
      `packages/core/src/composition/use-cases/validate-change-batch.ts` — compose the canonical validator through resolver dependencies
      Approach: preserve per-spec/per-artifact result aggregation and warnings
      (Req: Validate Change Batch, Validate Specs)
- [x] 4.5 Port log readback factory
      `packages/core/src/composition/use-cases/read-log.ts` — map branch log-ring behavior onto mainline logging destinations
      Approach: retain in-memory-only readback and reject arbitrary filesystem paths
      (Req: Read Log)
- [x] 4.6 Port context factories
      `get-project-context.ts`, `get-spec-context.ts`, `validate-specs.ts` — use resolver repositories, parsers, hashes, files, and validation services
      Approach: keep output, fingerprint, workspace routing, and dependency traversal unchanged
      (Req: Get Project Context, Get Spec Context, Validate Specs)
- [x] 4.7 Add branch-factory equivalence tests
      `packages/core/test/composition/use-cases/` — verify standalone factories and kernel groups share behavior
      Approach: execute both paths against identical fake dependencies and compare results/errors
      (Req: all branch-only core factory requirements)

## 5. Code graph and SDK

- [x] 5.1 Preserve Electron graph composition against main's provider contract
      `packages/code-graph-electron/src/composition/` — expose a factory compatible with `CodeGraphProvider`
      Approach: retain Electron SQLite runtime and lifecycle while matching the host provider contract
      (Req: Code Graph Electron Composition)
- [x] 5.2 Reconcile SDK re-exports for retained branch capabilities
      `packages/sdk/src/core-reexports.ts`, `packages/sdk/src/index.ts` — expose UI-required core factories after the merge
      Approach: accept main's host/orchestration exports unchanged and add only exports for branch-owned capabilities
      (Req: SDK Composition)

## 6. CLI migration

- [x] 6.1 Update CLI config loading
      `packages/cli/src/load-config.ts`, `packages/cli/src/index.ts` — await `createDefaultConfigLoader`
      Approach: print each `config.warnings` entry once and preserve `--config` and no-subcommand behavior
      (Req: CLI Entrypoint)
- [x] 6.2 Update CLI entrypoint dependencies and tests
      `packages/cli/package.json`, entrypoint tests — reconcile imports affected by the merged loader API
      Approach: retain only dependencies required by actual imports and test warnings, discovery, and no-subcommand behavior
      (Req: CLI Entrypoint)

## 7. Canonical project status

- [x] 7.1 Add structural project-status input types
      `packages/client/src/dto/project-status.ts`: `ProjectStatusGraphInput`, `ProjectStatusMapperInput` — define serializable input without core/SDK types
      Approach: include counts, optional workspace counts, graph diagnostics, approvals, and required auth type
      (Req: client DTO matches API wire shape)
- [x] 7.2 Implement `mapProjectStatusDto`
      `packages/client/src/dto/project-status.ts`: mapper — construct the canonical DTO deterministically
      Approach: clone records, derive warnings with the existing helper, omit unavailable graph, preserve nullable diagnostics, copy approvals, and always emit auth
      (Req: client project status graph includes warnings, types are shared or generated from API schemas)
- [x] 7.3 Export mapper and input types
      `packages/client/src/dto/index.ts`, `packages/client/src/index.ts` — expose named public API with JSDoc
      Approach: use type exports for interfaces and value export for the mapper
      (Req: client DTO canonical ownership)
- [x] 7.4 Add client mapper and architecture tests
      `packages/client/test/project-status.spec.ts` and package-boundary tests — cover full, absent graph, nullable fields, immutability, determinism, and forbidden imports
      Approach: table-driven structural fixtures and source/dependency assertions
      (Req: ProjectStatusDto parity and dependency neutrality)

## 8. API host and presenter

- [x] 8.1 Bootstrap API with main-owned composition primitives
      `packages/api/src/composition/create-api-server.ts`: `createApiServer` — update the branch-specific API host for main's async loader
      Approach: await `createDefaultConfigLoader({ startDir: projectRoot })`, load the complete active cascade once, call `createSdkContext` once, and preserve log ring, plain formatter, config warnings, auth, CORS, static UI, Swagger, and error handling
      (Req: Composition Create API Server, Studio host bootstrap)
- [x] 8.3 Preserve API project log readback
      API server state and project log routes — retain the branch-owned in-memory log ring after host adaptation
      Approach: keep in-memory-only readback and existing route behavior
      (Req: Routes Project Logs)
- [x] 8.4 Replace API-local project-status DTO mapping
      `dto/project-status.ts`, `presenters/presenter-project.ts`, `handlers/handler-project.ts` — delegate to client mapper and pass effective auth
      Approach: re-export the canonical type, adapt snapshot structurally, and remove `toProjectGraphSummaryDto`
      (Req: Dto Project Status, Presenter Project, Handler Project)
- [x] 8.5 Align project-status OpenAPI
      `packages/api/src/delivery/http/openapi-schemas.ts` — describe required auth and optional workspace, graph, and approval sections
      Approach: match mapper omission/nullability semantics exactly
      (Req: Dto Project Status)
- [x] 8.6 Add API host and status tests
      `packages/api/test/project.spec.ts`, `logs.spec.ts`, graph/static/OpenAPI tests — verify one host and canonical status
      Approach: cover auth, config warnings, graph present/absent, diagnostics, approvals, workspace counts, logs, and schema validation
      (Req: API server composition, DTO, handler, and project status presenter)

## 9. Desktop host and IPC

- [x] 9.1 Align desktop-owned host composition with main APIs
      `apps/specd-studio-desktop/src/main/ipc-handlers.ts`: `getHost`, `DesktopHostContext`, `toSdkHostContext` — retain a typed desktop wrapper and remove the SDK cast
      Approach: await `createDefaultConfigLoader({ startDir: activeProjectRoot })`, load the complete active cascade, call `createSdkContext` once with log options, compose Electron providers locally, and delete `toSdkHostContext`
      (Req: one kernel per open local project, SDK kernel access in IPC handlers)
- [x] 9.2 Route desktop graph operations through host providers
      `ipc-handlers.ts`: `withGraphProvider` and graph handlers — use `host.createGraphProvider`
      Approach: track each provider, open once, close in `finally`, and keep renderer on `SpecdDataPort`
      (Req: graph IPC methods use the Electron graph runtime)
- [x] 9.3 Preserve project-switch teardown
      `ipc-handlers.ts`, `apps/specd-studio-desktop/src/main/index.ts` — retain generation cancellation and dispose old state
      Approach: close tracked providers before clearing host/log state and reject superseded results
      (Req: project switch tears down kernel and graph state)
- [x] 9.4 Replace desktop project-status mapper
      `ipc-handlers.ts`: local status functions and `getProjectStatus` case — call `mapProjectStatusDto`
      Approach: remove local graph/status mapping and pass snapshot fields plus config auth type
      (Req: project status uses the canonical client mapper)
- [x] 9.5 Preserve desktop runtime and logging wiring
      Desktop package scripts, tsup config, and kernel options — keep Electron SQLite rebuild, CJS externalization, launch environment, and plain logs
      Approach: reconcile package changes without retargeting desktop to standard code-graph
      (Req: desktop startup, Electron launch, bundled main entry, plain-text logs)
- [x] 9.6 Add desktop host, graph, switch, and parity tests
      `apps/specd-studio-desktop/test/` — verify selected-root host, one kernel, desktop-owned Electron provider, cleanup, no cast, supersession, and canonical status
      Approach: fake SDK/provider boundaries and compare status against the shared/API fixture
      (Req: Main Kernel Lifecycle, IPC Handler Registry)

## 10. Documentation and generated artifacts

- [x] 10.1 Reconcile package manifests and lockfile
      Workspace `package.json` files, TypeScript references, `pnpm-lock.yaml` — align imports and dependency direction
      Approach: run pnpm install after manifest edits; keep Electron native dependencies isolated
      (Req: Architecture, Coding Conventions)
- [x] 10.2 Regenerate spec locks and metadata
      `specd.yaml`, `spec-lock.json`, metadata directories — refresh derived artifacts from the merged owned spec tree
      Approach: use specd metadata/graph tooling; do not hand-merge stale hashes or delete Studio metadata wholesale
      (Req: spec layout and metadata consistency)

## 11. Verification

- [x] 11.1 Run core tests
      `@specd/core` test suite — verify composition, config, VCS, factories, lifecycle, context, validation, and logs
      Approach: fix failures at the resolver/factory layer before continuing
- [x] 11.2 Run SDK and Electron graph tests
      `@specd/code-graph-electron`, `@specd/sdk` suites — verify provider ownership and host lifecycle on the merged host boundary
      Approach: include cleanup-on-error and injected-provider scenarios; keep standalone `@specd/code-graph` coverage tracked separately after the host-context parity repair
- [x] 11.3 Run CLI tests
      `@specd/cli` suite — verify async config loading, warnings, status, graph commands, and locks
      Approach: run after core/SDK are green to isolate delivery regressions
- [x] 11.4 Run client and API tests
      `@specd/client`, `@specd/api` suites — verify canonical status and server behavior
      Approach: use the same project-status fixture for mapper, HTTP, and OpenAPI assertions
- [x] 11.5 Run desktop tests
      `@specd/studio-desktop` suite — verify SDK host, Electron graph, switch cleanup, IPC, and status parity
      Approach: include success, provider failure, and superseded-session cases
- [x] 11.6 Run repository lint and build
      Root workspace — type-check package boundaries and build all production artifacts
      Approach: run `pnpm lint` then `pnpm build`; resolve errors without restoring obsolete APIs
- [x] 11.7 Validate specs and refresh graph
      Specd CLI — validate specs, generate required metadata, and reindex code graph
      Approach: use built CLI commands and confirm graph freshness after all source changes
- [x] 11.8 Smoke-test CLI discovery
      Repository root and nested directory — run project/graph status
      Approach: confirm identical config resolution and one emission per config warning
- [x] 11.9 Smoke-test API status
      Running API — request `GET /v1/project/status` and OpenAPI JSON
      Approach: verify auth, optional graph semantics, diagnostics, specs, approvals, and schema conformance
- [x] 11.10 Smoke-test desktop project switching
      Electron desktop — open a non-cwd project, run graph operations, switch projects, and inspect status/logs
      Approach: verify no cross-project paths/results, no leaked provider, plain logs, and HTTP/IPC status parity
- [x] 11.11 Run standalone code-graph tests after host-context parity repair
      `@specd/code-graph` suite — verify the shared graph package still passes independently of the Electron-specific host path
      Approach: run the standalone package suite after the repaired `sdk:host-context` spec/verify parity so graph-only failures are isolated from API and desktop bootstrap work
      (Req: Code Graph Electron Composition)
