# Invalidate Spec Metadata

## Overview

The `InvalidateSpecMetadata` use case marks a spec's `.specd-metadata.yaml` as stale by removing its `contentHashes` field. Without content hashes the metadata is treated as stale by all downstream consumers (staleness detection, `spec list --metadata-status`), forcing regeneration on the next metadata pass. All other fields (title, description, rules, scenarios, etc.) are preserved.

## Requirements

### Requirement: Removes contentHashes

When executed, the use case reads the existing `.specd-metadata.yaml`, removes the `contentHashes` key from the parsed YAML, and writes the result back. The write uses `force: true` to skip conflict detection — invalidation is always unconditional.

### Requirement: Preserves other fields

All fields other than `contentHashes` remain unchanged in the rewritten file. The use case does not validate the remaining content against the strict schema — it is a targeted mutation, not a full rewrite.

### Requirement: Returns null when not applicable

The use case returns `null` (no-op) when:

- The workspace does not exist in the configured repositories
- The spec does not exist in the workspace
- The spec has no `.specd-metadata.yaml` file
- The file content is not a YAML mapping (e.g. scalar, null)

In all other cases it returns `{ spec: '<workspace>:<path>' }`.

### Requirement: No strict validation on write

Because the use case intentionally removes `contentHashes` (a required field in `strictSpecMetadataSchema`), it bypasses `SaveSpecMetadata` and writes directly through `SpecRepository.save()`. This is the only use case that writes `.specd-metadata.yaml` without strict validation.

## Constraints

- The use case contains no CLI or delivery logic — it operates purely through the `SpecRepository` port
- The write is always forced (`force: true`) — there is no conflict detection for invalidation
- The use case never deletes the metadata file — it only strips `contentHashes`

## Spec Dependencies

- [`specs/core/spec-metadata/spec.md`](../spec-metadata/spec.md) — metadata file format and staleness detection rules
- [`specs/core/storage/spec.md`](../storage/spec.md) — `SpecRepository` port used for read and write
