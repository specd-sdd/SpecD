# Spec Compliance Partial: change-updated-at-timestamp

**Mode:** change  
**Change:** `change-updated-at-timestamp` (state: verifying)  
**Report:** `reports/20260727-122254/_partial-change-updated-at.md`  
**Auditor scope:** `core:change`, `core:change-manifest`, `core:fs-change-repository`, `core:get-status`  
**Focus:** NEW requirements — `updatedAt` / revision timestamp / legacy derivation / `ifModifiedSince` HTTP-304-style short-circuit (`unchanged: true`, empty `artifactStatuses`)  
**Method:** `changes spec-preview` + `graph search` / `graph impact` + implementation/test reads (read-only)

---

## Aggregate Summary

| Spec                        |                                            Requirements reviewed (NEW focus) |    Implemented |             Partial | Missing / broken |            Discrepancies | Missing tests |
| --------------------------- | ---------------------------------------------------------------------------: | -------------: | ------------------: | ---------------: | -----------------------: | ------------: |
| `core:change`               |                                                       1 (Revision timestamp) |              1 |                   0 |                0 |                        0 |             0 |
| `core:change-manifest`      |                                              1 bullet (Manifest `updatedAt`) |              1 |                   0 |                0 |                  1 minor |             0 |
| `core:fs-change-repository` |                                                1 (serialize + legacy derive) |              1 |                   0 |                0 | 1 soft (design vs delta) |             0 |
| `core:get-status`           | 5 modified/added (Accepts / Returns / Revision / refresh / effective-status) | 5 behaviorally | 1 spec text quality |                0 |                        2 |           2–3 |
| **TOTAL**                   |                                                                        **8** |          **8** |               **1** |            **0** |                    **4** |       **2–3** |

**Verdict:** Implementation matches the intended NEW behaviour (entity, persist/load, 304-style GetStatus stub). Main issues are **spec-text quality** in `core:get-status` (placeholder residue in the modified Returns requirement) and **incomplete negative-path / stub-field test coverage** for `ifModifiedSince`.

---

## 1. `core:change`

### Requirements Summary (NEW)

**Requirement: Revision timestamp** (delta-added)

- `Change` SHALL maintain `updatedAt` (last modification timestamp).
- `updatedAt` MUST NOT be prior to `createdAt`.
- If omitted at construction, default to `createdAt`.
- Provide `touchUpdatedAt(at: Date = new Date())` to set/advance (default now).

**Verify scenarios:**

1. Initialized with `createdAt` default
2. Rejects `updatedAt` before `createdAt` (`InvalidChangeError`)
3. Touch without args → current time
4. Touch with explicit later timestamp

### Implementation Status

| Requirement / scenario              | Status         | Evidence                                                                                                                    |
| ----------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Property + default to `createdAt`   | ✅ Implemented | `ChangeProps.updatedAt?`; ctor `props.updatedAt ?? props.createdAt` — `packages/core/src/domain/entities/change.ts:279-283` |
| Reject `updatedAt < createdAt`      | ✅ Implemented | throws `InvalidChangeError('updatedAt must not be before createdAt')` — same file `:280-282`, `:331-334`                    |
| Getter defensive copy               | ✅ Implemented | `get updatedAt()` returns `new Date(this._updatedAt.getTime())` — `:321-323`                                                |
| `touchUpdatedAt` default + explicit | ✅ Implemented | `:331-336`                                                                                                                  |
| Graph                               | ✅ Located     | symbols `updatedAt`, `touchUpdatedAt` on `Change`                                                                           |

### Discrepancies

None for NEW requirements. Code matches design and verify scenarios.

Note (non-blocking): `touchUpdatedAt` allows setting a timestamp **earlier than the current** `updatedAt` as long as `>= createdAt`. Spec wording “set or advance” permits this; verify only covers forward cases.

### Test Coverage

| Scenario                   | Covered? | Test                                                                         |
| -------------------------- | -------- | ---------------------------------------------------------------------------- |
| Default equals `createdAt` | ✅       | `packages/core/test/domain/entities/change.spec.ts` — `updatedAt` / defaults |
| Reject before `createdAt`  | ✅       | same — throws `InvalidChangeError`                                           |
| Touch without args         | ✅       | `touchUpdatedAt without arguments advances…` (`>= before`)                   |
| Touch explicit             | ✅       | sets to explicit date                                                        |
| Touch before `createdAt`   | ✅ Extra | throws (not required by verify, good)                                        |

### Missing Tests

None for NEW scenarios.

### Spec Dependency Chain

Depends on (depth 1): `core:change-manifest`, `core:workflow-model`, `core:spec-metadata`, `core:spec-id-format`, `default:_global/architecture`, `core:lifecycle-engine`, `default:_global/logging`, `core:implementation-detector-port`.

NEW requirement is entity-local; no contradiction with dependency specs found.

### Summary counts (`core:change`)

- Requirements reviewed (NEW): **1**
- Fully implemented: **1**
- Partial: **0**
- Missing: **0**
- Discrepancies: **0**
- Missing tests: **0**

---

## 2. `core:change-manifest`

### Requirements Summary (NEW)

Under **Requirement: Manifest structure** field definitions:

- `updatedAt` — optional ISO 8601 timestamp string for last update.

**Verify scenario (NEW):**

- **Valid manifest containing updatedAt** — schema validation succeeds for a manifest with a valid `updatedAt` ISO string.

### Implementation Status

| Requirement / scenario              | Status                  | Evidence                                                                                                                      |
| ----------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Optional `updatedAt` on schema      | ✅ Implemented          | `changeManifestSchema`: `updatedAt: z.string().optional()` — `packages/core/src/infrastructure/fs/manifest.ts:351`            |
| Interface field                     | ✅ Implemented          | `ChangeManifest.updatedAt?: string` — `:380`                                                                                  |
| Isolated schema validation scenario | ✅ Implemented + tested | `changeManifestSchema.safeParse({…, updatedAt: '2024-06-01T12:00:00.000Z'})` succeeds — `change-repository.spec.ts:1170-1189` |

### Discrepancies

1. **Minor — example JSON vs field list**
   - **Spec side:** The illustrative `manifest.json` example in Manifest structure still omits `updatedAt`, while the field-definition bullet (added by this change) documents it.
   - **Code side:** Persistence always writes `updatedAt` via `changeToManifest`.
   - **Interpretation:** Spec drift / incomplete example update — not an implementation bug. Prefer updating the example on archive, or accept optional field as documentary-only in the sample.

2. **Soft — ISO 8601 not enforced by Zod**
   - Spec describes ISO 8601; schema accepts any string. Invalid strings would parse as `Invalid Date` on load.
   - Verify only requires success for a valid ISO string. No hard fail.

### Test Coverage

| Scenario                                       | Covered? | Test                                                           |
| ---------------------------------------------- | -------- | -------------------------------------------------------------- |
| Valid manifest containing `updatedAt` (schema) | ✅       | isolated `safeParse` in `change-repository.spec.ts` (task 4.1) |

### Missing Tests

None for the NEW verify scenario. Optional future: reject/normalize non-ISO if the project later hardens the Zod type to `.datetime()`.

### Spec Dependency Chain

Depends on: `core:change`, `core:change-layout`, `core:storage`, `core:spec-metadata`, `core:spec-id-format`, `core:workspace`.

Consistent with `core:change` revision timestamp and with `core:fs-change-repository` serialization.

### Summary counts (`core:change-manifest`)

- Requirements reviewed (NEW): **1**
- Fully implemented: **1**
- Partial: **0**
- Missing: **0**
- Discrepancies: **1 minor** (+ 1 soft schema strictness)
- Missing tests: **0**

---

## 3. `core:fs-change-repository`

### Requirements Summary (NEW)

**Requirement: Revision timestamp serialization and backward compatibility**

- SHALL serialize `change.updatedAt` to `manifest.json`.
- For legacy manifests missing `updatedAt`, derive as **max** of `createdAt` and all `history[].at` timestamps.

**Verify scenarios:**

1. Persisting `updatedAt` to manifest (matches `change.updatedAt.toISOString()` after save)
2. Deriving `updatedAt` for legacy manifest

### Implementation Status

| Requirement / scenario  | Status                                           | Evidence                                                                                               |
| ----------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Serialize on persist    | ✅ Implemented                                   | `changeToManifest` sets `updatedAt: change.updatedAt.toISOString()` — `change-repository.ts:1676-1679` |
| Auto-touch before write | ✅ Implemented (design/tasks; not in delta text) | `_persistManifest` calls `change.touchUpdatedAt()` before serialize — `:685-686`                       |
| Legacy derive helper    | ✅ Implemented                                   | `deriveManifestUpdatedAt` — `:1633-1642`; used at load `:1459`                                         |
| Persist scenario        | ✅                                               | tests write/read `manifest.json`                                                                       |
| Legacy scenario         | ✅                                               | delete `updatedAt` from disk, reload, assert max(createdAt, history)                                   |

Graph: `deriveManifestUpdatedAt` symbol present; callers via load path constructing `Change`.

### Discrepancies

1. **Soft — design/tasks vs delta wording**
   - **Design / tasks:** every persist path calls `touchUpdatedAt()` so the clock advances on save.
   - **Delta requirement text:** only “serialize `change.updatedAt`” + legacy derive — does **not** SHALL auto-touch.
   - **Code:** implements design (auto-touch).
   - **Verify:** “matching `change.updatedAt.toISOString()`” holds **after** touch (entity and file agree); it does **not** require preserving a caller-supplied frozen past timestamp across save.
   - **Interpretation:** Prefer lifting auto-touch into the fs-change-repository requirement text for archive clarity; not an implementation bug relative to design.

No contradiction with `core:change-manifest` (optional field + on-load derivation for absence).

### Test Coverage

| Scenario                      | Covered? | Test                                              |
| ----------------------------- | -------- | ------------------------------------------------- |
| Persist includes `updatedAt`  | ✅       | `updatedAt persistence` / includes updatedAt      |
| Advances on subsequent save   | ✅ Extra | second save advances (supports design auto-touch) |
| Legacy derive from history    | ✅       | deletes field, asserts max timestamp              |
| Schema valid with `updatedAt` | ✅       | shared with change-manifest scenario              |

### Missing Tests

None for NEW verify scenarios.

Optional gap (low): legacy manifest with **empty history** and missing `updatedAt` → must equal `createdAt` (implied by algorithm; not explicitly tested).

### Spec Dependency Chain

Depends on: `default:_global/architecture`, `core:composition`, `core:storage`, `core:change-list-entry`, `core:change-repository-port`.

Aligned with `core:change` / `core:change-manifest` for the revision field.

### Summary counts (`core:fs-change-repository`)

- Requirements reviewed (NEW): **1**
- Fully implemented: **1**
- Partial: **0**
- Missing: **0**
- Discrepancies: **1 soft**
- Missing tests: **0** (1 optional edge)

---

## 4. `core:get-status`

### Requirements Summary (NEW / modified)

1. **Accepts** — `GetStatusInput` adds optional `ifModifiedSince` (ISO / `Date.parse`-able) for conditional short-circuit vs `change.updatedAt`.
2. **Returns** — adds optional `unchanged`; when `true`, `artifactStatuses` MUST be `[]`; `review` MAY be minimal stub; `blockers` MUST be `[]`; `nextAction` MAY say revision is current.
3. **Revision evaluation for conditional status queries** (added) — parse with `Date.parse`; if valid and `>= change.updatedAt.getTime()` → HTTP-304-style stub: no full projection, **no** `RefreshImplementationTracking`, `unchanged: true`, empty `artifactStatuses`, still return `change` + `specDependsOn`. If omitted / `NaN` / older → full path.
4. **Optional pre-read implementation tracking refresh** — skip refresh when short-circuit applies.
5. **Reports effective status for every artifact** — when `unchanged === true`, `artifactStatuses` MUST be empty; otherwise one entry per artifact with `LifecycleEngine` `effectiveStatus`.

**Verify scenarios (NEW):**

- Revision matches `updatedAt` → `unchanged: true`, empty statuses, no refresh
- Revision exceeds `updatedAt` → same
- Revision older → not unchanged; full evaluation (non-empty statuses when artifacts exist)

### Implementation Status

| Requirement                                                   | Status                     | Evidence                                                                                                                                                                                      |
| ------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GetStatusInput.ifModifiedSince?`                             | ✅                         | `get-status.ts:24-38`                                                                                                                                                                         |
| `GetStatusResult.unchanged?`                                  | ✅                         | `:191-201`                                                                                                                                                                                    |
| Short-circuit before refresh                                  | ✅                         | execute `:280-285` then refresh `:287-289`                                                                                                                                                    |
| `Date.parse` + `>= updatedAt`                                 | ✅                         | `:281-283`                                                                                                                                                                                    |
| `_buildUnchangedResult` stub                                  | ✅                         | `:448-483` — `unchanged: true`, `artifactStatuses: []`, `blockers: []`, review stub `required: false`, `nextAction.reason: 'Client revision is current'`, includes `change` + `specDependsOn` |
| Skip refresh on short-circuit                                 | ✅                         | refresh only after failed/absent short-circuit                                                                                                                                                |
| Full path when older                                          | ✅                         | no early return → `_buildActiveResult`                                                                                                                                                        |
| Effective-status empty on unchanged                           | ✅                         | stub returns `[]`                                                                                                                                                                             |
| Accepts / Returns / refresh / effective-status deltas vs code | ✅ Behaviorally consistent | see below                                                                                                                                                                                     |

**Consistency check (Accepts ↔ Returns ↔ refresh ↔ effective-status ↔ code):**

| Spec claim                                 | Code                              |
| ------------------------------------------ | --------------------------------- |
| `ifModifiedSince` optional on input        | ✅                                |
| `unchanged` optional on result             | ✅                                |
| Empty `artifactStatuses` when unchanged    | ✅                                |
| Empty `blockers` when unchanged            | ✅                                |
| Minimal review stub allowed                | ✅ `required: false`              |
| nextAction MAY indicate current revision   | ✅ `'Client revision is current'` |
| No refresh on short-circuit                | ✅                                |
| Full evaluation when older / omitted / NaN | ✅ logic; **NaN path untested**   |
| Still return `change` + `specDependsOn`    | ✅ stub includes both             |

### Discrepancies

1. **Medium — placeholder litter in modified Returns requirement (spec quality / incomplete delta)**
   - Merged preview (and workspace base) still contain the literal line:  
     `(rest of requirement content remains unchanged...)`
   - Introduced historically in commit `02b39469` when prior content defining `ArtifactStatusEntry` / `ArtifactFileStatus` / `review` / `Blocker` / `nextAction` shapes was replaced by that placeholder.
   - **This change’s `op: modified` on Returns re-ships that placeholder** instead of restoring the wiped structural definitions or using a surgical add-only delta.
   - **Code** still implements those shapes; **other requirements** (Drift-aware display, Returns lifecycle context, Identifies blockers) still describe much of the behaviour.
   - **Interpretation:** Spec defect perpetuated by this change’s delta. Prefer rewriting the Returns section to drop the placeholder and restore (or explicitly relocate) the structural contract before archive.
   - Possibilities: (a) fix delta content (spec wrong), (b) leave as pre-existing debt if intentionally deferred — but editing that section without cleaning the placeholder is a compliance smell.

2. **Low — unparseable `ifModifiedSince` required by spec, no verify scenario / no test**
   - Spec MUST full-evaluate when `Date.parse` yields `NaN`.
   - Code does (`Number.isNaN` guard).
   - Verify delta only covers match / exceeds / older — not unparseable or omitted.
   - **Interpretation:** Implementation correct; coverage gap.

3. **Informational — draft + `ifModifiedSince`**
   - Short-circuit only runs for active `get()` hits; drafts go to `_buildDraftedResult` without revision compare.
   - Spec does not explicitly require draft short-circuit. Acceptable ambiguity.

### Test Coverage

| Scenario / claim                                | Covered?        | Test                                                   |
| ----------------------------------------------- | --------------- | ------------------------------------------------------ |
| Match → unchanged + empty statuses + no refresh | ✅              | `get-status.spec.ts` `ifModifiedSince revision checks` |
| Exceeds → same                                  | ✅              | same (task 4.2)                                        |
| Older → full evaluation                         | ✅              | `unchanged` undefined; `artifactStatuses.length > 0`   |
| Unparseable → full evaluation                   | ❌ Missing      | —                                                      |
| Omitted → full evaluation                       | ✅ Implicit     | many existing GetStatus tests                          |
| Stub returns `change` + `specDependsOn`         | ❌ Not asserted | stub builds them but tests don’t check                 |
| Stub `blockers: []` / review stub               | ❌ Not asserted | —                                                      |
| Stub nextAction reason                          | ❌ Not asserted | MAY — optional                                         |

Related out-of-scope-but-design: `SaveChangeArtifact` returns `updatedAt` — implemented + tested (`save-change-artifact.spec.ts`); not one of the four affected specs.

### Missing Tests

1. **`ifModifiedSince: 'not-a-date'` (or equivalent)** → `unchanged` absent/false, refresh may run, non-empty `artifactStatuses` when artifacts exist.
2. **Assert short-circuit payload contract:** `result.change` defined, `result.specDependsOn` present, `result.blockers` `[]`, `result.review.required === false`.
3. (Optional) Explicit omitted-`ifModifiedSince` regression next to the revision describe block.

### Spec Dependency Chain

Depends on: `core:change`, `core:kernel`, `core:transition-change`, `core:schema-format`, `core:config`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`.

NEW short-circuit correctly depends on `core:change.updatedAt` and correctly exempts `RefreshImplementationTracking` — consistent with dependency intent.

### Summary counts (`core:get-status`)

- Requirements reviewed (NEW/modified): **5**
- Fully implemented (behaviour): **5**
- Spec text partial / degraded: **1** (Returns placeholder)
- Missing implementation: **0**
- Discrepancies: **2** (placeholder medium; unparseable coverage low) + 1 informational
- Missing tests: **2** required-ish + **1** optional

---

## Cross-cutting notes

1. **Graph freshness** at audit start: not stale (`project status --graph`).
2. **Primary symbols:** `Change.updatedAt` / `touchUpdatedAt`, `deriveManifestUpdatedAt`, `GetStatus._buildUnchangedResult`, `changeManifestSchema.updatedAt`.
3. **Recent fix acknowledged:** isolated schema validation test + `ifModifiedSince` exceeds case are present and aligned with verify deltas.
4. **SaveChangeArtifact `updatedAt` return** is implemented per design/tasks but is **outside** the four change `specIds`; no discrepancy against in-scope specs.
5. Neither “spec always right” nor “code always right”: placeholder is **spec debt**; 304 stub behaviour is **code+spec aligned**; auto-touch-on-persist is **code+design aligned**, slightly ahead of fs-change-repository delta text.

---

## Issue list (actionable)

| ID  | Severity | Spec                        | Issue                                                                                                                                                                                      |
| --- | -------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1  | Medium   | `core:get-status`           | Returns requirement still contains `(rest of requirement content remains unchanged...)`; this change’s modified delta preserves it. Restore structural DTO contract or remove placeholder. |
| C2  | Low      | `core:get-status`           | No test for unparseable `ifModifiedSince` → full path (spec-required behaviour).                                                                                                           |
| C3  | Low      | `core:get-status`           | Short-circuit tests omit assertions for `change` / `specDependsOn` / empty `blockers` / review stub.                                                                                       |
| C4  | Minor    | `core:change-manifest`      | Manifest structure example JSON omits `updatedAt` while field definitions include it.                                                                                                      |
| C5  | Soft     | `core:fs-change-repository` | Auto-`touchUpdatedAt` on persist is design/code behaviour not stated in the delta SHALL text.                                                                                              |

**No blocking implementation gaps found for the NEW functional requirements.**
