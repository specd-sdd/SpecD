# Partial: CLI + Kernel + Composition — `09-core-approval-gates-baked`

**Change:** `20260625-142946-09-core-approval-gates-baked`  
**Specs:** `cli:change-transition`, `cli:change-approve`, `core:kernel`, `core:composition`  
**Audit mode:** Change (spec-preview merged deltas)  
**Focus:** Approval gates baked at kernel construction; `kernel.changes.approve*` (not `kernel.specs`); CLI omits approval flags; factories pass `config.approvals`

---

## Requirements Summary

| Spec                  | Requirement focus                                                                                                               | Impl status                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| cli:change-transition | CLI delegates routing to baked `TransitionChange`; no approval flags on `execute`; refresh policy via `GetStatus(false)`        | ✅ Pass (approval focus) / ⚠️ Pre-existing I/O drift |
| cli:change-approve    | CLI calls `kernel.changes.approve*` with `{ name, reason }` only; no hash computation in CLI                                    | ✅ Pass                                              |
| core:kernel           | `approveSpec` / `approveSignoff` on `kernel.changes`; absent from `kernel.specs`; wired with `config.approvals` at construction | ✅ Pass                                              |
| core:composition      | Kernel groups approval gates under `changes`; factories extract `config.approvals` for approve/transition use cases             | ✅ Pass                                              |

---

## Implementation Status

### cli:change-transition

**File:** `packages/cli/src/commands/change/transition.ts`

| Requirement                                                          | Evidence                                                                                                                | Status |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------ |
| Approval-gate routing — CLI omits flags                              | `kernel.changes.transition.execute({ name, to, skipHookPhases }, onProgress)` — no `approvalsSpec` / `approvalsSignoff` | ✅     |
| Delegates refresh — pre-transition `GetStatus`                       | `refreshImplementationTracking: false` before transition (L220–223)                                                     | ✅     |
| Delegates refresh — repair guide                                     | Second `GetStatus` with `refreshImplementationTracking: false` on `InvalidStateTransitionError` (L263–266)              | ✅     |
| No direct `RefreshImplementationTracking` / `ImplementationDetector` | Handler only calls `status` and `transition` on kernel                                                                  | ✅     |
| `--next` resolution                                                  | `resolveNextTarget` covers drafting→designing through done→archivable; fails in pending-\* and archivable states        | ✅     |
| Approval routing transparent to CLI                                  | CLI passes logical target (`implementing`, `archivable`); effective state comes from use case result                    | ✅     |

### cli:change-approve

**File:** `packages/cli/src/commands/change/approve.ts`

| Requirement                                      | Evidence                                                          | Status |
| ------------------------------------------------ | ----------------------------------------------------------------- | ------ |
| Routes through `kernel.changes.approveSpec`      | L40: `kernel.changes.approveSpec.execute({ name, reason })`       | ✅     |
| Routes through `kernel.changes.approveSignoff`   | L78: `kernel.changes.approveSignoff.execute({ name, reason })`    | ✅     |
| No `approvalsSpec` / `approvalsSignoff` on input | Execute calls pass only `name` and `reason`                       | ✅     |
| No artifact hash computation in CLI              | No hasher imports or hash fields in handler                       | ✅     |
| `--reason` required                              | Commander `requiredOption('--reason <text>')` on both subcommands | ✅     |

### core:kernel

**File:** `packages/core/src/composition/kernel.ts`

| Requirement                           | Evidence                                                                                             | Status                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------- |
| `kernel.changes.approveSpec` wired    | L331–334: `new ApproveSpec(..., { spec: config.approvals.spec, signoff: config.approvals.signoff })` | ✅                            |
| `kernel.changes.approveSignoff` wired | L335–338: same pattern                                                                               | ✅                            |
| Not on `kernel.specs`                 | `Kernel` interface (L112–126): `specs` has no approve entries; approve at L109–110 under `changes`   | ✅                            |
| `TransitionChange` baked approvals    | L243–254: constructor receives `{ spec: config.approvals.spec, signoff: config.approvals.signoff }`  | ✅                            |
| `GetStatus` baked approvals           | L233–242: same approvals object passed at construction                                               | ✅                            |
| Entry mapping table (delta)           | `changes.approveSpec`, `changes.approveSignoff` in mapping; removed from `kernel.specs` table        | ✅ (impl matches delta table) |

### core:composition

**Files:** `packages/core/src/composition/kernel.ts`, `packages/core/src/composition/use-cases/{transition-change,approve-spec,approve-signoff}.ts`

| Requirement                                                | Evidence                                                                                          | Status |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------ |
| Approval gates under `kernel.changes` in kernel example    | `kernel.ts` L109–110, L331–338                                                                    | ✅     |
| `createTransitionChange(config)` passes `config.approvals` | `transition-change.ts` L141: `approvals: config.approvals` → explicit path L186: `opts.approvals` | ✅     |
| `createApproveSpec(config)` passes `config.approvals`      | `approve-spec.ts` L107 → L121: `options!.approvals`                                               | ✅     |
| `createApproveSignoff(config)` passes `config.approvals`   | `approve-signoff.ts` L107 → L121: `options!.approvals`                                            | ✅     |
| Factories accept `SpecdConfig` or explicit options         | All three factories retain dual overload signatures                                               | ✅     |

### Application-layer input shapes (construction-time baking)

| Use case           | `execute()` input                                                                                                        | Approval at construction       | Status |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------ | ------ |
| `TransitionChange` | `TransitionChangeInput`: `name`, `to`, optional `skipHookPhases`, `refreshImplementationTrackingBefore` — no gate fields | `ApprovalGates` in constructor | ✅     |
| `ApproveSpec`      | `ApproveSpecInput`: `name`, `reason` only                                                                                | `ApprovalGates` in constructor | ✅     |
| `ApproveSignoff`   | `name`, `reason` only (same pattern)                                                                                     | `ApprovalGates` in constructor | ✅     |

---

## Discrepancies

### D-CLI-T-1 — Repair guide written to stderr, not stdout (severity: low, pre-existing)

**Spec:** `cli:change-transition` verify — _Transition failure renders Repair Guide_: error to stderr; `repair guide:` section to **stdout**.

**Code:** `transition.ts` L268–277 writes error, blockers, and repair guide entirely to `process.stderr`.

| Possibility | Assessment                                                 |
| ----------- | ---------------------------------------------------------- |
| Spec wrong  | Unlikely — matches `change status` repair-guide convention |
| Code wrong  | **Likely** — stdout/stderr split not implemented           |

**Fix:** Move `repair guide:` block to stdout (keep `error:` on stderr) or update spec if stderr-only is intentional.

**Change scope:** Outside approval-gates delta; not introduced by this change.

---

### D-CLI-T-2 — Progress feedback stream (severity: low, pre-existing)

**Spec:** Progress output requirement lists events rendered to **stdout** in text mode.

**Code:** `makeProgressRenderer` uses `process.stderr.write` for requires-check and transitioned events (L140, L161).

| Possibility | Assessment                                                                            |
| ----------- | ------------------------------------------------------------------------------------- |
| Spec wrong  | Possible — verify scenario only says progress "may be rendered" without strict stream |
| Code wrong  | Minor — stream differs from spec prose                                                |

**Change scope:** Outside approval-gates delta.

---

### D-KERNEL-1 — Purpose bullet still lists approve under `specs` group (severity: low, spec drift)

**Spec (merged preview):** `core:kernel` Purpose L15 still says `specs` group includes "approve spec, approve signoff".

**Delta intent:** Entry mapping and verify scenarios move both to `kernel.changes`; implementation matches delta table.

| Possibility | Assessment                                                           |
| ----------- | -------------------------------------------------------------------- |
| Spec wrong  | **Likely** — Purpose bullet not updated when mapping table was moved |
| Code wrong  | No                                                                   |

**Fix:** Add delta op to update Purpose `specs` bullet before archive.

---

### D-KERNEL-2 — `kernel.specs.resolveSchema` in mapping table but not wired (severity: medium, pre-existing)

**Spec:** Entry mapping lists `specs.resolveSchema` → `ResolveSchema`.

**Code:** `kernel.ts` constructs `resolveSchema` locally (L171–177) but does **not** expose it on `kernel.specs`.

| Possibility | Assessment                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------ |
| Spec wrong  | Or mapping ahead of implementation                                                         |
| Code wrong  | **Likely** — verify scenario "ResolveSchema available via kernel.specs.resolve" would fail |

**Change scope:** Pre-existing; not part of approval-gates delta. Flag for separate fix.

---

## Test Coverage

### cli:change-transition

| Verify scenario                                                    | Test location                                                                      | Status                            |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | --------------------------------- |
| Transition execute omits approval flags                            | `change.spec.ts` — `does not pass approval flags to transition execute` (L829–865) | ✅ Covered                        |
| Spec approval gate active                                          | `change-transition.spec.ts` L85–104                                                | ✅                                |
| Signoff gate active                                                | `change-transition.spec.ts` L106–125                                               | ✅                                |
| Next flag honors approval routing                                  | `change-transition.spec.ts` L127–148                                               | ✅                                |
| Next fails in pending-spec-approval / pending-signoff / archivable | `change-transition.spec.ts` L331–384                                               | ✅                                |
| Pre-transition GetStatus skips refresh                             | `change-transition.spec.ts` L72–75, L290–297                                       | ✅                                |
| Repair guide uses core blockers                                    | `change-transition.spec.ts` L251–298                                               | ✅ (content; stream not asserted) |
| Approval-required stderr message                                   | `change-transition.spec.ts` L300–328                                               | ✅                                |

**Gaps:**

- No dedicated test in `change-transition.spec.ts` asserting `approvalsSpec`/`approvalsSignoff` undefined (covered indirectly in `change.spec.ts`).
- Repair guide stdout vs stderr not asserted.

### cli:change-approve

| Verify scenario                            | Test location                             | Status |
| ------------------------------------------ | ----------------------------------------- | ------ |
| Missing `--reason`                         | `change-approve.spec.ts` L92–100          | ✅     |
| Unknown sub-verb                           | `change-approve.spec.ts` L135–154         | ✅     |
| Successful spec/signoff text + JSON output | `change-approve.spec.ts` L47–90, L162–205 | ✅     |
| Change not found                           | `change-approve.spec.ts` L102–114         | ✅     |

**Gaps:**

- **Approve spec omits gate flag** — no assertion that `execute` is called with `{ name, reason }` only and that `approvalsSpec` is absent.
- **Approve signoff omits gate flag** — same gap for signoff path.
- **Routed through `kernel.changes.approve*`** — mocks are on `kernel.changes.approveSpec` / `approveSignoff` but no negative assertion on `kernel.specs`.
- **Hashes computed by use case** — no CLI integration test (covered at core layer).
- **Wrong state for spec approval** — test mocks `ApprovalGateDisabledError` (L116–128); does not assert `InvalidStateTransitionError` for wrong lifecycle state (may be acceptable if use case maps states).

**Test harness note:** `change-approve.spec.ts` mocks `loadConfig` / `createCliKernel` rather than `resolveCliContext` (used by `approve.ts`). Works because `resolveCliContext` delegates to those modules, but inconsistent with `change-transition.spec.ts` pattern.

### core:kernel

| Verify scenario                                    | Test location                      | Status |
| -------------------------------------------------- | ---------------------------------- | ------ |
| Approval gate use cases grouped under changes      | `kernel-get-config.spec.ts` L91–99 | ✅     |
| Specs group does not contain approve\*             | Same test L97–98                   | ✅     |
| Changes group contains approveSpec, approveSignoff | Same test L95–96                   | ✅     |

**Gaps:**

- No test that `TransitionChange` / `GetStatus` / `ApproveSpec` instances receive `config.approvals` values at construction (only placement tested).
- `kernel.specs.resolveSchema` scenario untested (pre-existing).

### core:composition

| Verify scenario                               | Test location                                                        | Status |
| --------------------------------------------- | -------------------------------------------------------------------- | ------ |
| Approval gate use cases grouped under changes | `kernel-get-config.spec.ts` (composition verify delegates to kernel) | ✅     |

**Gaps:**

- No unit tests for `createTransitionChange`, `createApproveSpec`, `createApproveSignoff` asserting `config.approvals` propagation through `SpecdConfig` overload.
- Factory `approvals` field on `FsTransitionChangeOptions` / `FsApproveSpecOptions` / `FsApproveSignoffOptions` not directly tested.

### core application use cases (supporting)

| Area                        | Tests                                                                                                                                              | Status                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Transition approval routing | `packages/core/test/application/use-cases/transition-change.spec.ts` — routes ready→pending-spec-approval, done→pending-signoff when gates enabled | ✅                              |
| ApproveSpec gate + hashes   | `packages/core/test/application/use-cases/approve-spec.spec.ts`                                                                                    | ✅                              |
| ApproveSignoff              | `packages/core/test/application/use-cases/approve-signoff.spec.ts`                                                                                 | ✅ (gate baking at constructor) |

---

## Spec Dependency Chain

| Spec                  | Depends on                                                | Consistency                                                              |
| --------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------ |
| cli:change-transition | core:transition-change, core:get-status                   | ✅ CLI defers routing and refresh to core; no duplicate approval logic   |
| cli:change-approve    | core:change (lifecycle gates)                             | ✅ CLI delegates to kernel approve use cases                             |
| core:kernel           | core:composition, core:approve-spec, core:approve-signoff | ✅ Mapping table and impl agree (except Purpose bullet drift D-KERNEL-1) |
| core:composition      | default:\_global/architecture                             | ✅ Approval gates correctly classified as change lifecycle               |

**Cross-spec alignment (change intent):**

- `cli:change-transition` + `cli:change-approve` + `core:kernel` + `core:composition` are **internally consistent** on baking `config.approvals` at kernel/factory construction and omitting gate flags from CLI `execute` inputs.
- `core:kernel` Purpose text (D-KERNEL-1) lags the entry mapping delta.

---

## Summary

| Metric                                      | Count                                           |
| ------------------------------------------- | ----------------------------------------------- |
| Requirements audited (approval-gates focus) | 18                                              |
| Pass                                        | 16                                              |
| Pre-existing / out-of-scope failures        | 2 (repair guide stream, resolveSchema exposure) |
| Spec drift (change-owned)                   | 1 (kernel Purpose bullet)                       |
| Test gaps                                   | 6                                               |

### Approval-gates verdict: **PASS**

All change-critical invariants are implemented:

1. ✅ `kernel.changes.approveSpec` and `kernel.changes.approveSignoff` — not on `kernel.specs`
2. ✅ CLI transition and approve commands omit `approvalsSpec` / `approvalsSignoff` on `execute`
3. ✅ Kernel and composition factories pass `config.approvals` at construction to `TransitionChange`, `ApproveSpec`, and `ApproveSignoff`
4. ✅ Core tests cover gate routing; kernel placement test covers namespace move

### Recommended follow-ups (non-blocking for this change)

1. Fix `core:kernel` Purpose bullet (D-KERNEL-1) before archive.
2. Add CLI tests asserting approve `execute` input shape and `kernel.changes` routing.
3. Add composition factory tests for `config.approvals` propagation (optional — kernel integration test partially covers).
4. Track `kernel.specs.resolveSchema` and repair-guide stdout separately.
