# Core compliance audit

## Scope and method

Change: `suggest-implementation-and-spec-deps`

Audited merged previews for:

- `core:fs-spec-repository` — 8 requirements, 33 scenarios
- `core:spec-repository-port` — 19 requirements, 63 scenarios
- `core:create-change` — 13 requirements, 35 scenarios
- `core:change-repository-port` — 29 requirements, 82 scenarios
- `core:fs-change-repository` — 11 requirements, 27 scenarios

Total reviewed surface: **80 requirements and 240 verification scenarios**. The review used merged `spec-preview` output, the current graph (fresh, complete, schema-compatible), implementation diffs and graph-resolved symbols. Direct dependency consistency was checked against `default:_global/architecture`, `core:composition`, `core:storage`, `core:spec-lock`, `core:spec-metadata`, `core:spec-optimization`, `core:change-list-entry`, and the mutual port/adapter dependencies in this batch.

Targeted execution:

```text
pnpm --filter @specd/core exec vitest run \
  test/application/use-cases/create-change.spec.ts \
  test/infrastructure/fs/change-repository.spec.ts \
  test/infrastructure/fs/spec-repository.spec.ts

Test Files  3 passed (3)
Tests       216 passed (216)
```

## Requirements Summary

### `core:fs-spec-repository`

All eight merged requirements are implemented: constructor/schema validation; storage factory; `FsSpecIndexCache` delegation and freshness; complete indexed list projection; metadata-only `get`; aggregate persisted-state serialization; metadata snapshot persistence; and physical Meta/fingerprint observations. The change-specific additions are present: `get()` supplies artifact `size`, and `artifactMeta()` returns `lastModified` plus `size` while keeping `hash` opt-in. Both use the same `_observeArtifact` path.

### `core:spec-repository-port`

All nineteen port requirements remain represented in the abstract port/domain model. `SpecArtifactEntry.size` is optional at the cross-adapter boundary, while `ArtifactMeta.size` is required for a returned observation. This matches the merged language: adapters without cheap metadata may omit the former, while `artifactMeta` observations include size. Existing repository operations, confinement, conflict, persisted-state and metadata-snapshot contracts remain intact.

### `core:create-change`

All thirteen requirements are represented. `CreateChangeInput` accepts optional `explorationContent`; `CreateChange.execute` forwards only non-empty content as semantic creation data to `ChangeRepository.create`; it performs no filesystem/path work. Existing identity, schema, history, dependency seeding, persistence/scaffolding and overlap behavior remain unchanged.

### `core:change-repository-port`

All twenty-nine requirements are represented by the abstract `ChangeRepository` and domain `Change`. The port accepts optional first-create exploration data and exposes lazy `readExploration`/`writeExploration`. `Change.explorationMeta` exposes only a defensive metadata snapshot (`lastModified`, `size`), not content or a filesystem filename. Existing mutation, listing, path-confinement and artifact contracts remain compatible.

### `core:fs-change-repository`

All eleven requirements are implemented. The adapter stores exploration at the private `.specd-exploration.md` path, atomically writes non-empty content, lazily reads it, stats it during aggregate hydration, and removes the first-created change on exploration-write failure. Existing index, manifest, mutation/reconciliation and `saveArtifact` rules remain in place.

## Implementation Status

| Spec                          | Status      | Primary evidence                                                                                                                |
| ----------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `core:fs-spec-repository`     | Implemented | `packages/core/src/infrastructure/fs/spec-repository.ts`: `artifactMeta`, `_buildSpec`, `_observeArtifact`                      |
| `core:spec-repository-port`   | Implemented | `packages/core/src/application/ports/spec-repository.ts`; `packages/core/src/domain/entities/spec.ts`                           |
| `core:create-change`          | Implemented | `packages/core/src/application/use-cases/create-change.ts`: `CreateChangeInput`, `execute`                                      |
| `core:change-repository-port` | Implemented | `packages/core/src/application/ports/change-repository.ts`; `packages/core/src/domain/entities/change.ts`                       |
| `core:fs-change-repository`   | Implemented | `packages/core/src/infrastructure/fs/change-repository.ts`: `create`, `readExploration`, `writeExploration`, `_explorationMeta` |

## Discrepancies

**No actionable specification/implementation discrepancies found.**

The two plausible interpretations checked most closely were:

1. **“First-create failure semantics” could require one physical transaction.** The code first persists the manifest, then exploration, and compensates by calling `delete` if exploration fails. The merged spec defines the observable guarantee—creation fails and `get` cannot observe a partial change—not a single filesystem syscall/transaction. The failure test confirms the required observable outcome. Therefore this is compliant, not a discrepancy.
2. **“Non-empty content” could mean non-whitespace after trimming.** Both use case and adapter treat any `length > 0` string as non-empty. The spec says absent, `undefined`, or empty content; it does not require trimming. The implementation follows the literal contract. If product intent later treats whitespace-only content as absent, the spec and code should change together.

Severity counts: Critical 0, High 0, Medium 0, Low 0.

## Test Coverage

Change-specific coverage is strong:

- `CreateChange` verifies forwarding non-empty exploration content to the repository and reading it back through the semantic port.
- `FsChangeRepository` verifies initial persistence, metadata-only hydration, explicit lazy read, absence/empty behavior, and cleanup after an injected exploration-write failure.
- `FsSpecRepository` verifies `get()` byte size, default `artifactMeta` without hash, opt-in hash, and absence.
- The targeted Core suite passed all 216 tests, preserving coverage of the substantial pre-existing merged port/adapter requirements.

The implementation itself provides direct structural evidence for constraints not easy to observe from black-box tests: `_explorationMeta` calls `fs.stat` rather than `readFile`; `_observeArtifact` performs one `stat` and reads only when `includeHash` is true; the application use case imports and calls only the repository port; the private exploration filename exists solely in the FS adapter.

## Missing Tests

No missing test blocks completion, but three narrow assertions would improve regression precision:

1. **Low — exact no-read assertion for change hydration.** The FS change test checks that the aggregate lacks `explorationContent`, but does not spy on `fs.readFile` to prove `get()` never reads `.specd-exploration.md`. Code inspection confirms `_explorationMeta` uses only `fs.stat`.
2. **Low — direct `writeExploration` behavior.** Initial-create persistence exercises it indirectly; there is no focused test that a later `writeExploration` atomically replaces content, rejects a missing change, and no-ops for empty content. The implementation is straightforward and uses `writeFileAtomic`.
3. **Low — exact single-stat assertion for spec metadata.** Tests validate the resulting `size`, but do not instrument `fs.stat` to prove `lastModified` and `size` came from exactly one call. Code inspection confirms both derive from the single local `stat` result in `_observeArtifact`.

These are test-hardening opportunities, not observed correctness defects.

## Dependency Consistency

- **Global architecture:** compliant. `CreateChange` uses the application port only; filesystem behavior stays in infrastructure. The domain remains I/O-free. Manual constructor injection is preserved.
- **Composition:** no new adapter construction or public concrete-adapter exposure is introduced. `CreateChange` remains a use case wired through existing composition semantics.
- **Port ↔ FS adapter:** consistent. The semantic exploration contract does not expose `.specd-exploration.md`; the filename is adapter-private. `ExplorationMeta` is cheap observation data only.
- **Storage/index contracts:** cleanup calls repository deletion, so a failed exploration write does not leave an active manifest or stale observable list entry. Exploration writes themselves do not alter manifest/list projections.
- **Spec lock / metadata / optimization contracts:** adding artifact byte size does not alter persisted semantic state, fingerprints, lock serialization or generated metadata freshness. Hash remains opt-in and generated metadata remains excluded from `specFingerprint`.
- **Change list entry contracts:** exploration metadata/content is not projected into list entries, consistent with lazy aggregate loading.

No dependency contradictions or package-direction violations were found.

## Summary counts

| Measure                         | Count |
| ------------------------------- | ----: |
| Specs audited                   |     5 |
| Requirements reviewed           |    80 |
| Verification scenarios reviewed |   240 |
| Fully implemented specs         |     5 |
| Partially implemented specs     |     0 |
| Unimplemented specs             |     0 |
| Correctness discrepancies       |     0 |
| Dependency inconsistencies      |     0 |
| Targeted tests passed           |   216 |
| Test-hardening opportunities    |     3 |

**Conclusion:** the five Core specs are compliant with the current implementation. There are no actionable correctness defects; only three low-priority opportunities to make the tests prove internal I/O-efficiency properties more directly.
