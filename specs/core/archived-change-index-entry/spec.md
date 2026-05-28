# ArchivedChangeIndexEntry

## Purpose

Listing archived changes must remain fast even when the archive contains many entries. `ArchivedChangeIndexEntry` defines the lightweight, index-backed record returned by archive listing APIs without requiring a `manifest.json` read per archived change.

## Requirements

### Requirement: Index entry fields

An `ArchivedChangeIndexEntry` MUST include the following fields:

- `name` (string) — original change name (lookup key)
- `archivedName` (string) — archive directory name
- `archivedAt` (Date) — archive timestamp
- `archivedBy` (ActorIdentity, optional) — actor identity when recorded
- `artifacts` (string\[]) — artifact type IDs present at archive time
- `specIds` (string\[]) — spec IDs associated with the change at archive time
- `schemaName` (string) and `schemaVersion` (number) — governing schema identity

### Requirement: No manifest-only data

`ArchivedChangeIndexEntry` MUST NOT require access to `manifest.json`-only fields that are not reliably present in `index.jsonl` entries (for example detailed artifact state maps or full change history).

### Requirement: Derived workspaces

`ArchivedChangeIndexEntry` SHOULD provide `workspaces` derived from `specIds` (workspace prefixes before `:`) for display and filtering.

## Constraints

- `ArchivedChangeIndexEntry` is a read-only data model with no mutating operations.
- It is intentionally incomplete; full archived change inspection is provided by `ArchivedChange` loaded from the archive manifest.

## Spec Dependencies

- `core:change` — uses shared change identifiers and actor identity concepts.
- `core:storage` — archive index (`index.jsonl`) format and storage conventions.
