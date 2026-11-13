# core:clear-project-metadata

## Purpose

Project optimized context lives in a dedicated cache file (`project-metadata.json`). Operators and CLI `project optimized-context clear` need a Core use case that removes that cache without requiring callers to invent filesystem paths or leave a half-cleared document behind.

## Requirements

### Requirement: Delete project-metadata.json

`ClearProjectMetadata.execute` SHALL atomically delete `{configPath}/project-metadata.json` when the file exists.

### Requirement: Idempotent when absent

When the file does not exist, `execute` MUST succeed without error and MUST NOT create the file.

### Requirement: Result contract

On success, `execute` SHALL return a result that indicates:

- `path` — the resolved absolute path that was targeted
- `cleared` — `true` when a file was deleted, `false` when it was already absent

### Requirement: Config-based factory through composition resolver

The config-based `createClearProjectMetadata(config, options?)` form MUST derive dependencies through a dedicated `resolveClearProjectMetadataDeps(resolver)` helper and then delegate to the canonical deps-based factory. The factory MUST NOT reconstruct filesystem wiring inline.

Resolved deps MUST include at least:

- `config: SpecdConfig`
- a file-deletion / writer port capable of removing the target path

## Constraints

- This use case does not recompute freshness hashes and does not rewrite a partial `project-metadata.json`
- Callers that need to replace optimized context MUST use `UpdateProjectMetadata` instead of clear+set unless they explicitly want the cache gone

## Spec Dependencies

- [`core:project-metadata`](../project-metadata/spec.md) — defines persistence location and schema of the cache file being cleared
