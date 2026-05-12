# Proposal: spec-contention-detection

## Motivation

When multiple active changes target the same spec, conflicts are only discovered late — at archive time, when delta application fails or drift is detected. There is no proactive mechanism to warn users that their work may collide with another in-progress change.

## Current behaviour

| When                    | What happens                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------- |
| Design (writing deltas) | No awareness of other changes targeting the same spec                               |
| Validation              | No cross-change check — only validates the delta against the current canonical spec |
| Archive                 | Delta application may fail with a cryptic error if the base changed                 |

All the data needed to detect overlaps already exists — every change declares its `specIds` in the manifest — but nothing reads across active changes to compare them.

## Proposed solution

Introduce a **spec overlap detection** feature that scans active change manifests, compares their `specIds`, and reports overlaps. The feature has four components:

1. **Domain service** — a pure function `detectSpecOverlap(changes)` that takes a list of changes and returns an overlap report listing every spec targeted by more than one change.
2. **Use case** — `DetectOverlap` that loads active changes via `ChangeRepository.list()`, runs the domain service, and optionally filters results to a specific change.
3. **CLI command** — `specd change overlap [<name>]` that displays overlap in a human-readable format. The CLI commands for `create` and `edit` will also show inline warnings when overlap is detected after their main operation.
4. **Archive overlap gate** — `ArchiveChange` checks for overlap before archiving. If another active change targets any of the same specs, the archive is blocked by default. An `allowOverlap` flag on the input (exposed as `--allow-overlap` in the CLI) permits archiving despite the overlap.

Overlap is **informational at design time** (create/edit warnings) but **blocking at archive time** by default, because archiving changes the canonical spec that other in-flight changes are working against.

Severity levels beyond the current behaviour are out of scope — they depend on sync (#21) and baseline (#22) features not yet implemented.

## Specs affected

### New specs

- `core:core/spec-overlap`: Domain service (`detectSpecOverlap`) and use case (`DetectOverlap`) for computing and returning spec overlap across active changes.
- `cli:cli/change-overlap`: CLI command `specd change overlap [<name>]` that renders overlap results in text, JSON, and toon formats.

### Modified specs

- `core:core/kernel`: Add `changes.detectOverlap` entry pointing to the new `DetectOverlap` use case, and wire it in `createKernel`.
- `core:core/archive-change`: Add `allowOverlap` flag to input and overlap gate before archiving — blocks when other active changes target the same specs unless the flag is set.

## Impact

- **@specd/core domain layer**: new pure function in `domain/services/detect-spec-overlap.ts`, new domain types (`OverlapReport`, `OverlapEntry`).
- **@specd/core application layer**: new use case `detect-overlap.ts`.
- **@specd/core application layer**: `ArchiveChange` gains overlap detection gate with `allowOverlap` bypass.
- **@specd/core composition layer**: new factory `createDetectOverlap`, kernel wiring update, `ArchiveChange` wiring update (needs `ChangeRepository` for overlap check — already available).
- **@specd/cli**: new command file `commands/change/contention.ts`, registration in the change command group. Inline warnings in `create` and `edit` commands.
- **No breaking changes**: purely additive — new use case, new kernel entry, new CLI command. The archive gate is new behaviour but has a bypass flag.

## Open questions

None.
