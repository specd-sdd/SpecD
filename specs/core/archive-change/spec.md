# ArchiveChange

## Purpose

Once a change has completed its full lifecycle, its spec modifications need to be applied to the project and the change itself preserved for posterity — but this finalization involves delta merging, hook execution, and metadata generation that must happen atomically and in the right order. `ArchiveChange` is the use case that merges delta artifacts into project specs, moves the change directory to the archive, and fires lifecycle hooks before and after. It is gated on `archivable` state.

## Requirements

### Requirement: Ports and constructor

`ArchiveChange` receives at construction time: `ChangeRepository`, a map of `SpecRepository` instances (one per configured workspace), `ArchiveRepository`, `RunStepHooks`, `ActorResolver`, `ArtifactParserRegistry`, `ExtractorTransformRegistry`, `SchemaProvider`, `GenerateSpecMetadata`, `SaveSpecMetadata`, and `SpecWorkspaceRoute[]`.

```typescript
class ArchiveChange {
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    archive: ArchiveRepository,
    runStepHooks: RunStepHooks,
    actor: ActorResolver,
    parsers: ArtifactParserRegistry,
    extractorTransforms: ExtractorTransformRegistry,
    schemaProvider: SchemaProvider,
    generateMetadata: GenerateSpecMetadata,
    saveMetadata: SaveSpecMetadata,
    workspaceRoutes: readonly SpecWorkspaceRoute[],
  )
}
```

Hook execution is delegated to `RunStepHooks` — `ArchiveChange` does not receive `HookRunner` or `projectWorkflowHooks` directly.

`SchemaProvider` is a lazy, caching port that returns the fully-resolved schema (with plugins and overrides applied). It replaces the previous `SchemaRegistry` + `schemaRef` + `workspaceSchemasPaths` triple. All are injected at kernel composition time, not passed per invocation.

`specs` is keyed by workspace name. A change may touch specs in multiple workspaces (e.g. `default` and `billing`); `ArchiveChange` looks up the `SpecRepository` for each spec ID's workspace before reading the base spec or writing the merged result. The bootstrap layer constructs and passes all workspace repositories.

`ArtifactParserRegistry` is a map from format name (`'markdown'`, `'json'`, `'yaml'`, `'plaintext'`) to the corresponding `ArtifactParser` adapter. `ArchiveChange` uses it to look up the correct adapter when applying delta files to base artifacts. The bootstrap layer constructs it and injects it here — `ArchiveChange` does not instantiate parsers directly.

`ExtractorTransformRegistry` is the shared runtime registry for metadata extraction transforms. `ArchiveChange` uses it during the pre-publication metadata-consistency pass that runs `extractMetadata(...)` over the prepared merged artifact content before canonical publication.

`SpecWorkspaceRoute[]` provides the workspace-routing metadata needed to build transform contexts for extraction operations that resolve spec references across workspace boundaries. `ArchiveChange` receives those routes at construction time so its pre-publication extraction pass uses the same routing model as other metadata-extraction callers.

`ChangeRepository` is used both for loading and persisting the change being archived and for listing all active changes during the overlap check.

### Requirement: Input

`ArchiveChange.execute` receives:

- `name` — the change name to archive
- `skipHookPhases` (ReadonlySet<ArchiveHookPhaseSelector>, optional, default empty set) — which archive hook phases to skip. Valid values: `'pre'`, `'post'`, `'all'`. When `'all'` is in the set, all archive hook execution is skipped. When the set is empty (default), both phases execute.
- `allowOverlap` (boolean, optional, default `false`) — when `true`, the use case skips the overlap check and permits archiving even when other active changes target the same specs

### Requirement: Schema name guard

After obtaining the schema from `SchemaProvider`, `ArchiveChange` must compare `schema.name()` with `change.schemaName`. If they differ, it must throw `SchemaMismatchError`. This must happen before the archivable guard, any hooks, or file modifications.

### Requirement: ArchivedChange construction

The use case MUST call `ArchiveRepository.archive(change, { actor })` to move the change to the permanent archive. The resulting `ArchivedChange` entity MUST be returned in the result.

### Requirement: Archivable guard

After the schema name guard, `ArchiveChange.execute()` MUST verify the change is archivable without yet transitioning lifecycle state.

The use case MUST call `change.assertArchivable()` on the loaded change. If the change is not in `archivable` or `archiving` state, it MUST throw `InvalidStateTransitionError` and abort before any hooks, snapshots, or file modifications.

This guard MAY run outside `ChangeRepository.mutate` when no lifecycle mutation is required. When the change is already in `archiving` from a prior failed commit, `assertArchivable()` MUST still pass so a retry can proceed.

### Requirement: Deferred transition to archiving

After full-batch preflight succeeds and batch canonical snapshots are written, `ArchiveChange` MUST transition the change to `archiving` inside a serialized `ChangeRepository.mutate(name, fn)` immediately before the first canonical `SpecRepository.publish()` call.

Inside the mutation callback, the use case MUST:

1. Obtain the fresh persisted `Change`.
2. Call `change.assertArchivable()`.
3. Call `change.transition('archiving', actor)` when the fresh change is not already in `archiving`.
4. Return the updated change.

Overlap guard, readOnly guard, pre-archive hooks, and preflight MUST complete while the change remains in `archivable`. Pre-archive hooks use workflow step `'archiving'`; they do not require lifecycle state `archiving`.

### Requirement: ReadOnly workspace guard

After the archivable guard passes and before canonical snapshots or publication, `ArchiveChange` MUST check every spec ID in `change.specIds` against the `SpecRepository` map. For each spec ID, it MUST look up the corresponding `SpecRepository` by workspace name and check `repository.ownership()`.

If any spec belongs to a workspace with `readOnly` ownership, `ArchiveChange` MUST throw `ReadOnlyWorkspaceError` with a message listing all affected specs and their workspaces. The error message format:

```text
Cannot archive change "<name>" — it contains specs from readOnly workspaces:

  - <specId>  →  workspace "<workspace>" (readOnly)

Archiving would write deltas into protected specs.
```

This check MUST occur before any hooks execute or any spec files are written. The change MUST remain in `archivable` when this guard throws.

### Requirement: Overlap guard

After the archivable guard passes and before pre-archive hooks execute, `ArchiveChange` MUST check for spec overlap with other active changes and handle invalidation when `allowOverlap` is `true`. The change MUST still be in `archivable` during this check.

The check MUST:

1. Call `ChangeRepository.list()` to retrieve all active changes
2. Exclude the change being archived from the list
3. Call the `detectSpecOverlap` domain service with the remaining changes plus the change being archived
4. Filter the result to entries where the change being archived participates

**When `allowOverlap` is `false`:** If the filtered report has overlap, `ArchiveChange` MUST throw `SpecOverlapError` with the overlap entries. The error message MUST list the overlapping spec IDs and the names of the other changes targeting them.

**When `allowOverlap` is `true`:** If the filtered report has overlap, `ArchiveChange` MUST invalidate each overlapping change as defined in the existing overlap invalidation rules.

If the filtered report has no overlap, the archive proceeds normally regardless of the `allowOverlap` flag.

### Requirement: Pre-archive hooks

After the archivable guard passes and while the change is still in `archivable`, when `'all'` and `'pre'` are both absent from `skipHookPhases`, `ArchiveChange` must execute pre-archive hooks by delegating to `RunStepHooks.execute({ name, step: 'archiving', phase: 'pre' })`.

If any pre-archive `run:` hook fails, `ArchiveChange` must throw `HookFailedError` with the hook command, exit code, and stderr. No lifecycle transition to `archiving`, no canonical snapshots, and no spec files are modified before a failed pre-archive hook.

When `'all'` or `'pre'` is in `skipHookPhases`, pre-archive hook execution is skipped entirely.

### Requirement: Tracked artifact selection at archive time

For every spec-scoped artifact, `ArchiveChange` MUST select the source file from the tracked `ArtifactFile.filename` declared on the change state for that spec ID and artifact type.

`ArchiveChange` MUST NOT derive, probe, or prefer an alternate `deltas/...` or `specs/...` path at archive time when that path is not the tracked filename for the artifact file being archived.

If the tracked file for a delta-capable artifact is a direct `specs/...` file, `ArchiveChange` MUST treat that direct file as authoritative even when another file happens to exist at a delta-shaped path on disk.

### Requirement: Prepare archive plan before permanent writes

`ArchiveChange` MUST complete a full archive-batch preflight before canonical publication begins for any spec.

During this preflight, `ArchiveChange` MUST resolve every tracked archive input, apply every required delta, build every planned canonical write, and execute every archive-time check that can still fail the archive attempt.

Archive-time checks covered by this rule include structural checks, metadata-extraction consistency checks, persisted-dependency sealing checks, sidecar-eligibility checks, and any other validation or consistency rule whose failure would reject the archive attempt.

If any preflight step fails for any spec in the archive batch, `ArchiveChange` MUST abort the archive before canonical publication begins for every spec. It MUST NOT publish an earlier spec and then continue validating a later spec.

The output of this requirement is an in-memory archive plan that is fully validated for the entire batch. Only after that full preflight succeeds MAY `ArchiveChange` start staged canonical publication.

### Requirement: Staged archive commit and failed-attempt visibility

Canonical publication begins only after the full archive-batch preflight has succeeded and batch canonical snapshots have been written for every spec in the batch.

A failure that occurs during preflight MUST leave canonical storage unchanged for every spec in the archive batch.

After canonical publication begins, failures are limited to the staged publication or archive-finalization phases. Those failures MUST preserve the existing guarantee that canonical storage does not expose a partially written version of an individual published spec.

Multi-spec archive has three safety boundaries:

- full-batch preflight atomicity before any canonical publication begins
- per-spec publication atomicity once staged canonical publication has started
- batch canonical snapshot and restore so a failed multi-spec commit attempt does not leave merged specs from earlier publications in the batch

On commit-phase failure after snapshots were taken, `ArchiveChange` MUST restore every spec in the batch to its pre-attempt canonical state before returning control to the caller.

### Requirement: Batch canonical snapshot before publication

Immediately after full-batch preflight succeeds and before the deferred transition to `archiving`, `ArchiveChange` MUST write a canonical snapshot for every spec in the archive batch.

For each spec:

1. Determine whether the canonical spec directory already existed.
2. Record every pre-existing canonical file path, including `spec-lock.json` when present.
3. Copy each pre-existing canonical file into `<specDir>/.specd-archive-backup/`.
4. Write `<specDir>/.specd-archive-backup/manifest.json` containing at minimum:
   - `changeName`
   - `specDirExisted: boolean`
   - `existingFiles: string[]`
   - `createdFiles: string[]` — initially empty; populated as publication proceeds

Snapshotting MUST NOT include `.specd/metadata/.../metadata.json`. That file is generated output and is not part of the commit contract.

### Requirement: Batch canonical restore on commit failure

When any commit-phase step fails after batch snapshots were written — including `SpecRepository.publish()` or `archiveRepository.archive()` — `ArchiveChange` MUST restore canonical storage for every spec in the batch before rethrowing the error.

Restore MUST run in reverse publication order. For each spec:

- If `manifest.specDirExisted` is `false` and the spec directory was created during this attempt, remove the entire spec directory.
- If `manifest.specDirExisted` is `true`, restore every path listed in `manifest.existingFiles` from `.specd-archive-backup/`.
- Delete every path listed in `manifest.createdFiles` that is not listed in `manifest.existingFiles`.

Restore MUST NOT delete or overwrite pre-existing canonical files that were not created or modified by this archive attempt.

After successful restore for all specs, `ArchiveChange` MUST delete each `.specd-archive-backup/` directory.

If restore itself fails for one or more specs, `ArchiveChange` MUST record the partial-restore outcome in the thrown error or repair guidance, leave the change in `archiving`, and MUST NOT auto-transition to `archivable`.

### Requirement: Orphan archive backup detection

Before writing new batch snapshots, `ArchiveChange` MUST detect an existing `.specd-archive-backup/` directory under any spec directory targeted by the archive batch.

- When `manifest.changeName` matches the current change name, `ArchiveChange` MUST auto-restore from that backup, delete the backup directory, and abort the current archive attempt with guidance to review the restored state and retry.
- When `manifest.changeName` differs or the manifest is unreadable, `ArchiveChange` MUST abort with repair guidance and MUST NOT begin publication.

### Requirement: Lifecycle rollback after failed commit

When a commit-phase failure occurs and batch canonical restore completes successfully for every spec in the batch, `ArchiveChange` MUST:

1. Append an `archive-failed` event with `commitStarted: true`.
2. Transition the change from `archiving` to `archivable` inside `ChangeRepository.mutate`.

When batch restore does not complete successfully, the change MUST remain in `archiving`.

### Requirement: Archive debug logging

`ArchiveChange` and the batch snapshot adapter (`FsArchiveBatchSnapshot` or equivalent) MUST emit debug-level logs at each meaningful archive step so operators can trace preparation, commit, recovery, and completion without enabling trace-level noise.

**Pre-commit (`ArchiveChange`):**

- archivable guard pass — change name and current state
- overlap and readOnly guard outcomes — spec IDs checked; overlap entries or readOnly workspaces when relevant
- pre-archive hooks — start and completion (step, phase, skipped phases)
- prepare-plan construction — publication count, stale specs, out-of-scope implementation counts
- full-batch preflight completion — publication count
- orphan backup detection — per spec: none found, matching orphan auto-restored, or foreign orphan abort
- batch snapshot — start and completion per spec (`specId`, `specDirExisted`, `existingFiles` count)
- deferred transition to `archiving` — change name and actor identity
- tracked artifact selection per spec-scoped artifact — direct vs delta-backed

**Commit phase:**

- staged publication start and completion per spec (`specId`, artifact count)
- each newly created canonical path recorded in the batch manifest (`recordCreatedFile`)
- archive repository call start and completion
- backup cleanup after successful archive move — spec IDs cleaned

**Recovery phase:**

- commit failure — failure step, `commitStarted`, and error message summary
- batch restore start and completion — reverse publish order, `restoredSpecIds`, `failedSpecIds`
- lifecycle rollback to `archivable` when restore succeeds
- partial restore — change remains in `archiving`; log lists specs that failed restore

**Post-commit:**

- persisted metadata generation start and completion per spec (or skip reason)
- post-archive hooks start and completion

**Failure diagnostics (all phases):**

- failure step (`prepare`, `commit`, `archive`, `metadata`)
- spec ID and artifact basename when failure is spec-scoped
- restore outcome when `commitStarted` is true

Each entry MUST use structured context fields (`change`, `specId`, `step`, `phase`, and other step-specific keys) per [`default:_global/logging`](../../_global/logging/spec.md). Debug logs MUST NOT include full file contents, hook stderr, or secrets.

### Requirement: Delta merge and spec sync

After all pre-archive hooks succeed, `ArchiveChange` must merge each delta artifact into the project spec and sync the result to `SpecRepository`.

For each spec ID in `change.specIds`:

1. Resolve the active schema for that spec's workspace.
2. For each artifact in the schema with `scope: spec`:
   a. Retrieve the file for this spec ID from the artifact via `artifact.getFile(specId)`. If the file is absent or its status is `missing` or `skipped`, skip — nothing to sync.
   b. Determine the output basename from `artifactType.output` (e.g. `spec.md`).
   c. **If `delta: true`:** attempt to load the delta file (`.delta.yaml`) from the change directory.
   - If the delta file exists: parse it as YAML to obtain delta entries. Look up the `ArtifactParser` for the artifact's `format` from `ArtifactParserRegistry`. If no adapter is registered, throw. Load the base artifact content from `SpecRepository`. If the base does not exist, treat it as an empty document (parse an empty string via `ArtifactParser.parse('')`). Parse the base content via `ArtifactParser.parse(baseContent)` to obtain a base AST. Call `ArtifactParser.apply(baseAST, deltaEntries)` to produce the merged AST. If `apply` throws `DeltaApplicationError`, re-throw. Serialize the merged AST via `ArtifactParser.serialize(mergedAST)` and save to `SpecRepository`.
   - If the delta file does not exist: fall back to copying the primary file. Load the artifact file content from `ChangeRepository` using `specFile.filename`. If found, save it directly to `SpecRepository`. This handles the case where a new spec is created under a `delta: true` artifact type — the change directory contains a full file rather than a delta.
     d. **If `delta: false`:** load the artifact file content from `ChangeRepository` using `specFile.filename`. Save directly to `SpecRepository`.

For markdown artifacts, the merge output must preserve inline formatting and list/style conventions from the base artifact wherever possible. Implementations must avoid destructive normalization of untouched sections during archive-time serialization.

When the base markdown uses mixed style markers for the same construct (for example both `-` and `*` bullets, or both `*` and `_` for emphasis/strong), archive-time serialization must be deterministic and follow project markdown conventions configured for lint consistency.

### Requirement: Archive repository call

After all canonical publications succeed, `ArchiveChange` MUST resolve the actor via `ActorResolver.identity()` before calling `archiveRepository.archive()`. If `identity()` throws or cannot provide an actor, the archive MUST fail and batch restore MUST run; there is no anonymous fallback archive path.

When actor resolution succeeds, `ArchiveChange` MUST call `archiveRepository.archive(change, { actor })`. The `ArchiveRepository` port is responsible for constructing the `ArchivedChange` record — the use case never builds it directly.

Immediately after a successful archive move, `ArchiveChange` MUST delete every `.specd-archive-backup/` directory written for this batch. Metadata generation and post-archive hooks run only after this cleanup.

The port's contract requires:

- `archivedName` — the full timestamped directory name: `YYYYMMDD-HHmmss-<name>` where the timestamp is derived from `change.createdAt` (zero-padded), never from wall-clock time at execution
- `archivedAt` — the timestamp when the archive operation completes, set by the repository
- `archivedBy` — the git identity of the actor who performed the archive
- `artifacts` — artifact metadata tracked by the repository

The `FsArchiveRepository` implementation additionally moves the change directory from its current location (`changes/` or `drafts/`) to the archive directory using the configured pattern, then appends an entry to `index.jsonl`. The use case has no knowledge of these implementation details.

### Requirement: Archive index metadata maintenance

The `ArchiveChange` use case SHALL ensure that the archive index metadata (total count) is maintained during the archiving process.

- The implementation MUST update the `.specd-index-meta.json` file to increment the `totalCount` after a successful archival.
- This update MUST happen atomically or with appropriate concurrency controls to prevent corruption of the metadata.

### Requirement: Post-archive hooks

After `archiveRepository.archive()` succeeds, when `'all'` and `'post'` are both absent from `skipHookPhases`, `ArchiveChange` must execute post-archive hooks by delegating to `RunStepHooks.execute({ name, step: 'archiving', phase: 'post' })`.

Post-archive hook failures do not roll back the archive. Every failed hook command must be appended to `postHookFailures` in declaration order.

When `'all'` or `'post'` is in `skipHookPhases`, post-archive hook execution is skipped entirely.

### Requirement: Spec metadata generation

`metadata.json` remains a derived archive-time projection. Sidecar consistency MUST still be determined in memory before canonical publication begins for each spec.

For each modified spec, preflight MUST:

1. Determine the final persisted `dependsOn` set for the archive attempt.
2. Determine the final `spec-lock.json` content that would be published for that spec.
3. Run `extractMetadata(...)` against the already-prepared merged artifact content in memory.
4. If `metadataExtraction.dependsOn` is present, compare it against the final persisted `dependsOn` set being sealed for that spec.
5. Abort publication for that spec if the extracted and final persisted `dependsOn` values do not match.

Persisted `metadata.json` generation MUST occur only after `archiveRepository.archive()` succeeds and after all `.specd-archive-backup/` directories for the batch have been deleted.

For each modified spec, `ArchiveChange` MUST then run `GenerateSpecMetadata` against the canonical persisted spec and persist `metadata.json` best-effort. Failures do not abort the archive; affected spec paths are reported in `staleMetadataSpecPaths`.

Sidecar consistency failures during preflight remain fatal before publication begins. Metadata generation failures after archive completion are non-fatal.

### Requirement: spec-lock sidecar persistence

`ArchiveChange` MUST persist a `spec-lock.json` sidecar alongside the canonical `scope: spec` artifacts for each modified spec, using the dedicated `SpecRepository` sidecar API.

The sidecar MUST use this structure:

```json
{
  "schema": {
    "name": "schema-std",
    "version": 1
  },
  "dependsOn": ["core:storage", "core:auth"]
}
```

Sidecar rules:

- `schema.name` and `schema.version` record the schema identity for the persisted spec.
- `dependsOn` records the persisted dependency set for that spec.
- `spec-lock.json` is part of the same staged spec-publication unit as the merged canonical spec artifacts for that spec.
- The final sidecar content MUST be determined before canonical publication begins, so publication can stage and publish the merged spec artifacts plus `spec-lock.json` together.
- Once a sidecar exists for a spec, its `schema` object is immutable and MUST remain the original recorded schema identity for that spec.
- On later re-archives of the same spec, `dependsOn` MUST be refreshed from the final `change.specDependsOn` value for that archive attempt; it is not a set union and it is not preserved as historical baggage.
- If no sidecar exists yet for the spec, archive MUST create one as part of the successful archive.

### Requirement: Opportunistic sidecar backfill

When archiving or regenerating metadata for a persisted spec that does not yet have `spec-lock.json`, the system MAY create the sidecar opportunistically, but only after verifying that the canonical spec is structurally valid under the current schema.

Backfill rules:

- Structural compatibility MUST be checked before any sidecar is created.
- If the compatibility check fails, the system MUST NOT create `spec-lock.json` implicitly for that spec.
- If the compatibility check fails, legacy `metadata.json` generation MAY still continue; only sidecar creation is blocked.
- If the compatibility check passes, the backfilled sidecar MUST copy `dependsOn` from the current persisted dependency view and MUST record the current project schema identity as the initial `schema` object.
- Backfill is opportunistic; this feature does not require a dedicated whole-repository migration command.

### Requirement: Result shape

`ArchiveChange.execute` must return a result object. The result must include:

- `archivedChange` — the `ArchivedChange` record that was persisted
- `postHookFailures` — array of hook commands that failed post-archive, empty on full success
- `staleMetadataSpecPaths` — array of spec paths where `metadata.json` generation failed during this archive (e.g. extraction produced no required fields); empty when all metadata was generated successfully
- `invalidatedChanges` — array of objects describing changes that were invalidated due to spec overlap, each containing:
  - `name` — the invalidated change's name
  - `specIds` — readonly array of overlapping spec IDs that triggered the invalidation
    Empty when no changes were invalidated (either no overlap existed or `allowOverlap` was `false` and the archive was blocked).

`ArchiveChange` throws on pre-archive hook failure or `assertArchivable` failure. Post-archive failures are returned, not thrown.

### Requirement: Typed errors for archive failures

`ArchiveChange` MUST NOT throw generic `Error` for validation or state failures. It SHALL use typed `SpecdError` subclasses for the following scenarios:

- `ArchiveDependencyMismatchError` — when extracted dependencies mismatch persisted ones.
- `ArchiveArtifactMissingError` — when a tracked or base artifact is missing.
- `ArchiveImplementationStateError` — when implementation files are open or out-of-scope sidecar updates are detected.
- `ArchivePreflightError` — for other preflight validation failures.

Each error MUST follow the [`default:_global/error-handling-conventions`](../../_global/error-handling-conventions/spec.md) for actionable messaging.

### Requirement: Tracked implementation review guard

Before archive materializes implementation links, `ArchiveChange` MUST verify that no tracked implementation file remains in `open` state.

Files in `resolved` or `ignored` state satisfy this guard. If any tracked implementation file remains `open`, archive MUST fail with repair guidance telling the operator to resolve or ignore the file explicitly.

### Requirement: Implementation materialization into spec-lock

During archive, confirmed `implementationLinks` from the active change manifest MUST be materialized into the affected specs' `spec-lock.json` sidecars.

Materialization MUST:

- normalize eligible raw file paths into canonical `workspace:path` identities
- persist file-level links when a confirmed link has no `symbols`
- persist symbol-level links when a confirmed link has one or more `symbols`
- ignore links whose raw file path falls under the target workspace `graph.excludePaths`
- discard links that cannot be normalized into a valid `workspace:path`
- fail archive when a confirmed link points outside the `codeRoot` of the workspace implied by `specId`

### Requirement: Out-of-scope sidecar update guard

Archive-time implementation integrity maintenance MAY discover that preserving a consistent implementation map would require sidecar updates outside the immediately archived spec scope.

By default, `ArchiveChange` MUST fail when those out-of-scope updates would occur.

Proceeding with those external sidecar updates requires an explicit `--allow-out-of-scope` override.

### Requirement: Config-based factory delegates through resolveArchiveChangeDeps

The config-based `createArchiveChange(config, options?)` form MUST derive `ArchiveChangeDeps` through `resolveArchiveChangeDeps(resolver)` and then delegate to canonical `createArchiveChange(deps)`.

`resolveArchiveChangeDeps(resolver)` MUST resolve:

- `changes: ChangeRepository`
- `listWorkspaces: ListWorkspaces`
- `archive: ArchiveRepository`
- `runStepHooks: RunStepHooks`
- `actor: ActorResolver`
- `parsers: ArtifactParserRegistry`
- `schemaProvider: SchemaProvider`
- `generateMetadata: GenerateSpecMetadata`
- `saveMetadata: SaveSpecMetadata`
- `extractorTransforms: ExtractorTransformRegistry`
- `workspaceRoutes: readonly SpecWorkspaceRoute[]`
- `projectRoot: string`
- `batchSnapshot: ArchiveBatchSnapshotPort`

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Constraints

- `change.assertArchivable()` must be called before any hooks, snapshots, or file modifications
- ReadOnly workspace guard and overlap guard must run while the change is in `archivable`, before snapshots or lifecycle transition to `archiving`
- Pre-archive hook failures abort the archive and throw — no lifecycle transition, no snapshots, and no partial canonical writes
- Transition to `archiving` must occur only after preflight succeeds and batch snapshots are written, immediately before the first canonical publication
- Commit-phase failures must run batch restore before returning; lifecycle rollback to `archivable` occurs only after successful batch restore
- Post-archive hook failures and metadata generation failures are returned or reported; the archive is not rolled back after a successful archive move
- `ArchiveChange` must not call `change.invalidate()` on the change being archived
- `ArchiveChange` never constructs `ArchivedChange` directly — it is always returned by `archiveRepository.archive(change, { actor })`
- Hook execution is delegated to `RunStepHooks` — `ArchiveChange` does not call `HookRunner` directly

## Spec Dependencies

- [`core:change`](../change/spec.md)
- [`core:schema-format`](../schema-format/spec.md)
- [`core:delta-format`](../delta-format/spec.md)
- [`core:validate-artifacts`](../validate-artifacts/spec.md)
- [`core:storage`](../storage/spec.md)
- [`core:run-step-hooks`](../run-step-hooks/spec.md)
- [`core:hook-execution-model`](../hook-execution-model/spec.md)
- [`core:template-variables`](../template-variables/spec.md)
- [`core:spec-metadata`](../spec-metadata/spec.md)
- [`core:content-extraction`](../content-extraction/spec.md)
- [`default:_global/architecture`](../../_global/architecture/spec.md)
- [`core:workspace`](../workspace/spec.md)
- [`core:spec-id-format`](../spec-id-format/spec.md)
- [`core:spec-overlap`](../spec-overlap/spec.md)
- [`default:_global/logging`](../../_global/logging/spec.md)
- [`core:spec-lock`](../spec-lock/spec.md)
- [`default:_global/error-handling-conventions`](../../_global/error-handling-conventions/spec.md)
- [`core:composition-resolver`](../composition-resolver/spec.md)
