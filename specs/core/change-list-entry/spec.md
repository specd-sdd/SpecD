# Change List Entry

## Purpose

Listing active, drafted, and discarded changes is a hot path for CLI and agents. Returning full `Change` aggregates or rich read-only views from every list call forces expensive manifest rehydration and history projection. `ChangeListEntry` types define the lightweight row shapes returned by `ChangeRepository.list*`: a shared base plus bucket-specific extras. Detail fields — history, artifact file maps, hashes, approvals — remain on `get`, `getDraft`, `getDiscarded`, and related detail operations.

## Requirements

### Requirement: Shared change list entry base

All three change list entry types share a common required base. Every entry MUST include:

- `name` (string) — change slug (lookup key)
- `createdAt` (Date) — creation timestamp recorded at change creation
- `state` (string) — current lifecycle state
- `specIds` (string[]) — spec IDs associated with the change
- `schemaName` (string) and `schemaVersion` (number) — governing schema identity

`state` MUST be derived from change history when projecting a list entry. It is not necessarily a plain manifest snapshot field.

### Requirement: ActiveChangeListEntry

`ActiveChangeListEntry` extends the shared base with no additional required fields beyond the base.

When `includeDescription` is set on the list options, the entry MAY include:

- `description` (string) — change description when present

When `includeDescription` is not set, `description` MUST NOT appear on the entry.

### Requirement: DraftedChangeListEntry

`DraftedChangeListEntry` extends the shared base with these additional **required** fields:

- `draftedAt` (Date) — timestamp when the change was drafted
- `draftedBy` (`ActorIdentity`) — actor who drafted the change

These fields MUST be derived from change history when projecting the entry.

When `includeDescription` is set, the entry MAY include `description` (string).

When `includeReason` is set, the entry MAY include `reason` (string) — draft reason when recorded in history.

When the corresponding include flag is not set, the optional field MUST NOT appear on the entry.

### Requirement: DiscardedChangeListEntry

`DiscardedChangeListEntry` extends the shared base with these additional **required** fields:

- `discardedAt` (Date) — timestamp when the change was discarded
- `discardedBy` (`ActorIdentity`) — actor who discarded the change

These fields MUST be derived from change history when projecting the entry.

When `includeDescription` is set, the entry MAY include `description` (string).

When `includeReason` is set, the entry MAY include `reason` (string) — discard reason when recorded in history.

When `includeSupersededBy` is set, the entry MAY include `supersededBy` (string) — name of the superseding change when recorded in history.

When the corresponding include flag is not set, the optional field MUST NOT appear on the entry.

### Requirement: Three distinct entry types

`ActiveChangeListEntry`, `DraftedChangeListEntry`, and `DiscardedChangeListEntry` are three separate types sharing a common base. They MUST NOT be modeled as a single discriminated union type at the port layer.

### Requirement: List entries exclude detail fields

Change list entry types MUST NOT include history events, artifact file maps, validated hashes, approval records, artifact content, or other fields reserved for detail operations (`get`, `getDraft`, `getDiscarded`, `status`, `artifact`).

## Constraints

- Change list entries are read-only data shapes with no mutating operations.
- Optional fields appear only when the matching `include*` flag is set on the list call; implementations MUST NOT perform extra `get` or file reads to satisfy a flag — the index stores the full CLI-usable payload and flags are response projection only.
- History-derived fields (`state`, draft/discard timestamps, actors, reasons, superseded-by) are projected when building an entry, not read as opaque manifest snapshots.

## Spec Dependencies

- [`core:change`](../change/spec.md) — change identity, lifecycle `state`, and `ActorIdentity`
- [`core:repository-port`](../repository-port/spec.md) — shared `ListOptions`, `ListResult`, and include-flag pagination contract
