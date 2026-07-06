# Design: merge-main-user-interface

## Non-goals

- Reconcile or preserve generated metadata artifacts from the branch. Metadata conflicts are intentionally ignored during manual merge resolution and will be regenerated afterwards.
- Change Studio Desktop or UI feature behavior unrelated to project-status/bootstrap wiring.
- Introduce new end-user commands, flags, transport contracts, or workflow states beyond the behavior already present on `main`.

## Affected areas

- `createKernel()` and `KernelOptions` in `packages/core/src/composition/kernel.ts`
  Change: align the branch with `main` by adopting the expanded wiring for `ValidateSpecs` and `GetSpecContext`, keeping repository/status bootstrap on the canonical path, and preserving branch-only kernel helpers that still back API/client/desktop behavior, including artifact read/save helpers, batch validation, outline helpers, and log-ring-backed log access.
  Callers: 8 direct, 128 transitive · Risk: CRITICAL.
  Note: this is the main integration hotspot because SDK host bootstrap, CLI project status, API server bootstrap, desktop IPC, and many composition factories all depend on kernel composition semantics.

- `GetProjectContext` in `packages/core/src/application/use-cases/get-project-context.ts`
  Change: stop recomputing metadata freshness in the use case, trust repository-provided `metadata.freshness`, and preserve stale metadata as usable dependency input while warning explicitly.
  Callers: 5 direct, 24 transitive · Risk: CRITICAL.
  Note: affects CLI/API/Desktop context consumers through kernel and SDK host context.

- `CompileContext` in `packages/core/src/application/use-cases/compile-context.ts`
  Change: use persisted metadata freshness classification instead of local hash checks, treat stale metadata as warning-bearing but still usable for dependency projection, and keep extraction fallback only for missing dependency projections.
  Callers: indirect through project/spec context and change context flows · Risk: HIGH.

- `GetSpecContext` in `packages/core/src/application/use-cases/get-spec-context.ts`
  Change: expand constructor dependencies to include schema provider, parser registry, extractor transforms, and workspace routes; replace local recursive traversal with shared `traverseDependsOn`; use `metadata.freshness` for stale handling.
  Callers: kernel specs API, CLI helpers, API handlers, desktop host context · Risk: HIGH.

- `EditChange` in `packages/core/src/application/use-cases/edit-change.ts`
  Change: seed `change.specDependsOn` from canonical semantic persisted dependency state via `readPersistedDependsOn(spec)` and only fall back to `metadata.json.dependsOn` when semantic state is absent.
  Callers: change editing flows and UI scope management · Risk: MEDIUM.

- `GetStatus` in `packages/core/src/application/use-cases/get-status.ts`
  Change: preserve complete schema-driven artifact-state derivation through config-based factory wiring while reconciling `main`’s repository/bootstrap changes with the branch-local polling/status fields (`ifModifiedSince`, `unchanged`, `hasTasks`) that are still consumed by API, client, UI, and desktop code in this branch.
  Callers: CLI, API, UI, desktop IPC · Risk: HIGH.

- `FsChangeRepository` in `packages/core/src/infrastructure/fs/change-repository.ts`
  Change: align active-read behavior with `main` by moving manifest persistence out of pure load reconstruction, introducing a shared internal `_getInternal(..., { skipWrite })` path, requiring lock-scoped writes for drift/sync persistence, and bypassing drift/status reconciliation when artifact types are unresolved.
  Callers: 9 direct, 45 affected files · Risk: CRITICAL.
  Note: this is a new merge hotspot because it sits under status reads, change mutation, artifact save flows, and every active-change listing path.

- `ValidateSpecs` in `packages/core/src/application/use-cases/validate-specs.ts`
  Change: add canonical metadata consistency validation against persisted dependency state and schema extraction; fail stale metadata instead of silently tolerating it.
  Callers: CLI validate flows, API validation routes, metadata generation workflows · Risk: HIGH.

- `SpecRepository` port in `packages/core/src/application/ports/spec-repository.ts`
  Change: return `PersistedSpecMetadata | null` from `metadata(spec)` so consumers receive freshness state as part of the contract.
  Callers: compile/spec/project context, metadata generation, validation, repository tests · Risk: HIGH.

- `FsSpecRepository` in `packages/core/src/infrastructure/fs/spec-repository.ts`
  Change: classify metadata freshness inside the repository, compare `metadata.dependsOn` with `readPersistedDependsOn(spec)`, hide `spec-lock.json` from `Spec.filenames`, exclude it from spec counting and artifact enumeration, and keep direct artifact access confined to expected files.
  Callers: every workspace-backed spec consumer via kernel composition · Risk: HIGH.

- Config-based composition factories in:
  `packages/core/src/composition/use-cases/get-status.ts`
  `packages/core/src/composition/use-cases/get-project-summary.ts`
  `packages/core/src/composition/use-cases/list-changes.ts`
  `packages/core/src/composition/use-cases/list-discarded.ts`
  `packages/core/src/composition/use-cases/list-drafts.ts`
  `packages/core/src/composition/use-cases/list-workspaces.ts`
  `packages/core/src/composition/use-cases/get-spec-context.ts`
  Change: ensure each factory uses the same canonical repository/bootstrap path as `createKernel`, with no weaker repository variants or partial bootstrap logic.
  Callers: SDK host context and direct composition tests · Risk: HIGH.

- `buildProjectStatusSnapshot()` in `packages/sdk/src/orchestration/build-project-status-snapshot.ts`
  Change: require all repository-backed reads to come from `SdkHostContext` project queries instead of direct repository bootstrap.
  Callers: CLI project status, API project route, desktop IPC snapshot consumers · Risk: MEDIUM.

- `registerProjectStatus()` in `packages/cli/src/commands/project/status.ts`
  Change: route repository-backed data exclusively through SDK host context / snapshot orchestration and remove any alternate direct repository construction path.
  Callers: CLI entrypoint and tests · Risk: MEDIUM.

- Tests in:
  `packages/core/test/application/use-cases/compile-context.spec.ts`
  `packages/core/test/application/use-cases/edit-change.spec.ts`
  `packages/core/test/application/use-cases/get-project-context.spec.ts`
  `packages/core/test/application/use-cases/get-project-summary.spec.ts`
  `packages/core/test/application/use-cases/get-spec-context.spec.ts`
  `packages/core/test/application/use-cases/get-status.spec.ts`
  `packages/core/test/application/use-cases/validate-specs.spec.ts`
  `packages/core/test/infrastructure/fs/change-repository.spec.ts`
  `packages/core/test/infrastructure/fs/spec-repository.spec.ts`
  `packages/core/test/composition/use-cases/get-status.spec.ts`
  `packages/core/test/composition/use-cases/list-changes.spec.ts`
  `packages/core/test/composition/use-cases/list-discarded.spec.ts`
  `packages/core/test/composition/use-cases/list-drafts.spec.ts`
  `packages/core/test/composition/use-cases/list-workspaces.spec.ts`
  `packages/core/test/composition/use-cases/get-project-summary.spec.ts`
  `packages/sdk/test/orchestration/build-project-status-snapshot.spec.ts`
  `packages/cli/test/commands/project/status.spec.ts`
  Change: add or adjust coverage for stale metadata, semantic dependency reads, hidden sidecars, lock-scoped change-repository reads, and canonical bootstrap behavior.
  Callers: CI and local verification · Risk: MEDIUM.

## New constructs

- `packages/core/src/application/use-cases/validate-specs.ts`: private `ValidateSpecs._validateMetadataConsistency(args): Promise<void>`
  Shape:

  ```ts
  private async _validateMetadataConsistency(args: {
    readonly specRepo: SpecRepository
    readonly spec: Spec
    readonly label: string
    readonly schema: Schema
    readonly specArtifactTypes: readonly ArtifactType[]
    readonly failures: ValidationFailure[]
  }): Promise<void>
  ```

  Responsibility: compare persisted metadata freshness and dependency projections against canonical semantic repository state.
  Relationships: called only from `_validateSpec`; depends on `SpecRepository.metadata()`, `readPersistedDependsOn()`, schema extraction, and parser registries.

- `packages/core/src/application/use-cases/validate-specs.ts`: private `ValidateSpecs._extractDependsOn(args): Promise<readonly string[] | undefined>`
  Shape:

  ```ts
  private async _extractDependsOn(args: {
    readonly specRepo: SpecRepository
    readonly spec: Spec
    readonly label: string
    readonly schema: Schema
    readonly specArtifactTypes: readonly ArtifactType[]
  }): Promise<readonly string[] | undefined>
  ```

  Responsibility: perform schema-driven dependsOn extraction only when the schema declares `metadataExtraction.dependsOn`.
  Relationships: called from `_validateMetadataConsistency`; depends on parsers, extractor transforms, workspace routes, and `extractMetadataFromSpecArtifacts`.

- `packages/core/src/application/use-cases/get-spec-context.ts`: private `GetSpecContext._buildDependsOnFallback(): Promise<DependsOnFallback | undefined>`
  Shape:

  ```ts
  private async _buildDependsOnFallback(): Promise<DependsOnFallback | undefined>
  ```

  Responsibility: materialize the shared fallback extraction config for `traverseDependsOn`.
  Relationships: called from `execute()` before dependency traversal; depends on `SchemaProvider`, parser registry, extractor transforms, and workspace routes.

- `packages/core/src/application/use-cases/get-spec-context.ts`: private `GetSpecContext._buildDependencyEntry(...)`
  Shape:

  ```ts
  private async _buildDependencyEntry(
    resolved: ResolvedSpec,
    workspaceMap: Map<string, ProjectWorkspace>,
    warnings: ContextWarning[],
    mode: SpecContextEntry['mode'],
    sections: ReadonlyArray<SpecContextSectionFlag> | undefined,
    llmOptimizedContext = false,
  ): Promise<SpecContextEntry | null>
  ```

  Responsibility: convert resolved dependency identities from shared traversal into context entries using canonical repository reads.
  Relationships: called after `traverseDependsOn`; depends on `ListWorkspaces` results and repository `metadata()`.

- `packages/core/src/infrastructure/fs/spec-repository.ts`: private `FsSpecRepository._classifyMetadataFreshness(spec, metadata, persistedDependsOn): Promise<'fresh' | 'stale'>`
  Shape:
  ```ts
  private async _classifyMetadataFreshness(
    spec: Spec,
    metadata: Record<string, unknown>,
    persistedDependsOn: readonly string[] | null,
  ): Promise<'fresh' | 'stale'>
  ```
  Responsibility: compute freshness once at repository boundary using artifact hashes plus persisted dependency-state parity.
  Relationships: called from `metadata(spec)`; depends on `checkMetadataFreshness`, `readPersistedDependsOn`, and repository artifact reads.

## Approach

0. Execute a real branch merge before any selective conflict edits.
   The implementation starts by running `git merge main` on `feat-user-interface`. Conflict resolution happens on top of Git's merge state, not by manually replaying isolated file copies from `main`. The merge commit must preserve ancestry to the three incoming `main` commits already analyzed for this change.

1. Move metadata freshness classification to the repository boundary.
   `SpecRepository.metadata(spec)` must return `PersistedSpecMetadata | null`, and `FsSpecRepository.metadata(spec)` must classify each persisted metadata record as `fresh` or `stale`. Freshness is `fresh` only when recorded `contentHashes` match current required artifact contents and `metadata.dependsOn` matches canonical semantic dependency state from `readPersistedDependsOn(spec)`. Any missing or mismatched hash, parse failure, or dependency mismatch yields `freshness: 'stale'`.

2. Hide `spec-lock.json` from generic artifact enumeration while keeping semantic access explicit.
   `FsSpecRepository.get()`, `list()`, directory walking, spec counting, and allowed-artifact resolution must exclude `spec-lock.json` from `Spec.filenames` and from generic artifact access. Semantic persisted dependencies continue to flow only through `readPersistedDependsOn(spec)`. This preserves the requirement that sidecars are implementation detail, not normal artifacts.

3. Update context-building use cases to trust repository freshness instead of rechecking hashes.
   `CompileContext`, `GetProjectContext`, and `GetSpecContext` must stop calling `checkMetadataFreshness` directly. Rendering logic uses metadata content only when `metadata.freshness === 'fresh'`. When metadata exists but is stale, the use case emits a `stale-metadata` warning and falls back according to current behavior instead of treating the spec as metadata-missing.

4. Preserve dependency projection order as:
   `change.specDependsOn` snapshot for in-change specs → persisted `metadata.json.dependsOn` for persisted specs, including stale metadata → schema extraction fallback only when no persisted projection is available.
   This ordering applies to `CompileContext`, `GetProjectContext`, and `GetSpecContext`. Extraction failures after finding dependency values are hard failures, not silent drops.

5. Share dependency traversal logic in single-spec context reads.
   `GetSpecContext` must use the shared `traverseDependsOn` helper rather than maintaining a custom recursive traversal. The constructor must accept `SchemaProvider`, `ArtifactParserRegistry`, `ExtractorTransformRegistry`, and workspace routes so traversal can resolve cross-workspace dependencies and schema-backed extraction consistently with project/change context.

6. Seed edited changes from canonical semantic dependency state.
   `EditChange` must first call `readPersistedDependsOn(spec)` when a persisted spec is added to a change. If it returns non-null, use that list directly for `change.specDependsOn`. Only when semantic state is absent may the use case fall back to persisted `metadata.json.dependsOn`. Existing in-change snapshots remain authoritative and must not be overwritten.

7. Make validation enforce canonical metadata parity.
   `ValidateSpecs` must report failures when:
   - metadata exists but repository classifies it as stale,
   - `metadata.json.dependsOn` differs from canonical persisted dependency state,
   - schema extraction is declared and extracted `dependsOn` differs from canonical persisted dependency state.
     When the schema omits `metadataExtraction.dependsOn`, validation checks only persisted metadata parity and does not invent extraction requirements.

8. Preserve canonical repository bootstrap in composition and orchestration.
   Config-based factories for `GetStatus`, `GetProjectSummary`, `ListChanges`, `ListDiscarded`, `ListDrafts`, `ListWorkspaces`, and `GetSpecContext` must all instantiate the same repository/bootstrap semantics as `createKernel`, including schema-driven artifact-state derivation and canonical metadata-path semantics. `buildProjectStatusSnapshot()` and CLI `project status` must read project/workspace information only through `SdkHostContext` project queries, never by constructing repositories directly in the orchestration layer.
   Upstream note: later `main` commits already materialize several of these bootstrap requirements and their verification scenarios, so the corresponding local artifact deltas should collapse to `no-op` where the merged preview shows no remaining branch-only contract.

9. Preserve `main`'s change-repository read-path contract while reconciling branch-only APIs.
   `FsChangeRepository.get()` must remain a real read path for active changes, but any manifest persistence triggered by artifact sync or drift detection must occur only through the internal helper under `_withChangeLock`. `mutate()` must reload through `_getInternal(..., { skipWrite: true })` to avoid nested locks or redundant writes. When no artifact types are resolved, active reads must bypass drift/status derivation rather than writing speculative manifest updates. Branch-only contracts such as `artifactReadOnly` and the public drift-reconciliation hook are not automatically removed by this merge because they were introduced on `feat/user-interface`, not deleted on `main`; they must be kept unless conflict resolution proves they are incompatible with the new read-path behavior.

10. Merge from `main` in a way that preserves active branch contracts unless they conflict with the new canonical bootstrap semantics.
    During code merge resolution, keep `main`’s constructor and repository-bootstrap changes for `ValidateSpecs`, `GetSpecContext`, and project-status wiring, but do not drop branch-local `GetStatus` polling fields (`ifModifiedSince`, `unchanged`, `hasTasks`) or branch-only kernel helpers/log-ring wiring while they still back API, client, UI, and desktop flows in this branch.

11. Treat missing symbols on `main` as branch-only capabilities, not implicit replacements.
    If a branch capability such as `GetReadOnlyChangeArtifact`, `SaveChangeArtifact`, `artifactReadOnly`, `reconcileArtifactDrift`, `ValidateChangeBatch`, `OutlineChangeArtifact`, or log-ring-backed kernel logging has no nominal replacement on `main`, the merge must preserve the capability and adapt it to `main`'s newer repository/bootstrap conventions. Absence on `main` is not by itself evidence that this branch should keep an older implementation shape.

12. Keep architecture and conventions compliant.
    All new logic stays in application/composition/infrastructure layers; domain remains free of I/O. Use named ESM exports, no default exports, no `any`, and preserve existing test organization. New helper methods should receive succinct JSDoc when they carry non-obvious repository/bootstrap semantics.

13. Documentation handling.
    No `docs/` page changes are required unless the implementation reveals a user-visible change in `project status` output or metadata-regeneration operator workflow. If such output changes become externally observable during implementation, update the relevant `docs/` command or workflow documentation in the same implementation batch.

## Key decisions

**Decision**: freshness is computed in `FsSpecRepository.metadata()` and propagated as data.
**Rationale**: every consumer needs the same classification; centralizing it prevents drift between compile, project-context, spec-context, and validation flows.
**Alternatives rejected**: recompute hashes in each use case. Rejected because it duplicates I/O, diverges on stale handling, and reintroduced inconsistent semantics on the branch.

**Decision**: stale metadata remains readable and warning-bearing instead of being treated as missing.
**Rationale**: persisted metadata still contains useful dependency projections and titles/descriptions, and the new requirements explicitly distinguish stale from absent metadata.
**Alternatives rejected**: null out stale metadata. Rejected because it would break fallback ordering and erase the difference between “outdated” and “not generated”.

**Decision**: `spec-lock.json` remains hidden behind semantic repository APIs.
**Rationale**: sidecars are storage detail, and exposing them through `Spec.filenames` or generic artifact reads would violate canonical artifact contracts.
**Alternatives rejected**: expose sidecars as normal artifacts. Rejected because it weakens path confinement and leaks storage internals into callers.

**Decision**: single-spec dependency traversal reuses `traverseDependsOn`.
**Rationale**: change/project/spec context should agree on traversal order, stale behavior, and extraction fallback.
**Alternatives rejected**: keep a bespoke `GetSpecContext` recursion. Rejected because it already drifted from the newer traversal semantics on `main`.

**Decision**: project status orchestration must only use `SdkHostContext` project queries.
**Rationale**: snapshot and CLI layers are adapters, not alternative composition roots.
**Alternatives rejected**: direct repository construction in SDK or CLI. Rejected because it created a weaker bootstrap path with divergent semantics from kernel composition.

**Decision**: adopt `main`'s lock-scoped read-path semantics without assuming branch-only repository APIs are deleted.
**Rationale**: the new `FsChangeRepository` behavior from `main` is real and should drive merge resolution, but `artifactReadOnly` and public drift-reconciliation APIs belong to branch history and therefore need explicit reconciliation rather than silent removal.
**Alternatives rejected**: treat absence from the incoming `main` diff as proof of deletion. Rejected because these contracts never existed on the `main` side of the merge-base and would be lost accidentally rather than by deliberate integration choice.

**Decision**: preserve branch-only `kernel` and `GetStatus` surface while importing `main`'s internal wiring changes.
**Rationale**: `getReadOnlyChangeArtifact`, `saveArtifact`, `validateBatch`, `outlineArtifact`, log-ring-backed logging, and `GetStatus` polling/status fields still have downstream consumers on this branch in API, client, UI, and desktop layers, so removing them would be a branch regression rather than a faithful merge of `main`.
**Alternatives rejected**: collapse the branch surface to `main` immediately. Rejected because it would delete active branch capabilities before their callers are migrated.

**Decision**: when `main` has no nominal replacement, adapt branch-only helpers to the new internals instead of preserving their old implementation shape.
**Rationale**: the branch capabilities still matter, but `main` has changed the surrounding repository/bootstrap conventions, so keeping the old implementation verbatim would preserve behavior at the wrong integration seam.
**Alternatives rejected**: treat absence on `main` as proof no adaptation is needed. Rejected because it would miss real convention drift in `FsChangeRepository`, kernel wiring, and project-status/bootstrap paths.

**Decision**: perform a true `git merge main` before resolving code conflicts.
**Rationale**: this change is specifically about integrating `main` into the branch while preserving history and surfacing real conflicts produced by Git's merge engine.
**Alternatives rejected**: copy changed files or replay `main` edits manually. Rejected because it loses the merge as a first-class integration event and can hide or misresolve conflict boundaries.

## Trade-offs

- `[High-risk merge hotspot in kernel composition]` → Resolve `packages/core/src/composition/kernel.ts` by favoring canonical `main` bootstrap semantics first, then reapply any still-valid branch behavior only through existing composition helpers and updated specs.
- `[High-risk merge hotspot in change repository reads]` → Resolve `packages/core/src/infrastructure/fs/change-repository.ts` by keeping `main`'s lock-scoped `_getInternal`/`mutate(skipWrite)` semantics intact, then reapplying branch-only repository APIs only where they remain compatible and do not reintroduce write-on-read side effects.
- `[Stale metadata now produces more validation failures]` → Accept stricter validation because the user already decided metadata can be regenerated; tests and operator workflow should make regeneration the clear remediation path.
- `[Cross-workspace dependency traversal grows constructor surface]` → Keep additional dependencies private to composition factories and avoid widening public domain contracts.

## Spec impact

### `core:spec-repository-port`

- Direct dependents observed in this change scope: `core:list-workspaces`, `core:compile-context`, `core:get-project-context`, `core:get-spec-context`, `core:validate-specs`.
- Transitive dependents: `core:get-project-summary`, `core:get-status`, `sdk:build-project-status-snapshot`, `cli:project-status`.
- Impact assessment: all dependent requirements remain satisfied after scope updates because the new contract is additive in semantics (`freshness`, hidden sidecar behavior, semantic dependency reads) and the affected dependent specs are already included in this change.

### `core:compile-context`

- Direct dependents: `core:get-project-context`, `core:get-spec-context`.
- Transitive dependents: `cli:project-status`, SDK host-context consumers.
- Impact assessment: dependent specs required updates to stale/missing metadata semantics and fallback ordering; those updates are already in scope.

### `core:get-project-context`

- Direct dependents from current scope: `cli:project-status`.
- Transitive dependents: SDK/API/Desktop project status consumers through host context.
- Impact assessment: no additional spec outside current scope needs modification because externally visible behavior stays within warning/selection semantics already captured by `cli:project-status`.

### `core:change-repository-port` and `core:storage`

- Direct dependents: `core:get-status`, `core:list-changes`, `core:list-drafts`, `core:list-discarded`, `core:get-change-artifact`, `core:save-change-artifact`, and composition factories that build active/draft/discarded change access.
- Transitive dependents: `core:get-project-summary`, `sdk:build-project-status-snapshot`, `cli:project-status`, Desktop IPC status reads, and any polling path that loads active changes.
- Impact assessment: the new read semantics are stricter, but branch-only `artifactReadOnly` and drift-reconciliation contracts still have downstream dependents in this branch. No additional spec outside current scope needs modification because downstream behavior is already captured via status/list/project-status specs; however, merge resolution must preserve those branch contracts unless implementation conflicts prove they cannot coexist with the new read path.

### `core:get-status` and `core:get-project-summary`

- Direct dependents: API change-read handlers, client status adapters, UI polling hooks, desktop IPC handlers, and SDK/CLI project-summary consumers.
- Impact assessment: the merge must preserve the branch-local status surface used for polling and task-capable artifact display while still adopting `main`’s canonical repository/bootstrap path under the hood.
- Post-merge artifact note: `main` now already carries the summary-bootstrap requirement/scenario added earlier in this branch, so the local `core:get-project-summary` spec/verify deltas are intentionally reduced to `no-op` and only the remaining branch-specific wiring work stays documented here.

### `core:list-changes`, `core:list-discarded`, `core:list-drafts`, `core:list-workspaces`, `core:get-status`, `core:get-project-summary`

- Direct dependents: `core:get-project-summary`, `sdk:build-project-status-snapshot`, `cli:project-status`.
- Impact assessment: canonical bootstrap semantics are now explicit in each dependent spec; after rebasing artifacts onto newer `main`, the remaining local spec edits are limited to canonical dependency-ID alignment and no further downstream spec changes are required beyond those already scoped.

### `sdk:build-project-status-snapshot`

- Direct dependents: `cli:project-status`.
- Transitive dependents: API project route and desktop IPC consumers rely on the same orchestration, but their specs are unaffected because no DTO or route contract changes are introduced.

No untracked downstream spec requires additional delta files beyond the 16 specs already in scope.

## Dependency map

```mermaid
graph LR
  CLI[cli project status] --> SDK[buildProjectStatusSnapshot]
  SDK --> HOST[SdkHostContext project queries]
  HOST --> KERNEL[createKernel / canonical factories]
  KERNEL --> CREPO[FsChangeRepository get/mutate]
  KERNEL --> GPCTX[GetProjectContext]
  KERNEL --> GSCTX[GetSpecContext]
  KERNEL --> GSTAT[GetStatus]
  KERNEL --> GSUM[GetProjectSummary]
  KERNEL --> LWS[ListWorkspaces]
  GPCTX --> CC[CompileContext semantics]
  GSCTX --> TRAV[traverseDependsOn]
  GSTAT --> CREPO
  LWS --> SREPO[SpecRepository metadata()]
  SREPO --> FSS[FsSpecRepository freshness + sidecar hiding]
  VAL[ValidateSpecs] --> SREPO
  EDIT[EditChange] --> SREPO
  CREPO -. covers .-> CHPORT[core:change-repository-port]
  CREPO -. covers .-> CSTORE[core:storage]
  SPECREP[core:spec-repository-port] -. depends on .-> COMPILE[core:compile-context]
  COMPILE -. depends on .-> PROJCTX[core:get-project-context]
  PROJCTX -. depends on .-> CLI_SPEC[cli:project-status]
```

```
┌──────────────────────┐
│ CLI project status   │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ SDK snapshot         │
│ buildProjectStatus…  │
└──────────┬───────────┘
           │ uses only
           ▼
┌──────────────────────┐
│ SdkHostContext       │
│ project queries      │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────────────┐
│ createKernel / factories     │  [CRITICAL]
│ canonical bootstrap          │
└───────┬───────────┬──────────┘
        │           │
        │           ├──────────────▶ GetStatus
        │           ├──────────────▶ GetProjectSummary
        │           └──────────────▶ List* use cases
        ▼
┌─────────────────────────────┐
│ FsChangeRepository          │ [CRITICAL]
│ get/mutate lock semantics   │
└───────┬─────────────────────┘
        │
        ├──────────────▶ GetStatus / ListChanges
        │
        ▼
┌──────────────────────┐
│ GetProjectContext    │ [CRITICAL]
└──────────┬───────────┘
           │ shares stale/fallback semantics
           ▼
┌──────────────────────┐
│ CompileContext       │ [HIGH]
└──────────┬───────────┘
           │
           ▼
┌──────────────────────────────┐
│ FsSpecRepository.metadata()  │ [HIGH]
│ freshness + hidden spec-lock │
└───────┬───────────────┬──────┘
        │               │
        ▼               ▼
   ValidateSpecs     EditChange

change-repository-port ─ ─ ─ ▶ storage ─ ─ ─ ▶ list/status/project-summary
spec-repository-port   ─ ─ ─ ▶ compile-context ─ ─ ─ ▶ get-project-context
get-project-context    ─ ─ ─ ▶ sdk snapshot    ─ ─ ─ ▶ cli project-status
```

## Migration / Rollback

- Merge step: run `git merge main` on `feat-user-interface` and leave metadata conflicts unresolved for manual discard/regeneration strategy.
- Migration: no data migration is required. After merge resolution, regenerate metadata artifacts with the normal metadata generation command to restore canonical freshness and dependency projections.
- Rollback: if merge resolution introduces regressions, revert only the functional merge changes for the affected core/sdk/cli files and rerun the targeted test suites. Metadata sidecars can be regenerated again after rollback; they are not authoritative merge inputs.

## Testing

**Automated tests**

- `packages/core/test/infrastructure/fs/spec-repository.spec.ts`
  Add scenarios for hidden `spec-lock.json`, stable hash behavior, stale metadata readability, and freshness classification from hash/dependency mismatch.
  Covers: `core:spec-repository-port` requirements and verify scenarios.

- `packages/core/test/application/use-cases/compile-context.spec.ts`
  Add scenarios for fresh metadata traversal without extraction, stale metadata warnings with usable dependency projection, and explicit failure when extraction finds unnormalizable values.
  Covers: `core:compile-context` requirements and verify scenarios.

- `packages/core/test/application/use-cases/get-project-context.spec.ts`
  Add scenarios for stale-vs-missing metadata distinction, metadata-only dependency discovery when schema extraction is absent, and explicit extraction failure behavior.
  Covers: `core:get-project-context` requirements and verify scenarios.

- `packages/core/test/application/use-cases/get-spec-context.spec.ts`
  Add scenarios for shared dependency traversal through `traverseDependsOn`, fresh metadata dependency discovery without extraction, stale metadata warning retention, cycle dedupe, and unresolved-dependency warnings.
  Covers: `core:get-spec-context` requirements and verify scenarios.

- `packages/core/test/application/use-cases/edit-change.spec.ts`
  Add scenarios for `readPersistedDependsOn(spec)` seeding, stale metadata fallback seeding, and preserving existing in-change snapshots.
  Covers: `core:edit-change` requirements and verify scenarios.

- `packages/core/test/infrastructure/fs/change-repository.spec.ts`
  Add scenarios for lock-protected read invalidation, no write on clean reads, `mutate()` skip-write reload behavior, and uninitialized repository bypass when artifact types are unresolved, while preserving coverage for branch-only `artifactReadOnly` and public drift-reconciliation behavior unless the merge intentionally retires them.
  Covers: `core:change-repository-port` and `core:storage` requirements and verify scenarios.

- `packages/core/test/application/use-cases/validate-specs.spec.ts`
  Add scenarios for stale metadata failure, metadata-vs-persisted dependency drift failure, extracted dependency drift failure, and no extraction failure when schema omits `metadataExtraction.dependsOn`.
  Covers: `core:validate-specs` requirements and verify scenarios.

- `packages/core/test/application/use-cases/get-status.spec.ts`
  Ensure status results still reflect full schema-driven artifact-state derivation after merge and preserve the branch-local polling/status fields that existing API, client, UI, and desktop consumers still require.
  Covers: `core:get-status` requirement.

- `packages/core/test/application/use-cases/get-project-summary.spec.ts`
  Verify config-wired summary counts come from downstream factories using canonical repository semantics.
  Covers: `core:get-project-summary` requirement.

- `packages/core/test/composition/use-cases/list-changes.spec.ts`
  `packages/core/test/composition/use-cases/list-discarded.spec.ts`
  `packages/core/test/composition/use-cases/list-drafts.spec.ts`
  `packages/core/test/composition/use-cases/list-workspaces.spec.ts`
  `packages/core/test/composition/use-cases/get-status.spec.ts`
  `packages/core/test/composition/use-cases/get-project-summary.spec.ts`
  Add composition tests that instantiate config-based factories and assert they preserve artifact-type, metadata-path, and schema-driven repository semantics.
  Covers: list/workspace/status/summary bootstrap requirements.

- `packages/sdk/test/orchestration/build-project-status-snapshot.spec.ts`
  Add a scenario asserting snapshot orchestration reads summary/workspace data only through host-context project queries.
  Covers: `sdk:build-project-status-snapshot` requirement.

- `packages/cli/test/commands/project/status.spec.ts`
  Add a scenario asserting the command uses SDK host context / snapshot path only and does not build repositories inline.
  Covers: `cli:project-status` requirement.

**Manual / E2E verification**

- Run:
  `git merge main`
  Expected: Git produces the real conflict set for this branch; functional conflicts are resolved in tracked code files, while metadata conflicts are ignored for later regeneration.

- Run:
  `node packages/cli/dist/index.js changes validate merge-main-user-interface --artifact specs --format text`
  and
  `node packages/cli/dist/index.js changes validate merge-main-user-interface --artifact verify --format text`
  Expected: all 16 scoped specs pass.

- Run targeted test suites:
  `pnpm --filter @specd/core test -- --runInBand compile-context get-project-context get-spec-context edit-change validate-specs get-status get-project-summary spec-repository change-repository`
  `pnpm --filter @specd/sdk test -- --runInBand build-project-status-snapshot`
  `pnpm --filter @specd/cli test -- --runInBand project/status`
  Expected: added stale-metadata and canonical-bootstrap assertions pass.

- Run a project status smoke test:
  `node packages/cli/dist/index.js project status --format text --context`
  Expected: project summary/context render successfully, stale metadata warnings appear only when metadata is genuinely stale, and no direct-bootstrap regression appears.

- Regenerate metadata after merge-resolution implementation:
  `node packages/cli/dist/index.js generate-metadata --write`
  Expected: stale metadata failures disappear after regeneration, and subsequent validation passes without metadata-consistency failures.

## Open questions

No open questions remain. The merge should follow `main` for canonical bootstrap and metadata semantics, and metadata regeneration is the explicit remediation for stale sidecars.
