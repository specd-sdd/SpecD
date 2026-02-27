# ArchiveChange

## Overview

`ArchiveChange` is the application use case that finalises a completed change: merges its delta artifacts into the project specs, moves the change directory to the archive, and fires lifecycle hooks before and after. It is gated on `archivable` state — the change must have completed the full lifecycle before it can be archived.

## Requirements

### Requirement: Ports and constructor

`ArchiveChange` receives at construction time: `ChangeRepository`, a map of `SpecRepository` instances (one per configured workspace), `ArchiveRepository`, `HookRunner`, `GitAdapter`, and `ArtifactParserRegistry`.

```typescript
class ArchiveChange {
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    archive: ArchiveRepository,
    hooks: HookRunner,
    git: GitAdapter,
    parsers: ArtifactParserRegistry,
  )
}
```

`specs` is keyed by workspace name. A change may touch specs in multiple workspaces (e.g. `default` and `billing`); `ArchiveChange` looks up the `SpecRepository` for each spec path's workspace before reading the base spec or writing the merged result. The bootstrap layer constructs and passes all workspace repositories.

`ArtifactParserRegistry` is a map from format name (`'markdown'`, `'json'`, `'yaml'`, `'plaintext'`) to the corresponding `ArtifactParser` adapter. `ArchiveChange` uses it to look up the correct adapter when applying delta files to base artifacts. The bootstrap layer constructs it and injects it here — `ArchiveChange` does not instantiate parsers directly.

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

1. Resolve the active schema for that spec's workspace.
2. For each artifact in the schema that declares `delta: true`:
   a. Look up the `ArtifactParser` for the artifact's `format` from `ArtifactParserRegistry`. If no adapter is registered for that format, throw — this is a configuration error.
   b. Load the delta file from `ChangeRepository` (filename `<artifact-output-filename>.delta.yaml`). If absent or `skipped` (effective status `skipped`), skip — nothing to sync.
   c. Parse the delta file as YAML to obtain the array of delta entries.
   d. Load the base artifact content from `SpecRepository`. If the base does not exist, treat it as an empty document (parse an empty string via `ArtifactParser.parse('')`).
   e. Parse the base content via `ArtifactParser.parse(baseContent)` to obtain a base AST.
   f. Call `ArtifactParser.apply(baseAST, deltaEntries)` to produce the merged AST. If `apply` throws `DeltaApplicationError`, re-throw it — this indicates a structural problem that should have been caught during `ValidateArtifacts`, or the delta was modified after validation.
   g. Serialize the merged AST via `ArtifactParser.serialize(mergedAST)` and save the result to `SpecRepository`.
3. For each artifact in the schema that declares `delta: false` (new file artifacts created in-change):
   a. Load the artifact file from `ChangeRepository`. If absent or `skipped` (effective status `skipped`), skip — nothing to sync.
   b. Save the content directly to `SpecRepository` (creating the spec directory and file if they do not exist).

### Requirement: Archive repository call

After syncing all specs, `ArchiveChange` must call `archiveRepository.archive(change)`, passing the `Change` entity. The `ArchiveRepository` port is responsible for constructing the `ArchivedChange` record — the use case never builds it directly, because `archivedAt` can only be set by the operation that performs the archive, and `archivedName` is an infrastructure naming concern.

The port's contract requires:

- `archivedName` — the full timestamped directory name: `YYYYMMDD-HHmmss-<name>` where the timestamp is derived from `change.createdAt` (zero-padded), never from wall-clock time at execution
- `archivedAt` — the timestamp when the archive operation completes, set by the repository
- `workspace` — the `SpecPath` of the primary workspace (the first entry in `change.workspaces`)
- `artifacts` — artifact metadata tracked by the repository

The `FsArchiveRepository` implementation additionally moves the change directory from its current location (`changes/` or `drafts/`) to the archive directory using the configured pattern, then appends an entry to `index.jsonl`. The use case has no knowledge of these implementation details.

`ArchiveChange` receives the returned `ArchivedChange` record and includes it in the result.

`ArchivedChange` has no `approval` field and no `wasStructural` flag — these were removed from the domain model.

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
- `ArchiveChange` never constructs `ArchivedChange` directly — it is always returned by `archiveRepository.archive(change)`
- `archivedName` must be derived from `change.createdAt` by the repository — never from wall-clock time at archive execution
- `ArchiveChange` does not delete the change from `ChangeRepository` — `FsArchiveRepository.archive()` moves the directory as part of the archive operation

## Spec Dependencies

- [`specs/core/change/spec.md`](../change/spec.md) — Change entity, `assertArchivable()`, `ArchivedChange`
- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) — `artifacts[].delta`, `artifacts[].format`, workflow hooks
- [`specs/core/delta-format/spec.md`](../delta-format/spec.md) — `ArtifactParser` port, `apply()`, `DeltaApplicationError`, `ArtifactParserRegistry`
- [`specs/core/validate-artifacts/spec.md`](../validate-artifacts/spec.md) — artifact validation gate before archive
- [`specs/core/storage/spec.md`](../storage/spec.md) — archive directory naming, `index.jsonl`, `FsArchiveRepository.archive()`
- [`specs/core/config/spec.md`](../config/spec.md) — workflow hook structure, `run:` vs `instruction:` entries, template variables
- [`specs/core/spec-metadata/spec.md`](../spec-metadata/spec.md) — metadata refresh signal; `staleMetadataSpecPaths` in result
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — port-per-workspace pattern; manual DI at entry points
