# Proposal: report-overlap-dependency-changes

## Motivation

An overlap invalidation currently tells users which archived change and specs caused the conflict, but not whether that archive changed the specs' dependency graph. This leaves an important review reason invisible precisely when an active change may still carry an older dependency snapshot.

## Current behaviour

When archive overlap is allowed, `ArchiveChange` invalidates other active changes that target the same specs. The resulting `spec-overlap-conflict` event records a human-readable message and affected artifacts. Archive output immediately lists invalidated change names and overlapping spec IDs, and `change status` shows the same overlap identity while review is pending.

Dependency changes are not captured. An invalidated change retains its existing `specDependsOn` values, which have priority during change context compilation and may therefore shadow dependencies newly published to canonical `spec-lock.json`. Neither archive output nor status indicates that additions or removals occurred, and the current status overlap projection reconstructs details by parsing free-form event text.

## Proposed solution

Extend successful overlap invalidation with structured, per-spec direct dependency changes. Archive processing will compare the pre-archive canonical dependency baseline with the fully preflighted dependency set that is actually published, recording sorted `added` and `removed` spec IDs for overlapping specs.

The structured details will be returned by `ArchiveChange`, persisted in the append-only invalidation event, and projected through lifecycle status. Human-readable archive and status output will show dependency additions and removals alongside existing overlap information, while JSON and TOON will expose the same structure. Existing events without the new payload will remain readable through the current message-based compatibility path.

Dependency details are informational review evidence: this change will not automatically rewrite an invalidated change's `specDependsOn` or expand overlap detection beyond shared `specIds`. Archive success output will report the same per-change, per-spec additions and removals stored for later review; when dependencies are unchanged, existing output remains concise. No overlap dependency event or successful archive result may claim changes from an archive attempt that did not complete successfully.

## Specs affected

### New specs

None.

### Modified specs

- `core:archive-change`: require successful archive overlap invalidation to derive dependency additions and removals from the validated publication plan and the previous canonical baseline.
  - Depends on (added): none
  - Depends on (removed): none
- `core:change`: extend the `spec-overlap-conflict` invalidation fact with optional structured overlap dependency details while preserving append-only history and compatibility with existing events.
  - Depends on (added): none
  - Depends on (removed): none
- `core:change-manifest`: define backward-compatible JSON serialization of the new structured invalidation payload.
  - Depends on (added): none
  - Depends on (removed): none
- `core:lifecycle-engine`: consume structured overlap details as the authoritative source and retain message parsing only for legacy events.
  - Depends on (added): none
  - Depends on (removed): none
- `core:get-status`: project dependency additions and removals in each active overlap review entry.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:change-status`: render overlap dependency changes in text output and serialize them in JSON and TOON.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:change-archive`: extend each invalidated-change result with per-spec dependency additions and removals, render meaningful changes in text output, and serialize them in JSON and TOON.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

The change affects the overlap and preflight paths in `packages/core/src/application/use-cases/archive-change.ts`, invalidation event types and behavior in `packages/core/src/domain/entities/change.ts`, manifest serialization in `packages/core/src/infrastructure/fs/change-repository.ts`, overlap review projection in `packages/core/src/domain/services/lifecycle-engine.ts` and `packages/core/src/application/use-cases/get-status.ts`, archive rendering in `packages/cli/src/commands/change/archive.ts`, and status rendering in `packages/cli/src/commands/change/status.ts`.

Public Core archive-result, status, and event types gain optional structured fields. CLI archive and status structured output gain corresponding nested fields. No external service or package dependency is introduced. Tests must cover dependency additions, removals, unchanged dependencies, multiple specs and changes, archive and status presentation, legacy events, and failed archive attempts.

## Technical context

- `spec-lock.json` is the durable canonical dependency record; generated metadata is not the comparison authority.
- The final dependency set already exists in archive preflight as `finalDependsOn`. The new comparison must reuse that validated result rather than re-extracting dependencies independently.
- `ArchiveChange` must return the same normalized dependency-change data passed to peer invalidation so archive output and later status cannot disagree.
- Peer invalidation must not become visible before the archive result it describes is durable. The design must preserve full-batch preflight, publication rollback, and append-only history guarantees.
- Only direct dependency set differences are in scope. Transitive graph changes are intentionally excluded.
- Structured event data replaces free-form text parsing for new events; message parsing remains only as a backward-compatible fallback.
- Automatic reconciliation of the invalidated change's `specDependsOn` was considered but excluded because it would mutate advisory change intent rather than merely explain why semantic review is required.
- `Change` and `ArchiveChange` are high-coupling areas, so the implementation should isolate set comparison and projection logic and exercise failure paths explicitly.
- `core:change` overlaps with the active `implementation-snapshot` change. The overlap was reviewed and explicitly accepted for this change.

## Open questions

None. The agreed scope is direct dependency additions and removals returned by a successful archive, recorded as structured backward-compatible review evidence, and rendered immediately by archive output and subsequently by change status. Automatic dependency reconciliation remains outside this change.
