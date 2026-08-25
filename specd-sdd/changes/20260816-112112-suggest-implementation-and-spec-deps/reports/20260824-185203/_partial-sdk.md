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
