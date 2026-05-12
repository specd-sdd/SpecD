# Exploration: spec-contention-detection

Generated: 2026-03-26

## Problem statement

When multiple active changes target the same spec, conflicts are only discovered late — at
archive or sync time, when delta application fails or drift is detected. There is no
proactive mechanism to warn users that their work may collide with another in-progress change.

Source: GitHub issue lsmonki/SpecD#51.

## Current situation

| When                    | What happens                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------- |
| Design (writing deltas) | No awareness of other changes targeting the same spec                               |
| Validation              | No cross-change check — only validates the delta against the current canonical spec |
| Sync (#21 Level 3)      | Drift detected via baselines (#22), but only after the other change already synced  |
| Archive                 | Delta application may fail with a cryptic error if the base changed                 |

## Approach / solution outline

### Spec overlap index

Compute which specs are targeted by multiple active changes by scanning change manifests.
Each change already declares its `specIds` — the data is already available. The index can
be computed on demand by scanning active changes via `ChangeRepository.list()`.

### Detection points

1. **At create/edit time** — when a change is created or adds a spec (`--add-spec`), the
   CLI checks for overlaps and shows a warning (non-blocking). This is CLI presentation
   logic — the use cases in core don't change.
2. **At archive time** — `ArchiveChange` checks for overlap before archiving. If overlap
   is detected, the archive is **blocked by default**. An `allowOverlap` flag on the input
   (CLI: `--allow-overlap`) permits archiving despite the overlap.
3. **Dedicated command** — `specd change overlap [<name>]` shows all specs targeted by
   multiple active changes.

### Severity model

| Context           | Behaviour                   | Rationale                                                                      |
| ----------------- | --------------------------- | ------------------------------------------------------------------------------ |
| Create/edit       | Warning (informational)     | User is starting work, awareness is enough                                     |
| Archive           | Blocking (with bypass flag) | Archiving changes the canonical spec, directly impacts other in-flight changes |
| Dedicated command | Informational               | User explicitly asked for overlap info                                         |

## Non-goals (from the issue)

- **Blocking concurrent work at design time** — overlap is a warning at create/edit, not a gate
- **Automatic conflict resolution** — that's the job of the delta merge algorithm and the user
- **Warning/Error severity levels for sync** — depend on #21 and #22 which aren't implemented

## Architecture decisions

### Domain service (pure function)

A pure function in `domain/services/` that takes a list of changes and returns an overlap
report. No I/O needed — pure computation over already-loaded data.

```ts
function detectSpecOverlap(changes: readonly Change[]): OverlapReport
```

### Use case

A `DetectOverlap` use case that:

1. Calls `ChangeRepository.list()` to get all active changes
2. Optionally filters to a specific change name
3. Calls the domain service
4. Returns the overlap report

### Archive gate

`ArchiveChange` gains an overlap check:

1. After the archivable guard, before pre-archive hooks
2. Calls `detectSpecOverlap` with all active changes (excluding the change being archived)
3. If overlap detected and `allowOverlap` is false → throws `SpecOverlapError`
4. If `allowOverlap` is true → proceeds despite overlap

The change being archived is excluded from the overlap check because it's about to be
archived — what matters is whether _other_ active changes target the same specs.

### Kernel entry

New entry at `kernel.changes.detectOverlap`.

### CLI command

`specd change overlap [<name>]` — shows overlap for all changes or a specific one.

### CLI inline warnings

The CLI commands for `create` and `edit` call `DetectOverlap` after their main operation
and display a warning if overlap is detected. This is pure presentation logic — the
core use cases don't change.

## Specs attached to this change

- `core:core/kernel` — existing spec, needs delta to add the new kernel entry
- `core:core/spec-overlap` — **new spec** for the domain service + use case
- `cli:cli/change-overlap` — **new spec** for the CLI command
- `core:core/archive-change` — existing spec, needs delta to add overlap gate + `allowOverlap` flag

## Key codebase observations

- `ChangeRepository.list()` already returns all active changes with specIds
- Each `Change` entity has a `specIds` getter
- The kernel groups use cases under `changes`, `specs`, and `project`
- CLI commands follow the pattern `specd <group> <action>` with Commander.js
- Existing CLI change commands are in `packages/cli/src/commands/change/`
- Domain services are pure functions in `packages/core/src/domain/services/`
- Use cases are in `packages/core/src/application/use-cases/`
- `ArchiveChange` already receives `ChangeRepository` — no new dependency needed for overlap check

## Naming decision

Originally named "contention" — renamed to "overlap" during design discussion because
"contention" is a technical term from concurrency that's hard to locate conceptually.
"Overlap" is more intuitive: two changes overlap on the same specs.

## User preferences

- User wants inline warnings in create/edit (informational)
- User wants archive to **block by default** with `--allow-overlap` bypass
- User prefers keeping core use cases (CreateChange, EditChange) unchanged — warnings are CLI logic
- Conversation in Spanish
