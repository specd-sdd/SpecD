# Proposal: fix-archive-preflight-atomicity

## Motivation

Archive currently allows some failure-prone checks to occur after canonical publication has already begun. When one of those checks fails, specd can leave canonical specs partially merged, which breaks archive atomicity and can block or corrupt later archive attempts.

## Current behaviour

Today, `ArchiveChange` prepares tracked archive writes ahead of commit, but it does not complete all failure-prone archive checks before canonical publication begins. Instead, some checks still run inside the per-spec publication loop, so one spec can be published and a later spec can still fail validation. A metadata extraction `dependsOn` mismatch is one example, but the problem is broader: any archive-time check that can still fail after publication has started can leave earlier specs partially archived in canonical storage.

## Proposed solution

Strengthen the archive contract so canonical publication cannot begin until all archive-time checks that may fail have completed successfully across the full archive batch. Archive must have a complete preflight phase that prepares merged outputs, resolves tracked artifacts, evaluates consistency and structural requirements, and rejects the archive attempt before any canonical spec or sidecar write begins. Per-spec publication should only start after that global preflight succeeds.

## Specs affected

### New specs

- none

### Modified specs

- `core:archive-change`: clarify that archive performs a complete preflight for all failure-prone checks across the full archive batch before canonical publication, and that failed preflight leaves no canonical writes.
  - Depends on (added): none
- `core:spec-metadata`: align metadata extraction and sidecar consistency requirements with the broader archive preflight rule so metadata-related checks are explicitly part of the no-write-before-success contract.
  - Depends on (added): none

## Impact

The main impact is in the core archive pipeline, especially `ArchiveChange` and the flow that prepares merged spec artifacts, validates archive-time consistency, and publishes canonical artifacts plus `spec-lock.json`. The change may also affect archive error handling, staged publication boundaries, and tests that currently assume some checks can occur inside the publication loop after earlier specs have already been published.

## Technical context

This proposal was driven by a real failure mode reported by the user: archive starts, some specs begin merging, and a later failure such as structural metadata extraction consistency leaves the repository in a partially archived state. During exploration, graph and code review identified `core:src/application/use-cases/archive-change.ts:ArchiveChange` as the central orchestration point and a CRITICAL-risk hotspot.

The concrete issue is that `_prepareArchivePlan()` only prepares writes, but archive-time validation is not fully finished there. Some checks still happen later inside the per-spec loop before each `publish()` call. That means the flow can effectively be "validate spec A, publish spec A, validate spec B, fail on spec B", which is enough to violate the user's required guarantee even if each individual spec is validated before its own `publish()`.

The proposal therefore targets `ArchiveChange` and `core:spec-metadata` rather than `SaveSpecMetadata` as the primary source of the bug. `SaveSpecMetadata` runs later and does not appear to be the cause of the partial canonical merge problem.

The user explicitly rejected a narrow fix limited to structural validation ordering. The requirement is broader: both structural checks and any other archive-time checks that can fail must complete before archive is allowed to begin canonical publication.

There is known overlap with the active change `implementation-file-tracking` on `core:archive-change` and `core:spec-metadata`, so downstream spec deltas and implementation should be written carefully to avoid conflicting with concurrent archive-flow changes.

## Open questions

None at proposal stage.
