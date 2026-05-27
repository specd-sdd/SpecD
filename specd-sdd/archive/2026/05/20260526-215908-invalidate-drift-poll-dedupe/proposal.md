# Proposal: invalidate-drift-poll-dedupe

## Motivation

SpecD Studio polls project and change status every ~2.5 seconds. Each poll loads the active change through `ChangeRepository.get()`, which reconciles artifact drift and may call `change.invalidate('artifact-drift', ...)`. When drift persists after the change is already invalidated and in `designing`, repeated loads were appending identical `invalidated` events and rewriting `manifest.json` on every poll — producing constant re-invalidation noise and manifest churn.

## Current behaviour

- `useProjectPoll` bumps a global `refreshKey` every 2.5s while the window is focused, refetching project and change status.
- `GetStatus` (and other read paths) load the change via `ChangeRepository.get()`.
- `FsChangeRepository` runs drift reconciliation at the end of `get()`. When validated files still drift, it calls `Change.invalidate('artifact-drift', SYSTEM_ACTOR, ...)` and persists the manifest before returning.
- `Change.invalidate()` always appended a new `invalidated` event (and optionally a `transitioned` event to `designing`) even when the change was already in `designing` with an equivalent prior `artifact-drift` invalidation.
- Result: polling clients observed a growing history and updated manifest on every tick although lifecycle state and review scope did not change.

## Proposed solution

Make artifact-drift invalidation **idempotent on repeated loads** when nothing new has drifted beyond the already-recorded invalidation:

1. **`Change.invalidate()`** — when `cause === 'artifact-drift'`, the change is already in `designing`, and the most recent `invalidated` event has the same cause and the same policy-expanded affected-artifact set (normalized), skip appending new history events. Still materialize drift flags on focused files when applicable.
2. **`FsChangeRepository` drift reconciliation** — after calling `invalidate()`, persist the manifest **only when** new history was appended (detect via history length or equivalent signal). Do not rewrite the manifest on deduped no-op invalidations.

Manual invalidation (`artifact-review-required`, `spec-overlap-conflict`, `spec-change`, etc.) is **not** deduped.

## Specs affected

### New specs

None.

### Modified specs

- `core:change`: add idempotent dedupe rules for repeated `artifact-drift` invalidation when already in `designing` with equivalent last event.
  - Depends on (added): none

- `core:change-repository-port`: require drift reconciliation loads to avoid manifest rewrite when invalidation is deduped; clarify return value of reconciliation hook.
  - Depends on (added): none

- `core:kernel`: document that kernel-triggered change loads must not amplify `artifact-drift` history on repeated polls when drift scope is unchanged.
  - Depends on (added): none

- `core:get-status`: require status reads to remain side-effect idempotent regarding invalidation history when drift scope is unchanged (aligns with Studio polling honesty).
  - Depends on (added): none

## Impact

| Area                                                       | Change                                                                                          |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `packages/core/src/domain/entities/change.ts`              | Dedupe gate inside `invalidate()` for `artifact-drift`                                          |
| `packages/core/src/infrastructure/fs/change-repository.ts` | Skip manifest write when reconciliation invalidation is a no-op                                 |
| Tests                                                      | New scenarios in `change.spec.ts`, `change-repository.spec.ts`, optionally `get-status.spec.ts` |
| Studio / API / CLI                                         | No contract change; polling stops rewriting manifests                                           |

No API DTO, CLI command, or UI spec changes required.

## Technical context

- Root cause traced from `ui:hooks/use-project-poll.ts` → `GetStatus` / `get()` → `_reconcileArtifactDrift`.
- Dedupe equivalence compares policy-expanded `affectedArtifacts` (artifact type + sorted file keys).
- Broad dedupe for all invalidation causes was rejected: it breaks merging multiple unhandled overlap invalidations in `GetStatus` review projection.
- Disabling drift reconciliation on read-only status polls was rejected: would hide real drift until a mutating use case runs.
- Parallels `core:validate-artifacts` rule: at most one `artifact-drift` invalidate per validate execution.
- Code was implemented ahead of this change; this change formalizes the behaviour in specs.

## Open questions

None — scope is limited to core drift dedupe on repeated loads.
