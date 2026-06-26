# Proposal: fix-change-status-cache-on-switch

## Motivation

In SpecD Studio, switching between active changes in the sidebar breaks the **Workflow & validation** card on Overview. The first visit loads correctly; returning to a previously opened change shows **Workflow status unavailable.** even though the change is active and status polling is enabled. This confuses users and hides blockers and next actions.

## Current behaviour

- `useChangesRead` polls `getChangeStatus` with a single hook-level `lastModified` timestamp shared across all open change names.
- When the user selects a different change, `statusData` is cleared to `undefined`.
- Returning to change A may call `getChangeStatus(A, { ifModifiedSince: B.updatedAt })` where B was the last viewed change.
- When B's revision is newer than A's, `GetStatus` returns `{ unchanged: true }` (false positive).
- The hook ignores `unchanged` responses without restoring cached status, so `statusData` stays `undefined`.
- `ChangeStatusPanel` (embedded in Overview) renders **Workflow status unavailable.** when `status` is missing — copy intended only for archived/discarded changes.

The Tasks tab and other consumers of `changeRead.status.data` in `ShellLayout` are affected by the same missing status.

## Proposed solution

Fix status caching inside `useChangesRead` only:

1. Track `ifModifiedSince` and last full status **per cache key** (`changeReadCacheKey` bucket + change name).
2. When the open change key changes, restore the last known status for that key immediately (no blank state).
3. On `{ unchanged: true }`, keep showing the cached full status for the current key.
4. On a full status payload, update the per-key cache and `lastModified` for that key only.
5. Add unit tests for A → B → A navigation where B has a newer `updatedAt`.

No API, port, or shell layout changes.

## Specs affected

### New specs

None.

### Modified specs

- `ui:hooks-changes-read`: add requirement that `useChangesRead` scopes `ifModifiedSince` and status cache per change cache key; `unchanged` polls must not clear visible status when revisiting a change.
  - Depends on (added): none
  - Depends on (removed): none

- `ui:change-tab-overview`: clarify that active/drafted changes MUST show workflow status when re-selected after visiting another change; **Workflow status unavailable.** remains only for archived/discarded.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

| Area                                                 | Change                                                          |
| ---------------------------------------------------- | --------------------------------------------------------------- |
| `packages/ui/src/hooks/use-changes-read.ts`          | Per-key `lastModified` + status cache; fix `unchanged` handling |
| `packages/ui/test/use-changes-read.spec.ts`          | New hook tests (A → B → A)                                      |
| `ShellLayout`, `ChangeOverview`, `ChangeStatusPanel` | No code changes expected — consume fixed hook output            |

Blast radius: LOW — `useChangesRead` has one direct dependent (`ShellLayout.tsx`).

## Technical context

- Root cause confirmed in exploration: global `lastModified` + `setStatusData(undefined)` on `changeName` change + early return on `unchanged`.
- `get-status.ts` short-circuit is correct; client must not send another change's timestamp.
- `useAsyncResource` keeps per-key fetch cache; the bug is the extra `statusData` layer above it.
- Disabling `ifModifiedSince` polling was rejected — wastes bandwidth.
- Fixing in `ChangeStatusPanel` or `ShellLayout` was rejected — wrong layer; hook is single source of truth.

## Open questions

None.
