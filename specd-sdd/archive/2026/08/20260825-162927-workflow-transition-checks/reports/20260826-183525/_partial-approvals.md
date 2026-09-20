# Batch: approvals

Audit mode: change `workflow-transition-checks` (verifying). Graph: `stale: false` at ref `2948f1a2`. Spec content from `changes spec-preview` (merged deltas). Implementation via graph search/impact then file reads. No code or spec files were modified.

Focus asked: `boundFromStates` vs hardcoded `ready`/`done`; drain `pending-*` still allowed.

---

## Per spec

### `core:approve-spec`

**Spec dependencies (depth 1):** `core:change`, `core:schema-format`, `core:composition`, `core:kernel`, `core:composition-resolver`, `core:transition-checks` (`from` states for `approval.spec` come from engine bindings).

**Implementation map**

| Area          | Location                                                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Use case      | `packages/core/src/application/use-cases/approve-spec.ts` (`ApproveSpec`, lines 70–101)                                          |
| Bindings      | `boundFromStates('approval.spec')` from `packages/core/src/domain/services/check-bindings.ts:170`                                |
| Engine `from` | `TRANSITION_BINDING_SPECS` `approval.spec`: `ready → implementing` and `ready → verifying` (`check-bindings.ts:57–63`)           |
| Factory       | `packages/core/src/composition/use-cases/approve-spec.ts` (`resolveApproveSpecDeps`, `createApproveSpec`)                        |
| Kernel        | `packages/core/src/composition/kernel.ts` `changes.approveSpec`                                                                  |
| Tests         | `packages/core/test/application/use-cases/approve-spec.spec.ts`, `packages/core/test/composition/use-cases/approve-spec.spec.ts` |

**Requirements summary (spec.md)**

1. Gate guard — disabled throws `ApprovalGateDisabledError` `'spec'` with no I/O; then load change, actor, schema, mismatch.
2. Change lookup — `ChangeNotFoundError` if missing.
3. Artifact hash computation — skip missing/skipped; load via `ChangeRepository.artifact`; skip null; cleanup + hash; keys `type:key`.
4. Approval recording and state transition — `recordSpecApproval`; no transition when state is bound `from` for `approval.spec`; drain `pending-spec-approval` → `spec-approved` allowed.
5. Persistence — `mutate`; no bound-`from` transition; drain allowed; return mutated `Change`.
6. Input contract — `name` + `reason` only; no gate flags.
7. Gate baked at construction — `approvals: ApprovalGates`.
8. Config factory via `resolveApproveSpecDeps`.

**Implementation status**

- **Conforms (bound `from` vs hardcoded allow-list):** `execute` uses `consentFrom = boundFromStates('approval.spec')` and allows `pending-spec-approval` as drain only (`approve-spec.ts:86–98`). Happy path does **not** call `transition('spec-approved')` or `transition('pending-spec-approval')`. Drain still calls `transition('spec-approved')` when `freshChange.state === 'pending-spec-approval'`.
- **Residual hardcode (error message only):** `InvalidStateTransitionError(change.state, consentFrom[0] ?? 'ready')`. Allow-list is binding-driven; `'ready'` is only the empty-binding fallback for the expected-state argument. Today bindings yield `['ready']`, so behaviour matches verify scenarios that name `ready`.
- **Gate / lookup / mutate / input / kernel wiring:** Match requirements. Kernel constructs via `createApproveSpec(resolveApproveSpecDeps(resolver))` and exposes `kernel.changes.approveSpec`.
- **Hashes:** Computed inside `mutate` on the fresh change (compatible with “before recording” and “record on fresh instance”). Uses `SchemaProvider.get()` + `buildCleanupMap`, not a per-file `SchemaRegistry` as the unchanged hash requirement still describes.
- **Deps field name:** Spec/`verify` list `hasher: ContentHasher`; composition interface is `contentHasher` (`ApproveSpecDeps`). Constructor param is still `hasher`. Wiring is correct; the published deps name does not match the spec bullet.

**Discrepancies**

1. **Artifact hash requirement vs code (spec drift, pre-existing wording).** Spec steps 4–5 still say resolve schema from `SchemaRegistry` per file, empty cleanup map if unresolved. Code uses `SchemaProvider` once in `_computeArtifactHashes` (and already in the gate). **Likely spec should say SchemaProvider**; code matches the gate-guard requirement and `core:composition-resolver`.
2. **`resolveApproveSpecDeps` lists `hasher`; code exports `contentHasher`.** Spec vs composition naming. **Likely spec/verify should say `contentHasher`** to match `ApproveSpecDeps` and sibling factories.
3. **Purpose still says stay in `ready`**, while recording requirement says “state bound as `from` (currently `ready`)”. Not a code bug today; CLI and purpose are more hardcoded than the recording requirement.
4. **Indexed/archived spec blurb** (graph search hit) still describes transitioning into `spec-approved` as the happy path. That is the **workspace spec before this change’s deltas**. Preview is the source of truth for this audit; archive will need to replace that description.

**Neither-side notes:** If engine bindings later add another `approval.spec` `from` state, use case and `boundFromStates` stay aligned; CLI spec/help (batch `cli:change-approve`) would not, unless updated.

**Test coverage**

| Verify scenario                            | Status                                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Gate disabled, no repo access              | Covered (`get`/`mutate` spies)                                                                                                  |
| Change does not exist                      | Covered                                                                                                                         |
| Cleanup rules spec vs verify               | **Missing** in this use-case suite (shared `computeArtifactHash` exists; no approve-spec test with two types)                   |
| Artifact load null skipped                 | Indirect (several tests mock `artifact` → `null`); no assertion that key is absent from the map                                 |
| SchemaProvider.get throws before hash      | **Missing**                                                                                                                     |
| Ready: `spec-approved` event, stay `ready` | Partial: asserts `state === 'ready'` and `activeSpecApproval.reason`; does **not** assert history event shape, hashes, or actor |
| Drain pending → `spec-approved`            | Covered                                                                                                                         |
| Drafting → `InvalidStateTransitionError`   | Covered (describe title still says “not in pending-spec-approval”)                                                              |
| Persist via `mutate`, return `ready`       | Ready path returns `ready`; **`mutate` spy is only on drain path**, not on ready                                                |
| Input name/reason only                     | Type-level; no negative test for extra gate fields                                                                              |
| Factory passes `config.approvals`          | Composition tests only `instanceof`; do not assert baked gates or `resolveApproveSpecDeps` field list                           |
| Enabled gate drain to `spec-approved`      | Covered                                                                                                                         |
| Schema mismatch before mutate              | Covered                                                                                                                         |

**Missing tests**

- Ready path: `mutate` called; history `type: 'spec-approved'` with reason, hashes, actor; no `transitioned` to pending/spec-approved.
- Hash key format `type:key`; cleanup applied vs not; skip `missing`/`skipped`.
- `SchemaProvider.get()` rejection in gate.
- Factory: `resolveApproveSpecDeps` returns `contentHasher` + `approvals` from `config.approvals`.
- Explicit test that allow-list is `boundFromStates` (e.g. documenting current `['ready']`) rather than only drafting rejection.

**Counts (`core:approve-spec`)**

- Spec requirements: 8
- Verify scenarios: 15
- Implemented as specified (behaviour): 8/8 with 2 wording/deps-name mismatches
- Discrepancies: 3 (2 spec-vs-code naming/hash source; 1 purpose/index stale vs bindings language)
- Requirements with adequate tests: ~10/15 scenarios
- Missing/weak tests: 5+ (cleanup, schema throw, ready mutate/event, factory fields, hash keys)

---

### `core:approve-signoff`

**Spec dependencies (depth 1):** `core:change`, `core:schema-format`, `core:composition`, `core:kernel`, `core:composition-resolver`, `core:transition-checks`.

**Implementation map**

| Area             | Location                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| Use case         | `packages/core/src/application/use-cases/approve-signoff.ts` (`ApproveSignoff`)                              |
| Bindings         | `boundFromStates('approval.signoff')`; engine `from: 'done'`, `to: 'archivable'` (`check-bindings.ts:64–68`) |
| Factory / kernel | `packages/core/src/composition/use-cases/approve-signoff.ts`; `kernel.changes.approveSignoff`                |
| Tests            | `packages/core/test/application/use-cases/approve-signoff.spec.ts`, composition factory spec                 |

**Requirements summary:** Mirror of approve-spec: gate `'signoff'`, `recordSignoff`, stay in bound `from` (currently `done`), drain `pending-signoff` → `signed-off`.

**Implementation status**

- **Conforms:** `consentFrom = boundFromStates('approval.signoff')`; drain `pending-signoff` still transitions to `signed-off`; happy path does not enter `pending-signoff` or `signed-off`.
- **Residual hardcode:** `consentFrom[0] ?? 'done'` on `InvalidStateTransitionError` only.
- Same SchemaProvider vs SchemaRegistry hash wording; same `contentHasher` vs spec `hasher`.
- Gate, lookup, mismatch, mutate, input, factory/kernel: match.

**Discrepancies**

1. Hash requirement still describes `SchemaRegistry` per file vs `SchemaProvider` (same as spec sibling).
2. `resolveApproveSignoffDeps` spec lists `hasher`; code uses `contentHasher`.
3. Purpose names `done` while recording requirement uses bound `from` (currently `done`). Aligned today with engine bindings.

**Test coverage**

Symmetric to approve-spec: done stay + drain `signed-off` covered; drafting rejection covered; gate/not-found/mismatch covered; cleanup/schema-throw/hash-key/`mutate` on **done** path/factory field list weak or missing. Describe title still “not in pending-signoff” for drafting.

**Missing tests:** Same class as approve-spec, for signoff/`done`/`signed-off`.

**Counts (`core:approve-signoff`)**

- Spec requirements: 8
- Verify scenarios: 15
- Implemented as specified (behaviour): 8/8 with 2 wording/deps-name mismatches
- Discrepancies: 3 (same pattern as approve-spec)
- Adequate scenario tests: ~10/15
- Missing/weak tests: 5+

---

### `cli:change-approve`

**Spec dependencies (depth 1):** `cli:entrypoint`, `core:change`, `core:transition-checks`.

**Implementation map**

| Area    | Location                                                                                                        |
| ------- | --------------------------------------------------------------------------------------------------------------- |
| Command | `packages/cli/src/commands/change/approve.ts` (`registerChangeApprove`)                                         |
| Tests   | `packages/cli/test/commands/change-approve.spec.ts`, `packages/cli/test/commands/change/change-approve.spec.ts` |

**Requirements summary**

1. Command signatures (`spec`/`signoff`, `--reason`, `--format`).
2. CLI does not pass gate flags; `kernel.changes.approveSpec` / `approveSignoff` only (`name`, `reason`).
3. CLI does not compute hashes.
4. Approve spec: valid in `ready` or drain `pending-spec-approval`; stay `ready`; do not print pending hop.
5. Approve signoff: valid in `done` or drain `pending-signoff`; stay `done`.
6. Output text/json/toon.
7. Errors: missing reason, wrong state, not found → exit 1 / `error:`.

**Implementation status**

- Signatures, required `--reason`, `kernel.changes.*` with `{ name, reason }` only: **conform**.
- No hash computation in CLI: **conform**.
- Success text `approved spec for ${name}` / `approved signoff for ${name}`; JSON `{ result, gate, name }`: **conform**.
- Help strings hardcode `ready` / `done` and mention drain pending states: matches **this CLI spec**, not `boundFromStates`.
- Drain: CLI does not branch on state; use case owns drain. Invoking execute from pending still allowed. Tests mock drain returns.

**Discrepancies**

1. **Hardcoded `ready`/`done` vs `core:transition-checks` / `boundFromStates` (spec–spec).** Change delta for “Approve spec/signoff behaviour” names concrete states only. Dependency on `core:transition-checks` is stated, but the behaviour text does not say “states bound as `from` for `approval.spec` / `approval.signoff`”. Core use cases already use bindings. **If bindings change, CLI spec/help would be wrong while core stays right.** Prefer aligning CLI requirements with bound-`from` + drain, with `ready`/`done` as current examples.
2. **Preview “Output on success” is incomplete** (text/json bullets trail off: “prints to stdout:” with no string). Implementation and verify scenarios still specify `approved spec for …` and JSON fields. **Spec body gap**; behaviour is in verify + code.
3. **Wrong-state verify vs test:** Scenario “change in `designing` → exit 1 / `error:`”. Test `exits 1 when change is in wrong state for spec approval` rejects with `ApprovalGateDisabledError('spec')`, not `InvalidStateTransitionError`. Exit/`error:` still pass, but the scenario is **not actually testing wrong lifecycle state**.

**Test coverage**

| Verify scenario                                               | Status                                                                                                           |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Missing `--reason`                                            | Covered (Commander throw)                                                                                        |
| Unknown sub-verb                                              | Covered                                                                                                          |
| Execute `{ name, reason }` only; `kernel.changes.approveSpec` | Covered; does **not** assert `kernel.specs.approveSpec` unused                                                   |
| Signoff call shape / `kernel.changes.approveSignoff`          | Covered; same gap for `kernel.specs.approveSignoff`                                                              |
| Hashes from disk, CLI did not pass hashes                     | **Not covered at CLI** (kernel mocked). Core tests also do not assert key format. Input shape implies no hashes. |
| Success from ready, stdout, exit 0                            | Covered (unit; process exit not always asserted on success)                                                      |
| Wrong state designing                                         | **Mis-stubbed** (gate disabled)                                                                                  |
| Success from done                                             | Covered                                                                                                          |
| Change not found                                              | Covered                                                                                                          |
| JSON output                                                   | Covered; given `pending-spec-approval` in verify is not required for CLI JSON                                    |

Extra tests (beyond verify): drain still invoked; stdout does not contain `pending-spec-approval` / `moved`.

**Missing tests**

- `kernel.specs.approveSpec` / `approveSignoff` not called.
- Wrong state via `InvalidStateTransitionError` (designing/drafting).
- TOON format (spec allows it; only JSON tested).
- Signoff missing `--reason` (spec error cases are generic; only spec sub-verb tested).

**Counts (`cli:change-approve`)**

- Spec requirements: 7
- Verify scenarios: 11
- Implemented as specified: 7/7 for current schema-std bindings
- Discrepancies: 3 (CLI hardcodes states vs bindings; incomplete output section; wrong-state test uses wrong error)
- Adequate scenario tests: ~8/11
- Missing/weak tests: 3+

---

## Batch totals

| Metric                                                        | Value                                                                                                                                                          |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Specs in batch                                                | 3                                                                                                                                                              |
| Spec requirements                                             | 8 + 8 + 7 = **23**                                                                                                                                             |
| Verify scenarios                                              | 15 + 15 + 11 = **41**                                                                                                                                          |
| Behaviour vs merged preview                                   | Happy path stay in bound `from`; **drain `pending-*` still allowed** in core and CLI                                                                           |
| `boundFromStates` in core use cases                           | **Yes** (`approval.spec` / `approval.signoff`)                                                                                                                 |
| Hardcoded `ready`/`done` as allow-list in core execute        | **No** (only `?? 'ready'` / `?? 'done'` on empty bindings for `InvalidStateTransitionError`)                                                                   |
| Hardcoded `ready`/`done` in CLI spec, help, and verify GIVENs | **Yes** (current bindings; not engine-driven)                                                                                                                  |
| Spec-vs-code discrepancies                                    | **8** across three specs (hash SchemaRegistry wording ×2, `hasher` vs `contentHasher` ×2, purpose/index stale, CLI vs bindings, incomplete CLI output section) |
| Spec-vs-spec (CLI vs core/transition-checks)                  | **1** material: CLI behaviour requirements name `ready`/`done` instead of bound `from`                                                                         |
| Blocking implementation bugs for this change’s intent         | **None found** for stay-in-`ready`/`done` + drain pending                                                                                                      |
| Test gaps (batch)                                             | Cleanup/schema-throw/hash keys/ready-or-done `mutate`+event; CLI wrong-state stub; `kernel.specs.*` unused                                                     |

**Verdict:** Core approve use cases match the change’s binding-driven consent model and still drain `pending-spec-approval` / `pending-signoff`. Residual `ready`/`done` strings are error fallbacks and CLI/docs, not the core allow-list. Highest-value follow-ups: align CLI (and purpose lines) with `boundFromStates`; fix leftover SchemaRegistry/`hasher` wording; tighten tests so ready/done persist and wrong-state are asserted, not implied.
