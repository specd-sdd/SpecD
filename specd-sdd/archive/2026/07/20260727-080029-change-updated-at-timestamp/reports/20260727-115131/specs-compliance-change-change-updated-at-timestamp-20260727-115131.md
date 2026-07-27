# Specs Compliance Report — change-updated-at-timestamp

**Mode:** change  
**Generated:** 2026-07-27T11:51:31  
**Change:** change-updated-at-timestamp  
**State at audit:** verifying

## Executive Summary

| Metric                           | Count |
| -------------------------------- | ----: |
| Specs audited                    |     4 |
| Requirements checked (NEW focus) |     9 |
| Implemented                      |     8 |
| Discrepancies                    |     2 |
| Missing tests                    |     2 |

**Verdict:** Scenario verification passes for the NEW verify scenarios. Compliance audit finds **spec/contract gaps** around `GetStatus` early-return payload wording vs stub implementation, plus minor test gaps.

**Highest-severity:** `core:get-status` — early return returns `unchanged: true` with empty `artifactStatuses`, while NEW requirement text says “current status data,” and sibling Accepts/Returns/refresh requirements were not amended.

## Detailed Findings

# Spec compliance audit (partial) — change-updated-at-timestamp

**Mode:** change `--change change-updated-at-timestamp`  
**Scope:** NEW requirements only (`updatedAt` / revision timestamp / legacy derivation / `ifModifiedSince` status caching), plus spot-check that deltas do not contradict existing requirements.  
**Date:** 2026-07-27  
**Method:** `changes spec-preview` for merged specs; `graph search` / `graph impact` for implementation navigation; direct read of implementation + tests under `packages/core`.

**Primary implementation anchors (graph):**

- `Change.updatedAt` / `Change.touchUpdatedAt` — `packages/core/src/domain/entities/change.ts`
- `deriveManifestUpdatedAt` / `changeToManifest` / `_persistManifest` — `packages/core/src/infrastructure/fs/change-repository.ts`
- `changeManifestSchema.updatedAt` — `packages/core/src/infrastructure/fs/manifest.ts`
- `GetStatusInput.ifModifiedSince` / `_buildUnchangedResult` — `packages/core/src/application/use-cases/get-status.ts`

---

## Spec: core:change

### Requirements Summary

**NEW (delta `Requirement: Revision timestamp`):**

1. `Change` maintains `updatedAt` as last-modification timestamp.
2. `updatedAt` MUST NOT be prior to `createdAt`.
3. If omitted at construction, `updatedAt` defaults to `createdAt`.
4. `touchUpdatedAt(at: Date = new Date())` sets/advances `updatedAt` (default = now).

**Verify scenarios (NEW):**

- Initialized with `createdAt` default
- Rejects `updatedAt` before `createdAt`
- Touch advances to default current time
- Touch advances to explicit timestamp

**Spot-check vs existing:** Additive after Identity; does not alter immutability of `name`/`createdAt`. No contradiction found with History / Lifecycle / Workspaces requirements.

### Implementation Status

| Requirement            | Status      | Evidence                                                              |
| ---------------------- | ----------- | --------------------------------------------------------------------- |
| `updatedAt` property   | Implemented | Getter at `change.ts:321-323`; private `_updatedAt`                   |
| Not before `createdAt` | Implemented | Constructor guard `change.ts:279-282`; same guard in `touchUpdatedAt` |
| Default to `createdAt` | Implemented | `props.updatedAt ?? props.createdAt` at `change.ts:279`               |
| `touchUpdatedAt`       | Implemented | `change.ts:331-336`                                                   |

Domain methods do not auto-touch on every mutation; repository persist path calls `touchUpdatedAt()` (see `core:fs-change-repository`). Spec only requires the property + method, so this is compliant.

### Discrepancies

**none** (functional).

Note (non-counted): method wording is “set or advance”; implementation allows setting `updatedAt` to any time `>= createdAt`, including earlier than the previous `updatedAt`. Verify scenarios only cover advancing/setting to a later explicit date. Consistent with “set or advance,” not a hard defect.

### Test Coverage

`packages/core/test/domain/entities/change.spec.ts` (`describe('updatedAt')`):

- defaults to `createdAt` when omitted
- throws `InvalidChangeError` when `updatedAt < createdAt`
- zero-arg `touchUpdatedAt()` advances (`>=` prior)
- explicit `touchUpdatedAt(date)` sets value
- extra: `touchUpdatedAt` before `createdAt` throws

All four NEW verify scenarios covered.

### Missing Tests

**none** for NEW scenarios.

### Summary: requirementsChecked=4 implemented=4 discrepancies=0 missingTests=0

---

## Spec: core:change-manifest

### Requirements Summary

**NEW (delta under Manifest structure field definitions):**

- `updatedAt` — optional ISO 8601 timestamp string for last update.

**Verify scenarios (NEW):**

- Valid manifest containing `updatedAt` validates against schema

**Spot-check vs existing:** Field is optional; does not conflict with “no top-level state,” append-only history, atomic writes, or schema-once rules. Example JSON block still omits `updatedAt`, which is fine because the field is optional. No contradiction with existing requirements.

### Implementation Status

| Requirement                      | Status                    | Evidence                                                                                                                                |
| -------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Optional `updatedAt` on manifest | Implemented               | `changeManifestSchema`: `updatedAt: z.string().optional()` (`manifest.ts:351`); `ChangeManifest.updatedAt?: string` (`manifest.ts:380`) |
| Treated as ISO 8601              | Implemented by convention | Docs/comments say ISO; writers use `toISOString()`; schema accepts any string (same pattern as `createdAt`)                             |

### Discrepancies

**none** against peer timestamp fields (`createdAt` is also `z.string()`, not `z.string().datetime()`).

### Test Coverage

No dedicated unit test that only calls `changeManifestSchema.safeParse({ ..., updatedAt })`.

Indirect coverage via `packages/core/test/infrastructure/fs/change-repository.spec.ts` (`updatedAt persistence`): persist/load round-trip through schema parse path.

### Missing Tests

1. **Verify scenario “Valid manifest containing updatedAt”** — no isolated schema-validation test asserting success when `updatedAt` is present (only repository integration coverage).

### Summary: requirementsChecked=1 implemented=1 discrepancies=0 missingTests=1

---

## Spec: core:fs-change-repository

### Requirements Summary

**NEW (delta `Requirement: Revision timestamp serialization and backward compatibility`):**

1. Serialize `change.updatedAt` to `manifest.json`.
2. Legacy manifests missing `updatedAt`: derive as max timestamp among `createdAt` and all `history[].at`.

**Verify scenarios (NEW):**

- Persisting `updatedAt` to manifest (`toISOString()` match)
- Deriving `updatedAt` for legacy manifest

**Spot-check vs existing:** Additive; does not alter index-cache, mutate/reconcile, or `saveArtifact` contracts. Persist still goes through `_persistManifest` (create/mutate), which also calls `touchUpdatedAt()` before serialize — compatible with serialization requirement. No contradiction found.

### Implementation Status

| Requirement           | Status      | Evidence                                                                                                                                                             |
| --------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Serialize `updatedAt` | Implemented | `changeToManifest` sets `updatedAt: change.updatedAt.toISOString()` (`change-repository.ts:1679`); `_persistManifest` calls `change.touchUpdatedAt()` first (`:685`) |
| Legacy derivation     | Implemented | `deriveManifestUpdatedAt` (`:1633-1643`); used in `_manifestToChange` (`:1459`)                                                                                      |

Graph: `deriveManifestUpdatedAt` dependents include `_manifestToChange` and repository tests — matches intended load path.

### Discrepancies

**none** (functional).

Note (non-counted): verify wording says “when `save` is called”; public API is `create` / `mutate` / `_persistManifest`. Behavior matches intent.

### Test Coverage

`packages/core/test/infrastructure/fs/change-repository.spec.ts` (`describe('updatedAt persistence')`):

- persist includes `updatedAt` matching `change.updatedAt.toISOString()`
- re-persist advances `updatedAt`
- legacy: strip `updatedAt`, reload, assert `max(createdAt, history[].at)`

Both NEW verify scenarios covered (+ advance case).

### Missing Tests

**none** for NEW scenarios.

### Summary: requirementsChecked=2 implemented=2 discrepancies=0 missingTests=0

---

## Spec: core:get-status

### Requirements Summary

**NEW (delta `Requirement: Revision evaluation for conditional status queries`):**

1. Support optional client revision comparison (`ifModifiedSince`).
2. If client revision `>= change.updatedAt.getTime()`, bypass full status re-evaluation and return early with the **current status data**.

**Verify scenarios (NEW):**

- Revision matches or exceeds `updatedAt` → early return without full re-evaluation

**Spot-check vs existing (contradiction risk):**

- Existing **Accepts a change name as input** still lists only `name` and `refreshImplementationTracking` — does **not** document `ifModifiedSince`.
- Existing **Returns the change and its artifact statuses** requires `artifactStatuses` — “one per artifact attached to the change.”
- Existing **Optional pre-read implementation tracking refresh** requires refresh for active changes by default.
- NEW early-return path interacts with all three; deltas do not explicitly carve exceptions into those older requirements.

### Implementation Status

| Requirement                      | Status                 | Evidence                                                                                                                                                                    |
| -------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Optional `ifModifiedSince` input | Implemented            | `GetStatusInput.ifModifiedSince?: string` (`get-status.ts:37`)                                                                                                              |
| Compare `>= updatedAt.getTime()` | Implemented            | `Date.parse` + compare (`get-status.ts:280-284`)                                                                                                                            |
| Bypass full re-evaluation        | Implemented            | Early return before refresh + `_buildActiveResult`                                                                                                                          |
| Return “current status data”     | **Partial / disputed** | `_buildUnchangedResult` returns `unchanged: true`, `artifactStatuses: []`, empty/minimal lifecycle/review/blockers (`get-status.ts:447-484`) — not a full status projection |

### Discrepancies

1. **Early-return payload vs “current status data” + existing return contract**
   - **Evidence:** Spec NEW text: “return early with the current status data.” Existing return requirement: `artifactStatuses` one entry per attached artifact. Code returns empty `artifactStatuses` and stub lifecycle/review (`_buildUnchangedResult`), flagged by design.md as intentional short-circuit.
   - **Spec may be wrong:** Requirement should document HTTP-304-style short-circuit: return `unchanged: true` with intentionally omitted/empty projections; and “Returns …” / refresh requirements should state explicit exceptions when `ifModifiedSince` hits.
   - **Code may be wrong:** Early return should still populate full current status (or a cached prior projection) so “current status data” and “one per artifact” remain true; `unchanged` would then be an optimization hint only.

2. **Delta incomplete relative to sibling GetStatus requirements**
   - **Evidence:** NEW requirement adds `ifModifiedSince` behavior, and code adds `GetStatusResult.unchanged`, but deltas do not amend **Accepts a change name as input** (missing `ifModifiedSince`) or **Returns the change and its artifact statuses** (missing `unchanged`, no exception for empty statuses). Refresh requirement is also silently skipped on early return without an explicit exception.
   - **Spec may be wrong:** Specs should be updated to list the new input/result fields and exceptions.
   - **Code may be wrong:** Less likely for field documentation; behavior follows design.md more than the merged “Returns …” MUST list.

### Test Coverage

`packages/core/test/application/use-cases/get-status.spec.ts` (`describe('ifModifiedSince revision checks')`):

- equal `ifModifiedSince` → `unchanged: true`, empty `artifactStatuses`, refresh **not** called
- older revision → full evaluation (`unchanged` undefined, non-empty statuses)

Covers the single NEW verify scenario for “matches”; “exceeds” is implied by `>=` but not separately asserted.

### Missing Tests

1. Explicit case where `ifModifiedSince` is **strictly greater** than `updatedAt` (verify says “matches or exceeds”).
2. (Optional / not in verify) Documentation-level scenarios for invalid `ifModifiedSince` parse (`NaN` → fall through) — not required by current verify.md.

### Summary: requirementsChecked=2 implemented=1 discrepancies=2 missingTests=1

---

## Cross-spec notes (spot-check)

- **Persistence advance path:** `_persistManifest` always `touchUpdatedAt()` before write, so `mutate` (including `SaveChangeArtifact` → `saveArtifact` + persist) advances revision. Aligns with caching usefulness for `GetStatus`.
- **List indexes:** `updatedAt` is not part of change-list-entry projection (graph/search confirmed no list-entry `updatedAt`); no new conflict with index write-path rules.
- **Out of change-spec scope but related:** `SaveChangeArtifact` returns `updatedAt` (design/tasks) — implemented + tested; not part of the four audited specs’ deltas.
- **CLI/MCP:** no `ifModifiedSince` / `updatedAt` wiring found under `packages/cli` / `packages/mcp` (delivery gap outside these specs unless delivery specs claim otherwise).

---

## Totals (NEW requirements focus)

| Spec                      | requirementsChecked | implemented | discrepancies | missingTests |
| ------------------------- | ------------------: | ----------: | ------------: | -----------: |
| core:change               |                   4 |           4 |             0 |            0 |
| core:change-manifest      |                   1 |           1 |             0 |            1 |
| core:fs-change-repository |                   2 |           2 |             0 |            0 |
| core:get-status           |                   2 |           1 |             2 |            1 |
| **TOTAL**                 |               **9** |       **8** |         **2** |        **2** |

**Highest-severity issue:** `core:get-status` early-return short-circuit returns a minimal stub (`unchanged: true`, empty artifact statuses) while the NEW requirement says “current status data,” conflicting with the existing “one artifactStatuses entry per artifact” return contract and leaving related input/return/refresh requirements unamended by the delta.
