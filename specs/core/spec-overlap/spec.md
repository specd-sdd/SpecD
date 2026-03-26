# Spec Overlap

## Purpose

When multiple active changes target the same spec, conflicts are only discovered late — at archive time, when delta application fails or drift is detected. There is no proactive mechanism to warn users that overlapping work may collide. The spec overlap feature provides early awareness by scanning active change manifests and reporting which specs are targeted by more than one change.

## Requirements

### Requirement: Domain service is a pure function

`detectSpecOverlap` MUST be a pure function in `domain/services/` that takes a list of `Change` entities and returns an `OverlapReport`. It MUST NOT perform I/O or access any ports.

The function signature MUST be:

```ts
function detectSpecOverlap(changes: readonly Change[]): OverlapReport
```

### Requirement: OverlapReport structure

`OverlapReport` MUST be a domain type containing:

- `entries` — a readonly array of `OverlapEntry` objects, one per overlapping spec
- `hasOverlap` — a boolean that is `true` when `entries` is non-empty

Each `OverlapEntry` MUST contain:

- `specId` — the qualified spec ID (e.g. `core:core/config`) targeted by multiple changes
- `changes` — a readonly array of objects, each containing:
  - `name` — the change name
  - `state` — the change's current lifecycle state

### Requirement: Overlap detection logic

A spec is overlapping when two or more active changes include it in their `specIds`. The domain service MUST:

1. Build an index of spec ID to list of changes that target it
2. Filter to entries where the list has more than one change
3. Sort entries by spec ID (lexicographic ascending)
4. Within each entry, sort changes by name (lexicographic ascending)

### Requirement: Single-change and zero-change inputs

When the input list contains zero or one change, the domain service MUST return an `OverlapReport` with an empty `entries` array and `hasOverlap` equal to `false`. It MUST NOT throw.

### Requirement: DetectOverlap use case

`DetectOverlap` MUST be an application use case that:

1. Calls `ChangeRepository.list()` to retrieve all active changes
2. Calls the `detectSpecOverlap` domain service with the result
3. Returns the `OverlapReport`

### Requirement: DetectOverlap accepts an optional change name filter

`DetectOverlap.execute()` MUST accept an optional `name` parameter. When provided, the returned report MUST include only `OverlapEntry` objects where one of the overlapping changes matches the given name. All active changes MUST still participate in overlap detection — the filter affects the output, not the input.

When the named change is not found among active changes, `DetectOverlap` MUST throw `ChangeNotFoundError`.

### Requirement: Constructor accepts a ChangeRepository

`DetectOverlap` MUST accept a `ChangeRepository` as its sole constructor argument. It MUST delegate to `ChangeRepository.list()` to retrieve changes.

## Constraints

- The domain service MUST NOT include drafted or discarded changes — only active changes from `ChangeRepository.list()` participate
- Severity levels beyond Info (Warning, Error) are out of scope for this change — they depend on sync (#21) and baseline (#22) features not yet implemented

## Spec Dependencies

- `core:core/change` — Change entity, `specIds` getter, lifecycle states
- `core:core/list-changes` — `ChangeRepository.list()` contract
- `core:core/kernel` — kernel entry for the new use case
