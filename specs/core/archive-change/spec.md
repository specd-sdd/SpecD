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

### Requirement: Input

`ArchiveChange.execute` receives:

- `name` — the change name to archive
- `skipHooks` (boolean, optional, default `false`) — when `true`, the use case skips all `run:` hook execution; the caller is responsible for invoking hooks separately via `RunStepHooks`

### Requirement: Schema name guard

After obtaining the schema from `SchemaProvider`, `ArchiveChange` must compare `schema.name()` with `change.schemaName`. If they differ, it must throw `SchemaMismatchError`. This must happen before the archivable guard, any hooks, or file modifications.

### Requirement: Archivable guard

The first step of `ArchiveChange.execute` after the schema name guard must call `change.assertArchivable()`. If the change is not in `archivable` state, this throws `InvalidStateTransitionError` and the archive is aborted without running any hooks or modifying any files.

After the guard passes, `ArchiveChange` MUST transition the change to `archiving` via `change.transition('archiving', actor)` and persist the change via `ChangeRepository.save(change)`. This records the state transition before any hooks execute or files are modified.

### Requirement: Pre-archive hooks

After the archivable guard passes, when `skipHooks` is `false` (default), `ArchiveChange` must execute pre-archive hooks by delegating to `RunStepHooks.execute({ name, step: 'archiving', phase: 'pre' })`.

If any pre-archive `run:` hook fails, `ArchiveChange` must throw `HookFailedError` with the hook command, exit code, and stderr. No files are modified before a failed pre-archive hook.

When `skipHooks` is `true`, pre-archive hook execution is skipped entirely.

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

After `archiveRepository.archive()` succeeds, when `skipHooks` is `false`, `ArchiveChange` must execute post-archive hooks by delegating to `RunStepHooks.execute({ name, step: 'archiving', phase: 'post' })`.

Post-archive hook failures do not roll back the archive — the change has already been moved and the index updated. Instead, `ArchiveChange` collects failures and returns them in the result so the CLI can present them to the user.

When `skipHooks` is `true`, post-archive hook execution is skipped entirely.

### Requirement: Spec metadata generation

After post-archive hooks complete, `ArchiveChange` must generate `.specd-metadata.yaml` for each spec that was modified during the delta merge and spec sync step.

For each modified spec:

1. Resolve the schema for the spec's workspace
2. Load the spec's `requiredSpecArtifacts` from `SpecRepository` and parse each via its `ArtifactParser` to obtain ASTs
3. Call `extractMetadata()` with the schema's `metadataExtraction` declarations to extract `title`, `description`, `dependsOn`, `keywords`, `rules`, `constraints`, and `scenarios`
4. If `change.specDependsOn` has an entry for this spec, use it as `dependsOn` (manifest dependencies take priority over extracted values)
5. Compute `contentHashes` by hashing each `requiredSpecArtifacts` file
6. Serialize the metadata as YAML and write via `SaveSpecMetadata`

If metadata generation fails for a spec (e.g. extraction produces no required fields, or `SaveSpecMetadata` throws `MetadataValidationError`), the failure is collected but does not abort the archive — the spec was already synced successfully. Failures are included in `staleMetadataSpecPaths` so the caller can report them.

### Requirement: Result shape

`ArchiveChange.execute` must return a result object. The result must include:

- `archivedChange` — the `ArchivedChange` record that was persisted
- `postHookFailures` — array of hook commands that failed post-archive, empty on full success
- `staleMetadataSpecPaths` — array of spec paths where `.specd-metadata.yaml` generation failed during this archive (e.g. extraction produced no required fields); empty when all metadata was generated successfully

`ArchiveChange` throws on pre-archive hook failure or `assertArchivable` failure. Post-archive failures are returned, not thrown.

## Constraints

- `change.assertArchivable()` must be called before any hooks or file modifications
- Pre-archive hook failures abort the archive and throw — no partial state is written
- Post-archive hook failures are returned in the result; the archive is not rolled back
- `ArchiveChange` must not call `change.invalidate()` or any mutation on the `Change` entity — the change is already at its terminal state
- `ArchiveChange` never constructs `ArchivedChange` directly — it is always returned by `archiveRepository.archive(change, { actor })`
- `archivedName` must be derived from `change.createdAt` by the repository — never from wall-clock time at archive execution
- `ArchiveChange` does not delete the change from `ChangeRepository` — `FsArchiveRepository.archive()` moves the directory as part of the archive operation
- Metadata generation failures do not abort the archive — the spec was already synced successfully; failures are collected in `staleMetadataSpecPaths`
- Hook execution is delegated to `RunStepHooks` — `ArchiveChange` does not call `HookRunner` directly

## Spec Dependencies

- [`specs/core/change/spec.md`](../change/spec.md) — Change entity, `assertArchivable()`, `ArchivedChange`
- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) — `artifacts[].delta`, `artifacts[].format`, workflow hooks
- [`specs/core/delta-format/spec.md`](../delta-format/spec.md) — `ArtifactParser` port, `apply()`, `DeltaApplicationError`, `ArtifactParserRegistry`
- [`specs/core/validate-artifacts/spec.md`](../validate-artifacts/spec.md) — artifact validation gate before archive
- [`specs/core/storage/spec.md`](../storage/spec.md) — archive directory naming, `index.jsonl`, `FsArchiveRepository.archive()`
- [`specs/core/run-step-hooks/spec.md`](../run-step-hooks/spec.md) — shared hook execution engine
- [`specs/core/hook-execution-model/spec.md`](../hook-execution-model/spec.md) — hook types, execution semantics
- [`specs/core/template-variables/spec.md`](../template-variables/spec.md) — `TemplateVariables` map, variable namespaces
- [`specs/core/spec-metadata/spec.md`](../spec-metadata/spec.md) — deterministic metadata generation at archive time; `SaveSpecMetadata` for writing
- [`specs/core/content-extraction/spec.md`](../content-extraction/spec.md) — `extractMetadata()` engine used to extract metadata fields from spec artifacts
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — port-per-workspace pattern; manual DI at entry points
- [`specs/core/workspace/spec.md`](../workspace/spec.md) — primary workspace for archive path template resolution
- [`specs/core/spec-id-format/spec.md`](../spec-id-format/spec.md) — canonical `workspace:capabilityPath` format for `specIds`
