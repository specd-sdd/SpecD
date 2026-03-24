# Invalidate Spec Metadata

## Purpose

When a spec's content changes outside the normal archive flow, its metadata becomes untrustworthy but deleting the entire file would lose curated fields like `dependsOn` and `description`. The `InvalidateSpecMetadata` use case marks the metadata as stale by removing only the `contentHashes` field, which causes all downstream consumers (staleness detection, `spec list --metadata-status`) to treat it as stale and forces regeneration on the next metadata pass. All other fields (title, description, rules, scenarios, etc.) are preserved.

## Requirements

### Requirement: Removes contentHashes

When executed, loads the existing metadata via `repo.metadata(spec)`. If metadata exists, removes the `contentHashes` and `originalHash` fields, serializes the rest with `JSON.stringify(withoutHashes, null, 2)`, and writes back via `repo.saveMetadata(spec, content, { force: true })`. The `YamlSerializer` dependency is no longer needed.

### Requirement: Preserves other fields

All fields other than `contentHashes` remain unchanged in the rewritten file. The use case does not validate the remaining content against the strict schema — it is a targeted mutation, not a full rewrite.

### Requirement: Error on unknown workspace or spec

If the workspace does not exist in the configured repositories, the use case throws `WorkspaceNotFoundError`. If the spec does not exist in the workspace, it throws `SpecNotFoundError`.

### Requirement: Returns null when not applicable

The use case returns `null` (no-op) when:

- The spec has no metadata file
- The file content is not a YAML mapping (e.g. scalar, null)

In all other cases it returns `{ spec: '<workspace>:<path>' }`.

### Requirement: No strict validation on write

Because the use case intentionally removes `contentHashes` (a required field in `strictSpecMetadataSchema`), it bypasses `SaveSpecMetadata` and writes directly through `SpecRepository.saveMetadata()`. This is the only use case that writes metadata without strict validation.

## Constraints

- The use case contains no CLI or delivery logic — it operates purely through the `SpecRepository` port
- The write is always forced (`force: true`) — there is no conflict detection for invalidation
- The use case never deletes the metadata file — it only strips `contentHashes`
- Metadata is read via `SpecRepository.metadata()` and written via `SpecRepository.saveMetadata()`

## Spec Dependencies

- [`specs/core/spec-metadata/spec.md`](../spec-metadata/spec.md) — metadata file format and staleness detection rules
- [`specs/core/storage/spec.md`](../storage/spec.md) — `SpecRepository` port used for read and write
