# Tasks: suggest-implementation-and-spec-deps

## 1. System Cache Infrastructure

- [x] 1.1 Create Clean Architecture cache ports and filesystem adapters
      `packages/sdk/src/domain/value-objects/implementation-suggestion-cache.ts` & `spec-deps-suggestion-cache.ts`: Domain types and stamp value objects.
      `packages/sdk/src/application/ports/implementation-suggestion-cache-port.ts` & `spec-deps-suggestion-cache-port.ts`: Abstract ports for object-oriented cache queries (`get`, `set`, `setMany`, `isSpecFresh`, `findSpecByFile`, `getFileToSpecMap`, `flush`, `invalidate`).
      `packages/sdk/src/infrastructure/fs/fs-implementation-suggestion-cache.ts` & `fs-spec-deps-suggestion-cache.ts`: Filesystem adapters with lazy single-pass load, in-memory bidirectional indexing (`code -> spec`), dirty tracking, and atomic persistence.
      (Req: Clean Architecture Cache Ports & Inverted Indexing)

## 2. SDK Orchestration Use Cases

- [x] 2.1 Implement `SuggestImplementationLinks` use case
      `packages/sdk/src/orchestration/suggest-implementation-links.ts`: `SuggestImplementationLinks` class and `execute(input)` method
      Approach: Pass 1 parses `spec.md` AST code blocks and derives capability naming paths via `SpecRepository.list({ includeMeta: true })`. Pass 2 queries `code-graph` for BM25 symbol search and file matching, resolving canonical workspace paths via `code-graph`'s `getFile`. Mark suggestions with `alreadyIncluded: true/false`. Additive Set Union on `apply: true` skipping already included links.
      (Req: Use Case Interface, Req: 3-Tier Analysis Algorithm, Req: Already-Included Marking, Req: Additive Mutation Semantics)

- [x] 2.2 Implement `createSuggestImplementationLinks` factory overloads
      `packages/sdk/src/orchestration/suggest-implementation-links.ts`: `createSuggestImplementationLinks` and `resolveSuggestImplementationLinksDeps`
      Approach: export 3 factory overloads (explicit deps, config bootstrap with `CompositionResolutionOptions`, and normalized resolution) and dependency resolver helper passing `workspaces` config down.
      (Req: Standard Factory & Composition Overloads)

- [x] 2.3 Implement `SuggestSpecDependencies` use case
      `packages/sdk/src/orchestration/suggest-spec-dependencies.ts`: `SuggestSpecDependencies` class and `execute(input)` method
      Approach: Pass 1 executes `SuggestImplementationLinks.execute({ all: true, apply: false })` dry-run warm-up. Pass 2 traces AST `import` statements and barrel re-exports (`analyzeFileImpact` maxDepth=2). Pass 3 applies `UpdatePersistedSpecDeps` if `apply: true`, executes `ValidateSpecs`, and conditionally creates an alignment change with `.specd-exploration.md` if invalid specs exist and `createAlignmentChange` is enabled.
      (Req: Use Case Interface, Req: Cache Warm-up & 2-Pass Dependency Deduction)

- [x] 2.4 Implement `createSuggestSpecDependencies` factory overloads
      `packages/sdk/src/orchestration/suggest-spec-dependencies.ts`: `createSuggestSpecDependencies` and `resolveSuggestSpecDependenciesDeps`
      Approach: export 3 factory overloads and dependency resolver helper.
      (Req: Standard Factory & Composition Overloads)

- [x] 2.5 Implement Token Affinity Scoring & Primary Symbol Differentiation
      `packages/sdk/src/orchestration/suggest-implementation-links.ts`: `computePathSpecAffinity`
      Approach: evaluate token coverage with regex `[\/\\_\-.:]+` and plural stemming, distinguish exact primary symbols (+200) from derivative symbols (+50), penalize candidates missing distinctive spec tokens (-100), and gate `HIGH` confidence.
      (Req: 3-Tier Analysis Algorithm)

- [x] 2.6 Implement Directional Validation Pass & Direct Recommendation Transitive Reduction
      `packages/sdk/src/orchestration/suggest-spec-dependencies.ts`: Pass 2.5 & Pass 2.6
      Approach: prune inverted dependencies when candidate imports target but target does not import candidate; prune redundant candidate recommendations when another candidate directly depends on it.
      (Req: Cache Warm-up & 2-Pass Dependency Deduction)

- [x] 2.7 Implement Progress Callbacks & Interactive CLI Spinners
      `packages/sdk/src/orchestration/suggest-implementation-links.ts` & `suggest-spec-dependencies.ts`: define `onProgress` callbacks.
      `packages/cli/src/commands/spec/implementation.ts` & `deps.ts`: wire `nanospinner` on `--format text` in TTY environments.
      (Req: Use Case Interface)

## 3. CLI Subcommands

- [x] 3.1 Register `specs implementation suggest` subcommand
      `packages/cli/src/commands/spec/implementation.ts`: `registerSpecImplementation` — add `suggest` subcommand handler
      Approach: map `--spec`, `--all`, `--workspace`, `--apply`, `--confidence`, `--rebuild-cache`, `--format` flags directly to `SuggestImplementationLinksInput`. Display `[already included]` and `[new]` tags in `text` format. Support `text`, `json`, `toon` formatters.
      (Req: Suggest subcommand in cli:spec-implementation)

- [x] 3.2 Register `specs deps suggest` subcommand
      `packages/cli/src/commands/spec/deps.ts`: `registerSpecDeps` — add `suggest` subcommand handler
      Approach: map `--spec`, `--all`, `--workspace`, `--apply`, `--create-change`, `--rebuild-cache`, `--format` flags to `SuggestSpecDependenciesInput`. Log suggested alignment command if invalid specs exist without `--create-change`. Ensure `json` and `toon` formats are strictly non-interactive.
      (Req: Suggest subcommand in cli:spec-deps)

## 4. Automated Testing

- [x] 4.1 Unit tests for `SuggestImplementationLinks`
      `packages/sdk/test/orchestration/suggest-implementation-links.spec.ts`: describe block verifying 2-pass scoring, 2-stage cache HIT, and additive apply
      Approach: test with mock `SpecRepository` and `code-graph` ports. Verify cache hits deterministically by asserting cached output is returned and AST/code-graph calls are skipped on unchanged stamps.

- [x] 4.2 Unit tests for `SuggestSpecDependencies`
      `packages/sdk/test/orchestration/suggest-spec-dependencies.spec.ts`: describe block verifying import tracing, dry-run cache warm-up, post-apply validation, and conditional change creation
      Approach: assert no change creation when `ValidateSpecs` returns `all-valid`.

- [x] 4.3 CLI integration tests for `specs implementation suggest` and `specs deps suggest`
      `packages/cli/test/commands/spec-implementation.spec.ts` and `spec-deps.spec.ts`: integration assertions
      Approach: execute CLI subcommands with `--format json` and `--format toon` and assert output schema.

- [x] 4.4 Automated tests for Token Affinity, Directional Validation & Transitive Reduction
      `packages/sdk/test/orchestration/suggest-spec-dependencies.spec.ts` & `packages/sdk/test/orchestration/suggest-implementation-links.spec.ts`
      Approach: add test suites verifying token affinity calculations, missing distinctive token penalties, inverted port-adapter dependency pruning, and transitive reduction.

- [x] 4.5 Automated tests for onProgress callbacks
      `packages/sdk/test/orchestration/suggest-spec-dependencies.spec.ts` & `suggest-implementation-links.spec.ts`
      Approach: verify sequence of emitted progress events during execution.

## 5. Documentation Updates

- [x] 5.1 Update CLI implementation documentation
      `docs/cli/spec-implementation.md`: add section for `specd specs implementation suggest`
      Approach: document flags (`--apply`, `--confidence`, `--rebuild-cache`), usage examples, and JSON/TOON output fields.

- [x] 5.2 Update CLI spec dependencies documentation
      `docs/cli/spec-deps.md`: add section for `specd specs deps suggest`
      Approach: document flags (`--apply`, `--create-change`, `--rebuild-cache`), post-apply validation behavior, and non-interactive format constraints.

- [x] 5.3 Update CLI main reference index
      `docs/cli/cli-reference.md`: update `spec implementation` and `spec deps` command index tables
      Approach: add `specs implementation suggest` and `specs deps suggest` entry summaries.

## 6. Cache Stamp Size Pre-filter (post-audit hardening)

- [x] 6.1 Expose artifact `size` in core repository contracts
      `packages/core/src`: add `size` to `SpecArtifactEntry` and `ArtifactMeta` value objects, populate from the existing `stat` in `_buildSpec` and `artifactMeta` (no extra I/O); update port types.
      Approach: optional field for adapter-family tolerance; FS adapter always populates it.

- [x] 6.2 Persist stamp `size` in both FS suggestion caches
      `packages/sdk/src/infrastructure/fs/fs-{implementation,spec-deps}-suggestion-cache.ts`: `getSpecStamp` captures `size`; stamps persist it; legacy entries without `size` keep working.
      Approach: optional `size?: number` on stamp VOs; no cache-version bump needed (absence = fallback path).

- [x] 6.3 Implement three-stage freshness check in both caches
      `get()`: (1) size/mtime pre-filter decides without hashing when both match or size differs; (2) content-hash precedence for drifted-mtime/equal-size; (3) timestamp fallback without usable hash.
      Approach: pure function shared per adapter; regression tests for all three stages plus legacy-stamp fallback.

- [x] 6.4 Tests for size pre-filter stages
      Cover: equal lm+equal size → HIT without hash fetch; differing size → MISS; drifted lm + equal size + hash mismatch → MISS; drifted lm + equal size + hash equal → HIT; legacy stamps (no size) unchanged behavior.
      Approach: mock repos exposing artifacts with/without size; assert `artifactMeta` not called on stage-1 hits.

## 7. Shared Cache Plumbing Dedup (refactor)

- [x] 7.1 Extract `write-json-atomic` helper
      `packages/sdk/src/infrastructure/fs/write-json-atomic.ts`: mkdir + temp-with-UUID write + rename, unlinking the temp file when rename fails; both adapters' `flush()` delegate to it.
      Approach: mirror core's internal `writeFileAtomic` semantics; core keeps its own copy (no sdk→core infra dependency).

- [x] 7.2 Extract spec-stamp source and freshness decision
      `packages/sdk/src/infrastructure/fs/spec-stamp-source.ts`: `readSpecStamp(deps, specId)`, `enrichSpecHash(deps, specId, stamp)`; plus pure `decideFreshness(cached, current)` returning fresh | stale | needs-hash. Both adapters delegate; duplicated ~70 lines removed.
      Approach: keep stage-2 enrichment at the call site (async); unit-test the decision function directly across all stage transitions.

- [x] 7.3 Rewire adapters and keep suites green
      Both FS caches consume the new helpers; no behavioral change — full sdk suite passes untouched.
      Approach: pure refactor commit; verify existing regression tests cover all stages.

## 8. Verification-report remediation: architecture and exploration

- [x] 8.1 Move suggestion config wiring into SDK composition
      Add composition modules/resolvers for both suggestion use cases; move concrete `Fs*SuggestionCache`, config-path, and file-observation construction out of `src/orchestration/`; keep canonical `createX(deps)` factories in orchestration and preserve public config facades by delegation.
      (Req: sdk:composition — Suggestion use-case composition; Req: SDK dependency-injected factories)

- [x] 8.2 Add optional exploration to the change repository contract
      Extend `CreateChangeInput` and `ChangeRepository.create` options with optional `explorationContent`; add `ExplorationMeta`, lazy `readExploration` / `writeExploration`, and update repository test doubles without loading exploration content from `get` or list.
      (Req: core:create-change — Optional initial exploration content; Req: core:change-repository-port — Optional exploration metadata and lazy content access)

- [x] 8.3 Implement filesystem exploration persistence
      Let `FsChangeRepository` privately materialize `.specd-exploration.md`, stat it for `ExplorationMeta`, read it only through `readExploration`, write atomically, and clean up first-create partial state when exploration persistence fails.
      (Req: core:fs-change-repository — Filesystem exploration persistence)

- [x] 8.4 Route alignment exploration through `CreateChange`
      Remove direct path/file writes and any `AlignmentChangeWriter`; format invalid-spec failures in `SuggestSpecDependencies` and pass them as `explorationContent` to `CreateChange.execute`.
      (Req: sdk:suggest-spec-dependencies — Pass 3)

## 9. Verification-report remediation: correctness and CLI contract

- [x] 9.1 Enforce apply dependencies before mutation
      Make `ValidateSpecs` mandatory for apply and preflight optional `CreateChange` when `createAlignmentChange` is requested; throw `InvalidInputError` before `UpdatePersistedSpecDeps` on missing collaborators.

- [x] 9.2 Stabilize post-apply and scoring outputs
      On validator exceptions log debug and return `{ status: 'all-valid', invalidSpecs: [] }`; emit the exact `exact-primary-symbol-match` reason token for primary matches.

- [x] 9.3 Register structured help on both CLI leaves
      Add JSON/TOON examples and response shape blocks through the shared `cli:entrypoint` help mechanism for `specs implementation suggest` and `specs deps suggest`.

- [x] 9.4 Add focused regression and boundary tests
      Cover optional/initial exploration, no-content `get`, lazy read, FS cleanup on create failure, config-to-composition delegation, forbidden orchestration filesystem imports, pre-mutation dependency failures, fail-open result shape, exact reason token, and both structured help schemas. Run Core, SDK, CLI, lint, typecheck, and the full verification suite.

## 10. Full compliance follow-up (2026-08-24)

- [x] 10.1 Move `SuggestImplementationLinks` into its application use-case file
      `packages/sdk/src/application/use-cases/suggest-implementation-links.ts`: move the class and canonical `createSuggestImplementationLinks(deps)` factory out of `src/orchestration/`; update imports without retaining a duplicate implementation.
      Approach: the use case depends only on ports; config overloads stay in `src/composition/suggest-implementation-links.ts`.
      (Req: Dependency-injected factory; Req: sdk:composition — Suggestion use-case composition)

- [x] 10.2 Move `SuggestSpecDependencies` into its application use-case file
      `packages/sdk/src/application/use-cases/suggest-spec-dependencies.ts`: move the class and canonical `createSuggestSpecDependencies(deps)` factory out of `src/orchestration/`; update imports without retaining a duplicate implementation.
      Approach: keep one use case per file and leave concrete construction in `src/composition/suggest-spec-dependencies.ts`.
      (Req: Dependency-injected factory; Req: sdk:composition — Suggestion use-case composition)

- [x] 10.3 Correct post-apply validation result interpretation
      `packages/sdk/src/application/use-cases/suggest-spec-dependencies.ts`: replace access to nonexistent `ValidateSpecsResult.issues` with `entries.filter(entry => !entry.passed)` and map each entry's `failures` and `warnings` into diagnostics.
      Approach: derive `all-valid` only when `failed === 0` and no entry fails; create one alignment change containing every failing spec when authorized.
      (Req: Cache Warm-up & 2-Pass Dependency Deduction; scenario: canonical validation entries)

- [x] 10.4 Make validator and mutation failures observable
      `packages/sdk/src/application/use-cases/suggest-spec-dependencies.ts`: remove the fail-open catch and any swallowed update/apply errors.
      Approach: propagate the original `SpecdError` or return an explicit validation-failed result; never translate an exception into `all-valid`.
      (Req: Cache Warm-up & 2-Pass Dependency Deduction; scenario: validator failure remains observable)

- [x] 10.5 Require the file-observation dependency
      `packages/sdk/src/application/use-cases/suggest-implementation-links.ts`: remove the permissive observer fallback and validate `SuggestImplementationLinksDeps.fileObserver` during factory construction.
      Approach: composition supplies the filesystem observer; missing injection throws `InvalidInputError` before analysis.
      (Req: 3-Tier Analysis Algorithm; scenario: missing file observer)

- [x] 10.6 Resolve Tier 1/Tier 2 cascade semantics
      `packages/sdk/src/application/use-cases/suggest-implementation-links.ts`: retain Tier 1 candidates through Tier 2 and short-circuit only Tier 3 when the combined ranked set is non-empty.
      Approach: merge and rank both candidate sets once; do not return a Tier-2-only result.
      (Req: 3-Tier Analysis Algorithm; scenario: Tier 2 retains Tier 1)

- [x] 10.7 Hide concrete SDK filesystem caches from the root API
      `packages/sdk/src/index.ts`: remove root exports for `FsImplementationSuggestionCache` and `FsSpecDepsSuggestionCache` while preserving ports, models, use cases, and composition factories.
      Approach: concrete adapters remain internal or available only through an intentional infrastructure subpath.
      (Req: sdk:composition — Suggestion use-case composition; scenario: root API does not expose concrete filesystem caches)

- [x] 10.8 Return and export the adapter registry port factory
      `packages/code-graph/src/composition/use-cases/create-builtin-adapter-registry.ts` and `packages/code-graph/src/composition/index.ts`: type every overload as `AdapterRegistryPort` and export `createBuiltinAdapterRegistry` from composition.
      Approach: instantiate `AdapterRegistry` privately but expose only its domain port contract.
      (Req: Built-in Adapter Registry Composition Factory & Keyword Discovery)

- [x] 10.9 Reuse the shared FS artifact observation path
      `packages/core/src/infrastructure/fs/spec-repository.ts`: make `artifactMeta` share the existing stat/read/hash helper and keep `includeMeta` as the only list metadata option.
      Approach: one stat supplies `lastModified` and `size`; hashing remains opt-in and has one implementation.
      (Req: Meta observations and specFingerprint on FS; Req: Spec stamp population on get)

- [x] 10.10 Relocate and extend SDK tests
      `packages/sdk/test/application/use-cases/suggest-implementation-links.spec.ts` and `suggest-spec-dependencies.spec.ts`: move tests with the use cases and add canonical validation, propagated failure, required observer, Tier 1/Tier 2, and exact-reason cases.
      Approach: mock ports only; assert update/create calls and absence of direct filesystem dependencies.

- [x] 10.11 Add composition and public-surface regression tests
      `packages/sdk/test/composition/` and `packages/code-graph/test/composition/create-builtin-adapter-registry.spec.ts`: verify SDK composition supplies concrete adapters, SDK root omits them, and Code Graph exposes a port-typed factory through composition.
      Approach: combine runtime export assertions with TypeScript contract assertions.

- [x] 10.12 Add Core repository observation regressions
      `packages/core/test/infrastructure/fs/spec-repository.spec.ts`: assert a single shared observation path, `size`/mtime from one stat, opt-in hashing, and no obsolete `includeMetadataStatus` behaviour.
      Approach: spy on filesystem observation/hash collaborators and exercise `includeMeta` list calls.

- [x] 10.13 Run package and repository verification
      Core, SDK, Code Graph, and CLI test suites plus lint and typecheck: verify every updated scenario and structured help contract.
      Approach: run package suites first, then the repository verification commands; record any environmental failure separately from product failures.

- [x] 10.14 Run manual CLI smoke checks and refresh documentation if output changed
      `docs/cli/spec-implementation.md`, `docs/cli/spec-deps.md`, and `docs/cli/cli-reference.md`: compare documented commands/results with real text, JSON, and TOON output.
      Approach: invoke `node packages/cli/dist/index.js specs implementation suggest --all` and a safe dry-run `specs deps suggest`; update docs only for observable contract changes.

## 11. Compliance follow-up: SDK topology specification (2026-08-25)

- [x] 11.1 Reconcile the SDK layer requirement with the implemented topology
      `deltas/sdk/composition/spec.md.delta.yaml`: `Requirement: Layer structure` — replace the obsolete ban on `application/` and `infrastructure/` with explicit application-to-port and composition-to-infrastructure dependency boundaries.
      Approach: permit `application/use-cases/` and internal `infrastructure/`; require composition as the sole concrete SDK infrastructure construction boundary and retain the curated root-barrel restriction.
      (Req: sdk:composition — Layer structure; Req: sdk:composition — Suggestion use-case composition)

- [x] 11.2 Replace the obsolete layer verification scenario
      `deltas/sdk/composition/verify.md.delta.yaml`: `Requirement: Layer structure` — remove the no-infrastructure assertion and add topology and forbidden-application-import scenarios.
      Approach: assert separate use-case files under `application/use-cases/`, permitted internal infrastructure, and no `node:fs`, concrete adapter, or config-path imports from application modules.
      (Req: sdk:composition — Layer structure)
