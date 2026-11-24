# Proposal: decouple-core-cli-error-hints

## Motivation

During `specd specs validate --all`, `DependsOnOverwriteError` (thrown by `@specd/core`) surfaced with `"Use --force to overwrite curated dependencies."` — a misleading hint because `specs validate` has no `--force` flag. More broadly, `@specd/core` domain/application errors, services, and use cases currently embed CLI-specific flags and command syntax in their messages, coupling core business logic to a single delivery mechanism and producing inaccurate hints when surfaced through other CLI commands or non-CLI hosts (`@specd/sdk`, `@specd/mcp`).

## Current behaviour

1. **Hardcoded CLI flags and commands in `@specd/core`:** Eight core error classes, services, and use cases embed CLI flags (`--force`, `--next`, `--allow-out-of-scope`, `--target`, `--set`, `--add`, `--remove`, `--clear`) or CLI command strings (`specd specs show <specId>`) directly in their error/failure messages:
   - `DependsOnOverwriteError` (`packages/core/src/domain/errors/depends-on-overwrite-error.ts:59`): mentions `Use --force to overwrite curated dependencies.`
   - `HistoricalImplementationGuardError` (`packages/core/src/domain/errors/historical-implementation-guard-error.ts:41`): mentions `without --force`.
   - `HappyPathNextUnavailableError` (`packages/core/src/domain/errors/happy-path-next-unavailable-error.ts:33-41`): mentions `cannot advance with --next: ...`.
   - `InvalidateRequiresForceError` (`packages/core/src/application/errors/invalidate-requires-force-error.ts:31`): mentions `Use --force to revoke the reported gate(s)...`.
   - `SpecNotInChangeError` (`packages/core/src/application/errors/spec-not-in-change-error.ts:20`): mentions `Suggestion: use specd specs show ${specId} to view the canonical spec`.
   - `detectImplLinksInScope` (`packages/core/src/application/services/detect-impl-links-in-scope.ts:52`): mentions `Re-run with --allow-out-of-scope if intentional.`.
   - `InvalidateChange` (`packages/core/src/application/use-cases/invalidate-change.ts:251,256`): `validateCommandShape` mentions `--target is not allowed with policy ...` and `At least one --target is required with policy ...`.
   - `UpdateSpecDeps` (`packages/core/src/application/use-cases/update-spec-deps.ts:85,88,97`): `InvalidInputError` messages reference `--set`, `--add`, `--remove`, and `--clear`.
2. **Command-blind hint rendering in `@specd/cli`:** Because core errors bake a single flag/command into `message`, CLI commands that propagate those errors (such as `specs validate` surfacing `DependsOnOverwriteError`) print hints for flags they do not accept, and JSON/TOON consumers receive CLI prose inside `error.message` instead of structured error context.

## Proposed solution

Decouple core error messages from CLI presentation while preserving actionable user guidance in `@specd/cli`:

1. **Delivery-agnostic messages in `@specd/core`:**
   - Rewrite the eight core error/validation messages to describe the domain or application invariant violation in host-neutral terms without CLI flags or `specd ...` command strings.
   - Ensure each affected `SpecdError` subclass exposes structured metadata properties (such as `existingDeps`, `incomingDeps`, `operation`, `changeName`, `state`, `gates`, `recoveries`, `specId`, `outOfScopeSpecIds`) so delivery layers can render context-aware guidance.
2. **Command-aware hint rendering in `@specd/cli`:**
   - Introduce a centralized, reusable hint-resolution table/helper (e.g., `resolveCliErrorHint(err, command, metadata)`) in `@specd/cli` that maps `(errorCode, command, metadata)` to a command-appropriate `hint` string (or `undefined` when no hint applies).
   - Extend `HandleErrorOptions` in `packages/cli/src/handle-error.ts` to accept a `command` identifier (superseding ad-hoc boolean flags like `lockRepairHint` while keeping backward compatibility if needed), so `handleError` and `cliError(..., { hint })` automatically emit the resolved `hint` on stderr and as a top-level `hint` field in JSON/TOON output.
   - Commands with custom error/repair-guide rendering (such as `transition.ts` and `archive.ts`) reuse the same `resolveCliErrorHint` helper instead of duplicating flag/command strings.
   - For `DEPENDS_ON_OVERWRITE`: `specs.generate-metadata` hints `--force`; `specs.validate` hints `specs deps add/set` or `specs generate-metadata --force`.

## Specs affected

### New specs

- None.

### Modified specs

- `default:_global/error-handling-conventions`: Codify the boundary that `@specd/core` errors, services, and use cases MUST NOT embed delivery-mechanism flags or CLI command syntax in `message`, and that delivery packages (`@specd/cli`) translate typed errors + command context into `hint` output.
  - Depends on (added): none
  - Depends on (removed): none
- `core:generate-metadata`: Update `DependsOnOverwriteError` contract so its message is host-neutral (no `--force` flag) while preserving `existingDeps` and `incomingDeps` metadata.
  - Depends on (added): none
  - Depends on (removed): none
- `core:invalidate-change`: Update `InvalidateRequiresForceError` and `validateCommandShape` error messages to be host-neutral (no `--force` or `--target` CLI flags).
  - Depends on (added): none
  - Depends on (removed): none
- `core:update-spec-deps`: Update `InvalidInputError` validation messages in `UpdateSpecDeps` to use host-neutral input field names (`set`, `add`, `remove`, `clear`) rather than CLI `--` flags.
  - Depends on (added): none
  - Depends on (removed): none
- `core:transition-change`: Update `HappyPathNextUnavailableError` contract so its message is host-neutral (no `--next` flag) while preserving `state` metadata.
  - Depends on (added): none
  - Depends on (removed): none
- `core:draft-change`: Update `HistoricalImplementationGuardError` contract when thrown by `DraftChange` so its message is host-neutral (no `--force` flag).
  - Depends on (added): none
  - Depends on (removed): none
- `core:discard-change`: Update `HistoricalImplementationGuardError` contract when thrown by `DiscardChange` so its message is host-neutral (no `--force` flag).
  - Depends on (added): none
  - Depends on (removed): none
- `core:transition-checks`: Update `detectImplLinksInScope` / `impl.linksInScope` failure message to be host-neutral (no `--allow-out-of-scope` flag) while preserving `outOfScopeSpecIds`.
  - Depends on (added): none
  - Depends on (removed): none
- `core:edit-change`: Update `SpecNotInChangeError` contract when thrown by `EditChange` so its message is host-neutral (no `specd specs show` command).
  - Depends on (added): none
  - Depends on (removed): none
- `core:validate-artifacts`: Update `SpecNotInChangeError` contract when thrown by `ValidateArtifacts` so its message is host-neutral (no `specd specs show` command).
  - Depends on (added): none
  - Depends on (removed): none
- `core:preview-spec`: Update `SpecNotInChangeError` contract when thrown by `PreviewSpec` so its message is host-neutral (no `specd specs show` command).
  - Depends on (added): none
  - Depends on (removed): none
- `cli:entrypoint`: Document command-context-aware `hint` rendering in `handleError` / `cliError` for typed `SpecdError` codes (including `SPEC_NOT_IN_CHANGE`, `IMPLEMENTATION_DETECTED`, `DEPENDS_ON_OVERWRITE`, `INVALIDATE_REQUIRES_FORCE`).
  - Depends on (added): none
  - Depends on (removed): none
- `cli:spec-generate-metadata`: Document `--force` repair hint rendered when `DEPENDS_ON_OVERWRITE` occurs during `specs generate-metadata`.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:spec-validate`: Document command-appropriate repair hint (`specs deps add/set` or `specs generate-metadata --force`) rendered when `DEPENDS_ON_OVERWRITE` occurs during `specs validate`.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:change-invalidate`: Document CLI-rendered `--force` and `--target` hints when `INVALIDATE_REQUIRES_FORCE` or invalid targeting occurs.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:change-transition`: Document CLI-rendered `--next` and `--skip-checks impl.linksInScope` / `--allow-out-of-scope` hints when `HappyPathNextUnavailableError` or `impl.linksInScope` fails.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:change-draft`: Document CLI-rendered `--force` hint when `HistoricalImplementationGuardError` (`IMPLEMENTATION_DETECTED`) occurs.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:change-discard`: Document CLI-rendered `--force` hint when `HistoricalImplementationGuardError` (`IMPLEMENTATION_DETECTED`) occurs.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:change-archive`: Document CLI-rendered `--skip-checks impl.linksInScope` / `--allow-out-of-scope` hint when `impl.linksInScope` fails.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:change-deps`: Document CLI-rendered `--set` / `--add` / `--remove` / `--clear` hints when `UpdateSpecDeps` rejects conflicting or empty options.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- **`@specd/core`:**
  - `packages/core/src/domain/errors/depends-on-overwrite-error.ts`
  - `packages/core/src/domain/errors/historical-implementation-guard-error.ts`
  - `packages/core/src/domain/errors/happy-path-next-unavailable-error.ts`
  - `packages/core/src/application/errors/invalidate-requires-force-error.ts`
  - `packages/core/src/application/errors/spec-not-in-change-error.ts`
  - `packages/core/src/application/services/detect-impl-links-in-scope.ts`
  - `packages/core/src/application/use-cases/invalidate-change.ts`
  - `packages/core/src/application/use-cases/update-spec-deps.ts`
  - Graph impact on `DependsOnOverwriteError` shows direct/transitive callers in `generate-spec-metadata.ts` (`resolveCanonicalDependsOn`, `execute`) and `materialize-spec-metadata.ts` (`_tryReusePersisted`, `_generateAndPersist`, `_readCurrentSourceState`), plus re-exports through `core` and `@specd/sdk`.
- **`@specd/cli`:**
  - `packages/cli/src/handle-error.ts` (already has `HandleErrorOptions` and `cliError` `hint` support; currently handles `IMPLEMENTATION_DETECTED` and `INVALID_SPEC_LOCK` with `lockRepairHint`)
  - Command handlers that catch or propagate these errors: `packages/cli/src/commands/change/transition.ts` (`HappyPathNextUnavailableError`), `packages/cli/src/commands/change/invalidate.ts` (`InvalidateRequiresForceError`), `packages/cli/src/commands/spec/validate.ts`, `packages/cli/src/commands/spec/generate-metadata.ts`, `packages/cli/src/commands/change/draft.ts`, `packages/cli/src/commands/change/discard.ts`, `packages/cli/src/commands/change/archive.ts`, `packages/cli/src/commands/change/deps.ts`.
- **Explicitly out of scope (deferred):**
  - `packages/core/src/application/services/lifecycle-guidance.ts` (`specd changes approve ...`, `specd change archive`)
  - `packages/core/src/application/use-cases/get-status.ts` (`bypassFlag: '--skip-checks ...'`)
  - `packages/core/src/application/use-cases/reconcile-change-validity.ts` (`details: { command: 'specd changes verification start <name>' }`)
    Structured workflow guidance projection is deferred to a separate change.

## Technical context

- Checked against `default:_global/architecture` and `default:_global/error-handling-conventions`: translating between a delivery mechanism and use cases is explicitly the responsibility of delivery packages (`@specd/cli`), not business logic.
- `packages/cli/src/handle-error.ts` already implements the `hint` pattern for `InvalidSpecLockError` (`HandleErrorOptions.lockRepairHint`), printing the hint on a separate line after `error: <message>` on stderr and as a top-level `hint` field in JSON/TOON output without mutating `error.message`.
- Existing unit/integration tests in `packages/core` and `packages/cli` that assert exact error message strings containing `--force`, `--next`, `--allow-out-of-scope`, `--target`, `--set`, `--add`, `--remove`, `--clear`, or `specd specs show` will need to be updated to match the host-neutral core messages and CLI-rendered hints.
- Resolved scope decision: all 20 affected specs in `default`, `core`, and `cli` are included in `specIds` (four of which — `cli:change-transition`, `core:preview-spec`, `core:transition-change`, `core:transition-checks` — have active overlaps that the user confirmed to proceed with).
- Agreed CLI hint architecture: use a centralized, reusable `(errorCode, command, metadata) -> hint` lookup table/helper in `@specd/cli` consumed by `handleError` (via a `command` context option) and by custom command renderers (such as `transition.ts` Repair Guide), rather than adding per-error boolean flags to `HandleErrorOptions`.

## Open questions

None.
