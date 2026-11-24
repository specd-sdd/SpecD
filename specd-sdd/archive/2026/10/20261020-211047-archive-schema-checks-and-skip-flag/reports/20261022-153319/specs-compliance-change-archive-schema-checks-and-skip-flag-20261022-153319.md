# Compliance audit — archive-schema-checks-and-skip-flag

Mode: delegated to verification attempt `verification-attempt-8`.

## Summary

| Metric                      |         Result |
| --------------------------- | -------------: |
| Merged change specs audited |             12 |
| Discrepancies               | 0 (1 resolved) |
| Severity                    |           none |
| Focused audit tests passed  |            732 |
| Full workspace test suite   |         passed |

### Finding (Resolved)

~~`GetStatus` omits `isSkippable` from its public blocker projection, although the merged `core:lifecycle-engine` requirement requires it for every blocker.~~  
**Resolved**: `GetStatus.Blocker` interface now declares `isSkippable: boolean` and `_mergeBlockers` projects it for both skippable and locked/non-skippable checks, with dedicated regression tests in `packages/core/test/application/use-cases/get-status.spec.ts`.

## Detailed findings

### Archive checks and registry

No discrepancies. The complete partial audit follows.

# Partial compliance audit — archive checks and registry

Scope: delegated compliance for `archive-schema-checks-and-skip-flag`, verification attempt `verification-attempt-7`.

Audited merged change specs:

- `core:archive-change`
- `core:check-registry`
- `core:transition-checks`

The audit used merged change previews, the current code graph (not stale), direct dependency context (`core:change`, `core:schema-format`, `core:workflow-model`, `core:get-status`, and the global architecture/error-handling/testing constraints), source review, and focused tests.

## Requirements and evidence

### `core:archive-change`

**Archive check resolution and generic bypasses — pass.** `ArchiveChangeInput` exposes only `skipChecks` and `skipHookPhases`; it intentionally has no `allowOverlap` or `allowOutOfScope` booleans (`packages/core/src/application/use-cases/archive-change.ts:77-97`). `ArchiveChange.execute` resolves the change's sovereign schema, derives effective archive bindings using `{ operation: 'archive' }`, validates requested bypass ids before predicates/effects/writes, and evaluates the resulting bindings (`:300-348`).

**Archive effects are binding-driven — pass.** The archive use case selects `before-persist` effects using `matchingEffects`, applies only `pre`/`post`/`all` hook-phase selectors, and uses failure policy rather than hard-coded hook IDs (`archive-change.ts:381-415`).

**Safety and lifecycle/reconciliation guards — pass.** The use case resolves the recorded schema before work, uses the required reconciler, requires `archivable`/`archiving`, performs archive predicates before effects, refreshes/reconciles after pre-effects, and blocks publication on post-hook invalidity.

**Evidence:** Focused tests cover unknown/case-sensitive ids, effects rejected as bypasses, locked checks, duplicate handling, schema-disabled checks, skip-only-overlap behavior, retry behavior, plugin/embedded archive checks, configuration/skippability, order, and immutable base bindings.

### `core:check-registry`

**Registry-backed archive bindings — pass.** `resolveEffectiveBindings` consumes injected base bindings and optional registry, retains governance, applies archive declarations, and synthesizes registered enabled checks. `validateSkipChecks` validates canonical case-sensitive ids, preserves deduplicated caller order, rejects unknown/hook/non-skippable bindings, and accepts registered-but-unbound disabled ids as no-ops.

### `core:transition-checks`

**Schema-declared `archiveChecks` resolution — pass.** `resolveEffectiveBindings` confines archive declarations to the archive coordinate, maintains separate ordinary transition checks, preserves binding policy unless permitted to override, and synthesizes bindings in declaration order.

## Test execution

`pnpm --filter @specd/core exec vitest run` against six archive/registry test files: 237 passed.

## Discrepancies

None found in this scope.

## Coverage gaps / limits

- Other nine change specs and CLI presentation are scoped to separate audit batches.
- Focused tests cover application/domain behavior, not a real filesystem archive CLI invocation.

### Core schema and lifecycle

# Partial compliance audit — core schema and lifecycle

Scope: delegated read-only audit for verification attempt `verification-attempt-7`.
Audited merged specs: `core:schema-format`, `core:workflow-model`, `core:change`, `core:kernel`, `core:get-status`, and `core:lifecycle-engine`.

## Result

0 discrepancies found (the 1 medium discrepancy has been resolved). All inspected requirements are implemented and have focused test evidence.

| Severity | Spec requirement                                    | Finding                                                                                                                                                                             | Status       |
| -------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| medium   | `core:lifecycle-engine` — Machine-readable blockers | `GetStatus` public `Blocker` projection and interface now include `isSkippable: boolean` alongside `bypassFlag`, with tests covering skippable, locked, and non-predicate blockers. | **Resolved** |

## Requirements and implementation evidence

| Spec                    | Audited requirement group                                                                                                                                          | Evidence                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `core:schema-format`    | `workflow.archiving.archiveChecks` accepts only `id`, `skippable`, `disabled`, and object `config`; it is archiving-only; unknown keys and malformed entries fail. | Strict YAML parser schema; build-schema defensive validation and archiving-only governance.              |
| `core:workflow-model`   | Archive declarations are independently resolved, registered, coordinate-unique, and governance locks prevent weakening locked archive bindings.                    | `WorkflowStepArchiveCheckDeclaration`/`archiveChecks` model and build-schema governance validation.      |
| `core:change`           | Archive skip controls are the allowed per-execution `ArchiveChange` override.                                                                                      | `ArchiveChangeInput.skipChecks` is canonical and has no ad-hoc booleans.                                 |
| `core:kernel`           | Kernel construction uses explicit dependencies and validates generic bypasses against resolved bindings.                                                           | Archive composition resolves bindings and calls `validateSkipChecks` before predicates/hooks/writes.     |
| `core:get-status`       | Status evaluates effective archive predicates and projects canonical bypass hints.                                                                                 | Archive bindings are resolved and predicate output is merged; see discrepancy for missing `isSkippable`. |
| `core:lifecycle-engine` | Domain blockers derive skippability from resolved bindings.                                                                                                        | `LifecycleBlocker` declares the field and failed checks resolve it from bindings.                        |

## Test evidence

- 253 focused tests passed across lifecycle verdict, GetStatus, schema build, and YAML parser.
- 120 ArchiveChange tests passed.

## Coverage gaps

- No public `GetStatus` test asserts `isSkippable: true` for a skippable archive predicate and `false` for a locked predicate.
- No public status serialization test covers false for non-predicate/review blockers.

### CLI archive/status and skill templates

# Partial compliance audit — CLI archive/status and skill templates

**Change:** `archive-schema-checks-and-skip-flag`  
**Mode:** delegated verification audit (`verification-attempt-7`)  
**Scope:** merged `cli:change-archive`, `cli:change-status`, and `skills:skill-templates-source`.

**Result:** pass; no implementation-to-spec discrepancies found in this assigned scope.

## Requirements and implementation evidence

### `cli:change-archive`

- The command exposes repeatable `--skip-checks <ids>`, retains `--skip-hooks`, and translates `--allow-overlap` / `--allow-out-of-scope` aliases only into `ArchiveChangeInput.skipChecks`.
- It trims comma-separated IDs, ignores empty entries, preserves exact case, deduplicates aliases, and leaves validation to Core.
- Progress uses the shared change-archive presenter and structured output emits progress before one terminal record.
- Overlap and generic predicate advice appears only when Core resolves a check as skippable.

### `cli:change-status`

- The renderer propagates Core-provided `blockers[].bypassFlag` to text, JSON, and TOON without locally deriving archive policy.
- This batch found no CLI discrepancy, but its behavior is affected by the Core missing `isSkippable` projection described above.

### `skills:skill-templates-source`

- Archive template guidance uses canonical `--skip-checks <checkId>` and treats legacy allow flags as aliases.
- It distinguishes live overlap from invalidation review and lists non-bypassable guards.

## Test coverage and execution evidence

- Four targeted CLI/skills test files: 119 tests passed.
- `@specd/cli` and `@specd/skills` typechecks passed.

## Gaps and residual risk

- Core archive enforcement is covered by the separate core audit.
- No manual archive was attempted; this is intentional for a delegated read-only audit.

## Audit conclusion

The change is fully conformant. The public `GetStatus` blocker projection finding has been resolved and regression tested. Verification attempt `verification-attempt-8` is active and ready to be completed upon user confirmation.
