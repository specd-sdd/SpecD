# List Specs

## Overview

The `ListSpecs` use case enumerates all specs across all configured workspaces, returning a title for each entry and optionally a short summary and metadata freshness status. It is the primary query for discovery UIs and CLI listing commands.

## Requirements

### Requirement: Enumerate specs across all workspaces

`ListSpecs.execute()` SHALL iterate every configured workspace in declaration order and call `SpecRepository.list()` on each. The returned `SpecListEntry[]` MUST preserve workspace declaration order, with specs within each workspace ordered by repository order.

### Requirement: Always resolve a title for each entry

Every `SpecListEntry` MUST include a `title` field. The title resolution order SHALL be:

1. The `title` field from `.specd-metadata.yaml`, when the file exists, parses successfully, and `title` is a non-empty string after trimming.
2. Fallback: the last segment of the spec's capability path (e.g. `auth/login` yields `login`).

### Requirement: Optional summary resolution

When `options.includeSummary` is `true`, the use case SHALL resolve a `summary` field for each entry. Summary resolution order:

1. The `description` field from `.specd-metadata.yaml`, when present and non-empty after trimming.
2. Extraction from `spec.md` content via `extractSpecSummary`, when the spec has a `spec.md` file and the extraction succeeds.
3. If neither source yields a value, `summary` MUST be omitted from the entry (not set to an empty string or `null`).

When `options.includeSummary` is `false` or omitted, the `summary` field MUST NOT appear on any entry.

### Requirement: Optional metadata freshness status

When `options.includeMetadataStatus` is `true`, the use case SHALL resolve a `metadataStatus` field for each entry. The status values SHALL be:

- `'missing'` — no `.specd-metadata.yaml` file exists for the spec.
- `'invalid'` — the metadata file exists but fails structural validation against `strictSpecMetadataSchema`.
- `'stale'` — the metadata file exists and is structurally valid, but content hashes are absent or do not match current file contents.
- `'fresh'` — the metadata file exists, is structurally valid, and all content hashes match current files.

When `options.includeMetadataStatus` is `false` or omitted, the `metadataStatus` field MUST NOT appear on any entry.

### Requirement: Silent error handling for metadata and summary reads

Errors encountered while reading `.specd-metadata.yaml` or `spec.md` for title/summary/status resolution MUST be silently caught. The spec entry MUST still appear in the results with the title fallback applied. The use case SHALL NOT propagate I/O errors from individual spec resolution to the caller.

### Requirement: SpecListEntry shape

Each entry MUST include the following required fields:

- `workspace` — the workspace name the spec belongs to.
- `path` — the spec's capability path rendered with `/` separators.
- `title` — the resolved title string.

Optional fields (`summary`, `metadataStatus`) MUST only be present when explicitly requested and successfully resolved.

## Constraints

- The use case receives a `ReadonlyMap<string, SpecRepository>` — it MUST NOT modify the map or the repositories.
- The use case defaults `includeSummary` and `includeMetadataStatus` to `false` when the options object or individual flags are not provided.
- Title and description values from metadata MUST be trimmed before use; empty-after-trim values MUST be treated as absent.

## Spec Dependencies

- [`specs/core/spec-metadata/spec.md`](../spec-metadata/spec.md) — metadata structure and `contentHashes`
- [`specs/core/content-extraction/spec.md`](../content-extraction/spec.md) — `extractSpecSummary` behaviour
- [`specs/core/storage/spec.md`](../storage/spec.md) — `SpecRepository` contract
- [`specs/core/workspace/spec.md`](../workspace/spec.md) — workspace ordering semantics
