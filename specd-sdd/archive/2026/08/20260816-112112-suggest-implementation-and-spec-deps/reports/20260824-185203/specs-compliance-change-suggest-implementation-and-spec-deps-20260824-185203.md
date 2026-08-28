# Spec Compliance Report — `suggest-implementation-and-spec-deps`

- Mode: change
- Generated: 2026-08-24 18:52:03 Europe/Madrid
- Specs audited: 8
- Requirement groups audited: 32
- Fully implemented: 31
- Partially implemented: 1
- Discrepancies: 7 (4 high, 3 medium)
- Missing or insufficient test cases: 21

## Executive Summary

All verification test, lint, and typecheck gates pass. Core and code-graph changes conform to their merged specs. The compliance audit nevertheless found material CLI and SDK gaps: missing structured-output help schemas on affected CLI leaves; SDK orchestration crossing the global infrastructure boundary; post-apply validation being optional or omitted after validator exceptions; plus three medium test/observable-behavior discrepancies.

The detailed batch findings are preserved in the traceability partial reports listed below and are appended verbatim under **Detailed Findings** by the compliance compilation step.

## Partial Reports

- `_partial-cli.md`
- `_partial-sdk.md`
- `_partial-core-graph.md`

## Detailed Findings

# CLI Compliance Audit — `cli:spec-implementation` and `cli:spec-deps`

## Requirements Summary

### `cli:spec-implementation`

Eight merged requirements were audited: command signature/format support; list behavior and initialized-state distinction; add; remove; delegation without CLI-owned mutation/path logic; shared raw path semantics; typed error mapping; and SDK-backed suggestion (selection flags, confidence, cache rebuild, additive apply, and inclusion tags).

### `cli:spec-deps`

Nine merged requirements were audited: command signature/format support; list; add; remove including uninitialized no-op; set; clear; delegation without CLI-owned merge/write logic; typed error mapping; and SDK-backed suggestion (selection flags, additive apply, post-apply validation, optional alignment-change creation, manual-command guidance, and non-interactive machine formats).

## Implementation Status

### `cli:spec-implementation`

- **Implemented:** `packages/cli/src/commands/spec/implementation.ts` registers `list`, `add`, `remove`, and `suggest` below the canonical `specs` command (with `spec` alias registered in `packages/cli/src/index.ts`). Every leaf rejects excess arguments and accepts `--format`.
- **Implemented:** list delegates once to `kernel.specs.getPersistedImplementation`, preserves file-level versus symbol-level presentation, and distinguishes uninitialized state in text and structured formats.
- **Implemented:** add/remove pass the raw file string and optional repeated symbols directly in one `kernel.specs.updatePersistedImplementation.execute` call. No file checks, workspace-boundary logic, lock writes, or link merging occur in the handler.
- **Implemented:** suggest creates the SDK orchestration use case and maps positional/`--spec`, `--all`, `--workspace`, `--apply`, `--confidence`, and `--rebuild-cache` inputs. Text output includes confidence and `[already included]`/`[new]`; structured formats emit the SDK result.
- **Implemented via shared error boundary:** all handler errors flow through `handleError`, which supplies the standard exit/error presentation. Domain-specific validation remains in Core/SDK as required by the dependency specs.

### `cli:spec-deps`

- **Implemented:** `packages/cli/src/commands/spec/deps.ts` registers `list`, `add`, `remove`, `set`, `clear`, and `suggest`; all leaf commands reject excess arguments and accept `--format`.
- **Implemented:** list delegates once to `kernel.specs.getPersistedDeps` and distinguishes uninitialized state. Mutations each make one direct `kernel.specs.updatePersistedDeps.execute` call with `add`, `remove`, `set`, or `clear` and do no local merge or lock-state mutation.
- **Implemented:** set accepts no `--dep` values and sends `set: []`; remove displays the empty/no-op result without manufacturing an error.
- **Implemented:** suggest creates the SDK orchestration use case and maps all specified flags, including `--create-change` to `createAlignmentChange`. It has no prompt/readline path; JSON/TOON directly render the result. Text renders import reasons, inclusion tags, applied counts, validation status, created-change details, or the SDK-provided manual alignment command.
- **Implemented via shared error boundary:** typed errors flow through `handleError`; the actual mutation semantics and concurrency/read-only enforcement belong to the direct Core dependencies.

## Discrepancies

1. **High — all ten affected leaf commands violate the direct `cli:entrypoint` help-schema contract.** The global dependency requires every command supporting JSON/TOON to append a `JSON/TOON output schema:` block via `addHelpText('after', ...)`. Neither registration file calls `addHelpText`; therefore `specs implementation {list,add,remove,suggest}` and `specs deps {list,add,remove,set,clear,suggest}` are non-conformant. This is implementation drift if the global CLI contract remains authoritative; alternatively, the global requirement is broader than intended and should be narrowed explicitly. The change specs themselves do not contradict the dependency, because they explicitly inherit entrypoint output conventions.
2. **Medium — the read-only error test encodes wording that contradicts the merged CLI requirement.** `spec-deps.spec.ts` constructs `ReadOnlyWorkspaceError` with “Change the workspace ownership in specd.yaml to allow writes,” while `cli:spec-deps` requires no configuration workaround. The production CLI merely presents the typed error, so a normally constructed compliant SDK error may still behave correctly; however, this test both fails to verify the prohibition and normalizes forbidden wording. This is primarily a test-fixture/spec mismatch, not proof of a production defect.

No contradiction was found between the new CLI suggestion requirements and their SDK dependency contracts. No CLI-owned direct `spec-lock.json` access or mutation semantics were found.

## Test Coverage

Targeted execution: `pnpm --filter @specd/cli test -- spec-implementation.spec.ts spec-deps.spec.ts` completed successfully (repository runner executed **80 files / 886 tests**, all passing).

### `cli:spec-implementation`

- Covered: list kernel delegation; add/remove input mapping including symbols; uninitialized text and JSON; list TOON; suggestion SDK delegation; confidence/symbol rendering; `[already included]` and `[new]`; applied-mutation summary; generic error prefix/exit path.
- Partial: command-format coverage is demonstrated only for list, not every leaf. Error testing uses `ChangeNotFoundError`, not the four error classes named by the spec. The test proves an `error:` prefix but not required message content/retry guidance/no-workaround behavior.

### `cli:spec-deps`

- Covered: list/add/remove/set/clear delegation; repeated add values; empty set; uninitialized remove no-op; uninitialized list text/JSON; list TOON; suggestion SDK delegation; inclusion/reason rendering; apply summary; successful post-apply validation rendering; a generic read-only error path.
- Partial: the read-only assertion checks only `error:` and `read-only`, and its fixture contains the expressly forbidden workaround. No tests exercise invalid post-apply handling or alignment change output.

## Missing Tests

### `cli:spec-implementation`

- Add without `--symbol` produces an input/result without `symbols`.
- Remove of one symbol demonstrates the remaining-symbol result.
- Explicit structural assertion that handlers do no filesystem/path-normalization/lock I/O (current direct-call tests are useful but do not guard forbidden collaborators).
- `SpecNotFoundError`, `ImplementationFileNotFoundError`, `ImplementationWorkspaceBoundaryError`, `ArtifactConflictError` with retry guidance, and `ReadOnlyWorkspaceError` without workaround.
- `--format` JSON/TOON behavior for add, remove, and suggest, plus help-schema checks for all four leaves.
- Suggest flag mapping for repeated `--spec`, `--all`, `--workspace`, `--apply`, `--confidence` (including `MED`), and `--rebuild-cache`; additive apply is only represented by a mocked result, not verified as an input.
- Excess positional argument rejection for each leaf.

### `cli:spec-deps`

- Exact remove result and exact set replacement result (current tests validate inputs, not resulting list semantics at the CLI surface).
- `SpecNotFoundError`, `ArtifactConflictError` with retry wording, and a correct negative assertion that read-only output does **not** suggest configuration changes.
- `--format` JSON/TOON behavior for mutation/suggest leaves, explicit proof machine formats never prompt/block stdin, and help-schema checks for all six leaves.
- Suggest flag mapping for repeated `--spec`, `--all`, `--workspace`, `--apply`, `--create-change`, and `--rebuild-cache`.
- Invalid post-apply result without `--create-change` renders the suggested alignment command; invalid result with `--create-change` renders the single created change.
- Excess positional argument rejection for each leaf.

## Dependency Chain

- `cli:spec-implementation` → `core:get-persisted-spec-implementation`, `core:update-persisted-spec-implementation`, `sdk:suggest-implementation-links`, `cli:entrypoint`.
- `cli:spec-deps` → `core:get-persisted-spec-deps`, `core:update-persisted-spec-deps`, `sdk:suggest-spec-dependencies`, `cli:entrypoint`.
- Global constraints applied: `_global/architecture` (CLI delegates business logic), `_global/conventions`, `_global/error-handling-conventions`, `_global/logging`, and `_global/testing`.
- Graph-first navigation confirmed registration in `packages/cli/src/index.ts` and the two command modules. The graph was stale at audit start and was re-indexed successfully before code inspection.

## Summary Counts

- Specs audited: **2**
- Requirements audited: **17** (8 implementation-link + 9 dependency requirements)
- Requirements with implementation present: **17**
- Cross-spec discrepancies: **2** (**1 high implementation/global-contract gap; 1 medium test/spec mismatch**)
- Verification scenarios in merged artifacts: **24** (11 implementation-link + 13 dependency scenarios)
- Scenario areas with direct or partial CLI tests: **17**
- Scenario areas with no direct CLI test: **7**
- Additional dependency-contract test gaps identified: **help schema, exhaustive typed-error wording, flag mapping, machine-mode non-interactivity, and invalid post-apply branches**

# SDK Compliance Audit — Suggestion Use Cases

Scope: `sdk:suggest-implementation-links` and `sdk:suggest-spec-dependencies`, using their merged change previews. Direct dependencies (depth 1) and applicable global specs were also reviewed. The code graph was current (`stale: false`, `contentFresh: true`) and located both public use-case classes and their dependency surfaces in `packages/sdk/src/orchestration/`.

## Requirements Summary

### `sdk:suggest-implementation-links`

1. Expose the documented input/result interface, including targeting, apply, cache rebuild, confidence filtering, and progress callbacks.
2. Reject missing targets, unknown workspaces/specs, and invalid confidence thresholds with typed `SpecdError` subclasses; normalize `MED` to `MEDIUM`.
3. Implement cached three-tier analysis: cache freshness/rebuild, symbol/path scoring, hierarchical content fallback, and tag/keyword fallback.
4. Mark already-linked files.
5. Apply only new links additively through `UpdatePersistedSpecImplementation`.
6. Provide dependency/config factory overloads through the shared composition resolver.

### `sdk:suggest-spec-dependencies`

1. Expose the documented input/result interface and progress events.
2. Validate target selection and existence with typed errors.
3. Warm the implementation cache globally, compute direct import-derived dependencies, validate direction, reduce transitive recommendations, cache with version/freshness/file-owner identity, and mark already configured dependencies.
4. On apply, add only new dependencies, always validate specs, optionally create one alignment change for all failures, fail open to an explicit `all-valid` diagnostic when validation throws, and never create a change for valid specs.
5. Provide dependency/config factory overloads through the shared composition resolver.

## Implementation Status

### `sdk:suggest-implementation-links`

- **Implemented:** Public input/result types and `execute()` exist in `packages/sdk/src/orchestration/suggest-implementation-links.ts`; Zod validation covers all target forms and confidence values, including `MED` normalization.
- **Implemented:** Target discovery uses repository metadata, checks every requested `specId`, and throws `InvalidInputError`, `WorkspaceNotFoundError`, and `SpecNotFoundError` as required.
- **Implemented:** Cache reads are skipped on `rebuildCache`; the default filesystem cache performs staged size/mtime/hash freshness checks. Candidate scoring includes +200 primary, +50 derivative, -150 per missing distinctive token, hierarchical content matching, and Tier 3 co-occurrence fallback.
- **Implemented with observable-name discrepancy:** Exact primary matches receive +200, but the emitted reason is `primary-symbol-match`, not the merged spec's `exact-primary-symbol-match`.
- **Implemented:** Existing canonicalized lock files are marked `alreadyIncluded`; apply skips them and invokes the persisted implementation updater with additive `action: 'add'`.
- **Implemented:** Factory overloads delegate through `createCompositionResolver` and `resolveSuggestImplementationLinksDeps`; public barrels export the use case.
- **Implemented:** Progress emits `discovery-start`, `discovery-done`, `start`, per-spec start/done, and final done in order.

### `sdk:suggest-spec-dependencies`

- **Implemented:** Public input/result types and use case exist; target validation covers missing input, absent/empty workspaces, empty `all`, and every requested spec ID.
- **Implemented:** Warm-up invokes `SuggestImplementationLinks.execute({ all: true, apply: false })`, primes the implementation cache, and computes a stable global file-to-spec fingerprint.
- **Implemented:** Dependency analysis uses depth-1 graph import impact, `findSpecByFile`, conditional barrel expansion, directional pruning, and direct-dependency transitive reduction.
- **Implemented:** Cache version is `1.1.0`; adapters enforce version and staged identity freshness. Entries retain the global file-owner fingerprint and are recomputed when it changes.
- **Implemented:** Existing dependencies are tagged `already-configured`/`alreadyIncluded`; apply sends only new IDs to `UpdatePersistedSpecDeps`.
- **Partially implemented:** Invalid validation results can create one alignment change containing all invalid spec IDs and exact `[artifactId]: description` lines, and valid results do not create a change. However, validator absence and validator exceptions do not satisfy the merged result contract (findings SDK-2 and SDK-3).
- **Implemented:** Factory overloads use the shared resolver; progress events cover warm-up, analysis, optional validation, and completion.

## Discrepancies

### SDK-1 — HIGH — Change specs conflict with global architecture boundaries

**Evidence:** `default:_global/architecture` says packages with business logic use domain/application/infrastructure layers, application logic interacts through ports, and **only `composition/` may import infrastructure**. Both audited use cases live in `src/orchestration/` yet import and instantiate `FsImplementationSuggestionCache`, and `SuggestSpecDependencies` also imports `FsSpecDepsSuggestionCache`, `node:fs/promises`, and directly performs `mkdir`/`writeFile`. Its merged constraint explicitly permits alignment-change filesystem scaffolding in the orchestration layer.

**Assessment:** The change spec and implementation agree with each other but contradict the project-wide constraint. Either (a) the global architecture is intended to treat `orchestration` as composition and must say so, or (b) default adapter construction and exploration-file writing must move behind composition/infrastructure ports. This is spec drift or an implementation-layering bug; the current texts cannot both be true.

### SDK-2 — HIGH — Validator exceptions do not return the required fail-open diagnostic

**Evidence:** The merged dependency spec requires that a thrown `ValidateSpecs` error degrade to `postApplyValidation.status: "all-valid"`. In `SuggestSpecDependencies.execute`, the `catch` after `validateSpecs.execute({})` is empty. `postApplyValidation` therefore remains `undefined`; only the progress event substitutes `all-valid`, and the returned result omits `postApplyValidation` entirely.

**Assessment:** This is an implementation bug if the merged contract is authoritative. Alternatively the spec could be relaxed to say validation errors merely do not block apply and the diagnostic is optional, but that would weaken the explicit status contract.

### SDK-3 — HIGH — Post-apply validation is optional in the dependency contract and can be skipped

**Evidence:** The merged spec says apply **runs `ValidateSpecs`**. `SuggestSpecDependenciesDeps.validateSpecs` is optional and execution is guarded by `if (input.apply && this.deps.validateSpecs)`. A caller using the canonical dependency-based factory without `validateSpecs` can apply mutations and receive no validation diagnostic. The standard config factory injects it, but the public `createSuggestSpecDependencies(deps)` overload permits omission.

**Assessment:** Make `validateSpecs` required (or throw typed invalid input before mutation when absent), or revise the spec to limit mandatory validation to config-composed instances. Current public API and requirement disagree.

### SDK-4 — MEDIUM — Exact-primary scoring reason differs from the specified reason

**Evidence:** The merged implementation-link scenario requires an `exact-primary-symbol-match` (+200). The implementation adds +200 but records `primary-symbol-match`; no compatibility alias is emitted.

**Assessment:** If reasons are observable explanatory output, code is non-conformant. If only score/confidence are contractual, the scenario should avoid prescribing the internal reason string.

### SDK-5 — MEDIUM — Missing CreateChange dependency is detected after possible mutations

**Evidence:** `createAlignmentChange: true` without `CreateChange` must throw `InvalidInputError`. The implementation performs warm-up, analysis, and per-spec dependency updates before checking this condition after the target loop. With `apply: true`, persisted locks may already be changed when the input error is thrown.

**Assessment:** Input validation normally precedes side effects and the requirement calls this an input error. Move the dependency check before warm-up/mutation, or explicitly document non-atomic behavior. Existing tests assert the error type but not absence of mutation.

## Test Coverage

Executed `pnpm --filter @specd/sdk test -- --run ...`; the package suite completed with **13 test files / 112 tests passing**.

### `sdk:suggest-implementation-links`

Covered directly:

- Basic confidence-scored suggestions and additive apply.
- Confidence filtering and `MED` normalization.
- Top-level symbol restriction and fenced-code extraction.
- Already-included marking and real SHA-256 stamp persistence.
- Missing target, unknown workspace/spec, invalid threshold typed errors.
- Dependency-constructor factory overload and progress event presence.
- Filesystem implementation-cache staged freshness behavior is covered in `fs-suggestion-cache.spec.ts`.

Coverage is mostly unit-level with mocked repositories/graph providers. The merged named Tier 1/2/3 acceptance examples are not exercised end-to-end.

### `sdk:suggest-spec-dependencies`

Covered directly:

- Warm-up/import graph deduction, additive apply, existing-dependency marking.
- Invalid-spec diagnostics and alignment creation behavior in the primary invalid path.
- Dependency cache reuse and file-owner fingerprint invalidation.
- Missing CreateChange error type; empty workspace/all and unknown target errors.
- Barrel expansion, directional pruning, and transitive reduction.
- Cache-version invalidation in the filesystem cache tests.
- Factory dependency overload and progress event presence.

The tests do not cover the validator-throws result, omission of the validator dependency, mutation-before-error ordering, or exact complete progress ordering.

## Missing Tests

1. **Required:** `ValidateSpecs.execute()` rejects; assert returned `postApplyValidation` is exactly `{ status: 'all-valid', invalidSpecs: [] }` and apply remains successful. This would currently fail (SDK-2).
2. **Required:** dependency-based construction without `validateSpecs`, followed by `apply: true`; assert the intended contract (reject before mutation or always validate). This exposes SDK-3.
3. **Required:** `createAlignmentChange: true` without `createChange`; assert `updatePersistedDeps.execute` is never called. This exposes SDK-5.
4. Exact primary versus derivative matching, including exact reason strings, +200/+50 behavior, `HIGH` cap, and -150-per-missing-token behavior.
5. Tier 2 `schema-which-command` hierarchical/subtoken example and Tier 3 `rules-injection` tag/keyword co-occurrence example against realistic graph fixtures.
6. Rebuild-cache fast path proving cache hit avoids AST/graph calls and `rebuildCache` forces both analysis passes.
7. Exact ordered progress arrays (including discovery/warmup nested progress and validation events), rather than event-presence assertions.
8. All-valid post-apply path with `createAlignmentChange: true`, explicitly asserting no `CreateChange` call and an `all-valid` result diagnostic.
9. Multi-spec invalid validation result proving exactly one change is created with all failing IDs and every exact failure description.
10. `specIds` multi-target success and partial-missing rejection for both use cases.

## Dependency Chain

- `sdk:suggest-implementation-links`
  - `code-graph:symbol-model` — symbol kinds/locations used for declared-symbol scoring.
  - `code-graph:traversal` — graph-backed code discovery.
  - `code-graph:language-adapter` — supported extensions and reserved keywords via the built-in adapter registry.
  - `core:get-persisted-spec-implementation` — canonical persisted implementation reads.
  - `core:update-persisted-spec-implementation` — additive persisted implementation mutation.
- `sdk:suggest-spec-dependencies`
  - `sdk:suggest-implementation-links` — global implementation cache warm-up and file ownership.
  - `code-graph:traversal` — depth-1 import impact.
  - `core:get-persisted-spec-deps` — canonical persisted dependency reads without direct lock access.
  - `core:update-persisted-spec-deps` — additive, idempotent persisted dependency mutation.
- Applicable globals: `default:_global/architecture`, `default:_global/conventions`, `default:_global/testing`, and `default:_global/docs`. Named exports, ESM paths, explicit public return types, typed validation errors, and JSDoc are generally satisfied. The architecture conflict is recorded as SDK-1.

## Summary Counts

- Specs audited: **2**
- Requirement groups audited: **11** (6 implementation-link groups; 5 dependency-suggestion groups)
- Fully implemented groups: **10**
- Partially implemented groups: **1**
- Discrepancies: **5** — **3 high**, **2 medium**, **0 low**
- Test suite result: **112 passed, 0 failed** across **13 files**
- Missing/insufficient test cases identified: **10**

# Compliance Audit Partial — Core and Code Graph

Audited change: `suggest-implementation-and-spec-deps`

Assigned change specs:

- `code-graph:language-adapter`
- `code-graph:graph-store`
- `core:fs-spec-repository`
- `core:spec-repository-port`

The audit used each change spec's merged `spec-preview` (spec and verification artifacts), graph-first symbol discovery, direct implementation/test inspection, project-wide architecture/testing directives, and depth-1 dependency context. No code or spec files were modified.

## Requirements Summary

| Spec                          | Changed requirement                                               | Required behavior                                                                                                                                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code-graph:language-adapter` | Built-in Adapter Registry Composition Factory & Keyword Discovery | Standalone and re-exported `createBuiltinAdapterRegistry`; built-in TS/Python/Go/PHP registration; optional custom adapters; `SpecdConfig` overload; optional adapter `keywords()`; aggregate `getReservedKeywords()` on port and registry. |
| `code-graph:graph-store`      | Symbol Query Workspace Scope                                      | Optional `SymbolQuery.workspace`; exact case-sensitive `'<workspace>:'` prefix filtering; `%` and `_` literal; parameterized SQLite comparison.                                                                                             |
| `core:fs-spec-repository`     | Artifact byte-size observations                                   | `get()` artifact entries and `artifactMeta()` return byte size from the same stat observation as mtime; no content read unless hash requested.                                                                                              |
| `core:spec-repository-port`   | Portable artifact-size contract                                   | `SpecArtifactEntry.size` optional for adapter families without cheap metadata; `ArtifactMeta.size` required and usable as a cheap pre-hash filter.                                                                                          |

## Implementation Status

### `code-graph:language-adapter` — Implemented

- `packages/code-graph/src/composition/use-cases/create-builtin-adapter-registry.ts` contains the standalone factory and overloads for `extraAdapters?: readonly LanguageAdapter[]` and `config: SpecdConfig`.
- The factory registers `TypeScriptLanguageAdapter`, `PythonLanguageAdapter`, `GoLanguageAdapter`, and `PhpLanguageAdapter`, then additive custom adapters when an array is supplied.
- The factory is re-exported through `src/composition/create-code-graph-provider.ts`, `src/index.ts`, and `src/public.ts`.
- `LanguageAdapter` declares `keywords?(): readonly string[]`.
- `AdapterRegistryPort` and `AdapterRegistry` expose `getReservedKeywords(): Set<string>`; the implementation aggregates unique keywords from unique registered adapter instances.
- All four built-in adapters implement keyword lists, including the merged scenario's representative values (`class`, `def`, `func`, `interface`, `async`).

### `code-graph:graph-store` — Implemented

- `packages/code-graph/src/domain/value-objects/symbol-query.ts` declares `readonly workspace?: string`.
- `SQLiteGraphDatabase.findSymbols()` adds `substr(file_path, 1, length(?)) = ?` with two bound `'<workspace>:'` parameters. This is exact and case-sensitive and avoids SQL `LIKE` wildcard behavior for `%` and `_`.
- The in-memory test store mirrors the contract with `filePath.startsWith(workspace + ':')`.
- The workspace condition composes with the existing name and other query predicates, so `findSymbols({ name: 'create*', workspace: 'core' })` is scoped before results are returned.

### `core:fs-spec-repository` — Implemented

- `FsSpecRepository._buildSpec()` performs one `fs.stat()` per artifact and constructs `{ filename, lastModified: stat.mtime.toISOString(), size: stat.size }` from that observation without reading artifact content.
- `FsSpecRepository.artifactMeta()` performs one stat, returns `{ lastModified, size }` when hashing is not requested, and reads the file only on `includeHash: true`, returning the same observed size alongside the SHA-256 hash.

### `core:spec-repository-port` — Implemented

- `SpecArtifactEntry` declares optional `readonly size?: number`, matching the cross-adapter allowance.
- `ArtifactMeta` declares required `readonly size: number` and optional `hash?: string`.
- The filesystem adapter fulfills the stronger cheap-metadata behavior required by its specific spec.

## Discrepancies

No implementation/spec contradictions were found for the four changed requirements.

No contradiction was found against the project-wide architecture/testing directives or the loaded depth-1 dependency contracts:

- Registry construction stays in the composition layer while adapter discovery contracts stay in domain ports/value objects, consistent with `default:_global/architecture`.
- Workspace filtering operates on canonical workspace-prefixed file paths, consistent with `code-graph:symbol-model`, `core:workspace`, and `core:spec-id-format` identity semantics.
- Artifact size is metadata-only and does not expose sidecars as artifacts or change persistence authority, consistent with `core:storage`, `core:spec-metadata`, and `core:spec-lock`.

Interpretation note: the architecture global says concrete adapters are not exported from public entry points. The new public factory returns the `AdapterRegistry` concrete type, but it does not export the individual concrete language adapters, and the merged change explicitly requires the factory and composition re-export. This is not classified as a conflict; if maintainers intend the global rule to prohibit returning any concrete infrastructure registry type, the global wording should be clarified.

## Test Coverage

Focused execution:

- `@specd/code-graph`: `create-builtin-adapter-registry.spec.ts` plus `sqlite-graph-store.spec.ts` — **130 tests passed**.
- `@specd/core`: `fs/spec-repository.spec.ts` — **87 tests passed**.

Coverage by changed requirement:

| Requirement                                 | Coverage | Evidence                                                                                                       |
| ------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| Built-in registry and extensions            | Covered  | Factory test verifies registry type and `.ts`, `.py`, `.go`, `.php`; custom adapter registration also covered. |
| Reserved keyword aggregation                | Covered  | Tests verify aggregation, deduplication, and representative built-in keywords.                                 |
| Symbol workspace scope                      | Covered  | SQLite integration test verifies exact casing plus literal `_` and `%`, including negative controls.           |
| `SpecArtifactEntry.size`                    | Covered  | Filesystem repository integration test verifies byte length from `get()`.                                      |
| `ArtifactMeta.size` and conditional hashing | Covered  | Tests verify size without hash, size with hash, expected SHA-256, and null for absent artifact.                |

## Missing Tests

These are coverage improvements, not observed implementation failures:

1. `createBuiltinAdapterRegistry(config: SpecdConfig)` has no direct runtime/type-focused test. The overload and implementation exist, but a test should call it with a minimal valid config and verify the built-ins are returned and config is not mistaken for an adapter array.
2. The graph-store merged scenario uses `{ name: 'create*', workspace: 'core' }`; current focused coverage strongly tests workspace prefix semantics independently, while other tests cover name wildcards. A single combined predicate test would exactly mirror the scenario.
3. Filesystem tests verify returned values but do not instrument `fs.stat`/`fs.readFile` call counts. The implementation visibly uses one stat and avoids reads on the no-hash path, but an adapter-level spy or injectable filesystem test would guard the explicit “same single stat” and “no content read” performance contract against regression.
4. `SpecArtifactEntry.size` is an optional port field, but no compile-contract test demonstrates that a non-filesystem adapter may omit it while `ArtifactMeta.size` remains required. Type-level fixtures could make that distinction explicit.

## Dependency Chain

### `code-graph:language-adapter`

- Direct loaded dependency: `code-graph:symbol-model`.
- Global constraints: `default:_global/architecture`, `_global/conventions`, `_global/testing`.
- Conformance: keyword discovery only extends adapter/registry capability; it does not change symbol identity, relation vocabulary, determinism, or parser-state constraints.

### `code-graph:graph-store`

- Direct dependencies declared by the change: `code-graph:symbol-model`, `default:_global/architecture`, `code-graph:staleness-detection`, `code-graph:document-model`.
- Conformance: workspace filtering uses existing canonical file paths and parameterized backend queries; it does not alter store lifecycle, atomicity, freshness, document persistence, or relation semantics.

### `core:fs-spec-repository`

- Direct dependencies declared by the change: `default:_global/architecture`, `core:composition`, `core:storage`, `core:spec-repository-port`, `core:spec-lock`, `core:spec-metadata`, `core:spec-optimization`.
- Conformance: size observation remains an infrastructure concern, is exposed through the port contract, and does not read or reinterpret semantic sidecars.

### `core:spec-repository-port`

- Direct dependencies declared by the change: `core:repository-port`, `default:_global/architecture`, `core:change`, `core:storage`, `core:workspace`, `core:spec-id-format`, `core:spec-metadata`, `core:content-extraction`, `core:search-specs`, `default:_global/logging`, `core:spec-lock`.
- Conformance: the added fields are immutable metadata shapes and preserve workspace scoping, canonical IDs, metadata/lock ownership, search behavior, logging abstraction, and repository layering.

## Summary Counts

- Specs audited: **4**
- Changed requirements audited: **4**
- Fully implemented changed requirements: **4**
- Implementation discrepancies: **0**
- Spec/dependency contradictions: **0**
- Focused test files passed: **3**
- Focused tests passed: **217**
- Missing/insufficient test cases identified: **4**
- Blocking compliance issues: **0**
