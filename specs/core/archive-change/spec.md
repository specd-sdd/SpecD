# ArchiveChange

## Purpose

Once a change has completed its full lifecycle, its spec modifications need to be applied to the project and the change itself preserved for posterity — but this finalization involves delta merging, hook execution, and metadata generation that must happen atomically and in the right order. `ArchiveChange` is the use case that merges delta artifacts into project specs, moves the change directory to the archive, and fires lifecycle hooks before and after. It is gated on `archivable` state.

## Requirements

### Requirement: Ports and constructor

`ArchiveChange` receives at construction time: `ChangeRepository`, a map of `SpecRepository` instances (one per configured workspace), `ArchiveRepository`, `HookRunner`, `VcsAdapter`, `ArtifactParserRegistry`, `SchemaRegistry`, `SaveSpecMetadata`, `YamlSerializer`, `schemaRef`, `workspaceSchemasPaths`, `projectRoot`, `changesPath`, and `projectHooks`.

```typescript
class ArchiveChange {
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    archive: ArchiveRepository,
    hooks: HookRunner,
    git: VcsAdapter,
    parsers: ArtifactParserRegistry,
    schemas: SchemaRegistry,
    saveMetadata: SaveSpecMetadata,
    yaml: YamlSerializer,
    schemaRef: string,
    workspaceSchemasPaths: ReadonlyMap<string, string>,
    projectRoot: string,
    changesPath: string,
    projectHooks: ProjectHooks,
  )
}
```

`schemaRef` is the schema reference string from `specd.yaml`. `workspaceSchemasPaths` is the resolved workspace-to-schemas-path map, passed through to `SchemaRegistry.resolve()`. `projectRoot` is the absolute path to the project root (the directory containing `specd.yaml`). `changesPath` is the absolute path to the changes directory. `projectHooks` contains the project-level workflow hook definitions from `specd.yaml`. All are injected at kernel composition time, not passed per invocation.

`hookVariables` is built internally by `ArchiveChange` from `projectRoot` and `changesPath` — the caller does not provide it.

`specs` is keyed by workspace name. A change may touch specs in multiple workspaces (e.g. `default` and `billing`); `ArchiveChange` looks up the `SpecRepository` for each spec ID's workspace before reading the base spec or writing the merged result. The bootstrap layer constructs and passes all workspace repositories.

`ArtifactParserRegistry` is a map from format name (`'markdown'`, `'json'`, `'yaml'`, `'plaintext'`) to the corresponding `ArtifactParser` adapter. `ArchiveChange` uses it to look up the correct adapter when applying delta files to base artifacts. The bootstrap layer constructs it and injects it here — `ArchiveChange` does not instantiate parsers directly.

### Requirement: Input

`ArchiveChange.execute` receives:

- `name` — the change name to archive

### Requirement: Schema name guard

After resolving the schema from config, `ArchiveChange` must compare `schema.name()` with `change.schemaName`. If they differ, it must throw `SchemaMismatchError`. This must happen before the archivable guard, any hooks, or file modifications.

### Requirement: Archivable guard

The first step of `ArchiveChange.execute` after the schema name guard must call `change.assertArchivable()`. If the change is not in `archivable` state, this throws `InvalidStateTransitionError` and the archive is aborted without running any hooks or modifying any files.

### Requirement: Pre-archive hooks

After the archivable guard passes, `ArchiveChange` must run all `run:` hooks declared in the schema's `workflow[archiving].hooks.pre` followed by any project-level `workflow[archiving].hooks.pre` entries, in declaration order.

`instruction:` hook entries in `pre` are not executed by `ArchiveChange` — they are AI context injected by `CompileContext` at skill compile time, not commands to run. Only `run:` entries are executed here.

If any pre-archive `run:` hook exits with a non-zero code, `ArchiveChange` must abort immediately and throw `HookFailedError` with the hook command, exit code, and stderr. No files are modified before a failed pre-archive hook.

### Requirement: Delta merge and spec sync

After all pre-archive hooks succeed, `ArchiveChange` must merge each delta artifact into the project spec and sync the result to `SpecRepository`.

For each spec ID in `change.specIds`:

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

After `archiveRepository.archive()` succeeds, `ArchiveChange` must run all `run:` hooks declared in `workflow[archiving].hooks.post` — schema hooks first, then project-level hooks, in declaration order.

`instruction:` post hooks are AI context injected by `CompileContext` and are not executed here.

Post-archive hook failures do not roll back the archive — the change has already been moved and the index updated. Instead, `ArchiveChange` collects failures and returns them in the result so the CLI can present them to the user.

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

`ArchiveChange` also needs `SchemaRegistry`, `YamlSerializer`, and `SaveSpecMetadata` (or equivalent ports) to perform the generation. These are injected at construction time alongside the existing dependencies.

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

## Spec Dependencies

- [`specs/core/change/spec.md`](../change/spec.md) — Change entity, `assertArchivable()`, `ArchivedChange`
- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) — `artifacts[].delta`, `artifacts[].format`, workflow hooks
- [`specs/core/delta-format/spec.md`](../delta-format/spec.md) — `ArtifactParser` port, `apply()`, `DeltaApplicationError`, `ArtifactParserRegistry`
- [`specs/core/validate-artifacts/spec.md`](../validate-artifacts/spec.md) — artifact validation gate before archive
- [`specs/core/storage/spec.md`](../storage/spec.md) — archive directory naming, `index.jsonl`, `FsArchiveRepository.archive()`
- [`specs/core/config/spec.md`](../config/spec.md) — workflow hook structure, `run:` vs `instruction:` entries, template variables
- [`specs/core/spec-metadata/spec.md`](../spec-metadata/spec.md) — deterministic metadata generation at archive time; `SaveSpecMetadata` for writing
- [`specs/core/content-extraction/spec.md`](../content-extraction/spec.md) — `extractMetadata()` engine used to extract metadata fields from spec artifacts
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — port-per-workspace pattern; manual DI at entry points
- [`specs/core/workspace/spec.md`](../workspace/spec.md) — primary workspace for archive path template resolution
- [`specs/core/spec-id-format/spec.md`](../spec-id-format/spec.md) — canonical `workspace:capabilityPath` format for `specIds`
