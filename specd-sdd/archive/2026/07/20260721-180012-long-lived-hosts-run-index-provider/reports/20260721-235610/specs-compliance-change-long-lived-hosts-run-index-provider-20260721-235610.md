# Specs Compliance Report — long-lived-hosts-run-index-provider

- **Mode:** change
- **Timestamp:** 20260721-235610
- **Verdict:** PASS (0 findings)

## Scope

`api:handler-graph`, `api:composition-create-api-context`, `api:composition-graph-provider`, `studio-desktop:ipc-handler-registry`, `studio-desktop:main-kernel-lifecycle`

## Aggregate

| Metric                 | Count |
| ---------------------- | ----- |
| Specs audited          | 5     |
| Blocking discrepancies | 0     |
| Soft findings          | 0     |

## Detailed Findings

### Partial: change-specs

# Partial audit — change specs (long-lived-hosts-run-index-provider)

Mode: change · Read-only · Post Both follow-up

## Requirements Summary

| Spec                                 | Change-focused requirements                                                   | Status |
| ------------------------------------ | ----------------------------------------------------------------------------- | ------ |
| api:handler-graph                    | Injected provider index; SDK owns ListWorkspaces assembly; no release/refresh | Met    |
| api:composition-create-api-context   | Healthy accessors; no release-before-index                                    | Met    |
| api:composition-graph-provider       | Stale reopen; no mandatory post-index refresh                                 | Met    |
| studio-desktop:ipc-handler-registry  | runIndexProjectGraph + sqlite-electron                                        | Met    |
| studio-desktop:main-kernel-lifecycle | Index reuses provider; no host reload after force                             | Met    |

## Implementation Status

- Handler index: `withGraphProvider` + `runIndexProjectGraph({ provider })`
- ApiContext: no `releaseGraphProviderForIndex` / `refreshGraphProvider`
- Desktop `indexGraph`: `runIndexProjectGraph(sdkCtx, { provider })`
- Stale: `withHealthyGraphProvider` + unit tests in `packages/api/test/long-lived-graph.spec.ts`

## Discrepancies

None. Prior soft finding (handler-centric ListWorkspaces verify wording) resolved in verify delta.

## Test Coverage

- `handler-graph-index-provider.spec.ts` — wiring
- `long-lived-graph.spec.ts` — stale retry + non-stale propagate
- Desktop source/wiring suite (7 tests)
- Prior `graph.spec.ts` force index → status

## Summary counts

- Blocking: 0
- Soft: 0
- Optional gaps: 0
