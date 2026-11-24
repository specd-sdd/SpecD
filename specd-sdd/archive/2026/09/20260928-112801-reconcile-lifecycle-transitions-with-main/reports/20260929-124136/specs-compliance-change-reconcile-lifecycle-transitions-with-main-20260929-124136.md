# Specs compliance audit — reconcile-lifecycle-transitions-with-main

- Mode: delegated change audit
- Verification attempt: `verification-attempt-2`
- Timestamp: 2026-09-29 12:41:36 Europe/Madrid
- Scope: 15 change specs plus direct dependencies and project-wide constraints
- Result: PASS with 1 low-severity test-convention advisory

## Aggregate summary

- Specs audited: 15
- Requirements audited: 231
- Scenarios reviewed: 661
- Conformant requirements: 231
- Partial or non-conformant requirements: 0
- Product/spec discrepancies: 0
- Missing behavioral tests: 0
- Advisories: 1
- Full repository test tasks: 24/24 passed

## Advisory

The unit test `packages/code-graph/test/application/use-cases/index-project-graph.spec.ts` constructs a partial `CodeGraphHostPort` mock through `as unknown as CodeGraphHostPort`. Behavior is covered and passes, but this is weaker than the complete typed-port mock convention required by `default:_global/testing`.

## Detailed findings

# Compliance audit — core lifecycle and CLI transition

Delegated verification attempt: `verification-attempt-2`

## Scope and method

- Change: `reconcile-lifecycle-transitions-with-main`
- Merged specs audited: `core:hook-execution-model`, `core:change`, `core:change-manifest`, `core:transition-change`, `core:run-step-hooks`, `core:change-repository-port`, `cli:change-transition`
- Scope size: 140 requirements and 393 verification scenarios.
- The merged view for every spec was obtained with `changes spec-preview`; raw deltas were not treated as the final contract.
- Graph freshness was checked first (`stale: false`, complete coverage). Graph search and spec impact were used to identify the implementation and test surfaces. All seven specs have CRITICAL transitive impact, so the audit covered domain, application, composition, filesystem persistence, hook infrastructure, and CLI presentation boundaries.
- Binding project constraints reviewed: hexagonal ownership, strict TypeScript/ESM conventions, actionable error handling, cross-platform testing, and Vitest test separation. Direct dependency contracts were also checked, particularly lifecycle-engine/transition-checks, schema-format/workflow-model, hook runner ports, storage/change-layout, repository base, GetStatus, and CLI entrypoint conventions.

## Requirements summary

| Spec                          | Requirements | Scenarios | Status        |
| ----------------------------- | -----------: | --------: | ------------- |
| `core:hook-execution-model`   |           12 |        41 | Compliant     |
| `core:change`                 |           30 |       103 | Compliant     |
| `core:change-manifest`        |            9 |        23 | Compliant     |
| `core:transition-change`      |           29 |        69 | Compliant     |
| `core:run-step-hooks`         |           16 |        31 | Compliant     |
| `core:change-repository-port` |           29 |        78 | Compliant     |
| `cli:change-transition`       |           15 |        48 | Compliant     |
| **Total**                     |      **140** |   **393** | **Compliant** |

## Implementation status and coverage

### `core:hook-execution-model`

The three hook forms, passive instruction behavior, explicit external dispatch, binding-driven phase/failure policy, skip selectors, ordering, and template expansion are implemented across `RunStepHooks`, transition/archive effect checks, schema validation, the node hook runner, and composition wiring. Transition effects execute before persistence with abort semantics; archive post effects collect after persistence. Instruction hooks are excluded from runtime execution and external hooks require a compatible registered runner. Tests cover shell/external/instruction discrimination, accepted-type selection and missing-runner errors, pre fail-fast and post fail-soft behavior, source-post/target-pre ordering, redesign/backward filtering, archive timing, template variables and host quote translation.

### `core:change`

The entity and supporting domain services implement identity and Windows-name guards, immutable spec/workspace-derived scope, the canonical lifecycle graph and drain-only parked states, neutral designing self-entry at the use-case boundary, approval/signoff projections, state-independent verification attempts, artifact/file drift, append-only history, implementation tracking, drafting/discarding, archive outcomes, schema-version history, task scope, and validity fingerprints. Lifecycle interpretation and dependency-aware reconciliation remain outside the entity, preserving the architecture contract. Domain and use-case tests cover the merged scenarios, including scope-aware consent, stale/current verification, exact invalidation projections, per-file drift, removed/resurrected tracked files, historical implementation guards, archive recovery, and task-artifact exclusion.

### `core:change-manifest`

Manifest serialization preserves native-v2 projections, legacy-v1 adaptation, strict future-version rejection, scoped approvals, verification attempt events, invalidation detail, filenames and tracked representation intent, fingerprints, and archive-failure history. Filesystem persistence uses serialized mutation and atomic manifest publication; normalization refuses representation-changing rewrites. Repository/loader tests exercise v1/v2 compatibility, round trips, future versions, filenames, fingerprints, attempt auditability, and atomic history persistence.

### `core:transition-change`

`TransitionChange` owns refresh/reconciliation/check/effect/persistence orchestration without manufacturing verification evidence. Approval policy is fixed at construction, pending states remain repair/drain paths, `to: 'next'` is resolved in Core, workflow and task requirements are predicates, implementation tracking activates on entry, and effect execution is selected by binding semantics. State persistence is serialized through repository mutation. Tests cover missing/schema errors, every relevant lifecycle direction, approval gates, canonical recovery, task/requires failures, hook ordering/failure/skip behavior, progress events, redesign/backward invalidation, post-hook refresh, implementation tracking checks, verification evidence preservation, and composition dependency resolution.

### `core:run-step-hooks`

The shared engine loads active or archived changes as specified, validates schema identity and step names, collects schema/project hooks in stable order, excludes instruction hooks, dispatches shell and explicit external hooks, supports `only`, constructs variables without singular workspace semantics, relays output/heartbeat progress, and returns complete fail-fast/fail-soft result shapes. Unit and infrastructure tests cover every requirement, including archived post fallback and progress before failure.

### `core:change-repository-port`

The port and filesystem adapter conform to the repository abstraction and read-model separation. Serialized `mutate`/`mutateDraft` windows prevent partial writes, hydrate fresh facts without deciding validity, reject wrong storage buckets, preserve ordering and cached list projections, enforce optimistic concurrency and tracked-file/path confinement, expose storage paths appropriately, and implement scaffold/unscaffold/delete/reindex contracts. The filesystem repository and manifest loader suites cover active/draft/discarded separation, mutation serialization/rollback, future manifest rejection, drift hydration, list buckets/counts, artifact confinement, concurrency, path access, and cleanup behavior.

### `cli:change-transition`

The CLI delegates lifecycle resolution and refresh policy to Core, parses explicit/`--next` targets and skip selectors, omits approval overrides, reports canonical blockers/next actions, preserves the transition progress stream boundary, maps hook failures to exit code 2 without a repair guide, and emits stable text/structured terminal results. CLI tests cover argument errors, all gate and parked-state routes, forwarding semantics, repair guidance, incomplete tasks, hook progress/liveness/history, structured stream records, skip selectors, and failure visibility.

## Test evidence

- Focused domain/application/repository/CLI batch: **9 files, 445 tests passed**.
- Expanded hook/archive/infrastructure/presentation batch: **7 files, 143 tests passed**.
- Combined audit evidence: **16 test files, 588 tests passed, 0 failed**.
- The selected tests include real temporary-filesystem integration coverage for persistence and infrastructure-level hook runner coverage, consistent with the global testing contract.

## Discrepancies

No implementation/spec discrepancy was found in this batch. No contradictory requirement was found between the merged change specs, their direct dependencies, or the applicable global constraints.

## Missing or insufficient tests

None identified. Each requirement has direct scenario coverage or is an architectural/typing constraint exercised through its owning implementation and integration tests. The previously relevant hook, lifecycle, manifest, repository, transition, and progress boundaries all have executable evidence.

## Spec dependency chain

- Hook semantics flow from `schema-format`, `workflow-model`, hook runner ports, and `transition-checks` into `run-step-hooks`, transition/archive effects, and CLI commands.
- Lifecycle state and persisted projections flow from `change` into `change-manifest`, `change-repository-port`, `lifecycle-engine`, `transition-change`, status, and CLI presentation.
- Repository behavior conforms to `repository-port`, `storage`, `change-layout`, read-only views, and the manifest contract.
- CLI transition behavior conforms to Core transition/status outputs and does not duplicate lifecycle interpretation.
- No dependency inversion or Core-to-adapter coupling violation was observed.

## Summary counts

- Specs audited: **7**
- Requirements audited: **140**
- Scenarios reviewed: **393**
- Compliant requirements: **140**
- Partial requirements: **0**
- Non-compliant requirements: **0**
- Discrepancies: **0**
- Missing-test findings: **0**
- Advisory findings: **0**

---

# Partial compliance audit — storage and code graph

Delegated verification attempt: `verification-attempt-2`

Scope:

- `core:fs-change-repository`
- `code-graph:indexer`
- `code-graph:index-project-graph`

Merged artifacts were read with `changes spec-preview`; implementation discovery used the current code graph (`stale: false`). Direct dependencies and the global architecture/testing constraints were reviewed. No verification attempt command was run by this audit.

## Requirements summary

| Spec                             | Requirements | Verification scenarios | Implemented |                    Discrepancies |
| -------------------------------- | -----------: | ---------------------: | ----------: | -------------------------------: |
| `core:fs-change-repository`      |           11 |                     29 |          11 |                                0 |
| `code-graph:indexer`             |           24 |                     97 |          24 |                                0 |
| `code-graph:index-project-graph` |            4 |                      7 |           4 |                                0 |
| **Total**                        |       **39** |                **133** |      **39** | **0 product/spec discrepancies** |

## Detailed findings

### `core:fs-change-repository`

Implementation status: compliant.

- **Validate options at construction** — implemented by the filesystem repository/config boundary; constructor validation and missing-directory behavior are covered by repository/config tests.
- **Storage factory registration** — the factory forwards context and config into `FsChangeRepository`; covered by composition/repository tests.
- **FsChangeIndexCache helper** — bucket-specific caches own active/draft/discarded list, count and rebuild behavior with canonical ordering; covered by change-repository and cache tests.
- **Revision timestamp serialization and backward compatibility** — manifest serialization and legacy history-derived timestamps are covered by manifest/repository tests.
- **Index helper mutate and lock** — `FsIndexCache.mutate()` serializes writers and releases its mutex in `finally`; atomic publishing uses temp files and rename. The new fault-injection test proves that failure during the second (meta) publish surfaces the original error, leaves no temp files, permits a coherent rebuild, and releases the lock for a following upsert.
- **Index freshness model** — invalidation, mtime mismatch and age-independent freshness paths are explicitly covered in `fs-index-cache-base.spec.ts`.
- **Write-path index maintenance** — upsert/remove/no-op projection behavior and list-index maintenance are covered by cache and repository integration tests.
- **create delegates to internal first persist** — cross-bucket collision and first-persist behavior are covered by repository tests.
- **mutate and mutateDraft reconcile after persist** — post-write hydration/reconciliation is exercised by repository mutation tests.
- **saveArtifact requires mutate window and does not touch Change** — rejection outside the window and byte-only writes inside it are covered by repository tests.
- **Windows path containment and rename recovery** — `isPathInside()` applies Windows path semantics and rejects prefix collisions; `moveDir()` falls back on `EPERM`/`EXDEV`; `retryOnLock()` retries `EPERM`, `EBUSY`, and `EACCES` exactly five attempts and rethrows the original object. The new parameterized test closes the previous error-code evidence gap.

Relevant evidence:

- `packages/core/src/infrastructure/fs/fs-index-cache-base.ts`
- `packages/core/src/infrastructure/fs/path-platform.ts`
- `packages/core/src/infrastructure/fs/move-dir.ts`
- `packages/core/test/infrastructure/fs/fs-index-cache-base.spec.ts`
- `packages/core/test/infrastructure/fs/path-platform.spec.ts`
- `packages/core/test/infrastructure/fs/move-dir.spec.ts`
- broader `change-repository.spec.ts` and manifest/config suites

No contradiction was found with `core:storage`, `core:change-list-entry`, `core:change-repository-port`, or `default:_global/architecture`. The generic cache remains infrastructure-level and the repository/port boundary is preserved.

### `code-graph:indexer`

Implementation status: compliant.

The 24 merged requirements were each traced to `IndexCodeGraph`, its adapter/store ports, SQLite integration, and the existing indexer suite:

1. **IndexCodeGraph use case** — the application use case owns discover/diff/extract/spec/store/clean/ref orchestration through ports.
2. **Incremental indexing** — content and graph fingerprints select new/changed/deleted/skipped work and full rebuild escalation.
3. **Deterministic implementation coverage projection** — repository-backed implementation facts create deterministic file/symbol coverage without guessed symbol links.
4. **Discovery fingerprint uses effective config** — effective include/exclude/workspace inputs participate in derivation freshness.
5. **Adapter-sourced resolution fingerprint** — adapter-provided resolution manifests are included without indexer-owned manifest parsing.
6. **Multi-workspace file discovery** — workspace ownership and project-global discovery are normalized and deduplicated.
7. **Portable graph paths** — persisted graph identities use workspace-prefixed portable paths.
8. **Binary file filtering** — unsupported binary/NUL content is excluded while supported textual encodings become documents.
9. **Bounded analysis memory** — extraction is chunked and session indexes avoid per-relation corpus scans.
10. **Two-pass extraction with in-memory index** — declaration facts precede reference/relation resolution.
11. **Shared indexing session** — file, relation, spec and freshness writes participate in one bulk generation.
12. **Scoped binding environment resolution** — lexical/import/re-export binding facts come from adapter payloads and indexed lookup.
13. **Chunked processing** — persistence and relation writes remain chunked/deduplicated.
14. **Progress reporting** — discovery/index/spec progress includes known totals.
15. **Phase execution timing logging** — returned phase metrics separate semantic phases, persistence and search rebuilding.
16. **Cross-workspace package resolution** — adapter identities and public bindings drive package resolution across workspaces.
17. **Error isolation** — the new integration test injects an adapter parse failure: the valid file is committed, the failed file appears in `errors`, and `filesIndexed` is `1`. A second new test makes `writeFiles()` reject: the exact infrastructure error aborts the run and SQLite remains at `fileCount: 0`, proving transaction rollback rather than per-file collection.
18. **Index result** — fingerprint/rebuild reason, discovery exclusions, namespace deduplication and document encoding outcomes are covered by indexer/integration tests.
19. **Spec dependency indexing** — normalized metadata, aggregate persisted state, dependency and coverage relations are repository-driven.
20. **Prefer LLM-optimized description** — optimized metadata description wins when present.
21. **Reference fact indexing** — logical bindings, hierarchy, source ranges/content and unambiguous coverage are committed atomically.
22. **Incompatible derivation rebuild** — incompatibility rotates the logical generation and rebuilds search indexes after bulk commit.
23. **Indexed-input observation capture** — successful commits persist observations and clear workspace/aggregate stale latches.
24. **Bounded incremental relation construction** — affected-closure processing, conservative repair for newly available targets, unchanged fast paths and disjoint timing are implemented and exercised by the extensive indexer/SQLite suites.

Relevant evidence:

- `packages/code-graph/src/application/use-cases/index-code-graph.ts`
- graph-store/index-session ports and SQLite bulk-session implementation
- adapter registry and TypeScript/Go adapters
- `packages/code-graph/test/application/use-cases/index-project-graph-integration.spec.ts`
- the existing indexer, reference-fact, incremental, SQLite and staleness suites

No contradiction was found with `code-graph:graph-store`, `code-graph:language-adapter`, `code-graph:symbol-model`, `code-graph:workspace-integration`, `code-graph:sqlite-graph-store`, or the Core metadata/config dependencies. Parse failures remain adapter/file outcomes; store failures retain infrastructure-error identity and abort the atomic session.

### `code-graph:index-project-graph`

Implementation status: compliant.

- **Executes project indexing** — `execute()` calls the supplied open provider once and returns its `IndexResult` unchanged.
- **Supports forced logical reindex** — `force: true` is forwarded to `provider.index()`; the use case has no recreate path. Integration coverage confirms a logical full rebuild without changing healthy storage generation.
- **Accepts open provider and prepared inputs** — the new consolidated unit test asserts forwarding of `projectRoot`, `workspaces`, `graphConfig`, `codeGraphVersion`, `vcsRoot`, `force`, progress and materialized metadata inputs. Inspection confirms no resolution, process, lock, open/close, clear or recreate ownership in the use case.
- **Factory wires dependencies** — `createIndexProjectGraph()` returns a fresh stateless instance with no captured configuration.

Relevant evidence:

- `packages/code-graph/src/application/use-cases/index-project-graph.ts`
- `packages/code-graph/src/composition/use-cases/index-project-graph.ts`
- `packages/code-graph/test/application/use-cases/index-project-graph.spec.ts`
- `packages/code-graph/test/application/use-cases/index-project-graph-integration.spec.ts`

The application-layer class imports only ports/value objects and therefore conforms to `default:_global/architecture`. Its lifecycle boundaries agree with `code-graph:composition`, `code-graph:indexer`, and `code-graph:graph-store`.

## Test coverage and execution

Targeted execution performed during this audit:

- Core filesystem batch: **3 files, 21 tests passed**.
- Code-graph project/indexer batch: **2 files, 18 tests passed**.

The repaired evidence specifically covers all four prior advisory areas: lock error variants, failure between JSONL and metadata publication, parse-vs-infrastructure isolation, and complete prepared-input forwarding.

### Cross-cutting test-convention advisory

`packages/code-graph/test/application/use-cases/index-project-graph.spec.ts` constructs a partial provider and coerces it with `as unknown as CodeGraphHostPort`. `default:_global/testing` says port mocks must implement their port interface fully and forbids partial `as unknown as Port` mocks. This does not indicate a product/spec behavior mismatch and does not weaken the assertions for the four requirements above, but it is a literal test-convention violation. Recommended follow-up: replace `makeProvider()` with the repository's full typed host-port test double (unused methods may throw `new Error('not implemented')`).

## Discrepancies

### Product/spec discrepancies

None.

### Test/spec discrepancy

1. **Low — partial `CodeGraphHostPort` mock**
   - Spec side: `default:_global/testing` requires complete typed port mocks and explicitly rejects `as unknown as Port` partials.
   - Code side: `makeProvider()` supplies only `index` and casts through `unknown`.
   - Interpretation: the production implementation and scenario outcomes are correct; the test fixture should be made conformant. If the project intentionally permits focused structural mocks for broad host facades, the global testing spec would instead need narrowing.

## Missing tests

No missing behavioral scenario tests were identified for the three audited specs after the new coverage. The only remaining issue is the mock-shape convention above.

## Spec dependency chain

- `core:fs-change-repository` → `default:_global/architecture`, `core:composition`, `core:storage`, `core:change-list-entry`, `core:change-repository-port`: conformant.
- `code-graph:indexer` → graph-store/language/symbol/workspace/SQLite contracts plus Core config/spec metadata/list-workspaces: conformant.
- `code-graph:index-project-graph` → composition/indexer/graph-store/Core config: conformant.
- `default:_global/testing`: behavioral coverage, runner, layout, temp-directory cleanup and portability are conformant; one typed-mock-shape advisory remains.

## Summary counts

- Specs audited: **3**
- Requirements audited: **39**
- Verification scenarios audited: **133**
- Requirements implemented: **39**
- Product/spec discrepancies: **0**
- Test/spec discrepancies: **1 low-severity**
- Missing behavioral tests: **0**
- Targeted tests: **39 passed, 0 failed**

---

# Compliance audit partial — CLI, global docs/testing, guide, and skills

Delegated verification attempt: `verification-attempt-2`  
Change: `reconcile-lifecycle-transitions-with-main`  
Scope: `cli:entrypoint`, `default:_global/testing`, `default:_global/docs`, `guide:conventions`, `skills:workflow-automation`

## Executive summary

- Specs audited: **5**
- Requirements audited: **52**
- Verification scenarios audited: **135**
- Requirements conformant: **52**
- Requirements partially conformant: **0**
- Requirements non-conformant: **0**
- Missing or materially insufficient tests: **0**
- Dependency/global-spec contradictions: **0**
- Findings requiring code or spec changes: **0**

The merged change previews are internally consistent and conform to their global and direct-dependency constraints. The implementation, tests, package manifests, generated workflow templates, and documentation coverage checks provide evidence for every requirement in this batch. No discrepancy was found between intended behavior and implementation.

## Audit method and evidence

- Used the merged artifacts returned by `changes spec-preview`; all five specs are `no-op` relative to their current bases, so verification assessed the effective merged contract rather than raw deltas.
- Confirmed the code graph was current (`stale: false`, complete coverage, no parse failures).
- Used graph impact as the primary navigation surface. Risk classification was CRITICAL for `cli:entrypoint`, HIGH for `guide:conventions`, MEDIUM for `default:_global/docs` and `skills:workflow-automation`, and LOW for `default:_global/testing`.
- Inspected implementation and test surfaces identified by the graph, including CLI program/error/table helpers, CLI documentation/configuration coverage tests, the guide domain/application/infrastructure suites, and workflow-template parity/behavior tests.
- Executed focused verification suites:
  - CLI evidence: **4 files, 129 tests passed** (`handle-error`, table helper, documentation coverage, configuration coverage). The requested nonexistent `test/program.spec.ts` path was ignored by Vitest and is not counted.
  - Guide package: **7 files, 58 tests passed**.
  - Skills evidence: **3 files, 34 tests passed**.
- Confirmed manifest boundaries: `@specd/cli` and `@specd/mcp` depend directly on `@specd/sdk`, not `@specd/core` or `@specd/code-graph`; `@specd/guide` has no SpecD workspace dependency.
- A broad multi-term graph search hit a graph-backend OOM after the required impact queries had succeeded. This did not affect scope discovery or conclusions because focused graph impact, direct evidence inspection, and tests completed successfully.

## Detailed findings

### `cli:entrypoint`

**Requirements summary:** 16 requirements; 40 scenarios.

**Implementation status: conformant.**

- Configuration discovery, global/local `--config` propagation, bare-command dashboard dispatch, root-only banner behavior, the top-level `init` alias, excess-argument rejection, and reusable `createProgram()` are implemented in the CLI program/bootstrap surfaces.
- Exit-code and stream contracts are centralized in `handleError`; typed SpecD errors produce structured JSON/TOON on stdout while preserving plain diagnostic stderr. Hook failures map to code 2 and system failures to code 3.
- `renderTable`/`fitColumnsToTerminal` implement the right-to-left width reduction, minimum-width, wrap/truncate, and non-TTY behavior.
- Root banner labels are fed CLI, SDK, core, and code-graph versions through the SDK-facing boundary.
- Dynamic documentation coverage traverses the command tree and checks dedicated reference docs, the CLI index, and the guide overview. Configuration documentation coverage introspects the schema and cascade semantics.
- Host dependency boundary is satisfied by the CLI and MCP manifests.

**Test coverage:** adequate. Direct evidence includes `packages/cli/test/handle-error.spec.ts`, `packages/cli/test/helpers/table.spec.ts`, `packages/cli/test/documentation-coverage.spec.ts`, `packages/cli/test/configuration-coverage.spec.ts`, plus graph-linked command/integration coverage for root program behavior. The focused suite passed 129 tests.

**Discrepancies:** none.

**Dependency consistency:** consistent with `core:config` and `default:_global/error-handling-conventions`; no competing discovery, error, or host-import contract was found.

### `default:_global/testing`

**Requirements summary:** 8 requirements; 15 scenarios.

**Implementation status: conformant.**

- Package test scripts and Vitest configurations use Vitest and conventional `test/` locations/suffixes.
- Domain/application tests use typed port substitutes; infrastructure suites exercise real adapter boundaries with cleanup.
- Cross-platform cases are represented explicitly, including CRLF handling in guide slicing and the previously added Windows lock/path/index failure coverage in core/code-graph.
- Test fixtures use OS-derived temporary paths and avoid depending on POSIX-only permission behavior for Windows assertions.
- No snapshot-based acceptance evidence was used for the audited behavior.

**Test coverage:** adequate. This global policy is enforced by package conventions, lint/type checking, and the package suites; the focused guide tests include an explicit CRLF scenario, while the full verification hooks cover the repository-wide suite.

**Discrepancies:** none.

**Dependency consistency:** consistent with `default:_global/architecture` and `default:_global/conventions`; unit/integration placement follows the declared layer boundaries and ESM/Vitest constraint.

### `default:_global/docs`

**Requirements summary:** 12 requirements; 38 scenarios.

**Implementation status: conformant.**

- User guides, CLI references, SDK entry points, package references, ADR conventions, and public composition surfaces are present in their required locations and governed by repository coverage checks.
- CLI command/reference coverage is dynamically derived from `createProgram()`, preventing undocumented command families/subcommands and stale CLI indexes.
- Configuration documentation coverage compares current schema keys, defaults, graph/logging/plugin options, overrides, and cascade semantics with the guide.
- ESLint contains active JSDoc rules for exported/public symbols and required descriptions/parameters/returns.
- Guide opening and skills-catalog expectations are represented in CLI/guide tests and documentation surfaces.
- No removed variable, renamed list/summary contract, or CLI output change in this batch lacks corresponding documentation.

**Test coverage:** adequate. Principal evidence is `packages/cli/test/documentation-coverage.spec.ts`, `packages/cli/test/configuration-coverage.spec.ts`, guide bundle/frontmatter tests, and repository lint/JSDoc enforcement.

**Discrepancies:** none.

**Dependency consistency:** consistent with `default:_global/conventions`; naming, Markdown placement, and formatting rules do not conflict with the merged documentation contract.

### `guide:conventions`

**Requirements summary:** 5 requirements; 13 scenarios.

**Implementation status: conformant.**

- The package maintains domain/application/port/infrastructure/composition separation and exposes clean public entry points.
- `packages/guide/package.json` has no dependency on SpecD workspace packages; bundling is a build-time concern rather than a runtime core dependency.
- Guide domain errors extend `SpecdGuideError`, satisfy the duck-typed SpecD error contract, and do not inherit from `@specd/core`.
- Manifest/build/test/lint scripts and package deliverables are present; the README describes architecture, catalog, and quick start.

**Test coverage:** adequate. All **58 guide tests passed**, covering error hierarchy, domain models, application queries/slicing, bundle/frontmatter compilation, search, and end-to-end guide-engine behavior.

**Discrepancies:** none.

**Dependency consistency:** this spec declares no direct spec dependencies and remains compatible with the global architecture, testing, documentation, and error-handling policies.

### `skills:workflow-automation`

**Requirements summary:** 11 requirements; 29 scenarios.

**Implementation status: conformant.**

- Shared/template guidance uses canonical plural resource groups and text status diagnostics, prefers TOON for structured extraction, and limits JSON to explicit exceptions.
- `specs show`, `specs context`, and `specs metadata` have distinct documented roles; outline retrieval uses `specs outline` on demand.
- Transition failures follow the emitted repair guide rather than forcing retries.
- Structural validation is kept separate from semantic review; inline validation diffs, filtered diff previews, and merged previews are selected according to the stated risk conditions.
- Verify/compliance templates encode explicit attempt ownership. Delegated compliance remains change-scoped downstream and neither starts nor completes the caller's attempt.
- Implementation tracking requires explicit resolve/ignore before archive.
- Context optimization routes to the project/spec optimizer agents when agents are supported and documents the inline fallback otherwise.
- Generated/installed skill copies are checked for protocol parity with their source templates.

**Test coverage:** adequate. The three focused files passed **34 tests**. `template-workflow.spec.ts` directly asserts read-surface guidance, canonical reconciliation, verification ownership, delegated downstream routing, open-file draining, and optimizer gates; `generated-skill-protocol.spec.ts` checks installed-copy parity; repository tests validate rendered bundles.

**Discrepancies:** none.

**Dependency consistency:** consistent with all declared direct dependencies: `cli:command-resource-naming`, `skills:agents`, `cli:spec-context`, `cli:spec-metadata`, `core:get-status`, `core:validate-artifacts`, and `core:transition-checks`. No template instruction contradicts canonical resource naming, context/metadata separation, reconciled status, structural validation, or recovery precedence.

## Test coverage and missing tests

| Spec                         | Requirements | Scenarios | Status         | Missing tests |
| ---------------------------- | -----------: | --------: | -------------- | ------------: |
| `cli:entrypoint`             |           16 |        40 | Conformant     |             0 |
| `default:_global/testing`    |            8 |        15 | Conformant     |             0 |
| `default:_global/docs`       |           12 |        38 | Conformant     |             0 |
| `guide:conventions`          |            5 |        13 | Conformant     |             0 |
| `skills:workflow-automation` |           11 |        29 | Conformant     |             0 |
| **Total**                    |       **52** |   **135** | **Conformant** |         **0** |

Some global-policy scenarios are enforced through lint, manifest constraints, dynamic coverage tests, or workflow-template assertions rather than one test named identically to each scenario. The evidence is nevertheless direct and behaviorally sufficient; no additional test gap was identified.

## Spec dependency chain

- `cli:entrypoint` → `core:config`, `default:_global/error-handling-conventions`.
- `default:_global/testing` → `default:_global/architecture`, `default:_global/conventions`.
- `default:_global/docs` → `default:_global/conventions` (and references `core:config` in its ADR guidance).
- `guide:conventions` → no declared direct dependency.
- `skills:workflow-automation` → `cli:command-resource-naming`, `skills:agents`, `cli:spec-context`, `cli:spec-metadata`, `core:get-status`, `core:validate-artifacts`, `core:transition-checks`.

All checked edges are semantically compatible with the merged requirements.

## Final disposition

**PASS.** This batch contains no implementation defect, spec drift, documentation inconsistency, dependency contradiction, or missing-test finding. No code/spec change is recommended.
