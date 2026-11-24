# Compliance Audit Partial Report — Batch 1: `global-and-core-errors`

**Change:** `decouple-core-cli-error-hints` (`specd-sdd/changes/20261114-104525-decouple-core-cli-error-hints`)  
**Verification Attempt:** `verification-attempt-2` (delegated, read-only)  
**Scope:**

- `default:_global/error-handling-conventions`
- `core:generate-metadata`
- `core:invalidate-change`
- `core:update-spec-deps`
- `core:transition-change`
- `core:draft-change`

---

## Batch Summary Table

| Spec ID                                      | Status                                               | Delta Scenarios Checked | Discrepancies Found                                                                                                                                  | Test Files Run & Passed                                                                                                                                                                                                             |
| -------------------------------------------- | ---------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default:_global/error-handling-conventions` | Partial / Discrepancy Found                          | 2 / 2 (9 total)         | 1 new/active (`validate-skip-checks.ts` mentions `CLI: --skip-hooks`), 1 pre-existing (`DiffGenerationError` extends `Error`)                        | `packages/core/test/domain/errors/host-neutral-errors.spec.ts` (5/5), `packages/core/test/domain/errors/specd-error.spec.ts` (3/3), `packages/cli/test/error-hints.spec.ts` (9/9), `packages/cli/test/handle-error.spec.ts` (55/55) |
| `core:generate-metadata`                     | Partial (Pre-existing drift)                         | 1 / 1 (35 total)        | 0 delta discrepancies; 2 pre-existing (`generatedBy: 'core'` not set on `metadata`; `metadata` not `{}` when schema has no `metadataExtraction`)     | `packages/core/test/application/use-cases/generate-spec-metadata.spec.ts` (21/21)                                                                                                                                                   |
| `core:invalidate-change`                     | Compliant                                            | 3 / 3 (22 total)        | 0                                                                                                                                                    | `packages/core/test/application/use-cases/invalidate-change.spec.ts` (26/26)                                                                                                                                                        |
| `core:update-spec-deps`                      | Compliant                                            | 3 / 3 (39 total)        | 0                                                                                                                                                    | `packages/core/test/application/use-cases/update-spec-deps.spec.ts` (31/31)                                                                                                                                                         |
| `core:transition-change`                     | Compliant (with cross-ref to `validate-skip-checks`) | 1 / 1 (58 total)        | 0 in `TransitionChange` / `HappyPathNextUnavailableError` (see `validate-skip-checks.ts` under global spec for `CheckNotSkippableError` hook reason) | `packages/core/test/application/use-cases/transition-change.spec.ts` (131/131)                                                                                                                                                      |
| `core:draft-change`                          | Compliant                                            | 1 / 1 (18 total)        | 0                                                                                                                                                    | `packages/core/test/application/use-cases/draft-change.spec.ts` (9/9)                                                                                                                                                               |

---

## Detailed Findings

### 1. `default:_global/error-handling-conventions`

#### Requirements & Scenario Coverage

- **Specd Error Contract** (`SpecdError` in [specd-error.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/domain/errors/specd-error.ts#L7-L33)): Defines `get specd(): true`, `abstract get code(): string`, and `this.name = this.constructor.name`. Covered by `packages/core/test/domain/errors/specd-error.spec.ts`.
- **core Mandate**: All error classes under `packages/core/src/domain/errors/` and `packages/core/src/application/errors/` extend `SpecdError`. (See pre-existing exception for `DiffGenerationError` in `application/ports/diff-generator.ts` below.)
- **Monorepo Package Mandate**: `SpecdCliError` in [specd-cli-error.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/errors/specd-cli-error.ts#L6-L15) extends `SpecdError`.
- **Host-Neutral Core Errors and Delivery Hints (Delta)**:
  - `DependsOnOverwriteError`, `HistoricalImplementationGuardError`, `HappyPathNextUnavailableError`, `InvalidateRequiresForceError`, and `SpecNotInChangeError` all omit CLI flags (`--force`, `--next`) and `specd ...` commands, and expose structured metadata properties (`existingDeps`, `incomingDeps`, `operation`, `changeName`, `state`, `gates`, `recoveries`, `specId`). Covered by [host-neutral-errors.spec.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/test/domain/errors/host-neutral-errors.spec.ts#L8-L55).
  - CLI hint translation in [handle-error.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/handle-error.ts#L219-L254) and [error-hints.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/error-hints.ts#L160-L174) resolves command-aware hints without mutating core error messages. Covered by `packages/cli/test/error-hints.spec.ts` and `packages/cli/test/handle-error.spec.ts`.

#### Discrepancies

1. **Core error message includes CLI flag `--skip-hooks`** (`Host-Neutral Core Errors and Delivery Hints` — `Scenario: Core error message omits CLI flags and commands`)
   - **Location:** [validate-skip-checks.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/services/validate-skip-checks.ts#L9-L10) and [validate-skip-checks.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/services/validate-skip-checks.ts#L51-L53)
   - **Evidence:**
     ```ts
     export const HOOK_CHECK_NOT_SKIPPABLE_REASON =
       'Effect checks (hooks) are governed exclusively by skipHookPhases (CLI: --skip-hooks)'
     ```
     When `validateSkipChecks` encounters an effect check in `skipChecks`, it throws `new CheckNotSkippableError(checkId, HOOK_CHECK_NOT_SKIPPABLE_REASON)`, producing a core `SpecdError` message containing `(CLI: --skip-hooks)`.
   - **Interpretation:**
     - _Implementation bug:_ This violates the `Host-Neutral Core Errors and Delivery Hints` requirement in `default:_global/error-handling-conventions`, which states that domain/application error messages in `@specd/core` must describe the invariant violation without CLI flags (`--force`, `--next`, etc.). The `(CLI: --skip-hooks)` hint belongs in `@specd/cli`'s `error-hints.ts` rather than `@specd/core`.
     - _Spec drift:_ Unlikely, as the spec was just updated in this change to forbid CLI flags in `@specd/core` error messages; however, if `validate-skip-checks.ts` was intentionally left out of scope of this change, it remains a residual non-conformance against the global spec.

2. **Pre-existing: `DiffGenerationError` extends `Error` directly instead of `SpecdError`** (`core Mandate`)
   - **Location:** [diff-generator.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/ports/diff-generator.ts#L18-L38)
   - **Evidence:** `export class DiffGenerationError extends Error` does not extend `SpecdError` and lacks `specd: true` and `code`.
   - **Interpretation:**
     - _Implementation bug:_ If `core Mandate` applies to all `@specd/core` errors (domain and application), `DiffGenerationError` should extend `SpecdError`.
     - _Spec drift:_ `core Mandate` specifically says _"Given: a domain error in @specd/core"_, whereas `DiffGenerationError` is defined in `application/ports/` as an adapter-level port error.

---

### 2. `core:generate-metadata`

#### Requirements & Scenario Coverage

- **Host-neutral `DependsOnOverwriteError` (Delta):**
  - [depends-on-overwrite-error.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/domain/errors/depends-on-overwrite-error.ts#L13-L63): `code` is `'DEPENDS_ON_OVERWRITE'`; message is `` `dependsOn would change (${parts.join('; ')}). Pass force to overwrite curated dependencies.` `` (no `--force`); `existingDeps` and `incomingDeps` getters return the arrays.
  - Thrown at [generate-spec-metadata.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/generate-spec-metadata.ts#L367).
  - Tested in [host-neutral-errors.spec.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/test/domain/errors/host-neutral-errors.spec.ts#L9-L15) and `generate-spec-metadata.spec.ts` (21/21 passed).
- **Schema resolution, spec resolution, dependsOn resolution, single persisted-state read, provenance:** Verified in [generate-spec-metadata.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/generate-spec-metadata.ts#L104-L244).

#### Discrepancies (Pre-existing, unrelated to delta)

1. **`generatedBy: 'core'` marker not populated by `GenerateSpecMetadata.execute`** (`Assembled result` — `Scenario: Result includes generatedBy marker`)
   - **Location:** [generate-spec-metadata.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/generate-spec-metadata.ts#L216-L229)
   - **Evidence:** The assembled `metadata` object includes `...extracted.metadata`, `dependsOn`, `implementation`, `...freshOptimizations`, `contentHashes`, and `provenance`, but never sets `generatedBy: 'core'`.
   - **Interpretation:** Either _spec drift_ (if `generatedBy` was moved to materialization or dropped) or _implementation bug_ (missing field in `GenerateSpecMetadata`).
2. **`metadata` when schema has no `metadataExtraction`** (`Schema resolution` — `Scenario: Schema has no metadataExtraction`)
   - **Location:** [generate-spec-metadata.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/generate-spec-metadata.ts#L216-L243)
   - **Evidence:** Returns `hasExtraction: false`, but `metadata` still contains `contentHashes` and `provenance` rather than `{}`.
   - **Interpretation:** _Spec drift_ (provenance/hashes were added to `GenerateSpecMetadata` output after that scenario was written) or _implementation bug_.

---

### 3. `core:invalidate-change`

#### Requirements & Scenario Coverage

- **Policy-dependent target rules (Delta):**
  - [invalidate-change.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/invalidate-change.ts#L251-L261): `validateCommandShape` produces `'targets are not allowed with policy \'...\' — targeting is semantically irrelevant'` and `'At least one target is required with policy \'...\''` — host-neutral, no `--target`.
- **Approval guard (Delta):**
  - [invalidate-requires-force-error.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/errors/invalidate-requires-force-error.ts#L13-L45): `code` is `'INVALIDATE_REQUIRES_FORCE'`; message is `'Change has active consent affected by this invalidation. Pass force to revoke the reported gate(s); Core will select the required recovery target.'` (no `--force`); exposes `gates` and `recoveries`.
- **All other requirements:** Input contract, target normalization, reconciliation, nextAction routing verified in [invalidate-change.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/invalidate-change.ts#L121-L195) and tested by `packages/core/test/application/use-cases/invalidate-change.spec.ts` (26/26 passed) + `host-neutral-errors.spec.ts` (lines 38-45).
- **Discrepancies:** None.

---

### 4. `core:update-spec-deps`

#### Requirements & Scenario Coverage

- **Typed errors for dependency update failures (Delta):**
  - [update-spec-deps.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/update-spec-deps.ts#L85-L96) and [apply-depends-on-mutation.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/_shared/apply-depends-on-mutation.ts#L27-L58): All throw `InvalidInputError` (`INVALID_INPUT`) with host-neutral messages (`set is mutually exclusive with add, remove, and clear`, `clear is mutually exclusive with add and remove`, `at least one of add, remove, set, or clear must be provided`, `dependency '${id}' not found in current deps`) without `--` CLI flag prefixes.
- **All other requirements:** `UpdateSpecDepsInput` (`add`, `remove`, `set`, `clear`), spec membership check, `parseSpecId` validation, `tryNormalizeDepId` for `remove`, serialized `mutate` persistence verified in `update-spec-deps.ts` and tested by `packages/core/test/application/use-cases/update-spec-deps.spec.ts` (31/31 passed).
- **Discrepancies:** None.

---

### 5. `core:transition-change`

#### Requirements & Scenario Coverage

- **Host-neutral `HappyPathNextUnavailableError` (Delta):**
  - [happy-path-next-unavailable-error.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/domain/errors/happy-path-next-unavailable-error.ts#L8-L51): `code` is `'HAPPY_PATH_NEXT_UNAVAILABLE'`; `state` getter exposes current `ChangeState`; `happyPathNextMessage(state)` omits `--next`. Tested in [host-neutral-errors.spec.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/test/domain/errors/host-neutral-errors.spec.ts#L31-L36).
- **Committed recovery, check evaluation, hooks, persistence:** Verified in [transition-change.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/transition-change.ts#L733-L758) and tested by `packages/core/test/application/use-cases/transition-change.spec.ts` (131/131 passed).
- **Discrepancies:** None in `TransitionChange` or `HappyPathNextUnavailableError` itself (see `validate-skip-checks.ts` under `default:_global/error-handling-conventions` for `HOOK_CHECK_NOT_SKIPPABLE_REASON` passed to `CheckNotSkippableError`).

---

### 6. `core:draft-change`

#### Requirements & Scenario Coverage

- **Host-neutral `HistoricalImplementationGuardError` (Delta):**
  - [historical-implementation-guard-error.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/domain/errors/historical-implementation-guard-error.ts#L14-L45): `code` is `'IMPLEMENTATION_DETECTED'`; message is `` `Cannot ${operation} a change that has reached implementing without force: implementation may already exist and specs and code could be left out of sync` `` (no `--force`); exposes `operation` and `changeName`. Tested in [host-neutral-errors.spec.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/test/domain/errors/host-neutral-errors.spec.ts#L17-L29).
- **Use case contract:** [draft-change.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/draft-change.ts#L22-L63) checks active change existence, resolves actor, calls `changes.mutate`, and returns `DraftedChangeView`. Tested by `packages/core/test/application/use-cases/draft-change.spec.ts` (9/9 passed).
- **Discrepancies:** None.
