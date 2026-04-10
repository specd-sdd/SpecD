# ArchiveChange

## Purpose

Once a change has completed its full lifecycle, its spec modifications need to be applied to the project and the change itself preserved for posterity — but this finalization involves delta merging, hook execution, and metadata generation that must happen atomically and in the right order. `ArchiveChange` is the use case that merges delta artifacts into project specs, moves the change directory to the archive, and fires lifecycle hooks before and after. It is gated on `archivable` state.

## Requirements

### Requirement: Ports and constructor

`ArchiveChange` receives at construction time: `ChangeRepository`, a map of `SpecRepository` instances (one per configured workspace), `ArchiveRepository`, `RunStepHooks`, `VcsAdapter`, `ArtifactParserRegistry`, `SchemaProvider`, `SaveSpecMetadata`, `YamlSerializer`, and `ActorResolver`.

```typescript
class ArchiveChange {
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    archive: ArchiveRepository,
    runStepHooks: RunStepHooks,
    actor: ActorResolver,
    parsers: ArtifactParserRegistry,
    schemaProvider: SchemaProvider,
    generateMetadata: GenerateSpecMetadata,
    saveMetadata: SaveSpecMetadata,
    yaml: YamlSerializer,
  )
}
```

Hook execution is delegated to `RunStepHooks` — `ArchiveChange` does not receive `HookRunner` or `projectWorkflowHooks` directly.

`SchemaProvider` is a lazy, caching port that returns the fully-resolved schema (with plugins and overrides applied). It replaces the previous `SchemaRegistry` + `schemaRef` + `workspaceSchemasPaths` triple. All are injected at kernel composition time, not passed per invocation.

`specs` is keyed by workspace name. A change may touch specs in multiple workspaces (e.g. `default` and `billing`); `ArchiveChange` looks up the `SpecRepository` for each spec ID's workspace before reading the base spec or writing the merged result. The bootstrap layer constructs and passes all workspace repositories.

`ArtifactParserRegistry` is a map from format name (`'markdown'`, `'json'`, `'yaml'`, `'plaintext'`) to the corresponding `ArtifactParser` adapter. `ArchiveChange` uses it to look up the correct adapter when applying delta files to base artifacts. The bootstrap layer constructs it and injects it here — `ArchiveChange` does not instantiate parsers directly.

`ChangeRepository` is used both for loading and persisting the change being archived and for listing all active changes during the overlap check.

### Requirement: Input

`ArchiveChange.execute` receives:

- `name` — the change name to archive
- `skipHookPhases` (ReadonlySet<ArchiveHookPhaseSelector>, optional, default empty set) — which archive hook phases to skip. Valid values: `'pre'`, `'post'`, `'all'`. When `'all'` is in the set, all archive hook execution is skipped. When the set is empty (default), both phases execute.
- `allowOverlap` (boolean, optional, default `false`) — when `true`, the use case skips the overlap check and permits archiving even when other active changes target the same specs

### Requirement: Schema name guard

After obtaining the schema from `SchemaProvider`, `ArchiveChange` must compare `schema.name()` with `change.schemaName`. If they differ, it must throw `SchemaMismatchError`. This must happen before the archivable guard, any hooks, or file modifications.

### Requirement: Archivable guard

The first persisted-state mutation step of `ArchiveChange.execute` after the schema name guard MUST be a call to `ChangeRepository.mutate(name, fn)`.

Inside the mutation callback, the repository supplies the fresh persisted `Change` for `name`. The use case MUST call `change.assertArchivable()` on that instance. If the change is not in `archivable` state, the callback throws and the archive is aborted without running any hooks or modifying any files.

After the guard passes, the callback MUST transition the change to `archiving` via `change.transition('archiving', actor)` when the fresh change is not already in `archiving`, then return the updated change. When the callback resolves, the repository persists the updated manifest before any hooks execute or files are modified.

The rest of the archive flow operates on the change returned by that serialized mutation step.

### Requirement: ReadOnly workspace guard

After the archivable guard passes and the change transitions to `archiving`, `ArchiveChange` MUST check every spec ID in `change.specIds` against the `SpecRepository` map. For each spec ID, it MUST look up the corresponding `SpecRepository` by workspace name and check `repository.ownership()`.

If any spec belongs to a workspace with `readOnly` ownership, `ArchiveChange` MUST throw `ReadOnlyWorkspaceError` with a message listing all affected specs and their workspaces. The error message format:

```text
Cannot archive change "<name>" — it contains specs from readOnly workspaces:

  - <specId>  →  workspace "<workspace>" (readOnly)

Archiving would write deltas into protected specs.
```

This check MUST occur before any hooks execute or any spec files are written. It is a defense-in-depth guard — upstream guards at `change create` and `change edit` should prevent readOnly specs from entering a change, but the archive MUST NOT silently merge deltas into protected specs if those guards are bypassed.

### Requirement: Overlap guard

After the archivable guard passes and the change transitions to `archiving`, but before pre-archive hooks execute, `ArchiveChange` MUST check for spec overlap with other active changes.

The check MUST:

1. Call `ChangeRepository.list()` to retrieve all active changes
2. Exclude the change being archived from the list
3. Call the `detectSpecOverlap` domain service with the remaining changes plus the change being archived
4. Filter the result to entries where the change being archived participates

If the filtered report has overlap and `allowOverlap` is `false`, `ArchiveChange` MUST throw `SpecOverlapError` with the overlap entries. The error message MUST list the overlapping spec IDs and the names of the other changes targeting them.

If `allowOverlap` is `true`, the overlap check is skipped entirely — the use case proceeds to pre-archive hooks without calling `detectSpecOverlap`.

### Requirement: Pre-archive hooks

After the archivable guard passes, when `'all'` and `'pre'` are both absent from `skipHookPhases`, `ArchiveChange` must execute pre-archive hooks by delegating to `RunStepHooks.execute({ name, step: 'archiving', phase: 'pre' })`.

If any pre-archive `run:` hook fails, `ArchiveChange` must throw `HookFailedError` with the hook command, exit code, and stderr. No files are modified before a failed pre-archive hook.

When `'all'` or `'pre'` is in `skipHookPhases`, pre-archive hook execution is skipped entirely.

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

After syncing all specs, `ArchiveChange` must resolve the actor via `ActorResolver.identity()` before calling `archiveRepository.archive()`. If `identity()` throws (e.g. no VCS config), the archive proceeds without an actor.

`ArchiveChange` must then call `archiveRepository.archive(change, { actor })` when an actor is available, or `archiveRepository.archive(change, {})` when it is not. The `ArchiveRepository` port is responsible for constructing the `ArchivedChange` record — the use case never builds it directly, because `archivedAt` can only be set by the operation that performs the archive, and `archivedName` is an infrastructure naming concern.

The port's contract requires:

- `archivedName` — the full timestamped directory name: `YYYYMMDD-HHmmss-<name>` where the timestamp is derived from `change.createdAt` (zero-padded), never from wall-clock time at execution
- `archivedAt` — the timestamp when the archive operation completes, set by the repository
- `archivedBy` (optional) — the git identity of the actor who performed the archive; absent if git identity was unavailable
- `workspace` — the `SpecPath` of the primary workspace (the first entry in `change.workspaces`)
- `artifacts` — artifact metadata tracked by the repository

The `FsArchiveRepository` implementation additionally moves the change directory from its current location (`changes/` or `drafts/`) to the archive directory using the configured pattern, then appends an entry to `index.jsonl`. The use case has no knowledge of these implementation details.

`ArchiveChange` receives the returned `ArchivedChange` record and includes it in the result.

`ArchivedChange` has no `approval` field and no `wasStructural` flag — these were removed from the domain model.

### Requirement: Post-archive hooks

After `archiveRepository.archive()` succeeds, when `'all'` and `'post'` are both absent from `skipHookPhases`, `ArchiveChange` must execute post-archive hooks by delegating to `RunStepHooks.execute({ name, step: 'archiving', phase: 'post' })`.

Post-archive hook failures do not roll back the archive. Every failed hook command must be appended to `postHookFailures` in declaration order.

When `'all'` or `'post'` is in `skipHookPhases`, post-archive hook execution is skipped entirely.

### Requirement: Spec metadata generation

After merging deltas and archiving the change, the archive process generates metadata for each spec in the change's `specIds`. For each spec, it runs `GenerateSpecMetadata` to extract metadata deterministically, merges manifest `specDependsOn` entries (highest priority), serializes the result as JSON via `JSON.stringify(metadata, null, 2)`, and writes via `SaveSpecMetadata` with `force: true`. Failures are recorded in `staleMetadataSpecPaths` but do not abort the archive.

### Requirement: Result shape

`ArchiveChange.execute` must return a result object. The result must include:

- `archivedChange` — the `ArchivedChange` record that was persisted
- `postHookFailures` — array of hook commands that failed post-archive, empty on full success
- `staleMetadataSpecPaths` — array of spec paths where `.specd-metadata.yaml` generation failed during this archive (e.g. extraction produced no required fields); empty when all metadata was generated successfully

`ArchiveChange` throws on pre-archive hook failure or `assertArchivable` failure. Post-archive failures are returned, not thrown.

## Constraints

- `change.assertArchivable()` must be called before any hooks or file modifications
- ReadOnly workspace guard must run after archivable guard and state transition, before any hooks or file modifications
- Pre-archive hook failures abort the archive and throw — no partial state is written
- Post-archive hook failures are returned in the result; the archive is not rolled back
- `ArchiveChange` must not call `change.invalidate()` or any mutation on the `Change` entity — the change is already at its terminal state
- `ArchiveChange` never constructs `ArchivedChange` directly — it is always returned by `archiveRepository.archive(change, { actor })`
- `archivedName` must be derived from `change.createdAt` by the repository — never from wall-clock time at archive execution
- `ArchiveChange` does not delete the change from `ChangeRepository` — `FsArchiveRepository.archive()` moves the directory as part of the archive operation
- Metadata generation failures do not abort the archive — the spec was already synced successfully; failures are collected in `staleMetadataSpecPaths`
- Hook execution is delegated to `RunStepHooks` — `ArchiveChange` does not call `HookRunner` directly

## Spec Dependencies

- [`core:core/change`](../change/spec.md) — Change entity, `assertArchivable()`, `ArchivedChange`
- [`core:core/schema-format`](../schema-format/spec.md) — `artifacts[].delta`, `artifacts[].format`, workflow hooks
- [`core:core/delta-format`](../delta-format/spec.md) — `ArtifactParser` port, `apply()`, `DeltaApplicationError`, `ArtifactParserRegistry`
- [`core:core/validate-artifacts`](../validate-artifacts/spec.md) — artifact validation gate before archive
- [`core:core/storage`](../storage/spec.md) — archive directory naming, `index.jsonl`, `FsArchiveRepository.archive()`
- [`core:core/run-step-hooks`](../run-step-hooks/spec.md) — shared hook execution engine
- [`core:core/hook-execution-model`](../hook-execution-model/spec.md) — hook types, execution semantics
- [`core:core/template-variables`](../template-variables/spec.md) — `TemplateVariables` map, variable namespaces
- [`core:core/spec-metadata`](../spec-metadata/spec.md) — deterministic metadata generation at archive time; `SaveSpecMetadata` for writing
- [`core:core/content-extraction`](../content-extraction/spec.md) — `extractMetadata()` engine used to extract metadata fields from spec artifacts
- [`default:_global/architecture`](../../_global/architecture/spec.md) — port-per-workspace pattern; manual DI at entry points
- [`core:core/workspace`](../workspace/spec.md) — primary workspace for archive path template resolution
- [`core:core/spec-id-format`](../spec-id-format/spec.md) — canonical `workspace:capabilityPath` format for `specIds`
- [`core:core/spec-overlap`](../spec-overlap/spec.md) — `detectSpecOverlap` domain service for overlap detection
