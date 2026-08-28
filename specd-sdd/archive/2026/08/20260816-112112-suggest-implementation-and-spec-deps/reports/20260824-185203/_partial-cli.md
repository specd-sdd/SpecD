# CLI Compliance Audit — `cli:spec-implementation` and `cli:spec-deps`

## Requirements Summary

### `cli:spec-implementation`

Eight merged requirements were audited: command signature/format support; list behavior and initialized-state distinction; add; remove; delegation without CLI-owned mutation/path logic; shared raw path semantics; typed error mapping; and SDK-backed suggestion (selection flags, confidence, cache rebuild, additive apply, and inclusion tags).

### `cli:spec-deps`

Nine merged requirements were audited: command signature/format support; list; add; remove including uninitialized no-op; set; clear; delegation without CLI-owned merge/write logic; typed error mapping; and SDK-backed suggestion (selection flags, additive apply, post-apply validation, optional alignment-change creation, manual-command guidance, and non-interactive machine formats).

## Implementation Status

### `cli:spec-implementation`

- **Implemented:** `packages/cli/src/commands/spec/implementation.ts` registers `list`, `add`, `remove`, and `suggest` below the canonical `specs` command (with `spec` alias registered in `packages/cli/src/index.ts`). Every leaf rejects excess arguments and accepts `--format`.
- **Implemented:** list delegates once to `kernel.specs.getPersistedImplementation`, preserves file-level versus symbol-level presentation, and distinguishes uninitialized state in text and structured formats.
- **Implemented:** add/remove pass the raw file string and optional repeated symbols directly in one `kernel.specs.updatePersistedImplementation.execute` call. No file checks, workspace-boundary logic, lock writes, or link merging occur in the handler.
- **Implemented:** suggest creates the SDK orchestration use case and maps positional/`--spec`, `--all`, `--workspace`, `--apply`, `--confidence`, and `--rebuild-cache` inputs. Text output includes confidence and `[already included]`/`[new]`; structured formats emit the SDK result.
- **Implemented via shared error boundary:** all handler errors flow through `handleError`, which supplies the standard exit/error presentation. Domain-specific validation remains in Core/SDK as required by the dependency specs.

### `cli:spec-deps`

- **Implemented:** `packages/cli/src/commands/spec/deps.ts` registers `list`, `add`, `remove`, `set`, `clear`, and `suggest`; all leaf commands reject excess arguments and accept `--format`.
- **Implemented:** list delegates once to `kernel.specs.getPersistedDeps` and distinguishes uninitialized state. Mutations each make one direct `kernel.specs.updatePersistedDeps.execute` call with `add`, `remove`, `set`, or `clear` and do no local merge or lock-state mutation.
- **Implemented:** set accepts no `--dep` values and sends `set: []`; remove displays the empty/no-op result without manufacturing an error.
- **Implemented:** suggest creates the SDK orchestration use case and maps all specified flags, including `--create-change` to `createAlignmentChange`. It has no prompt/readline path; JSON/TOON directly render the result. Text renders import reasons, inclusion tags, applied counts, validation status, created-change details, or the SDK-provided manual alignment command.
- **Implemented via shared error boundary:** typed errors flow through `handleError`; the actual mutation semantics and concurrency/read-only enforcement belong to the direct Core dependencies.

## Discrepancies

1. **High — all ten affected leaf commands violate the direct `cli:entrypoint` help-schema contract.** The global dependency requires every command supporting JSON/TOON to append a `JSON/TOON output schema:` block via `addHelpText('after', ...)`. Neither registration file calls `addHelpText`; therefore `specs implementation {list,add,remove,suggest}` and `specs deps {list,add,remove,set,clear,suggest}` are non-conformant. This is implementation drift if the global CLI contract remains authoritative; alternatively, the global requirement is broader than intended and should be narrowed explicitly. The change specs themselves do not contradict the dependency, because they explicitly inherit entrypoint output conventions.
2. **Medium — the read-only error test encodes wording that contradicts the merged CLI requirement.** `spec-deps.spec.ts` constructs `ReadOnlyWorkspaceError` with “Change the workspace ownership in specd.yaml to allow writes,” while `cli:spec-deps` requires no configuration workaround. The production CLI merely presents the typed error, so a normally constructed compliant SDK error may still behave correctly; however, this test both fails to verify the prohibition and normalizes forbidden wording. This is primarily a test-fixture/spec mismatch, not proof of a production defect.

No contradiction was found between the new CLI suggestion requirements and their SDK dependency contracts. No CLI-owned direct `spec-lock.json` access or mutation semantics were found.

## Test Coverage

Targeted execution: `pnpm --filter @specd/cli test -- spec-implementation.spec.ts spec-deps.spec.ts` completed successfully (repository runner executed **80 files / 886 tests**, all passing).

### `cli:spec-implementation`

- Covered: list kernel delegation; add/remove input mapping including symbols; uninitialized text and JSON; list TOON; suggestion SDK delegation; confidence/symbol rendering; `[already included]` and `[new]`; applied-mutation summary; generic error prefix/exit path.
- Partial: command-format coverage is demonstrated only for list, not every leaf. Error testing uses `ChangeNotFoundError`, not the four error classes named by the spec. The test proves an `error:` prefix but not required message content/retry guidance/no-workaround behavior.

### `cli:spec-deps`

- Covered: list/add/remove/set/clear delegation; repeated add values; empty set; uninitialized remove no-op; uninitialized list text/JSON; list TOON; suggestion SDK delegation; inclusion/reason rendering; apply summary; successful post-apply validation rendering; a generic read-only error path.
- Partial: the read-only assertion checks only `error:` and `read-only`, and its fixture contains the expressly forbidden workaround. No tests exercise invalid post-apply handling or alignment change output.

## Missing Tests

### `cli:spec-implementation`

- Add without `--symbol` produces an input/result without `symbols`.
- Remove of one symbol demonstrates the remaining-symbol result.
- Explicit structural assertion that handlers do no filesystem/path-normalization/lock I/O (current direct-call tests are useful but do not guard forbidden collaborators).
- `SpecNotFoundError`, `ImplementationFileNotFoundError`, `ImplementationWorkspaceBoundaryError`, `ArtifactConflictError` with retry guidance, and `ReadOnlyWorkspaceError` without workaround.
- `--format` JSON/TOON behavior for add, remove, and suggest, plus help-schema checks for all four leaves.
- Suggest flag mapping for repeated `--spec`, `--all`, `--workspace`, `--apply`, `--confidence` (including `MED`), and `--rebuild-cache`; additive apply is only represented by a mocked result, not verified as an input.
- Excess positional argument rejection for each leaf.

### `cli:spec-deps`

- Exact remove result and exact set replacement result (current tests validate inputs, not resulting list semantics at the CLI surface).
- `SpecNotFoundError`, `ArtifactConflictError` with retry wording, and a correct negative assertion that read-only output does **not** suggest configuration changes.
- `--format` JSON/TOON behavior for mutation/suggest leaves, explicit proof machine formats never prompt/block stdin, and help-schema checks for all six leaves.
- Suggest flag mapping for repeated `--spec`, `--all`, `--workspace`, `--apply`, `--create-change`, and `--rebuild-cache`.
- Invalid post-apply result without `--create-change` renders the suggested alignment command; invalid result with `--create-change` renders the single created change.
- Excess positional argument rejection for each leaf.

## Dependency Chain

- `cli:spec-implementation` → `core:get-persisted-spec-implementation`, `core:update-persisted-spec-implementation`, `sdk:suggest-implementation-links`, `cli:entrypoint`.
- `cli:spec-deps` → `core:get-persisted-spec-deps`, `core:update-persisted-spec-deps`, `sdk:suggest-spec-dependencies`, `cli:entrypoint`.
- Global constraints applied: `_global/architecture` (CLI delegates business logic), `_global/conventions`, `_global/error-handling-conventions`, `_global/logging`, and `_global/testing`.
- Graph-first navigation confirmed registration in `packages/cli/src/index.ts` and the two command modules. The graph was stale at audit start and was re-indexed successfully before code inspection.

## Summary Counts

- Specs audited: **2**
- Requirements audited: **17** (8 implementation-link + 9 dependency requirements)
- Requirements with implementation present: **17**
- Cross-spec discrepancies: **2** (**1 high implementation/global-contract gap; 1 medium test/spec mismatch**)
- Verification scenarios in merged artifacts: **24** (11 implementation-link + 13 dependency scenarios)
- Scenario areas with direct or partial CLI tests: **17**
- Scenario areas with no direct CLI test: **7**
- Additional dependency-contract test gaps identified: **help schema, exhaustive typed-error wording, flag mapping, machine-mode non-interactivity, and invalid post-apply branches**
