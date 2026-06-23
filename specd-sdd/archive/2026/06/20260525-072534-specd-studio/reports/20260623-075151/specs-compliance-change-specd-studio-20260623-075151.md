# Spec Compliance Audit

- Mode: `--change specd-studio`
- Change: `specd-studio`
- Timestamp: `2026-06-23 07:51:51`
- Change path: `/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/specd-sdd/changes/20260525-072534-specd-studio`

## Scope

- Change specs in scope: `191`
- Project-wide specs included for compliance context:
  - `default:_global/architecture`
  - `default:_global/conventions`
  - `default:_global/docs`
  - `default:_global/error-handling-conventions`
  - `default:_global/eslint`
  - `default:_global/logging`
  - `default:_global/spec-layout`
  - `default:_global/testing`
- Code graph status: fresh (`lastIndexedRef: 9cd04791`)

## Evidence Used

Commands executed:

```text
node packages/cli/dist/index.js config show --format toon
node packages/cli/dist/index.js changes status specd-studio --format toon
node packages/cli/dist/index.js project context --format toon
node packages/cli/dist/index.js graph stats --format json
node packages/cli/dist/index.js changes implementation review specd-studio --format toon
node packages/cli/dist/index.js changes implementation review specd-studio --format text
```

Verification evidence reused from the active verify run:

- verifying pre-hooks passed: `pnpm test`, `pnpm lint`, `pnpm typecheck`
- graph-first spot checks confirmed:
  - `@specd/ui` and `@specd/client` do not import `@specd/core`
  - `SpecdDataPort` aggregates the required port groups
  - API handlers delegate through kernel use cases for change read/mutate flows
  - `application/problem+json` normalization is centralized in API error handling

## Findings

### 1. Implementation review is not clean yet

Severity: high

The compliance review for `specd-studio` is not clean because implementation tracking still shows a large unresolved review surface.

Evidence:

- `specd changes implementation review specd-studio --format text`
- The output reports a very large `open` tracked-file set across:
  - repo config and lockfiles
  - `apps/specd-studio-web/*`
  - `apps/specd-studio-desktop/*`
  - `packages/api/*`
  - `packages/client/*`
  - `packages/ui/*`
  - many change-local spec and delta artifacts under `specd-sdd/changes/20260525-072534-specd-studio/*`

Why this matters:

- The `cli:change-implementation` workflow defines implementation tracking as an explicit review surface.
- Open tracked files mean the change has not been fully reviewed and linked at the implementation-traceability layer, even if tests pass.

Possible interpretations:

- Spec may be acceptable, but the implementation review bookkeeping is incomplete.
- Code may be complete, but the change still lacks the confirmed traceability the workflow expects before archive.

Recommended follow-up:

- Run `node packages/cli/dist/index.js changes implementation review specd-studio --format text`
- Then close the review surface with targeted:
  - `node packages/cli/dist/index.js changes implementation add ...`
  - `node packages/cli/dist/index.js changes implementation resolve ...`
  - `node packages/cli/dist/index.js changes implementation ignore ...`

### 2. Out-of-scope implementation sidecar exists

Severity: medium

The implementation review reports one out-of-scope sidecar:

```text
core:kernel
```

Why this matters:

- The review flow is designed to surface implementation-sidecar maintenance that would require updates outside the current spec scope.
- This means the confirmed implementation linkage currently references a spec not included in the change scope.

Possible interpretations:

- The change scope may be too narrow and should include `core:kernel`.
- The linkage may be overly broad and should be removed or reassigned.

Recommended follow-up:

- Inspect why `packages/core/src/composition/kernel.ts` is linked to `core:kernel`.
- Decide whether to:
  - add `core:kernel` to the change scope, or
  - remove/adjust the implementation link if it is not intended change scope.

### 3. Stale symbol links detected

Severity: medium

The implementation review reports stale symbol-level diagnostics while the graph is fresh, so they are authoritative:

- `api:openapi-generation -> packages/api/src/delivery/openapi/openapi-doc.ts`
  - stale symbol: `OPENAPI_STUB`
- `client:dto-graph-search -> packages/client/src/dto/graph-search.ts`
  - stale symbol: `GraphSearchHitDto`

Why this matters:

- The change implementation links reference symbols that the current graph cannot resolve.
- This weakens spec-to-symbol traceability and may indicate renamed, removed, or drifted symbols.

Possible interpretations:

- Spec linkage is stale while code is correct.
- Code changed shape and the intended symbol-level traceability was never refreshed.

Recommended follow-up:

- Re-run implementation review after refreshing the relevant implementation links.
- Update or remove the stale symbol links via `changes implementation add/remove`.

## Non-findings

These checks did not surface compliance issues in this run:

- Graph freshness
- Layering check sample:
  - `packages/ui/src` and `packages/client/src` showed no `@specd/core` imports
- API delegation sample:
  - change handlers use kernel-backed read/write flows instead of bypassing into raw repository save/load for the reviewed paths
- Error-shape sample:
  - API maps failures to `application/problem+json`
- Automated verification hooks:
  - tests passed
  - lint passed
  - typecheck passed

## Audit Result

Result: `issues found`

Summary:

- The code/spec architecture checks sampled during verification are broadly aligned.
- The blocking compliance concern is implementation-traceability integrity, not failing tests.
- This change should not be treated as compliance-clean until:
  - open implementation review items are intentionally resolved or ignored
  - the out-of-scope sidecar is reconciled
  - stale symbol links are repaired or removed

## Recommended Next Action

Primary path:

1. Run `/specd-implement specd-studio`
2. Use `node packages/cli/dist/index.js changes implementation review specd-studio --format text`
3. Resolve the implementation review gaps
4. Re-run `/specd-verify specd-studio` in full mode

Alternative path if scope is wrong:

1. Run `/specd-design specd-studio`
2. Decide whether `core:kernel` belongs in scope
3. Return to implementation review and verification
