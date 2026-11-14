# Partial Compliance Audit — Batch 3 (`cli-specs`)

- **Change:** `decouple-core-cli-error-hints` (`specd-sdd/changes/20261114-104525-decouple-core-cli-error-hints`)
- **Verification Attempt:** `verification-attempt-2` (delegated, read-only)
- **Scope (9 specs):** `cli:entrypoint`, `cli:spec-generate-metadata`, `cli:spec-validate`, `cli:change-invalidate`, `cli:change-transition`, `cli:change-draft`, `cli:change-discard`, `cli:change-archive`, `cli:change-deps`
- **Global / Consistency Baseline:** `default:_global/error-handling-conventions`

---

## Summary Table

| Spec ID                      | Total Scenarios | Compliant | Discrepancies | Missing Command Tests | Status             |
| ---------------------------- | --------------: | --------: | ------------: | --------------------: | ------------------ |
| `cli:entrypoint`             |              48 |        48 |             0 |                     0 | PASS               |
| `cli:spec-generate-metadata` |              14 |        12 |             2 |                     2 | FAIL               |
| `cli:spec-validate`          |              15 |        15 |             0 |                     1 | PASS (test gap)    |
| `cli:change-invalidate`      |              16 |        16 |             0 |                     2 | PASS (test gap)    |
| `cli:change-transition`      |              39 |        39 |             0 |                     0 | PASS               |
| `cli:change-draft`           |              12 |        12 |             0 |                     1 | PASS (test gap)    |
| `cli:change-discard`         |              11 |        11 |             0 |                     1 | PASS (test gap)    |
| `cli:change-archive`         |              29 |        29 |             0 |                     0 | PASS               |
| `cli:change-deps`            |              27 |        27 |             0 |                     1 | PASS (test gap)    |
| **Total**                    |         **211** |   **209** |         **2** |                 **8** | **1 spec failing** |

---

## Detailed Findings

### 1. `cli:entrypoint`

- **Spec Dependency Chain:** `core:config`, `default:_global/error-handling-conventions`
- **Consistency with Global/Dependency Specs:** Consistent with `default:_global/error-handling-conventions` (`Host-Neutral Core Errors and Delivery Hints`, `Metadata Extraction`, `Monorepo Package Mandate`).
- **Implementation Status:**
  - Centralized hint resolution implemented in [`packages/cli/src/error-hints.ts`](packages/cli/src/error-hints.ts#L1-L174) (`CLI_ERROR_HINTS`, `CLI_ERROR_HINT_RULES`, `resolveCliErrorHint`).
  - [`packages/cli/src/handle-error.ts`](packages/cli/src/handle-error.ts#L192-L268) (`handleError`) resolves command-aware hints via `resolveCliErrorHint(code, options ?? {}, metadata)` (and falls back to `metadata.checkId` when present), prints `hint` on the line following `error: <message>` on `stderr`, and attaches `hint` to structured `json`/`toon` payloads via [`cliError`](packages/cli/src/handle-error.ts#L53-L79) without mutating `message`. When no rule matches, `hint` is omitted from both `stderr` and structured output.
  - Process lifecycle, cleanup (`runCliCleanup`), signal handling, exit codes (`0`, `1`, `2`, `3`, `130`, `143`), and grace period timers verified in [`packages/cli/src/run.ts`](packages/cli/src/run.ts#L1-L80).
- **Discrepancies:** None.
- **Test Coverage:**
  - [`packages/cli/test/error-hints.spec.ts`](packages/cli/test/error-hints.spec.ts#L1-L131): 9/9 passed.
  - [`packages/cli/test/handle-error.spec.ts`](packages/cli/test/handle-error.spec.ts#L1-L512): 55/55 passed (including `command-aware hint rendering` at L451-L512).
  - [`packages/cli/test/entrypoint.spec.ts`](packages/cli/test/entrypoint.spec.ts): 11/11 passed.
  - [`packages/cli/test/run.spec.ts`](packages/cli/test/run.spec.ts): 16/16 passed.
  - [`packages/cli/test/commands/guide-sdk/guide-sdk.spec.ts`](packages/cli/test/commands/guide-sdk/guide-sdk.spec.ts): 72/72 passed.
- **Missing Tests:** None.

---

### 2. `cli:spec-generate-metadata`

- **Spec Dependency Chain:** `core:regenerate-spec-metadata`, `core:spec-metadata`, `default:_global/architecture`
- **Consistency with Global/Dependency Specs:** Consistent with `default:_global/error-handling-conventions`.
- **Implementation Status:**
  - [`packages/cli/src/commands/spec/generate-metadata.ts`](packages/cli/src/commands/spec/generate-metadata.ts#L11-L130) delegates to `kernel.specs.regenerateMetadata.execute({ target, force })` and passes `{ command: 'specs.generate-metadata' }` to `handleError` in the `catch` block (L126).
  - **Broken error-hint path in single-spec mode:** [`RegenerateSpecMetadata._regenerateOne`](packages/core/src/application/use-cases/regenerate-spec-metadata.ts#L90-L108) catches **all** errors thrown by `materializeSpecMetadata.execute(...)` (including [`DependsOnOverwriteError`](packages/core/src/domain/errors/depends-on-overwrite-error.ts#L13-L64)) and returns `{ specId, ok: false, error: error.message }`.
  - In [`packages/cli/src/commands/spec/generate-metadata.ts`](packages/cli/src/commands/spec/generate-metadata.ts#L65-L72), when `result.kind === 'spec'` and `!entry.ok`, the CLI calls `cliError(entry.error ?? ..., opts.format)` directly instead of passing through `handleError`.
  - `cliError` defaults `code` to `'CLI_ERROR'` and receives no `options.hint`, and `DependsOnOverwriteError.message` only states `"Pass force to overwrite curated dependencies."` (no `--force` flag).
- **Discrepancies (2 scenarios failing):**
  1. **Scenario `dependsOn change exits 1 with --force hint`** (`*Requirement: Error — dependsOn overwrite*`):
     - **Spec expectation:** `stderr` includes `error: dependsOn would change` and a hint mentioning `--force`; exits with code `1`; `stdout` is empty.
     - **Observed code:** Because `RegenerateSpecMetadata._regenerateOne` ([`regenerate-spec-metadata.ts:94-106`](packages/core/src/application/use-cases/regenerate-spec-metadata.ts#L94-L106)) swallows `DependsOnOverwriteError` into `{ ok: false, error: error.message }`, [`generate-metadata.ts:67-71`](packages/cli/src/commands/spec/generate-metadata.ts#L67-L71) calls `cliError(entry.error, opts.format)` and never reaches `handleError` at L126. `stderr` prints `error: dependsOn would change (...). Pass force to overwrite curated dependencies.` without `--force`.
     - **Both possibilities:**
       - _Implementation bug (likely):_ `RegenerateSpecMetadataSpecResult` drops the structured error / code (or single-spec mode doesn't rethrow/attach `code: 'DEPENDS_ON_OVERWRITE'`), preventing `generate-metadata.ts` from routing through `handleError(..., { command: 'specs.generate-metadata' })` and `resolveCliErrorHint('DEPENDS_ON_OVERWRITE', ...)`.
       - _Spec drift (unlikely):_ If `RegenerateSpecMetadata` is intentionally non-throwing for single-spec results, the CLI spec would need to reflect that `cliError` is used unless `RegenerateSpecMetadataSpecResult` carries `code` or rethrows.
  2. **Scenario `JSON output on dependsOn error includes hint`** (`*Requirement: Error — dependsOn overwrite*`):
     - **Spec expectation:** Exit code `1`; `stderr` contains `error: dependsOn would change`; structured error payload includes a `hint` mentioning `--force`.
     - **Observed code:** [`generate-metadata.ts:67-71`](packages/cli/src/commands/spec/generate-metadata.ts#L67-L71) calls `cliError(entry.error, opts.format)` with default `code = 'CLI_ERROR'` and `options = undefined`, emitting `{ result: "error", code: "CLI_ERROR", message: "...", exitCode: 1 }` with **no `hint` field**.
     - **Both possibilities:** Same root cause as above — either `RegenerateSpecMetadata` / `generate-metadata.ts` must preserve/handle the typed error through `handleError` (implementation bug), or the spec expectation for `hint` in `specs generate-metadata` JSON output cannot be satisfied under the current `{ ok: false, error: string }` contract.
- **Test Coverage:**
  - [`packages/cli/test/commands/spec-generate-metadata.spec.ts`](packages/cli/test/commands/spec-generate-metadata.spec.ts#L1-L194): 6/6 passed (signature, single-spec ok, `--all`, `--force`, batch JSON partial/ok).
- **Missing Tests:**
  - No test in `spec-generate-metadata.spec.ts` exercises `DependsOnOverwriteError` (neither text nor `--format json` output), which is why the discrepancy above was not caught by the unit suite.

---

### 3. `cli:spec-validate`

- **Spec Dependency Chain:** `default:_global/architecture`, `default:_global/conventions`
- **Consistency with Global/Dependency Specs:** Consistent with `default:_global/error-handling-conventions`.
- **Implementation Status:**
  - [`packages/cli/src/commands/spec/validate.ts`](packages/cli/src/commands/spec/validate.ts#L122-L124) routes errors through `handleError(err, opts.format, { command: 'specs.validate' })`.
  - [`packages/cli/src/error-hints.ts`](packages/cli/src/error-hints.ts#L68-L69) (`'deps.repair-or-force-generate'`) renders `'Repair with: specd specs deps add <spec-id> / specd specs deps set <spec-id>, or re-run specd specs generate-metadata --force'` for `DEPENDS_ON_OVERWRITE` on `specs.validate`, without suggesting `--force` on `specs validate`.
- **Discrepancies:** None.
- **Test Coverage:**
  - [`packages/cli/test/commands/spec-validate.spec.ts`](packages/cli/test/commands/spec-validate.spec.ts#L1-L207): 9/9 passed.
  - Hint routing for `specs.validate` + `DEPENDS_ON_OVERWRITE` is tested in [`error-hints.spec.ts:10-14`](packages/cli/test/error-hints.spec.ts#L10-L14) and [`handle-error.spec.ts:462-475`](packages/cli/test/handle-error.spec.ts#L462-L475).
- **Missing Tests:**
  - No command-level test in `spec-validate.spec.ts` simulates `kernel.specs.validate.execute` rejecting with `DependsOnOverwriteError`.

---

### 4. `cli:change-invalidate`

- **Spec Dependency Chain:** Inherited from `core:invalidate-change` / `cli:entrypoint`
- **Consistency with Global/Dependency Specs:** Consistent with `default:_global/error-handling-conventions`.
- **Implementation Status:**
  - [`packages/cli/src/commands/change/invalidate.ts`](packages/cli/src/commands/change/invalidate.ts#L222-L231) handles `InvalidateRequiresForceError` by printing per-recovery warnings to `stderr` and delegating to `handleError(err, opts.format, { command: 'change.invalidate' })`.
  - [`packages/cli/src/error-hints.ts`](packages/cli/src/error-hints.ts#L109-L112) maps `INVALIDATE_REQUIRES_FORCE` on `change.invalidate` to `force.revoke-consent` (`--force`), and maps [`INVALID_INVALIDATE_TARGET` / `INVALID_INPUT`](packages/cli/src/error-hints.ts#L135-L143) on `change.invalidate` to `invalidate.target-flags` (`--target`).
- **Discrepancies:** None.
- **Test Coverage:**
  - [`packages/cli/test/commands/change/change-invalidate.spec.ts`](packages/cli/test/commands/change/change-invalidate.spec.ts#L1-L520): 16/16 passed.
  - Hint rules for `INVALIDATE_REQUIRES_FORCE` and `INVALID_INPUT` on `change.invalidate` are tested in [`error-hints.spec.ts:32-42`](packages/cli/test/error-hints.spec.ts#L32-L42).
- **Missing Tests:**
  - `change-invalidate.spec.ts` does not assert structured (`--format json`/`toon`) `hint` output for `InvalidateRequiresForceError` or `InvalidInvalidateTargetError` at the command level.

---

### 5. `cli:change-transition`

- **Spec Dependency Chain:** Inherited from `core:transition-change` / `cli:entrypoint`
- **Consistency with Global/Dependency Specs:** Consistent with `default:_global/error-handling-conventions`.
- **Implementation Status:**
  - [`packages/cli/src/commands/change/transition.ts`](packages/cli/src/commands/change/transition.ts#L136-L143) and [L432-L437](packages/cli/src/commands/change/transition.ts#L432-L437) resolve `HAPPY_PATH_NEXT_UNAVAILABLE` via `resolveCliErrorHint('HAPPY_PATH_NEXT_UNAVAILABLE', { command: 'change.transition' })` in both text repair guide and structured `complete` failure records.
  - [L175-L183](packages/cli/src/commands/change/transition.ts#L175-L183) and [L438-L444](packages/cli/src/commands/change/transition.ts#L438-L444) resolve skippable `CheckPredicateFailedError` (including `impl.linksInScope`) via `resolveCliErrorHint(cpErr.checkId, { command: 'change.transition' }, { isSkippable: true })`.
  - [L468](packages/cli/src/commands/change/transition.ts#L468) delegates unhandled errors to `handleError(err, opts.format, { command: 'change.transition' })`.
- **Discrepancies:** None.
- **Test Coverage:**
  - [`packages/cli/test/commands/change/transition.spec.ts`](packages/cli/test/commands/change/transition.spec.ts): 52/52 passed (including `HappyPathNextUnavailableError` text & JSON hints at L843-L930, L1705-L1712; `impl.linksInScope` bypass hint at L1557-L1580).
- **Missing Tests:** None.

---

### 6. `cli:change-draft`

- **Spec Dependency Chain:** Inherited from `core:draft-change` / `cli:entrypoint`
- **Consistency with Global/Dependency Specs:** Consistent with `default:_global/error-handling-conventions`.
- **Implementation Status:**
  - [`packages/cli/src/commands/change/draft.ts`](packages/cli/src/commands/change/draft.ts#L50-L52) delegates errors to `handleError(err, opts.format, { command: 'change.draft' })`.
  - [`packages/cli/src/error-hints.ts`](packages/cli/src/error-hints.ts#L104-L107) maps `IMPLEMENTATION_DETECTED` on `change.draft` to `force.bypass-impl-guard` (`Re-run with --force to proceed anyway`).
- **Discrepancies:** None.
- **Test Coverage:**
  - [`packages/cli/test/commands/change-draft.spec.ts`](packages/cli/test/commands/change-draft.spec.ts#L1-L193): 9/9 passed.
  - `IMPLEMENTATION_DETECTED` hint for `change.draft` is tested in [`error-hints.spec.ts:20-30`](packages/cli/test/error-hints.spec.ts#L20-L30).
- **Missing Tests:**
  - `change-draft.spec.ts` tests `HistoricalImplementationGuardError` at L148-L166 without asserting `--force` in `stderr` or `hint` in `--format json`/`toon`.

---

### 7. `cli:change-discard`

- **Spec Dependency Chain:** Inherited from `core:discard-change` / `cli:entrypoint`
- **Consistency with Global/Dependency Specs:** Consistent with `default:_global/error-handling-conventions`.
- **Implementation Status:**
  - [`packages/cli/src/commands/change/discard.ts`](packages/cli/src/commands/change/discard.ts#L53-L55) delegates errors to `handleError(err, opts.format, { command: 'change.discard' })`.
  - [`packages/cli/src/error-hints.ts`](packages/cli/src/error-hints.ts#L104-L107) maps `IMPLEMENTATION_DETECTED` on `change.discard` to `force.bypass-impl-guard` (`Re-run with --force to proceed anyway`).
- **Discrepancies:** None.
- **Test Coverage:**
  - [`packages/cli/test/commands/change-discard.spec.ts`](packages/cli/test/commands/change-discard.spec.ts#L1-L218): 9/9 passed.
  - `IMPLEMENTATION_DETECTED` hint for `change.discard` is tested in [`error-hints.spec.ts:20-30`](packages/cli/test/error-hints.spec.ts#L20-L30).
- **Missing Tests:**
  - `change-discard.spec.ts` tests `HistoricalImplementationGuardError` at L165-L191 without asserting `--force` in `stderr` or `hint` in `--format json`/`toon`.

---

### 8. `cli:change-archive`

- **Spec Dependency Chain:** Inherited from `core:archive-change` / `cli:entrypoint`
- **Consistency with Global/Dependency Specs:** Consistent with `default:_global/error-handling-conventions`.
- **Implementation Status:**
  - [`packages/cli/src/commands/change/archive.ts`](packages/cli/src/commands/change/archive.ts#L185-L204) resolves skippable `CheckPredicateFailedError` via `resolveCliErrorHint(err.checkId, { command: 'change.archive' }, { isSkippable: true })` in text mode, and routes structured/other errors to `handleError(err, opts.format, { command: 'change.archive' })` (which resolves `metadata.checkId` at [`handle-error.ts:221-226`](packages/cli/src/handle-error.ts#L221-L226)).
- **Discrepancies:** None.
- **Test Coverage:**
  - [`packages/cli/test/commands/change/archive.spec.ts`](packages/cli/test/commands/change/archive.spec.ts): 45/45 passed (including `renders centralized bypass hint for skippable impl.linksInScope in text and json modes` at L708-L741).
- **Missing Tests:** None.

---

### 9. `cli:change-deps`

- **Spec Dependency Chain:** Inherited from `core:update-spec-deps` / `cli:entrypoint`
- **Consistency with Global/Dependency Specs:** Consistent with `default:_global/error-handling-conventions`.
- **Implementation Status:**
  - [`packages/cli/src/commands/change/deps.ts`](packages/cli/src/commands/change/deps.ts#L186-L188) delegates errors to `handleError(err, opts.format, { command: 'change.deps' })`.
  - [`packages/cli/src/error-hints.ts`](packages/cli/src/error-hints.ts#L130-L133) maps `INVALID_INPUT` on `change.deps` to `deps.operation-flags` (`Use one of --add, --remove, --set, or --clear (--set and --clear cannot be combined with --add or --remove)`).
- **Discrepancies:** None.
- **Test Coverage:**
  - [`packages/cli/test/commands/change-deps.spec.ts`](packages/cli/test/commands/change-deps.spec.ts): 33/33 passed.
  - `INVALID_INPUT` hint for `change.deps` is tested in [`error-hints.spec.ts:104-110`](packages/cli/test/error-hints.spec.ts#L104-L110).
- **Missing Tests:**
  - No command-level test in `change-deps.spec.ts` exercises `UpdateSpecDeps` throwing `InvalidInputError` to verify the rendered `--set`/`--add`/`--remove`/`--clear` hint end-to-end.
