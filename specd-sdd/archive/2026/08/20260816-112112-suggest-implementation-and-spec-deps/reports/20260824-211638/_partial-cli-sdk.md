# Compliance Audit — CLI and SDK suggestion surfaces

## Scope and method

Change: `suggest-implementation-and-spec-deps`  
Specs: `cli:spec-implementation`, `cli:spec-deps`, `sdk:suggest-implementation-links`, `sdk:suggest-spec-dependencies`, `sdk:composition`.

The audit used each change spec's merged `changes spec-preview`, the project-wide directives (especially `default:_global/architecture`, `_global/testing`, `_global/conventions`, and `_global/error-handling-conventions`), and the declared direct dependencies at depth 1. Code discovery was graph-first (`graph stats`, `graph search`) and then confirmed against the implementation and tests. The graph was current and complete. No code or spec was modified.

## Requirements Summary

| Spec                               | Requirements | Verification scenarios | Status                                                                                 |
| ---------------------------------- | -----------: | ---------------------: | -------------------------------------------------------------------------------------- |
| `cli:spec-implementation`          |            9 |                     15 | Implemented                                                                            |
| `cli:spec-deps`                    |           10 |                     16 | Implemented                                                                            |
| `sdk:suggest-implementation-links` |            6 |                     17 | Implemented                                                                            |
| `sdk:suggest-spec-dependencies`    |            4 |                     14 | Implemented                                                                            |
| `sdk:composition`                  |            8 |                     16 | Implemented according to the new composition requirement, but internally contradictory |
| **Total**                          |       **37** |                 **78** | **37 implemented; 1 spec-level contradiction**                                         |

## Implementation Status

### `cli:spec-implementation`

All nine requirements are implemented in `packages/cli/src/commands/spec/implementation.ts`:

- `list`, `add`, `remove`, and `suggest` are registered as leaf commands, reject excess arguments, and accept structured formats.
- The persisted-state commands delegate to `kernel.specs.getPersistedImplementation` and `kernel.specs.updatePersistedImplementation`; the CLI passes raw file values and does not perform filesystem observation or canonical link mutation.
- Uninitialized output is distinct in text and includes `initialized` in structured output.
- `suggest` resolves the SDK composition facade, forwards all target/apply/cache/confidence options, renders confidence and `[already included]`/`[new]`, and documents the JSON/TOON response without executing the use case.
- Typed failures flow through the shared CLI error mapper, consistent with `cli:entrypoint` and the global machine-readable error convention.

### `cli:spec-deps`

All ten requirements are implemented in `packages/cli/src/commands/spec/deps.ts`:

- `list`, `add`, `remove`, `set`, `clear`, and `suggest` exist, reject excess arguments, and expose structured formats.
- Mutation commands map directly to the persisted dependency use case, including empty-set clearing and uninitialized remove no-op behavior.
- `suggest` calls the SDK facade and forwards `--apply`, `--create-change`, cache and targeting options.
- Text and structured results include existing/new status, mutation totals, canonical post-apply validation entries, and created alignment-change information.
- The alignment flag does not write exploration files in the CLI; creation and optional exploration content are delegated through the SDK/Core `CreateChange` contract.

### `sdk:suggest-implementation-links`

All six requirements are implemented in `packages/sdk/src/application/use-cases/suggest-implementation-links.ts`:

- Canonical input validation and typed errors cover target selection, workspace, spec identity, and confidence normalization.
- The three-tier analysis preserves Tier 1 when Tier 2 adds candidates and uses Tier 3 only as fallback; scoring, cache invalidation/rebuild, symbol differentiation, and path/token affinity are implemented.
- Existing links are marked using canonical files from persisted state.
- `apply` performs additive mutations only and propagates mutation failures.
- The application factory requires resolved ports, including a file observer; the module has no filesystem/config/composition imports.
- Progress events are emitted throughout discovery and analysis.

### `sdk:suggest-spec-dependencies`

All four requirements are implemented in `packages/sdk/src/application/use-cases/suggest-spec-dependencies.ts`:

- Target validation, workspace/spec errors, cache warm-up, import tracing, directional validation, transitive reduction, and cache ownership invalidation are present.
- Apply is additive and mutation failures propagate.
- Post-apply validation consumes canonical `ValidateSpecsResult.entries`, selects `!passed` entries, preserves failures and warnings, and propagates validator errors rather than fabricating `all-valid`.
- Missing validator dependencies fail before mutation.
- At most one optional alignment change is created through injected `CreateChange`; exploration content is passed into that use case and is not written directly by the SDK.
- The canonical dependency-injected factory and progress events are present.

### `sdk:composition`

The implementation satisfies the newly added suggestion-composition requirement:

- Each application use case has its own file under `src/application/use-cases/`.
- Concrete filesystem observers/caches are assembled only in `src/composition/` and the config facade delegates to the canonical `createX(deps)` application factory.
- The application modules have no `node:fs`, concrete cache, or config-path dependency.
- The SDK root exports curated use cases, types, ports, and composition factories, but not `FsImplementationSuggestionCache` or `FsSpecDepsSuggestionCache`.
- Package dependencies remain limited to Core and Code Graph, and the pre-existing curated barrel/import-policy requirements remain satisfied.

## Discrepancies

### D-1 — HIGH — `sdk:composition` contains mutually exclusive layer requirements

**Evidence**

- The merged pre-existing **Layer structure** requirement says the SDK source directories are limited to composition/orchestration/presentation/shared plus `index.ts`, and explicitly says the package “MUST NOT contain ... application ports, or infrastructure adapters” (`specs/sdk/composition/spec.md:13-23`). Its merged verification scenario still requires that no `infrastructure/` directory exist.
- The newly merged **Suggestion use-case composition** requirement requires the normal hexagonal topology, places each use case under `src/application/use-cases/`, and explicitly permits composition to construct SDK filesystem infrastructure and concrete caches.
- The implementation necessarily contains `src/application/use-cases/` and `src/infrastructure/fs/`; for example `packages/sdk/src/composition/suggest-implementation-links.ts:13-19` imports the concrete cache and application use case.
- `packages/sdk/test/composition/package-boundary.spec.ts:24-49` correctly tests the new topology, but does not and cannot satisfy the older “no infrastructure/application” scenario.

**Code interpretation**

The code follows the latest design decision and the global hexagonal architecture: application behavior is separate from composition, and filesystem details remain at the edge. Under that interpretation the old layer requirement/scenario is stale and should be replaced, not implemented.

**Spec interpretation**

If the historical Layer structure requirement remains authoritative, the current SDK directory structure and concrete infrastructure are non-compliant. Meeting it would undo the explicit new requirement and the agreed design. Therefore this cannot be repaired safely in code; the merged spec and verify artifact need reconciliation in design.

**Recommended resolution**

Update `sdk:composition` so its Layer structure requirement includes `application/` and `infrastructure/` with explicit dependency-direction constraints, and replace the obsolete “No infrastructure in SDK source tree” verification scenario with checks that infrastructure is not imported by application use cases and is not exported from the root barrel.

No other correctness discrepancy was found.

## Test Coverage

### Executed suites

- SDK: **13 files, 122 tests passed**.
- CLI: **80 files, 888 tests passed**.

The package scripts executed their complete package suites even when file arguments were supplied. There were no failures.

### Coverage assessment by spec

- `cli:spec-implementation`: strong behavioral coverage for delegation, uninitialized rendering, structured help, structured format, suggest forwarding, status tags, typed errors, and mutation/result rendering.
- `cli:spec-deps`: strong behavioral coverage for all persisted mutations, no-op semantics, structured help, suggest forwarding, status tags, validation rendering, uninitialized rendering, and read-only errors.
- `sdk:suggest-implementation-links`: strong unit coverage with mocked ports for targeting/errors, cache hashing/rebuild, additive mutation, propagation, existing marking, Tier 1/Tier 2 preservation, confidence normalization, and progress.
- `sdk:suggest-spec-dependencies`: strong unit coverage for warm-up/tracing, apply and failure propagation, canonical validation entries, optional change creation with exploration content, validator failure, cache ownership changes, directional validation, transitive reduction, targeting errors, and progress.
- `sdk:composition`: focused package-boundary tests prove concrete assembly stays in composition, application modules have no filesystem/composition imports, and concrete caches are absent from the root. Broader pre-existing SDK composition tests cover exports and host surfaces elsewhere in the package suite.

## Missing Tests

The following are coverage improvements, not observed implementation defects:

1. **MEDIUM / spec contradiction:** there is no passing test for the old `sdk:composition` scenario “No infrastructure in SDK source tree”; such a test would necessarily fail and conflict with the new scenario. This is resolved only by updating the spec/verify artifact (D-1).
2. **LOW:** CLI command tests do not individually exercise every typed error listed by both command specs at each leaf. Shared `handle-error` tests cover `ArtifactConflictError`, and leaf tests demonstrate the shared mapping path, but explicit per-command retry-message and workspace-boundary assertions would improve traceability.
3. **LOW:** the implementation-suggestion suite exercises cache rebuild and real content stamps, but an explicitly named assertion for the complete “fast-path without reindex when fresh” branch would map more directly to the scenario wording.
4. **LOW:** dependency cache tests cover persisted reuse, rebuild, and ownership invalidation; an explicit fixture with an obsolete cache schema/version would make the “version mismatch” scenario independently obvious.
5. **LOW:** a CLI test should assert `--create-change` forwarding plus rendering of the returned `createdChange` block in the same end-to-end command scenario. The SDK creation behavior itself is directly tested.

## Dependency Consistency

- `default:_global/architecture`: the new application/composition/infrastructure separation is consistent with the global hexagonal rule. The old `sdk:composition` layer prohibition is the inconsistent artifact (D-1).
- `_global/testing`: SDK application logic is unit-tested with injected/mocked ports; filesystem cache infrastructure has separate real-filesystem tests. CLI adapter behavior is tested at the command boundary.
- `_global/error-handling-conventions` and `cli:entrypoint`: command failures route through the shared formatter/error mapper; structured output/help is registered and leaf commands reject excess arguments.
- Core persisted implementation/dependency use-case dependencies: CLI does not duplicate normalization, validation, or persistence and delegates through Kernel/SDK boundaries.
- Code Graph symbol/traversal/language-adapter dependencies: SDK consumes the provider and graph port; application code does not instantiate filesystem or config infrastructure.
- `core:create-change`: dependency suggestions pass optional `explorationContent` to `CreateChange`; there is no SDK/CLI direct write, preserving repository-specific persistence behavior.
- `sdk:suggest-implementation-links` → `sdk:suggest-spec-dependencies`: the latter consumes the injected implementation-suggestion use case and retains application-layer dependency direction.
- Package dependency policy: `@specd/sdk` has only `@specd/core` and `@specd/code-graph` platform runtime dependencies; CLI consumes SDK rather than parallel Core/Code Graph runtime dependencies.

## Summary counts

| Category                        |  Count |
| ------------------------------- | -----: |
| Requirements audited            |     37 |
| Verification scenarios reviewed |     78 |
| Requirements implemented        |     37 |
| Code correctness defects        |      0 |
| Spec-level contradictions       | 1 HIGH |
| Additional test improvements    |  4 LOW |
| SDK tests passed                |    122 |
| CLI tests passed                |    888 |

**Overall:** The CLI and SDK implementation is functionally compliant with the intended new design and all executed tests pass. Verification should not silently dismiss D-1: `sdk:composition` must return to design so its old layer requirement/scenario is reconciled with the newly required application/infrastructure topology.
