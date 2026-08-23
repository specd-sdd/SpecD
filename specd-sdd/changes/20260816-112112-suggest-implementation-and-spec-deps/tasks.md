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
      Approach: test with mock `SpecRepository` and `code-graph` ports. Verify sub-millisecond cache hits on unchanged stamps.

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
