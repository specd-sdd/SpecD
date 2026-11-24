# Tasks: decouple-core-cli-error-hints

## 1. `@specd/core` host-neutral error messages and metadata

- [x] 1.1 Make `DependsOnOverwriteError` message host-neutral
      `packages/core/src/domain/errors/depends-on-overwrite-error.ts`: `DependsOnOverwriteError.constructor` — remove `Use --force to overwrite curated dependencies.`
      Approach: describe the `dependsOn` mismatch (`removed` / `added`) and state that explicit force confirmation is required without `--force`; preserve `existingDeps` and `incomingDeps` getters and `areSame()`
      (Req: Host-neutral DependsOnOverwriteError)
- [x] 1.2 Make `HistoricalImplementationGuardError` message host-neutral
      `packages/core/src/domain/errors/historical-implementation-guard-error.ts`: `HistoricalImplementationGuardError.constructor` — remove `without --force`
      Approach: state that the change cannot be drafted/discarded after reaching `implementing` without explicit force confirmation; preserve `operation` and `changeName` getters
      (Req: Host-neutral HistoricalImplementationGuardError)
- [x] 1.3 Make `HappyPathNextUnavailableError` host-neutral and expose `state`
      `packages/core/src/domain/errors/happy-path-next-unavailable-error.ts`: `HappyPathNextUnavailableError`, `happyPathNextMessage` — add `readonly _state: ChangeState` + `get state(): ChangeState` and remove `--next` from all switch cases
      Approach: rewrite `happyPathNextMessage(state)` using `cannot advance to next state: ...` without CLI flag syntax
      (Req: Host-neutral HappyPathNextUnavailableError)
- [x] 1.4 Make `InvalidateRequiresForceError` message host-neutral
      `packages/core/src/application/errors/invalidate-requires-force-error.ts`: `InvalidateRequiresForceError.constructor` — remove `Use --force`
      Approach: state that explicit force confirmation is required to revoke the reported gate(s) while preserving `gates` and `recoveries` getters
      (Req: Approval guard)
- [x] 1.5 Make `SpecNotInChangeError` host-neutral and expose `specId` and `changeName`
      `packages/core/src/application/errors/spec-not-in-change-error.ts`: `SpecNotInChangeError` — add `get specId()` and `get changeName()` getters and remove `Suggestion: use specd specs show ...`
      Approach: store `_specId` and `_changeName` in constructor and emit only `Spec '${specId}' is not in the current specIds of change '${changeName}'.`
      (Req: Host-neutral SpecNotInChangeError)
- [x] 1.6 Make `detectImplLinksInScope` failure message host-neutral
      `packages/core/src/application/services/detect-impl-links-in-scope.ts`: `detectImplLinksInScope` — remove `Re-run with --allow-out-of-scope if intentional.`
      Approach: keep compact out-of-scope count and `outOfScopeSpecIds` array while omitting CLI bypass flags
      (Req: Host-neutral impl.linksInScope message)
- [x] 1.7 Make `InvalidateChange` target validation messages host-neutral
      `packages/core/src/application/use-cases/invalidate-change.ts`: `validateCommandShape` — replace `--target` with host-neutral `targets`
      Approach: update both `errors.push(...)` strings to reference `targets` and `policy` without `--target`
      (Req: Policy-dependent target rules)
- [x] 1.8 Make `UpdateSpecDeps` `InvalidInputError` messages host-neutral
      `packages/core/src/application/use-cases/update-spec-deps.ts`: `UpdateSpecDeps.execute` — replace `--set`, `--add`, `--remove`, `--clear` with `set`, `add`, `remove`, `clear`
      Approach: rewrite the three `throw new InvalidInputError(...)` calls to use input field names without `--` prefixes
      (Req: Typed errors for dependency update failures)

## 2. `@specd/cli` centralized hint table and `handleError` integration

- [x] 2.1 Create centralized two-table CLI error hint catalog and routing rules
      `packages/cli/src/error-hints.ts`: `CliCommandId`, `CliHintContext`, `CLI_ERROR_HINTS`, `CLI_ERROR_HINT_RULES`, `resolveCliErrorHint` — implement reusable `hintId -> template` catalog and `(code, commands?, when?) -> hintId` routing table
      Approach: separate `CLI_ERROR_HINTS` (semantic `CliHintId` entries shared across commands) from `CLI_ERROR_HINT_RULES` (declarative mapping with optional `when` predicates for `INVALID_SPEC_LOCK` `dependsOn` field paths and `impl.linksInScope` `isSkippable === true`); filter `<specPath required>` inside `'spec.show-canonical'`
      (Req: Command-aware error hint rendering)
- [x] 2.2 Integrate `resolveCliErrorHint` into `handleError`
      `packages/cli/src/handle-error.ts`: `HandleErrorOptions`, `handleError` — add `readonly command?: CliCommandId` to `HandleErrorOptions` and replace inline `LOCK_REPAIR_HINT` branching with `resolveCliErrorHint(code, options ?? {}, metadata)`
      Approach: pass resolved `hint` (when defined) to `cliError(err.message, format, exitCode, code, { metadata, hint })` while preserving `lockRepairHint` compatibility
      (Req: Command-aware error hint rendering)

## 3. `@specd/cli` command wiring

- [x] 3.1 Wire `specs generate-metadata` command context and hint rendering
      `packages/cli/src/commands/spec/generate-metadata.ts`: `registerSpecGenerateMetadata` — pass `{ command: 'specs.generate-metadata' }` to `handleError` and ensure `DEPENDS_ON_OVERWRITE` renders `--force` hint
      Approach: pass `{ command: 'specs.generate-metadata' }` in catch block and handle single-spec failure hint when `DependsOnOverwriteError` is surfaced
      (Req: Error — dependsOn overwrite)
- [x] 3.2 Wire `specs validate` command context for `DEPENDS_ON_OVERWRITE`
      `packages/cli/src/commands/spec/validate.ts`: `registerSpecValidate` — pass `{ command: 'specs.validate' }` to `handleError`
      Approach: ensure `DEPENDS_ON_OVERWRITE` resolves to `specd specs deps add/set` / `specd specs generate-metadata --force` hint and never `--force` on `specs validate`
      (Req: Error — dependsOn overwrite hint)
- [x] 3.3 Wire `specs deps` command context
      `packages/cli/src/commands/spec/deps.ts`: `registerSpecDeps` — pass `{ command: 'specs.deps', lockRepairHint: true }` to `handleError`
      Approach: preserve existing `INVALID_SPEC_LOCK` repair hint via the centralized table
      (Req: Command-aware error hint rendering)
- [x] 3.4 Wire `change invalidate` command context and hint rendering
      `packages/cli/src/commands/change/invalidate.ts`: `registerChangeInvalidate` — pass `{ command: 'change.invalidate' }` to `handleError` and reuse `resolveCliErrorHint`
      Approach: ensure `INVALIDATE_REQUIRES_FORCE` and targeting errors render `--force` / `--target` hints via the shared resolver
      (Req: CLI-rendered invalidation hints)
- [x] 3.5 Wire `change transition` command context and Repair Guide hint reuse
      `packages/cli/src/commands/change/transition.ts`: `registerChangeTransition` — reuse `resolveCliErrorHint` with `change.transition` context
      Approach: call `resolveCliErrorHint` for `HAPPY_PATH_NEXT_UNAVAILABLE` and `impl.linksInScope` (`{ isSkippable }`) to render `--next` context and `--skip-checks impl.linksInScope` / `--allow-out-of-scope`
      (Req: CLI-rendered transition error hints)
- [x] 3.6 Wire `change draft` and `change discard` command contexts
      `packages/cli/src/commands/change/draft.ts`, `packages/cli/src/commands/change/discard.ts`: `registerChangeDraft`, `registerChangeDiscard` — pass `{ command: 'change.draft' }` and `{ command: 'change.discard' }` to `handleError`
      Approach: ensure `IMPLEMENTATION_DETECTED` renders the `--force` hint via `handleError`
      (Req: CLI-rendered historical implementation guard hint)
- [x] 3.7 Wire `change archive` command context and `impl.linksInScope` hint reuse
      `packages/cli/src/commands/change/archive.ts`: `registerChangeArchive` — pass `{ command: 'change.archive' }` to `handleError` and reuse `resolveCliErrorHint('impl.linksInScope', { command: 'change.archive' }, { isSkippable })`
      Approach: render `--skip-checks impl.linksInScope` / `--allow-out-of-scope` hint on skippable `impl.linksInScope` failure
      (Req: CLI-rendered out-of-scope implementation hint)
- [x] 3.8 Wire `change deps` command context
      `packages/cli/src/commands/change/deps.ts`: `registerChangeDeps` — pass `{ command: 'change.deps' }` to `handleError`
      Approach: ensure `UpdateSpecDeps` `InvalidInputError` errors render `--set`, `--add`, `--remove`, `--clear` hints via `resolveCliErrorHint`
      (Req: CLI-rendered dependency operation flag hints)

## 4. Documentation and Tests

- [x] 4.1 Document host-neutral core errors and CLI hint table in `docs/core/errors.md`
      `docs/core/errors.md`: error contract section — document the ban on CLI flags/commands in `@specd/core` error messages and the CLI `resolveCliErrorHint` pattern
      Approach: add concise section with examples of structured error metadata + CLI hint translation
      (Req: Host-Neutral Core Errors and Delivery Hints)
- [x] 4.2 Update and add `@specd/core` unit tests for host-neutral messages and metadata getters
      `packages/core/test/`: error, service, and use-case specs — assert host-neutral messages (no CLI flags or `specd specs show`) and new getters (`HappyPathNextUnavailableError.state`, `SpecNotInChangeError.specId`, `SpecNotInChangeError.changeName`)
      Approach: update existing assertions in core test files covering the 8 modified files
      (Req: Host-Neutral Core Errors and Delivery Hints)
- [x] 4.3 Add unit tests for `packages/cli/src/error-hints.ts` and `handle-error.ts`
      `packages/cli/test/error-hints.spec.ts`, `packages/cli/test/handle-error.spec.ts`: test full `(code × command)` matrix, `hint` rendering on stderr and in `json`/`toon` payloads, and `undefined` for unmatched commands
      Approach: test `resolveCliErrorHint` directly and through `handleError`
      (Req: Command-aware error hint rendering)
- [x] 4.4 Update CLI command tests for command-specific hints
      `packages/cli/test/commands/`: `spec-validate.spec.ts`, `spec-generate-metadata.spec.ts`, `change/change-invalidate.spec.ts`, `change/transition.spec.ts`, `change-draft.spec.ts`, `change-discard.spec.ts`, `change/archive.spec.ts`, `change-deps.spec.ts` — verify command-appropriate hints and absence of `--force` hint in `specs validate`
      Approach: update assertions where core error messages changed and add assertions for `hint` output
      (Req: Error — dependsOn overwrite hint)
- [x] 4.5 Build monorepo and run full `@specd/core` and `@specd/cli` test suites
      `pnpm build && pnpm --filter @specd/core test && pnpm --filter @specd/cli test` — verify TypeScript compilation, all unit/integration tests pass, and `specs validate --all` produces the expected hint on `DEPENDS_ON_OVERWRITE`
      Approach: run build and tests cleanly with zero failures
      (Req: Host-Neutral Core Errors and Delivery Hints)

## 5. Verification & Compliance Remediation

- [x] 5.1 Fix `transition.explicit-step` hint template and `HappyPathNextUnavailableError` hint rendering in `change transition`
      `packages/cli/src/error-hints.ts`, `packages/cli/src/commands/change/transition.ts`: update `CLI_ERROR_HINTS['transition.explicit-step']` to reference positional `<step>` instead of `--to <state>`, and ensure `HappyPathNextUnavailableError` renders the centralized `HAPPY_PATH_NEXT_UNAVAILABLE` hint in both `text` and `json`/`toon` modes
      Approach: render `resolveCliErrorHint('HAPPY_PATH_NEXT_UNAVAILABLE', { command: 'change.transition' })` in `transition.ts` repair-guide text and structured output (or route through `handleError` when no repair guide status is attached)
      (Req: CLI-rendered transition error hints)
- [x] 5.2 Fix `impl.linksInScope` structured (`json`/`toon`) hint resolution in `change archive` and `handleError`
      `packages/cli/src/commands/change/archive.ts`, `packages/cli/src/handle-error.ts`: ensure `CheckPredicateFailedError` with `checkId === 'impl.linksInScope'` and `skippable === true` resolves `checks.skip-impl-links-in-scope` in `json`/`toon` mode as well as `text` mode
      Approach: pass `err.checkId` and `{ isSkippable: err.skippable }` (or handle `CheckPredicateFailedError` in `handleError`) so `resolveCliErrorHint` matches `CLI_ERROR_HINT_RULES`
      (Req: CLI-rendered out-of-scope implementation hint)
- [x] 5.3 Add missing `@throws` JSDoc tags on `@specd/core` use-case `execute()` methods
      `packages/core/src/application/use-cases/`: `discard-change.ts`, `validate-artifacts.ts`, `invalidate-change.ts`, `draft-change.ts`, `transition-change.ts`, `generate-spec-metadata.ts` — document thrown `SpecdError` subclasses in `@throws` JSDoc tags
      Approach: add missing `@throws` entries matching each `execute()` method's thrown error types
      (Req: JSDoc Documentation)
- [x] 5.4 Add missing `@specd/core` and `@specd/cli` unit/command test assertions
      `packages/core/test/`, `packages/cli/test/`: add unit test for `detectImplLinksInScope` host-neutral message, use-case-level assertions (`discard-change.spec.ts`, `invalidate-change.spec.ts`, `update-spec-deps.spec.ts`, `transition-change.spec.ts`, `draft-change.spec.ts`, `generate-spec-metadata.spec.ts`), `toon` hint assertion in `handle-error.spec.ts`, and command-level hint tests (`transition.spec.ts`, `archive.spec.ts`, `spec-generate-metadata.spec.ts`, `spec-validate.spec.ts`, `change-invalidate.spec.ts`, `change-draft.spec.ts`, `change-discard.spec.ts`, `change-deps.spec.ts`)
      Approach: add focused test cases covering every audited requirement without duplicating existing coverage
      (Req: Host-Neutral Core Errors and Delivery Hints)
