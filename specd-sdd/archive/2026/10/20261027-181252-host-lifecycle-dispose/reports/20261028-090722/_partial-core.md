# Partial audit: core:kernel + core:kernel-builder disposal (change host-lifecycle-dispose)

Method: merged specs via `changes spec-preview host-lifecycle-dispose core:kernel|core:kernel-builder` (specIds are `core:kernel`, `core:kernel-builder`; `core:core/kernel` is rejected). Code read in full: kernel-disposal.ts, relevant parts of kernel.ts / kernel-builder.ts, both error classes. Ran `vitest` on kernel.spec / kernel-disposal.spec / kernel-builder.spec: 3 files, 52 tests, all pass.

## Requirements Summary

core:kernel

- R1 Kernel is a plain object (dispose is the only lifecycle op; no initialize/shutdown/events; use cases immutable; one-way closed state).
- R2 Kernel disposal (dispose + Symbol.asyncDispose alias, never sync-throw; reverse order, sequential; idempotent/concurrent share one promise, each disposer at most once; failure isolation with AggregateError of one Error per failure, message `Disposer '<name>' failed`, `cause`; 5000 ms timeout, warn via logger naming disposer, abandon, not in AggregateError, timer must not keep process alive; closed state; no disposers -> no work; opaque).
- R3 KernelOptions accepts named disposers (`{name, dispose}`, non-empty name, duplicate -> RegistryConflictError category `disposers`, array order = registration order, ownership transfers on success).
- R4 Failed construction releases registered disposers (reverse order, same isolation/timeout, before rejection propagates, includes invalid/conflicting entries releasing well-formed ones once; original error preserved; release failures logged as warnings).

core:kernel-builder

- R5 Builder registers named disposers (`registerDisposer(name, dispose)` chainable; call order into options.disposers; empty name rejected at registration; duplicate -> RegistryConflictError `disposers`; opaque).
- R6 Builder hands disposers to kernel (kernel runs them after successful build, builder never; failed build relies on createKernel release; builder and createKernel with equivalent options dispose identically).

default:\_global/conventions delta: only adds "Node.js engine floor" requirement + 4 scenarios. It has NO disposal content (out of scope for disposal; see Discrepancies).

## Implementation Status

| Scenario                                                               | Implemented                                                                                      | Tested (test name)                                                                                                                                                                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| kernel: Kernel exposes dispose as only lifecycle op                    | Yes (kernel.ts:472-478 plain literal with `dispose` and `[Symbol.asyncDispose]: dispose`)        | kernel.spec "exposes dispose as its only lifecycle operation"                                                                                                                                                                 |
| kernel: Use cases are immutable after creation                         | Yes (pre-existing)                                                                               | kernel.spec same test (checks addUseCase/removeUseCase undefined)                                                                                                                                                             |
| Disposers run in reverse registration order, each finishes before next | Yes (runDisposers reverse loop, await)                                                           | kernel-disposal.spec "runs disposers in reverse registration order, awaiting each before the next"; kernel.spec "runs the supplied disposers in reverse order and isolates failures"                                          |
| Symbol.asyncDispose is an alias                                        | Yes (same function reference)                                                                    | kernel.spec "treats Symbol.asyncDispose as an alias and supports await using" (also asserts identity)                                                                                                                         |
| Repeated and concurrent calls share one disposal                       | Yes (`disposal ??=` memoization)                                                                 | kernel.spec "shares one promise across repeated and concurrent dispose calls"; kernel-disposal.spec createDispose "shares one promise across repeated and concurrent calls and runs each disposer once"                       |
| A failing disposer does not stop the others                            | Yes (DisposerFailedError message `Disposer 'b' failed`, cause set, wrapped in AggregateError)    | kernel-disposal.spec "isolates a failing disposer and aggregates DisposerFailedError entries" (asserts cause); kernel.spec "runs ... and isolates failures" (asserts message, order)                                          |
| Hanging disposer abandoned after timeout                               | Yes (Promise.race, warn, late rejection swallowed, timeout not in aggregate)                     | kernel-disposal.spec "abandons a hanging disposer after the timeout, warns, and continues" + "does not report a timeout in the aggregate error and swallows a late rejection" (unit level only, not through kernel.dispose()) |
| Timeout does not keep process alive                                    | Yes (`timer.unref()`, clearTimeout in finally)                                                   | kernel-disposal.spec "unrefs the timeout timer and clears it after a normal disposer" (mock-based)                                                                                                                            |
| No disposers                                                           | Yes (empty list = no work)                                                                       | kernel.spec "resolves dispose for a kernel without disposers"; kernel-disposal.spec "resolves without doing any work for an empty list"                                                                                       |
| Disposers are accepted in order                                        | Yes                                                                                              | kernel.spec "runs the supplied disposers in reverse order..." (and await-using test)                                                                                                                                          |
| Empty name is rejected                                                 | Yes (InvalidDisposerError, code INVALID_DISPOSER)                                                | kernel.spec "rejects an empty disposer name"; kernel-disposal.spec "rejects an empty name"                                                                                                                                    |
| Duplicate name rejected with RegistryConflictError `disposers`         | Yes                                                                                              | kernel.spec "rejects a duplicate disposer name with a RegistryConflictError"; kernel-disposal.spec "rejects a duplicate name with a RegistryConflictError for the disposers registry" (asserts category)                      |
| Disposers run when construction fails                                  | Yes (createKernel try/catch -> releaseAfterFailedConstruction before rethrow, kernel.ts:310-315) | kernel.spec "releases the disposers in reverse order when construction fails"                                                                                                                                                 |
| Original error preserved                                               | Yes (release never throws; failures -> Logger.warn)                                              | kernel.spec "keeps the original construction error when a disposer also fails"; kernel-disposal.spec "never throws and reports failures as a warning"                                                                         |
| Conflicting entries still release well-formed ones                     | Yes (isWellFormed filter)                                                                        | kernel.spec "still releases well-formed entries once when entries conflict"; kernel-disposal.spec "releases well-formed entries once and ignores malformed ones"                                                              |
| builder: registerDisposer is chainable                                 | Yes (returns builder)                                                                            | kernel-builder.spec "registerDisposer is chainable"                                                                                                                                                                           |
| builder: Disposers reach kernel options in call order                  | Yes (kernel-builder.ts:302 copies state.disposers in order)                                      | kernel-builder.spec "hands registered disposers to the kernel in call order and the builder never runs them" (observed via dispose order; options object itself not inspected)                                                |
| builder: Empty name rejected                                           | Yes (InvalidDisposerError at registration)                                                       | kernel-builder.spec "rejects an empty disposer name"                                                                                                                                                                          |
| builder: Duplicate name rejected, first not overwritten                | Yes (RegistryConflictError 'disposers')                                                          | kernel-builder.spec "rejects a duplicate disposer name and keeps the first registration"                                                                                                                                      |
| builder: Kernel runs disposers after successful build; builder did not | Yes                                                                                              | kernel-builder.spec "hands registered disposers ..." (asserts order empty before dispose; run after)                                                                                                                          |
| builder: Failed build releases disposers                               | Yes (delegates to createKernel)                                                                  | kernel-builder.spec "releases registered disposers in reverse order when build fails"                                                                                                                                         |
| builder: Builder and options produce same disposal                     | Yes                                                                                              | kernel-builder.spec "disposes a builder-built kernel the same way as an options-built kernel"                                                                                                                                 |

All 22 disposal scenarios (kernel 15 incl. 2 plain-object, builder 7) are implemented. Requirement-level text also verified: `Kernel extends AsyncDisposable`, `dispose(): Promise<void>` in the interface, `KernelOptions.disposers?: readonly KernelDisposer[]`.

## Discrepancies

None blocking; no code-wrong findings. Minor spec/code observations:

1. Spec gap (spec incomplete, code reasonable): the error type for empty/malformed names is only "a clear error" in scenarios; code throws `InvalidDisposerError` (code `INVALID_DISPOSER`), which neither spec names. Likewise the code also rejects a non-callable `dispose` (kernel-disposal.ts isWellFormed) while R3 only says `name` MUST be non-empty; R4 does define "well-formed" as non-empty name AND callable `dispose`, so it is implied. Suggest naming `InvalidDisposerError` and the callable rule in R3/R5 (or leave generic).
2. Spec says warnings are logged "through its logger"; code uses the ambient static `Logger` (observability/logger proxy, per repo convention). Compatible, but a literal reading ("kernel's logger") is imprecise. Spec wording could say "ambient Logger".
3. Spec says the failing-disposer errors are "one `Error`"; code uses `DisposerFailedError extends SpecdError` (extends Error; extra `disposerName` getter, code `DISPOSER_FAILED`). Satisfies spec and the conventions "Error types" requirement (extends SpecdError, machine-readable code, `_disposerName` private backing field). Not spec-documented as a public error; consider listing both new errors (and exports) in a spec/error doc. Not verified here whether they are exported from the package index.
4. Closed state: spec says other members are unspecified after dispose(); code keeps no closed flag beyond the memoized promise (equivalent). OK.
5. default:\_global/conventions delta contains only the Node.js engine floor requirement; nothing about disposal. Consistency with disposal code is therefore N/A. The disposal code complies with existing conventions (named exports, kebab-case files, test dir mirroring, explicit return types, SpecdError subclasses with `code`, underscore backing field, no `any`). The engine floor is out of scope for this audit. Note `await using` in kernel.spec relies on Node >=22 / TS 5.2+, consistent with that floor.
6. Builder scenario "kernel options carry the disposers in order a, b" is verified indirectly (via dispose order); there is no test inspecting the options handed to createKernel. Behaviorally equivalent.

## Test Coverage

- packages/core/test/composition/kernel-disposal.spec.ts: validateDisposers (4), runDisposers (7), createDispose (1), releaseAfterFailedConstruction (2).
- packages/core/test/composition/kernel.spec.ts "createKernel disposal": 10 tests (lifecycle surface, alias/await using, shared promise, order + isolation, no disposers, empty name, duplicate, failed construction release, original error preserved, conflicting entries).
- packages/core/test/composition/kernel-builder.spec.ts: 6 disposer tests.
- Run result: 52/52 pass across the three files.

## Missing Tests

- No kernel-level (end-to-end through `kernel.dispose()`) test of the 5000 ms timeout / warning scenario; covered only at runDisposers unit level (fake timers). Low risk since kernel.dispose is runDisposers.
- Kernel-level failing-disposer test does not assert `cause` (unit test does).
- "Process not kept alive" is tested by mocking setTimeout and checking `unref` was called, not by a real event-loop check. Acceptable.
- Kernel-level test that `dispose()` is a closed/idempotent after rejection (second call after AggregateError returns the same rejected promise) is not explicit; the memoization test uses a successful disposal only.
- No test for non-callable `dispose` through createKernel (only at validateDisposers level).
- No test that `dispose()` never throws synchronously (e.g., disposer that throws synchronously inside kernel); covered at runDisposers level ("converts a synchronous throw into an isolated failure").
- Builder: no assertion on options passed to createKernel (indirect only).

## Counts

- Requirements audited: 6 (4 kernel, 2 builder) + conventions delta (N/A to disposal).
- Scenarios audited: 22 (kernel 17 incl. plain-object, builder 7 minus overlap = 22 disposal scenarios: kernel 15 + builder 7; plain-object "Use cases are immutable" counted pre-existing).
- Implemented: 22/22.
- Tested (at least one direct test): 22/22 (3 only at unit level or indirectly: hanging timeout, process-alive, options-in-order).
- Discrepancies: 0 code-wrong, 0 spec-wrong blocking; 3 minor spec-wording gaps (items 1-3).
- Missing tests: 7 minor.
