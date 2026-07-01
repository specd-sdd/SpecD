# Proposal: studio-graph-health-warnings

## Motivation

Studio users see a generic stale-graph notification when `graph.stale` is true, but
CLI graph commands already emit richer diagnostics (VCS ref drift and derivation
fingerprint mismatch) via `warnGraphStale` on stderr. API, IPC, and `@specd/client`
DTOs do not expose those signals, chrome surfaces duplicate `getGraphStatus` calls, and Bell / Graph panel cannot warn about fingerprint/config drift or stay in parity with the CLI.

## Current behaviour

- `GetGraphHealth` returns `stale`, `currentRef`, and `fingerprintMismatch` on the
  domain result (`code-graph:get-graph-health`).
- `buildProjectStatusSnapshot` passes `graphHealth` through the SDK unchanged.
- `GraphStatusDto` and `ProjectGraphSummaryDto` expose counts and `stale` only; no
  `fingerprintMismatch` or structured warnings.
- `StudioTopBar` notifications badge on `graph.stale` and show a single hard-coded
  stale-graph card. Fingerprint mismatch is never surfaced in Studio UI.
- `GraphMainView` Index Status card shows only Ready/Stale/Off from `stale`; no
  `warnings[]`, fingerprint, or ref context.
- `ShellLayout` calls `useGraphStatus` separately from `useProjectPoll`, so sidebar
  rail and graph panel can disagree with Bell on the same tick.
- Desktop IPC reuses the same client DTOs; no separate IPC-only contract exists.

## Proposed solution

Extend the graph health wire shapes and presenters so Studio receives the same
diagnostics the CLI already computes:

1. Add `fingerprintMismatch: boolean | null` (and optionally `currentRef` where
   useful) to `GraphStatusDto` and the `graph` slice on `ProjectStatusDto`.
2. Add `warnings: { type: string; message: string }[]` on graph status responses,
   built in API presenters from `GetGraphHealthResult` (and CLI-equivalent copy),
   not by changing `GetGraphHealth` in v1.
3. Align `GET /v1/graph/status` and the `graph` field on `GET /v1/project/status`
   so both expose the same diagnostic fields.
4. Update `ui:design-system` notifications: distinct cards for stale graph vs
   fingerprint mismatch; badge when either is active.
5. Update `ui:graph-main-view`: Index Status card surfaces `warnings[]` from project poll session `projectStatus.graph`.
6. Add `ui:hooks-project` session store (`useSyncExternalStore`, same pattern as studio output): single writer `useProjectPoll`, readers via `useProjectPollSession()`.
7. Update `ui:hooks-graph` and `ui:sidebar-graph-entry`: chrome stale affordances read session store; no duplicate `getGraphStatus` for rail/badge.
8. IPC/desktop inherit parity automatically via shared client types and presenters.

Thirteen existing specs receive deltas.

## Specs affected

### New specs

_none_

### Modified specs

- `api:dto-graph-status`: add `fingerprintMismatch`, `currentRef` (optional), and
  `warnings[]` to the wire shape.
  - Depends on (added): none
  - Depends on (removed): none

- `api:dto-project-status`: extend the embedded `graph` summary with the same
  diagnostic fields as `GraphStatusDto`.
  - Depends on (added): none
  - Depends on (removed): none

- `client:dto-graph-status`: mirror `api:dto-graph-status` fields for TypeScript
  parity.
  - Depends on (added): none
  - Depends on (removed): none

- `client:dto-project-status`: mirror extended `graph` slice.
  - Depends on (added): none
  - Depends on (removed): none

- `api:presenter-graph`: map `GetGraphHealthResult` into DTO including derived
  `warnings[]` (stale + fingerprint messages aligned with CLI stderr copy).
  - Depends on (added): none
  - Depends on (removed): none

- `api:presenter-project`: map `buildProjectStatusSnapshot.graphHealth` into the
  project status `graph` slice with the same diagnostic fields.
  - Depends on (added): none
  - Depends on (removed): none

- `api:routes-graph`: document new response fields on `GET /v1/graph/status`.
  - Depends on (added): none
  - Depends on (removed): none

- `api:routes-project`: document new `graph` fields on `GET /v1/project/status`.
  - Depends on (added): none
  - Depends on (removed): none

- `ui:design-system`: require Bell notifications to surface graph stale and
  fingerprint-mismatch warnings from project/graph status DTOs (not a single
  generic stale message only).
  - Depends on (added): none
  - Depends on (removed): none

- `ui:graph-main-view`: require `GraphMainView` Index Status card to render
  `warnings[]` diagnostics from project poll session `projectStatus.graph`.
  - Depends on (added): none
  - Depends on (removed): none

- `ui:hooks-project`: require project poll session store (`useProjectPollSession`) as the single in-memory source for `projectStatus` across Studio chrome.
  - Depends on (added): none
  - Depends on (removed): none

- `ui:hooks-graph`: chrome stale affordances read project poll session; `getGraphStatus` reserved for graph workspace port operations.
  - Depends on (added): none
  - Depends on (removed): none

- `ui:sidebar-graph-entry`: graph rail stale indicator reads `projectStatus.graph.stale` from session store.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- **API**: `presenter-graph.ts`, `presenter-project.ts`, `openapi-schemas.ts`,
  handlers for graph and project status.
- **Client**: `dto/graph-status.ts`, `dto/project-status.ts`, remote/memory
  adapters if field passthrough is needed.
- **UI**: `project-poll-session.ts`, `use-project-poll.ts`, `ShellLayout.tsx` (remove chrome `useGraphStatus`), `StudioTopBar.tsx`, `GraphMainView.tsx`, sidebar graph entry wiring.
- **Desktop IPC**: presenter mapping in `ipc-handlers.ts` (implementation only;
  no new studio-desktop spec in v1).
- **Out of scope**: changing `GetGraphHealth`, CLI stderr behaviour, Zustand/Redux (deferred), or adding
  warnings to the bottom Problems panel or change Overview blockers.

## Technical context

- Reference implementation for warning copy:
  `packages/cli/src/commands/graph/warn-graph-staleness.ts`.
- `GetGraphHealthResult` already carries `fingerprintMismatch`; presenters should
  derive `warnings[]` rather than pushing warning assembly into code-graph v1.
- `studio-desktop` IPC specs are not in scope; client DTO parity is sufficient.
- ESLint host guardrails already block direct `@specd/core` imports in API/desktop.

## Open questions

- **E2E coverage**: defer Playwright notification assertions to implementation
  unless design/tasks explicitly add them (optional follow-up test).
