# CLI + SDK Compliance Audit

Scope: `cli:spec-implementation`, `cli:spec-deps`, `sdk:suggest-implementation-links`, `sdk:suggest-spec-dependencies`, and `sdk:composition`, using the merged change previews. Direct dependencies checked include `default:_global/architecture`, `core:composition`, `code-graph:composition`, `cli:entrypoint`, and the real `core:ValidateSpecs` contract. Audit date: 2026-08-24. The code graph was current (`stale: false`, full indexed coverage).

## Requirements Summary

### `cli:spec-implementation`

The merged spec defines persisted implementation list/add/remove commands, direct Kernel delegation, raw-path semantics, typed error mapping, the SDK-backed `suggest` command, inclusion tags, additive apply behavior, and discoverable JSON/TOON help on every structured-output leaf.

### `cli:spec-deps`

The merged spec defines persisted dependency list/add/remove/set/clear commands, direct Kernel delegation, typed error mapping, the SDK-backed `suggest` command, post-apply validation, optional alignment-change creation, noninteractive structured output, and JSON/TOON response help.

### `sdk:suggest-implementation-links`

The merged spec defines input validation, progress events, a three-tier suggestion cascade, cache freshness and rebuild semantics, token affinity and symbol scoring, already-included marking, additive application, and a canonical dependency-injected orchestration factory. Concrete filesystem observation and caches belong at composition.

### `sdk:suggest-spec-dependencies`

The merged spec defines input validation, implementation-cache warm-up, import traversal, directional pruning, transitive reduction, cache ownership fingerprints, additive mutation, mandatory post-apply `ValidateSpecs`, fail-open validator handling, optional single alignment-change creation through `CreateChange`, and a canonical dependency-injected factory.

### `sdk:composition`

The merged spec defines the SDK package dependency boundary, a purportedly restricted source topology, curated public exports, host import policy, version exports, review orchestration, and config-based suggestion composition that delegates to canonical dependency factories. It also inherits the global hexagonal rule that packages containing business logic use `domain`, `application`, `infrastructure`, and optionally `composition`, with only composition importing infrastructure and no concrete adapter exposed from the public root.

## Implementation Status

### `cli:spec-implementation` — substantially implemented

- `packages/cli/src/commands/spec/implementation.ts` registers list/add/remove/suggest leaves with `.allowExcessArguments(false)` and format/config options.
- Mutation handlers map parsed flags directly to Kernel inputs; suggestion construction comes from `@specd/sdk`.
- Text output marks `[already included]` and `[new]`; structured output forwards the SDK result.
- Suggest help is registered before the action and therefore does not execute the use case.
- Existing command tests exercise delegation, initialization distinction, inclusion tags, TOON, help-without-execution, and representative typed error mapping.

### `cli:spec-deps` — substantially implemented

- `packages/cli/src/commands/spec/deps.ts` registers list/add/remove/set/clear/suggest leaves and maps mutations to Kernel use cases.
- Suggest delegates to `createSuggestSpecDependencies(config)`, maps `--create-change` to `createAlignmentChange`, never prompts, renders validation diagnostics, and forwards machine-readable results.
- Existing tests exercise all mutation leaves, initialization/no-op behavior, suggestion delegation/rendering, structured help, TOON, and read-only error presentation.

### `sdk:suggest-implementation-links` — implemented with boundary weakness

- The orchestration module has the requested canonical `createSuggestImplementationLinks(deps)` factory and no `node:fs`, filesystem-adapter, cache-constructor, or config-path import.
- Composition constructs `FsImplementationSuggestionCache`, the graph provider, Core use cases, and an FS-backed `SuggestionFileObserver`, then delegates to the canonical factory.
- The main algorithm, scoring reason `exact-primary-symbol-match`, cache port, progress events, inclusion marking, and additive update calls exist.
- The file observer is typed optional and silently falls back to “exists”/empty content, so direct orchestration construction can bypass the injected observation contract.

### `sdk:suggest-spec-dependencies` — structurally implemented but functionally broken for real validation

- The canonical dependency factory, composition facade, cache warm-up, graph traversal, pruning, cache fingerprint, preflight checks, exploration delegation to `CreateChange`, fail-open result, and progress events exist.
- However, the orchestration decodes a non-existent `ValidateSpecsResult.issues` property. The actual Core result is `{ entries, totalSpecs, passed, failed }`, with each entry `{ spec, passed, failures, warnings }`. Consequently the real composed validator reports every completed validation as `all-valid`, even when `failed > 0`; alignment changes cannot be triggered from real Core failures.

### `sdk:composition` — nonconformant and internally contradictory

- The two suggestion cases are correctly split into separate composition files and both delegate to their canonical orchestration factories.
- Runtime workspace dependencies are limited to Core and Code Graph; CLI/MCP/plugins are absent.
- The real source tree and root barrel violate explicit merged requirements: `src/application`, `src/domain`, and `src/infrastructure` exist, additional root files exist, and concrete `FsImplementationSuggestionCache` / `FsSpecDepsSuggestionCache` classes are exported from `src/index.ts`.

## Discrepancies

### CRITICAL — Real `ValidateSpecs` failures are treated as valid

Evidence:

- `packages/core/src/application/use-cases/validate-specs.ts:52` defines `ValidateSpecsResult.entries`, `totalSpecs`, `passed`, and `failed`; it has no `issues` field.
- `packages/core/src/application/ports/validation-result-cache.ts:9` defines each entry with `spec`, `passed`, `failures`, and `warnings`.
- `packages/sdk/src/orchestration/suggest-spec-dependencies.ts:787-849` checks only `valResObj.issues`. With the real result, `invalidSpecs` remains empty and the code selects `status: 'all-valid'`.
- SDK tests mock `{ issues: [...] }` instead of Core's public result, so all 117 SDK tests pass while the real integration is broken.

Impact: the core promise of post-apply validation and conditional alignment-change creation is not met. Invalid specs are silently classified as valid, no change is created, and CLI users receive false reassurance.

Interpretation: the implementation is wrong relative to both the merged SDK spec and the direct Core dependency contract. If the intended validator API truly is `issues`, then the Core spec/API and composition must be deliberately redesigned together; the current change cannot assume it.

### HIGH — SDK public root exports concrete infrastructure adapters

Evidence:

- `packages/sdk/src/index.ts` explicitly exports `FsImplementationSuggestionCache` and `FsSpecDepsSuggestionCache` from `./infrastructure/fs/index.js`.
- Merged `sdk:composition` says the root barrel MUST NOT export infrastructure adapters.
- `default:_global/architecture` says concrete adapter classes are never exported from public entry points.
- `packages/sdk/test/barrel.spec.ts` claims to test absence of infrastructure implementations but does not assert these two newly exported classes are absent.

Impact: delivery hosts can couple directly to SDK filesystem details, undermining storage substitution and the curated facade.

Interpretation: code and coverage are wrong if the architectural contract stands. If public construction of caches is intentional, both global and SDK specs need an explicit exception rather than an accidental export.

### HIGH — `sdk:composition` source-topology requirements contradict both code and the global dependency spec

Evidence:

- Merged `sdk:composition` says `src/` is limited to `composition`, `orchestration`, `presentation`, `shared`, and `index.ts`, and says the SDK MUST NOT contain `domain`, `application`, or `infrastructure` layers.
- The actual tree contains `src/application/ports`, `src/domain/errors`, `src/domain/value-objects`, `src/infrastructure/fs`, plus root `core-reexports.ts`, `ports.ts`, and `extensions.ts`.
- The same merged spec's new suggestion-composition requirement authorizes composition to construct concrete filesystem caches, which are implemented in the prohibited `src/infrastructure` directory.
- `default:_global/architecture` requires any package containing business logic to have `domain`, `application`, and `infrastructure`; SDK now contains nontrivial algorithms, cache ports, and value objects. Thus the SDK-local prohibition conflicts with its global dependency.

Impact: no implementation can simultaneously satisfy the merged SDK layer-list prohibition, the new concrete-cache composition requirement as currently located, and the global layering rule.

Interpretation: this is primarily an artifact/design defect, not merely an implementation bug. The likely correction is to acknowledge SDK as a business-logic package with hexagonal layers and revise the SDK topology requirement; alternatively, move all domain/application/infrastructure concerns out of SDK and narrow it back to a facade.

### MEDIUM — Injected file observation is bypassable

Evidence:

- Merged `sdk:suggest-implementation-links` says candidate existence is validated through an injected file-observation dependency and orchestration operates exclusively through it.
- `SuggestImplementationLinksDeps.fileObserver` is optional.
- `_fileExists()` returns `true` when absent and `_readText()` returns `''` when absent.

Impact: direct use of the canonical factory with a superficially accepted deps object may emit nonexistent candidates and silently disable Tier 2 content inspection.

Interpretation: make the observer required in the canonical deps contract, or document and specify an explicit non-FS observer behavior. The current silent fallback is not the stated contract.

### MEDIUM — Apply-time domain errors are silently swallowed

Evidence:

- `SuggestImplementationLinks` catches every `UpdatePersistedSpecImplementation.execute` error and ignores it.
- `SuggestSpecDependencies` catches every `UpdatePersistedSpecDeps.execute` error and ignores it.
- The CLI and global error contracts expect typed errors to be actionable and consistently mapped; swallowing prevents `SpecNotFoundError`, read-only, conflict, and storage errors from reaching the host.

Impact: `--apply` can exit successfully after failing to persist suggestions; dependency validation may then run against unchanged lock state.

Interpretation: the specs are not explicit about partial-apply error policy, so either implementation should propagate/aggregate typed failures or the SDK specs must define best-effort semantics and expose per-item failures in the result.

### MEDIUM — Tier wording is internally inconsistent

Evidence:

- `sdk:suggest-implementation-links` first states that Tier 2 refines/extends Tier 1 and “does not short-circuit it.”
- The following Tier 2 bullet says “If Tier 2 produces matching candidates, the algorithm short-circuits and returns.”

Impact: reviewers cannot determine whether the implementation should rank a combined Tier 1/2 set or immediately return at Tier 2.

Interpretation: this requires spec clarification. Tests should then lock the chosen behavior.

### LOW — Structured help is locally hard-coded and not fully contract-tested

Evidence:

- Both CLI leaves call `.addHelpText()` directly with embedded response text. This satisfies the observable help requirement, but no shared schema-builder abstraction is used despite the phrase “shared structured-output help mechanism.”
- Tests assert key strings and non-execution but do not compare the documented schema against the exported SDK result types.

Impact: future result-field changes can make help stale without failing tests.

Interpretation: either clarify that Commander's shared convention is the mechanism, or introduce a reusable typed schema helper/test fixture.

## Test Coverage

Executed in this audit:

- SDK package: 13 files, 117 tests passed.
- CLI package: 80 files, 888 tests passed.

Covered well:

- CLI delegation and output for persisted implementation/dependency operations.
- Suggest command delegation, text tags, basic structured-help availability, and no execution during help.
- SDK input validation, MED normalization, primary-symbol reason, inclusion marking, additive call shape, progress events.
- Dependency directional pruning, transitive reduction, ownership-fingerprint invalidation, preflight missing collaborators, fail-open result, and exploration content passed to `CreateChange`.
- Composition config facades instantiate concrete caches and orchestration source has no direct FS/config imports.

Coverage weakness: several passing tests assert implementation-specific mock shapes rather than the public dependency contracts. Most importantly, the validator tests construct `issues`, which the real Core use case never returns.

## Missing Tests

1. A real or contract-faithful `ValidateSpecsResult.entries` integration test proving that failed entries produce `invalid-specs-detected` and one alignment change.
2. A test that valid real `entries` produces `all-valid` and never calls `CreateChange`.
3. A composition topology test for the merged directory restriction. The named scenario exists in `verify.md`, but `package-boundary.spec.ts` does not implement it.
4. A barrel test asserting `FsImplementationSuggestionCache` and `FsSpecDepsSuggestionCache` are not exported from `@specd/sdk` root.
5. A canonical factory test proving missing `fileObserver` is rejected, or an explicit test specifying the intended fallback.
6. Tests that update-use-case errors during both apply flows are propagated or represented, rather than silently ignored.
7. Direct Tier 2 hierarchical/subtoken scenario and Tier 3 fallback co-occurrence scenario tests matching the merged verification artifact; current orchestration tests do not name or construct those end-to-end cases.
8. Cache size/mtime/hash precedence tests at orchestration level for all three freshness branches and `rebuildCache` bypass.
9. CLI tests for every declared typed-error mapping, especially dependency unknown-spec/conflict and implementation boundary/conflict/read-only cases individually.
10. A typed/help snapshot or schema conformance test preventing documented JSON/TOON shapes from drifting from SDK result interfaces.

## Spec Dependency Chain

- `cli:spec-implementation` -> `sdk:suggest-implementation-links` -> Code Graph symbol/traversal/language-adapter specs and Core persisted implementation query/update specs.
- `cli:spec-deps` -> `sdk:suggest-spec-dependencies` -> `sdk:suggest-implementation-links`, Code Graph traversal, Core persisted dependency query/update, and `core:create-change`.
- Both CLI specs -> `cli:entrypoint` for formatting, help, exit, and host-boundary behavior.
- `sdk:composition` -> `default:_global/architecture`, `core:composition`, `code-graph:composition`, both suggestion specs, and host/presentation/review specs.

Consistency assessment:

- CLI-to-SDK dependency direction is correct; CLI package runtime platform dependency is SDK-only.
- Suggestion orchestration-to-composition dependency direction is correct for the new split.
- `sdk:suggest-spec-dependencies` is inconsistent with its direct Core validator dependency at the result-shape boundary.
- `sdk:composition` is inconsistent with global architecture and internally inconsistent about whether SDK may have hexagonal layers/infrastructure.
- SDK public exports violate both the SDK-local and global curated-entrypoint constraints.

## Summary Counts

- Specs audited: 5 change specs plus relevant global/direct dependencies.
- Top-level requirements reviewed: 36.
- Fully/substantially implemented: 30.
- Partially implemented or underspecified: 3.
- Nonconformant/contradictory: 3.
- Findings: 7 total — 1 CRITICAL, 2 HIGH, 3 MEDIUM, 1 LOW.
- Missing or materially insufficient test areas: 10.
- Test execution: 1,005 passing tests across SDK and CLI; passing status does not clear the contract mismatches above.

Overall verdict: **NOT COMPLIANT**. The real `ValidateSpecs` integration failure is release-blocking. The `sdk:composition` topology/export contradictions require design/spec resolution before a clean compliance signoff is possible.
