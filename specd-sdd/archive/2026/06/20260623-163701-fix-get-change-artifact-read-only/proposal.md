# Proposal: fix-get-change-artifact-read-only

## Motivation

Studio users see `updatedAt` advance when they open or switch artifact tabs, even though
nothing was edited. That breaks conditional status polling (`ifModifiedSince`) and makes
the change look perpetually "dirty". The root cause is a read path that incorrectly
persists the change manifest on every artifact GET.

## Current behaviour

`GetChangeArtifact` loads artifact bytes inside `ChangeRepository.mutate()`. `mutate()`
always calls `save()`, which calls `touchUpdatedAt()`. So `GET /v1/changes/{name}/artifacts/{filename}`
bumps the revision clock on every request.

The current `core:get-change-artifact` spec requires this behaviour ("Within
`ChangeRepository.mutate`, the use case MUST load the change...").

Status polling alone does not reproduce the bug; opening artifact bodies in Studio (or
calling the artifact GET endpoint directly) does.

## Proposed solution

Make `GetChangeArtifact` a true read use case:

1. `changes.get(name)` — load the change
2. `findTrackedArtifactFile(change, filename)` — same tracked-file guard as `SaveChangeArtifact`
3. `changes.artifact(change, filename)` — read bytes and hash
4. Return `{ content, originalHash }` without `mutate()` or `save()`

Update `core:get-change-artifact` spec and verify scenarios to require read-only repository
access and assert `updatedAt` stays stable across repeated reads.

No API route or UI hook changes — they already delegate to the use case.

## Specs affected

### New specs

None.

### Modified specs

- `core:get-change-artifact`: Replace the `mutate`-based read requirement with read-only
  repository access (`get` + `artifact`). Add verify scenario that repeated reads do not
  advance `updatedAt`.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

| Area                                                             | Change                                              |
| ---------------------------------------------------------------- | --------------------------------------------------- |
| `packages/core/src/application/use-cases/get-change-artifact.ts` | Remove `mutate()` wrapper                           |
| `specs/core/get-change-artifact/`                                | Spec + verify deltas                                |
| `packages/core/test/application/use-cases/`                      | Regression test for stable `updatedAt`              |
| `packages/api`, `packages/ui`, `packages/client`                 | No code changes; behaviour fix flows through kernel |

Consumers (`handler-changes-read`, `useChangeArtifact`, `RemoteSpecdDataAdapter.getChangeArtifact`)
keep the same HTTP contract; only the side effect disappears.

## Technical context

- Confirmed reproduction: `GET /v1/changes/test-change/artifacts/proposal.md`
- `GetReadOnlyChangeArtifact` and `OutlineChangeArtifact` already use `get()` + `artifact()`
  without `mutate` — this change aligns `GetChangeArtifact` with that pattern.
- Full `mutate()` audit (2026-06-23): no other read use cases misuse `mutate`; scope stays
  narrow.
- Rejected alternatives: UI-only workaround; making `mutate()` skip `save()` when unchanged;
  fixing read-path manifest sync in `get()` (separate concern, does not bump `updatedAt`).
- Fix belongs on `feat/user-interface` branch — endpoint and use case do not exist on `main`.

## Open questions

None — verify scenario for stable `updatedAt` is confirmed; `change-repository-port` clarifying
delta is explicitly out of scope.
