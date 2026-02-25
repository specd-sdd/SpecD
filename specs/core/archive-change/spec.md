# ArchiveChange

## Overview

`ArchiveChange` is the application use case that finalises a completed change: merges its delta artifacts into the project specs, moves the change directory to the archive, and fires lifecycle hooks before and after. It is gated on `archivable` state — the change must have completed the full lifecycle before it can be archived.

## Requirements

### Requirement: Ports and constructor

`ArchiveChange` receives at construction time: `ChangeRepository`, a map of `SpecRepository` instances (one per configured workspace), `ArchiveRepository`, `HookRunner`, and `GitAdapter`.

```typescript
class ArchiveChange {
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    archive: ArchiveRepository,
    hooks: HookRunner,
    git: GitAdapter,
  )
}
```

`specs` is keyed by workspace name. A change may touch specs in multiple workspaces (e.g. `default` and `billing`); `ArchiveChange` looks up the `SpecRepository` for each spec path's workspace before reading the base spec or writing the merged result. The bootstrap layer constructs and passes all workspace repositories.

### Requirement: Input

`ArchiveChange.execute` receives:

- `name` — the change name to archive
- `schemaRef` — the schema reference string from `specd.yaml`
- `workspaceSchemasPaths` — resolved workspace-to-schemas-path map, passed through to `SchemaRegistry.resolve()`
- `hookVariables` — template variable values available to `run:` hook commands (`change.name`, `change.workspace`, `codeRoot`); the use case does not derive these — the caller provides them from the active config and runtime context

### Requirement: Archivable guard

The first step of `ArchiveChange.execute` must call `change.assertArchivable()`. If the change is not in `archivable` state, this throws `InvalidStateTransitionError` and the archive is aborted without running any hooks or modifying any files.

### Requirement: Pre-archive hooks

After the archivable guard passes, `ArchiveChange` must run all `run:` hooks declared in the schema's `workflow[archiving].hooks.pre` followed by any project-level `workflow[archiving].hooks.pre` entries, in declaration order.

`instruction:` hook entries in `pre` are not executed by `ArchiveChange` — they are AI context injected by `CompileContext` at skill compile time, not commands to run. Only `run:` entries are executed here.

If any pre-archive `run:` hook exits with a non-zero code, `ArchiveChange` must abort immediately and throw `HookFailedError` with the hook command, exit code, and stderr. No files are modified before a failed pre-archive hook.

### Requirement: Delta merge and spec sync

After all pre-archive hooks succeed, `ArchiveChange` must merge each delta artifact into the project spec and sync the result to `SpecRepository`.

For each spec path in `change.specIds`:

1. Resolve the active schema.
2. For each artifact in the schema that declares `deltas[]`:
   a. Load the artifact file from `ChangeRepository` (the delta file in the change directory). If absent or `skipped` (status `skipped` — `validatedHash === "__skipped__"`), skip — nothing to sync.
   b. Load the base spec from `SpecRepository`. If the base does not exist, treat it as an empty spec.
   c. Call `mergeSpecs(base, delta, deltaConfigs, deltaOperations)` with `deltaConfigs` from the artifact's `deltas[]` and `deltaOperations` from the schema (or defaults).
   d. Save the merged content to `SpecRepository` via `specs.save(spec, artifact)`.
3. For each artifact in the schema that does **not** declare `deltas[]` (new file artifacts):
   a. Load the artifact content from `ChangeRepository`. If absent or `skipped` (status `skipped` — `validatedHash === "__skipped__"`), skip — nothing to sync.
   b. Save the content to `SpecRepository` (creating the spec and file if necessary).

`mergeSpecs` was already run during `ValidateArtifacts` for conflict detection. If `ArchiveChange` encounters a `DeltaConflictError`, it must throw it — this indicates a bug in the validation gate or a change to the artifacts after validation.

### Requirement: ArchivedChange construction

After syncing all specs, `ArchiveChange` must construct an `ArchivedChange` record:

- `name` — the change's slug name (e.g. `add-auth-flow`)
- `archivedName` — the full timestamped directory name: `YYYYMMDD-HHmmss-<name>` where the timestamp is derived from `change.createdAt` (zero-padded)
- `workspace` — the `SpecPath` of the primary workspace (the first entry in `change.workspaces`)
- `archivedAt` — the current timestamp
- `artifacts` — an array of artifact filenames that were synced to `SpecRepository`

`ArchivedChange` has no `approval` field and no `wasStructural` flag — these were removed from the domain model.

### Requirement: Archive repository call

`ArchiveChange` must call `archiveRepository.archive(archivedChange)`. The `FsArchiveRepository` implementation moves the change directory from its current location (`changes/` or `drafts/`) to the archive directory using the configured pattern, then appends an entry to `index.jsonl`. The use case has no knowledge of these implementation details.

### Requirement: Post-archive hooks

After `archiveRepository.archive()` succeeds, `ArchiveChange` must run all `run:` hooks declared in `workflow[archiving].hooks.post` — schema hooks first, then project-level hooks, in declaration order.

`instruction:` post hooks are AI context injected by `CompileContext` and are not executed here.

Post-archive hook failures do not roll back the archive — the change has already been moved and the index updated. Instead, `ArchiveChange` collects failures and returns them in the result so the CLI can present them to the user.

### Requirement: Spec metadata refresh signal

After post-archive hooks complete, `ArchiveChange` must collect the set of spec paths that were modified during the delta merge and spec sync step. These are included in the result so that the caller (CLI or MCP layer) can trigger metadata regeneration for those specs.

`ArchiveChange` does not invoke the LLM extraction agent directly — it only signals which specs need refresh. The caller is responsible for scheduling the actual metadata regeneration.

### Requirement: Result shape

`ArchiveChange.execute` must return a result object. The result must include:

- `archivedChange` — the `ArchivedChange` record that was persisted
- `postHookFailures` — array of hook commands that failed post-archive, empty on full success
- `staleMetadataSpecPaths` — array of spec paths whose `.specd-metadata.yaml` should be regenerated because their content was modified during this archive

`ArchiveChange` throws on pre-archive hook failure or `assertArchivable` failure. Post-archive failures are returned, not thrown.

## Constraints

- `change.assertArchivable()` must be called before any hooks or file modifications
- Pre-archive hook failures abort the archive and throw — no partial state is written
- Post-archive hook failures are returned in the result; the archive is not rolled back
- `ArchiveChange` must not call `change.invalidate()` or any mutation on the `Change` entity — the change is already at its terminal state
- The `archivedName` is always derived from `change.createdAt`, never from wall-clock time at archive execution
- `ArchiveChange` does not delete the change from `ChangeRepository` — `FsArchiveRepository.archive()` moves the directory as part of the archive operation

## Spec Dependencies

- [`specs/core/change/spec.md`](../change/spec.md) — Change entity, `assertArchivable()`, `ArchivedChange`
- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) — `artifacts[].deltas[]`, workflow hooks, `deltaOperations`
- [`specs/core/validate-artifacts/spec.md`](../validate-artifacts/spec.md) — artifact validation gate before archive; conflict detection via `mergeSpecs`
- [`specs/core/delta-merger/spec.md`](../delta-merger/spec.md) — `mergeSpecs` used during spec sync
- [`specs/core/storage/spec.md`](../storage/spec.md) — archive directory naming, `index.jsonl`, `FsArchiveRepository.archive()`
- [`specs/core/config/spec.md`](../config/spec.md) — workflow hook structure, `run:` vs `instruction:` entries, template variables
- [`specs/core/spec-metadata/spec.md`](../spec-metadata/spec.md) — metadata refresh signal; `staleMetadataSpecPaths` in result
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — port-per-workspace pattern; manual DI at entry points
