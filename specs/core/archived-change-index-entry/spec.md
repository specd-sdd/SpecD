# ArchivedChangeIndexEntry

## Purpose

Listing archived changes must remain fast even when the archive contains many entries. `ArchiveListEntry` (formerly `ArchivedChangeIndexEntry`) defines the lightweight, index-backed record returned by archive listing APIs without requiring a `manifest.json` read per archived change.

## Requirements

### Requirement: Index entry fields

An `ArchiveListEntry` MUST include the following **required** fields:

- `name` (string) — original change name (lookup key)
- `archivedName` (string) — archive directory name
- `archivedAt` (Date) — archive timestamp
- `specIds` (string\[]) — spec IDs associated with the change at archive time
- `schemaName` (string) and `schemaVersion` (number) — governing schema identity

When `includeArchivedBy` is set on archive list options, the entry MAY include:

- `archivedBy` (`ActorIdentity`) — actor identity when recorded at archive time

When `includeArchivedBy` is not set, `archivedBy` MUST NOT appear on the entry.

`ArchiveListEntry` MUST NOT include `artifacts`. Artifact detail belongs on `get(name)`.

`ArchiveListEntry` MUST NOT include a `workspaces` field. Callers that need the workspaces of associated specs MUST derive the plural set from `specIds`; they MUST NOT assign a singular or primary workspace to the change. If `workspacesFromSpecIds` is used for that derivation, it MUST obtain each workspace through `parseSpecId` (see `core:spec-id-format`), MUST NOT split an ID on the first `:` without validating it, and MUST return the unique workspace names in encounter order. An invalid ID in its input raises `InvalidSpecIdError` instead of yielding a partial or wrong workspace; archived change `specIds` are fully qualified and valid because the manifest rejects anything else on load.

The public type name `ArchiveListEntry` replaces `ArchivedChangeIndexEntry`. Implementations MAY retain the old name as a deprecated alias during migration, but new code MUST use `ArchiveListEntry`.

### Requirement: No manifest-only data

`ArchiveListEntry` MUST NOT require access to `manifest.json`-only fields that are not reliably present in the list index (for example detailed artifact state maps, full change history, or artifact type lists). Artifact inventories are detail fields loaded via `get(name)`.

## Constraints

- `ArchiveListEntry` is a read-only data model with no mutating operations.
- It is intentionally incomplete; full archived change inspection is provided by `ArchivedChange` loaded from the archive manifest via `get(name)`.
- Optional `archivedBy` appears only when `includeArchivedBy` is set on the list call; the index stores the full payload and the flag is projection-only.

## Spec Dependencies

- [`core:change`](../change/spec.md) — shared change identifiers and actor identity concepts
- [`core:storage`](../storage/spec.md) — filesystem archive layout and fs-cache list index conventions
- [`core:repository-port`](../repository-port/spec.md) — shared list pagination types and include-flag projection
- [`core:spec-id-format`](../spec-id-format/spec.md) — `parseSpecId` is the only way workspaces are derived from spec IDs
