# Proposal: long-lived-hosts-run-index-provider

## Motivation

Studio desktop and the HTTP API keep a long-lived open `CodeGraphProvider`, but
indexing still treated the SDK as a short-lived open/close orchestrator. That forced
host workarounds (release/refresh cycles or bypassing `runIndexProjectGraph`). Main now
allows passing an existing open provider into `runIndexProjectGraph`; this branch must
adopt that path so long-lived hosts index without tearing down their session provider.

## Current behaviour

- **API** (`POST /v1/graph/index`): closes/releases the long-lived provider, calls
  `runIndexProjectGraph` (which opens a transient provider via `withOpenGraphProvider`),
  then refreshes/reopens the long-lived provider for subsequent reads.
- **Studio desktop** (`indexGraph` IPC): indexes by calling `createIndexProjectGraph`
  directly on the long-lived provider, bypassing SDK project-assembly orchestration.
- Host specs still describe “after `runIndexProjectGraph` (short-lived internal
  provider), replace/reopen the long-lived provider,” which matches the pre-`provider`
  SDK contract.

## Proposed solution

Adapt API and Studio desktop long-lived hosts to call
`runIndexProjectGraph(ctx, { provider, … })` with the already-open session/process
provider. Do not close that provider on index success or failure. Drop the
release→index→refresh cycle and the desktop manual `createIndexProjectGraph` path for
routine index. Leave `sdk:run-index-project-graph` and SDK implementation unchanged —
consume the shipped optional-`provider` contract as a dependency only.

## Specs affected

### New specs

_none_

### Modified specs

- `api:handler-graph`: Index route must pass the healthy long-lived opened provider into
  `runIndexProjectGraph` and must not release/close it around index for the short-lived
  workaround.
  - Depends on (added): none
  - Depends on (removed): none

- `api:composition-graph-provider`: Replace the requirement that the host must
  replace/reopen the long-lived provider after `runIndexProjectGraph` solely because
  indexing used a short-lived internal provider. When indexing uses `input.provider`,
  the same long-lived instance remains authoritative after index (stale reopen on
  `GraphProviderStaleError` still applies).
  - Depends on (added): none
  - Depends on (removed): none

- `api:composition-create-api-context`: Remove or narrow any
  `releaseGraphProviderForIndex` / post-index refresh surface that exists only to
  accommodate short-lived SDK index, once handlers pass `provider`.
  - Depends on (added): none
  - Depends on (removed): none

- `studio-desktop:ipc-handler-registry`: Desktop `indexGraph` must use
  `runIndexProjectGraph` with the long-lived host provider (not per-call
  `createIndexProjectGraph` / not `withOpenGraphProvider` for routine index). Drop the
  “reopen after short-lived runIndex” wording for this path.
  - Depends on (added): `sdk:run-index-project-graph` (already registered)
  - Depends on (removed): none

- `studio-desktop:main-kernel-lifecycle`: Align kernel/host lifecycle text so index
  reuses the session long-lived provider via SDK orchestration with `provider`, without
  mandating replace/reopen after index when that provider was injected.
  - Depends on (added): `sdk:run-index-project-graph` (already registered)
  - Depends on (removed): none

## Impact

- `packages/api` — `handler-graph` index route; `create-api-context` /
  `composition-graph-provider` / long-lived helpers if release/refresh APIs become unused
- `apps/specd-studio-desktop` — `ipc-handlers` `indexGraph` path; possibly shared
  long-lived graph helpers
- Tests for desktop graph IPC / API graph index
- No changes to `@specd/sdk` `runIndexProjectGraph` implementation or
  `sdk:run-index-project-graph` workspace specs

## Technical context

- Main commit `e4d8b821` / archive `allow-existing-provider-in-run-index-project-graph`:
  optional `RunIndexProjectGraphInput.provider`; conflict with `beforeOpen`/`afterClose`
  throws `InvalidProviderLifecycleError`; injected provider is never closed by the SDK.
- Prior UI-branch work (`merge-main-adapt-ui-branch`) established long-lived hosts and
  `withGraphProvider` / peek vs healthy accessors; this change only fixes the index seam.
- `sdk:run-index-project-graph` stays out of change `specIds` (dependency only) to avoid
  overlap with `deprecate-ladybug-store`, which plans a broader rewrite of that spec.
- Agreed direction: when indexing with the injected long-lived provider, hosts should
  **not** release/refresh solely because index ran — the same open instance remains the
  session provider (subject to existing stale-error reopen rules).
- **Force reindex does not require a host-level reload** when `force` runs on that same
  injected long-lived provider: `CodeGraphProvider.index({ force: true })` already owns
  `store.recreate()` (close DB → wipe → rotate storage generation → reopen store) and
  refreshes the provider’s cached generation afterward. Desktop already indexes with
  `force` on the long-lived instance without a host `refresh`. The API’s current
  release→index→refresh cycle exists because a _different_ (short-lived) provider
  performed recreate; with `provider` passthrough that reason goes away.
- **Keep** healthy stale reopen (`withGraphProvider` / `withHealthyGraphProvider` on
  `GraphProviderStaleError`) for cross-process generation changes — orthogonal to
  post-index refresh.

## Open questions

- Exact removal vs retention of `releaseGraphProviderForIndex` /
  `refreshGraphProvider` helpers if other callers remain — settle in design by inventorying
  call sites (does not change the proposed host index behaviour).
- Desktop wiring shape for `runIndexProjectGraph(ctx, …)` (how `SdkHostContext` is
  obtained from the existing desktop host) — implementation detail for design/tasks.
