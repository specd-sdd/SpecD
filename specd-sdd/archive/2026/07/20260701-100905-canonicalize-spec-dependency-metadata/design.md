# Design: canonicalize-spec-dependency-metadata

## Non-goals

- Do not change CLI commands, flags, or output shapes.
- Do not introduce a new user-facing artifact for `spec-lock.json`.
- Do not eagerly backfill every legacy spec in the repository; legacy metadata fallback remains supported.
- Do not change the meaning of `change.specDependsOn`; it remains the per-change baseline snapshot used to detect archive-time dependency edits.

## Affected areas

- `FsSpecRepository` in `packages/core/src/infrastructure/fs/spec-repository.ts`
  Change: keep `spec-lock.json` out of `Spec.filenames`, reject it through `artifact()` / `save()`, and preserve semantic sidecar access through `readPersisted*` / `updatePersisted*`.
  Callers: high fan-in through `createSpecRepository`, all context/query use cases, archive pipeline, and repository integration tests. Risk: HIGH.

- `SpecRepository` port in `packages/core/src/application/ports/spec-repository.ts`
  Change: expand the metadata read contract so persisted metadata reads distinguish `missing` from `stale`. `metadata(spec)` must return `null` only when `metadata.json` is absent; otherwise it returns the parsed metadata plus freshness state and `originalHash`. The port and tests must also align the stronger “sidecar is not an artifact” contract.
  Callers: all core use cases that read specs. Risk: HIGH because this is the shared port boundary.

- `GenerateSpecMetadata` in `packages/core/src/application/use-cases/generate-spec-metadata.ts`
  Change: merge canonical persisted `dependsOn` into returned metadata, detect extraction-vs-persisted mismatch, and continue projecting implementation from semantic repository state. This use case remains the deterministic reconstruction path when a consumer cannot trust persisted metadata as-is.
  Callers: direct archive-time metadata regeneration and metadata update flows. Risk: HIGH because archive and metadata cache correctness depend on it.

- `SaveSpecMetadata` in `packages/core/src/application/use-cases/save-spec-metadata.ts`
  Change: keep using persisted metadata only for optimistic concurrency and overwrite protection, but tolerate the richer metadata read result (`fresh` vs `stale`). It still writes only `metadata.json` and never mutates `spec-lock.json`.
  Callers: archive, metadata update flows, and direct tooling writes. Risk: MEDIUM because write safety depends on preserving `originalHash` semantics while the read contract changes.

- `loadPersistedSpecDependsOn` in `packages/core/src/application/use-cases/_shared/load-persisted-spec-depends-on.ts`
  Change: keep repository semantic state first, metadata second, empty last; document this helper as the only seeding path for `CreateChange` and `EditChange`.
  Callers: `CreateChange`, `EditChange`. Risk: MEDIUM.

- `CreateChange` in `packages/core/src/application/use-cases/create-change.ts`
  Change: continue seeding `change.specDependsOn` through `loadPersistedSpecDependsOn`; no direct sidecar reads are allowed.
  Callers: CLI/API change creation and tests. Risk: MEDIUM.

- `EditChange` in `packages/core/src/application/use-cases/edit-change.ts`
  Change: continue seeding newly added spec snapshots through `loadPersistedSpecDependsOn`; preserve existing snapshots.
  Callers: CLI/API change scope editing and tests. Risk: MEDIUM.

- `traverseDependsOn` in `packages/core/src/application/use-cases/_shared/depends-on-traversal.ts`
  Change: prefer canonical metadata `dependsOn` from the repository result; only fall back to schema extraction when metadata is missing, or when the consumer policy declares stale metadata insufficient for the current operation.
  Callers: `CompileContext`, shared traversal tests. Risk: HIGH because dependency discovery fans out into context assembly.

- `CompileContext` in `packages/core/src/application/use-cases/compile-context.ts`
  Change: treat metadata as the canonical consumer surface for dependency traversal; keep `change.specDependsOn` highest priority and make the stale/missing metadata policy explicit. `CompileContext` must inspect metadata freshness and decide where stale persisted metadata is acceptable versus when deterministic in-memory reconstruction is required.
  Callers: CRITICAL blast radius, 99 affected files in graph impact, including kernel composition, archive validation support, CLI context flows, and many tests. Risk: CRITICAL.

- `GetProjectContext` in `packages/core/src/application/use-cases/get-project-context.ts`
  Change: same canonical metadata dependency order as `CompileContext`; no generic sidecar reads. It must consume the richer metadata freshness result and fall back explicitly when persisted metadata is missing or too stale for the field being served.
  Callers: CLI/API project context flows and tests. Risk: HIGH.

- `GetSpecContext` in `packages/core/src/application/use-cases/get-spec-context.ts`
  Change: same canonical metadata dependency order for single-spec traversal. It must consume the richer metadata freshness result and fall back explicitly when persisted metadata is missing or too stale for the field being served.
  Callers: CLI/API spec context flows and tests. Risk: HIGH.

- `ValidateSpecs` in `packages/core/src/application/use-cases/validate-specs.ts`
  Change: add canonical metadata consistency checks for stale `contentHashes`, metadata-vs-persisted `dependsOn` drift, and extraction-vs-persisted mismatch when extraction exists. Validation is also the standard path that turns advisory `stale` repository reads into actionable failures.
  Callers: validation CLI/API and integration tests. Risk: HIGH.

- Archive pipeline helpers in `packages/core/src/application/use-cases/archive-change.ts`
  Change: no new responsibility, but implementation must stay consistent with existing `_resolvePersistedDependsOn` and metadata preflight rules because `GenerateSpecMetadata` will now enforce the same canonical projection.
  Callers: archive change flow and archive tests. Risk: HIGH.

- Test suites
  Change: update repository, metadata generation, context traversal, create/edit change, validation, and archive tests to reflect canonical metadata projection and sidecar exclusion.
  Files: `packages/core/test/infrastructure/fs/spec-repository.spec.ts`, `packages/core/test/application/use-cases/generate-spec-metadata.spec.ts`, `compile-context.spec.ts`, `get-project-context.spec.ts`, `get-spec-context.spec.ts`, `validate-specs.spec.ts`, `create-change.spec.ts`, `edit-change.spec.ts`, `archive-change.spec.ts`, and shared traversal helpers.

## New constructs

No new public types, classes, or files are required. The change is an alignment of existing repository semantics, metadata generation, dependency traversal, and validation behavior.

## Approach

1. Harden the repository boundary.
   `FsSpecRepository.get()` and `list()` must stop surfacing `spec-lock.json` in `Spec.filenames`. `artifact()` and `save()` must reject `spec-lock.json` even if the file exists on disk. Semantic sidecar access remains available only through `readPersistedSchema`, `readPersistedDependsOn`, `readPersistedImplementation`, `updatePersistedSchema`, `updatePersistedDependsOn`, `updatePersistedImplementation`, and `specHash`.

2. Expand the metadata repository contract without making the repository reconstruct content.
   `SpecRepository.metadata(spec)` remains a read of persisted `metadata.json`; it does not run extraction and it does not silently rewrite metadata. Its contract becomes:
   - return `null` only when the metadata file does not exist
   - return the parsed metadata plus `originalHash` and `freshness: 'fresh' | 'stale'` when the file exists
   - preserve lenient parsing semantics for malformed files if that behavior already exists, but still mark the result `stale`
   - keep staleness detection inside the repository adapter so every consumer sees the same freshness classification
     This gives all consumers the same persisted view while keeping fallback policy outside the repository.

3. Canonicalize metadata generation around persisted dependency state.
   `GenerateSpecMetadata.execute()` still runs schema extraction, but it must no longer treat extracted `dependsOn` as the final answer by default. After extraction:
   - read persisted dependencies through `specRepo.readPersistedDependsOn(spec)`
   - if persisted dependencies exist, use them as `metadata.dependsOn`
   - if extracted `dependsOn` also exists and differs, fail explicitly
   - if persisted dependencies do not exist, keep extracted `dependsOn` unchanged
   - continue projecting `implementation` from `readPersistedImplementation(spec)`
     This makes `metadata.json` the canonical normalized consumer shape while preserving `spec-lock.json` as the durable persisted source.

4. Keep change snapshots separate from canonical metadata.
   `CreateChange` and `EditChange` must continue using `loadPersistedSpecDependsOn()` to seed `change.specDependsOn`. The helper remains ordered as persisted semantic state first, metadata second, empty last. This preserves the reason `change.specDependsOn` exists: it is a change-local baseline that can later diverge from the final archived dependency set.

5. Unify dependency traversal consumers.
   `traverseDependsOn`, `CompileContext`, `GetProjectContext`, and `GetSpecContext` must all use the same source order:
   - `change.specDependsOn` first when change-local state exists
   - persisted `metadata.json.dependsOn` second as the canonical consumer-facing projection
   - deterministic extraction only when metadata is missing, or when the consumer explicitly requires a fresh reconstructed value and the schema actually declares `metadataExtraction.dependsOn`
     Consumers must not collapse `missing` and `stale` into the same case:
   - `missing` means there is no persisted canonical metadata, so fallback may be required
   - `stale` means persisted canonical metadata exists but may no longer match the current artifacts, so each consumer must decide whether stale data is acceptable for its operation
     No context flow reads `spec-lock.json` through the artifact API. Persisted sidecars are already reflected into metadata by generation/regeneration, and any direct sidecar reads stay behind semantic repository methods.

6. Define explicit consumer fallback policy.
   The repository does not own reconstruction policy. Each consumer that reads metadata must document what it does for each state:
   - `CompileContext`, `GetProjectContext`, `GetSpecContext`: may use persisted metadata for dependency discovery, but must fall back to deterministic extraction for fields that require freshness when metadata is missing or stale and extraction exists
   - `SaveSpecMetadata`: may use stale persisted metadata for overwrite protection and conflict detection because it only needs the previous serialized snapshot and `originalHash`
   - `loadPersistedSpecDependsOn`: may still use metadata as a legacy fallback when no persisted sidecar dependency state exists, but it must ignore freshness for that seed-only compatibility path
   - `ValidateSpecs`: must treat stale metadata and canonical mismatch as failures so drift is surfaced centrally

7. Expand validation to catch permanent drift.
   `ValidateSpecs` must gain a metadata-consistency pass after structural artifact validation and cross-artifact validation. That pass loads metadata and persisted dependencies from the repository and reports failures when:
   - metadata exists and the repository marks it `stale`
   - metadata `dependsOn` differs from `readPersistedDependsOn(spec)`
   - schema extraction for `dependsOn` exists and yields a different set from persisted dependencies
     If extraction is omitted and metadata matches persisted state, validation passes for that check. This is the “fix it forever” mechanism: stale metadata and sidecar/extraction mismatch become visible in the standard validation path without changing CLI contracts.

8. Preserve backward compatibility for legacy specs.
   Legacy specs with no sidecar still work because metadata fallback remains allowed in `loadPersistedSpecDependsOn()` and extraction fallback remains allowed when metadata is absent. The new behavior is stricter only for persisted specs that already have semantic dependency state or canonical metadata.

9. No `docs/` update is required for this change as designed because behavior is internal to core repository semantics and spec workflows, not user-facing CLI behavior. If implementation uncovers user-facing wording changes in CLI help or workflow docs, update the relevant `docs/` page in the same implementation change.

## Key decisions

- **Metadata becomes the canonical consumer shape** → Context readers, search, and metadata-driven tools need one stable shape across heterogeneous schemas. Consumers should not need to know whether a schema stores dependencies in `spec.md`, `verify.md`, or only in a sidecar.
  **Alternatives rejected** → Reading `spec-lock.json` directly in each consumer was rejected because it leaks sidecar mechanics into every use case and keeps the “two sources” problem unsolved.

- **`metadata()` reports freshness instead of pretending stale content is missing** → Persisted metadata existence and freshness are different facts. Returning `null` only for absence lets consumers decide whether stale persisted data is still useful for their operation.
  **Alternatives rejected** → Having `SpecRepository.metadata()` rebuild metadata on read was rejected because repository reads would become schema-aware reconstruction flows; returning `null` for stale metadata was rejected because it erases the difference between “nothing persisted” and “persisted but drifted”.

- **`spec-lock.json` stays durable but not an artifact** → Persisted semantics remain next to the canonical spec, but the normal spec artifact surface stays schema-driven and stable.
  **Alternatives rejected** → Adding `spec-lock.json` to `Spec.filenames` or letting `artifact()` read it was rejected because it breaks the artifact abstraction and revives the original bug.

- **Validation catches metadata drift instead of teaching each reader bespoke fallback rules** → A central validation path scales better and keeps runtime consumers simple.
  **Alternatives rejected** → Letting every consumer silently reconcile metadata, extraction, and sidecar state was rejected because it hides drift and leads to inconsistent results.

- **`change.specDependsOn` remains distinct from persisted metadata** → It captures the baseline at change creation/edit time so archive can detect dependency edits later.
  **Alternatives rejected** → Replacing it with direct metadata reads was rejected because it would lose the before/after snapshot needed by archive semantics.

## Trade-offs

- `[Higher validation strictness]` → Existing stale metadata may now fail `ValidateSpecs`. Mitigation: keep runtime reads advisory, but make validation output actionable and deterministic.
- `[More coupling between metadata generation and persisted repository state]` → `GenerateSpecMetadata` now depends on semantic persisted dependencies in addition to extraction. Mitigation: the dependency already exists conceptually in archive and is exposed through existing port methods, so no new architectural layer crossing is introduced.
- `[Legacy schemas without dependency extraction still rely on metadata regeneration discipline]` → If metadata is absent, traversal still needs fallback behavior. Mitigation: keep absent-metadata extraction fallback and metadata seeding fallback for legacy specs.
- `[Consumer logic becomes more explicit]` → Every metadata consumer must now inspect freshness and document fallback behavior. Mitigation: keep the repository contract uniform (`null` = missing, object = persisted metadata with freshness) and enforce the important cases in specs and tests.

## Spec impact

### `core:spec-metadata`

- Direct dependents reviewed: `core:compile-context`, `core:get-project-context`, `core:get-spec-context`, `core:generate-metadata`, `core:save-spec-metadata`.
- Transitive dependents reviewed through context flows and archive pipeline.
- Additional scope needed: `core:generate-metadata` because its old requirement explicitly said no `dependsOn` postprocessing and that is no longer true.
- Additional scope needed: `core:save-spec-metadata` because the repository metadata read contract now carries freshness state and `SaveSpecMetadata` must specify how stale persisted metadata is treated during overwrite protection.

### `core:spec-repository-port`

- Direct dependents reviewed: `core:get-spec`, `core:create-change`, `core:edit-change`, `core:generate-metadata`, `core:compile-context`, `core:get-project-context`, `core:get-spec-context`, `core:validate-specs`.
- No extra scope required for `core:get-spec`: once `Spec.filenames` excludes `spec-lock.json`, its existing “load all artifact files” behavior remains correct over the schema artifact set.
- Additional scope needed in dependent readers because `metadata(spec)` no longer means simply “parsed object or null”; they must interpret freshness explicitly.

### `core:save-spec-metadata`

- Direct dependencies reviewed: `core:spec-metadata`, `core:spec-repository-port`.
- This spec now needs a delta because overwrite protection and optimistic concurrency both read persisted metadata and must define their behavior when that persisted file is stale.
- No archive-authority change is introduced: `SaveSpecMetadata` still never mutates `spec-lock.json` and still does not decide persisted dependency truth.

### `core:spec-lock`

- Direct dependents reviewed: `core:spec-metadata`, `core:spec-repository-port`, archive behavior.
- No extra scope required for archive specs because current archive requirements already describe persisted dependency sealing and sidecar materialization; implementation alignment happens inside existing archive code and tests.

## Dependency map

```mermaid
graph LR
  SL[spec-lock.json<br/>durable persisted state] --> R[FsSpecRepository semantic methods]
  R --> GM[GenerateSpecMetadata]
  GM --> MD[metadata.json<br/>canonical consumer shape]
  MD --> MR[metadata() result<br/>fresh or stale]
  MR --> CC[CompileContext]
  MR --> GPC[GetProjectContext]
  MR --> GSC[GetSpecContext]
  MR --> SSM[SaveSpecMetadata]
  R --> VS[ValidateSpecs]
  MR --> VS
  LCD[loadPersistedSpecDependsOn] --> CCH[CreateChange]
  LCD --> ECH[EditChange]
  R --> LCD
  CCH --> CSD[change.specDependsOn snapshot]
  ECH --> CSD
  CSD --> CC
```

```text
┌────────────────────┐
│  spec-lock.json    │
│ durable sidecar    │
└─────────┬──────────┘
          │ semantic reads only
          ▼
┌──────────────────────────────┐
│ FsSpecRepository             │
│ readPersisted* / update*     │
│ artifact() rejects spec-lock │
│ metadata() => fresh/stale    │
└───────┬──────────────┬───────┘
        │              │
        │              └───────────────┐
        ▼                              ▼
┌───────────────┐              ┌────────────────┐
│ GenerateSpec  │─────────────▶│ metadata.json  │
│ Metadata      │ canonicalize │ canonical view │
└──────┬────────┘              └──────┬─────────┘
       │                               │
       │                               ▼
       │                     ┌────────────────────┐
       │                     │ metadata() result  │
       │                     │ fresh | stale      │
       │                     └───────┬────────────┘
       │                             ├────────────▶ CompileContext [CRITICAL]
       │                             ├────────────▶ GetProjectContext
       │                             ├────────────▶ GetSpecContext
       │                             ├────────────▶ SaveSpecMetadata
       │                             └────────────▶ ValidateSpecs
       │
       ▼
┌───────────────────────────┐
│ loadPersistedSpecDependsOn│
└──────┬──────────────┬─────┘
       │              │
       ▼              ▼
 CreateChange      EditChange
       │              │
       └──────▶ change.specDependsOn snapshot ──────▶ CompileContext
```

## Migration / Rollback

- No storage migration is required.
- Existing persisted specs remain readable because metadata fallback and absent-metadata extraction fallback remain supported.
- Rollback is a code revert plus regeneration of metadata artifacts if an implementation run has already rewritten them under the new rules.

## Testing

**Automated tests**

- `packages/core/test/infrastructure/fs/spec-repository.spec.ts`
  Add cases that `get()` / `list()` exclude `spec-lock.json` from `Spec.filenames`, and that `artifact(spec, 'spec-lock.json')` / `save()` reject it while `readPersistedDependsOn()` still works.

- `packages/core/test/application/use-cases/generate-spec-metadata.spec.ts`
  Add coverage for:
  - persisted `dependsOn` projected when extraction omits it
  - mismatch between extracted and persisted `dependsOn` failing explicitly
  - implementation projection still coming from semantic repository state

- `packages/core/test/application/use-cases/compile-context.spec.ts`
  Add coverage for:
  - fresh metadata `dependsOn` used even when schema omits dependency extraction
  - extraction fallback only when metadata is absent
  - `change.specDependsOn` still overriding metadata

- `packages/core/test/application/use-cases/get-project-context.spec.ts`
  Add the same canonical-metadata-first dependency traversal cases for project context.

- `packages/core/test/application/use-cases/get-spec-context.spec.ts`
  Add the same canonical-metadata-first dependency traversal cases for single-spec context.

- `packages/core/test/application/use-cases/validate-specs.spec.ts`
  Add scenarios for:
  - stale `contentHashes` causing failure
  - metadata `dependsOn` drift vs persisted state causing failure
  - extraction-vs-persisted mismatch causing failure
  - omitted extraction with matching metadata/persisted state passing

- `packages/core/test/application/use-cases/create-change.spec.ts`
  Update seeding assertions to use semantic persisted dependency state first and metadata as legacy fallback.

- `packages/core/test/application/use-cases/edit-change.spec.ts`
  Update seeding assertions identically and keep the “do not overwrite existing snapshot” case.

- `packages/core/test/application/use-cases/archive-change.spec.ts`
  Keep or extend coverage that archive writes `spec-lock.json`, falls back to persisted dependencies when extraction omits `dependsOn`, and fails on mismatch before publication.

- Shared tests
  Update `packages/core/test/application/use-cases/_shared/depends-on-traversal.spec.ts` and test helpers/stubs so the shared traversal helper and fake repositories reflect the new canonical metadata order.

**Manual / E2E verification**

- Run:
  - `node packages/cli/dist/index.js changes validate canonicalize-spec-dependency-metadata --artifact proposal --format text`
  - `node packages/cli/dist/index.js changes validate canonicalize-spec-dependency-metadata --all --artifact specs --format text`
  - `node packages/cli/dist/index.js changes validate canonicalize-spec-dependency-metadata --all --artifact verify --format text`
  - targeted core tests for repository, metadata generation, context traversal, create/edit change, validate specs, and archive flows
  - repository-wide lint/test commands required by the global testing and eslint specs before transition to `ready`

- Verify merged deltas manually with:
  - `node packages/cli/dist/index.js changes spec-preview canonicalize-spec-dependency-metadata core:spec-repository-port --artifact specs`
  - `node packages/cli/dist/index.js changes spec-preview canonicalize-spec-dependency-metadata core:generate-metadata --artifact specs`
  - `node packages/cli/dist/index.js changes spec-preview canonicalize-spec-dependency-metadata core:spec-metadata --artifact verify`

- Expected outcome:
  - `spec-lock.json` never appears as a normal artifact
  - metadata-driven context readers obtain canonical `dependsOn` from metadata even when the schema does not extract dependencies
  - `ValidateSpecs` fails when metadata is stale or canonical dependency projection is inconsistent

## Open questions

None.
