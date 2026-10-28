# Partial audit: core disposal (core:kernel, core:kernel-builder, conventions delta)

Re-audit after fixes. Read-only. Tests run: kernel.spec, kernel-disposal.spec, kernel-builder.spec -> 57 pass, 0 fail.

## Requirements Summary

core:kernel (4 requirements, 17 disposal scenarios incl. plain-object):

- Kernel is a plain object (dispose is only lifecycle op): 1 disposal scenario
- Kernel disposal: 8 scenarios
- KernelOptions accepts named disposers: 4 scenarios
- Failed construction releases registered disposers: 3 scenarios

core:kernel-builder (2 requirements, 9 scenarios + registerDisposer chainable):

- Builder registers named disposers: chainable, call order, empty name, non-callable, duplicate
- Builder hands disposers to kernel: success, failed build, builder vs options parity

default:\_global/conventions delta: adds only "Node.js engine floor" (spec + 4 verify scenarios). NOT disposal-related.

## Implementation Status

| Scenario                                                                                                    | Implemented | Where                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------- |
| Kernel exposes dispose as only lifecycle op                                                                 | yes         | kernel.ts:472-478 (`dispose`, `[Symbol.asyncDispose]: dispose`, same fn ref)                                          |
| Reverse order, sequential                                                                                   | yes         | kernel-disposal.ts runDisposers (reverse, await each)                                                                 |
| asyncDispose alias                                                                                          | yes         | same function reference                                                                                               |
| Repeated/concurrent share promise, run once                                                                 | yes         | createDispose `disposal ??=`                                                                                          |
| Failing disposer isolated; AggregateError of DisposerFailedError, msg `Disposer 'b' failed`, cause=original | yes         | runDisposers; disposer-failed-error.ts (sets `cause`, code DISPOSER_FAILED); exported via application/errors/index.ts |
| Rejected disposal stays rejected                                                                            | yes         | memoized promise never reset                                                                                          |
| Hanging disposer: 5000 ms, warn via ambient Logger naming disposer, continue, resolve, not in aggregate     | yes         | runOne + Logger.warn with disposer name; KERNEL_DISPOSER_TIMEOUT_MS=5000                                              |
| Timer does not keep process alive                                                                           | yes         | `timer.unref()`, cleared in finally                                                                                   |
| No disposers                                                                                                | yes         | empty loop resolves; no sync throw (async fn)                                                                         |
| Disposers accepted in order                                                                                 | yes         | options.disposers passed through                                                                                      |
| Empty name -> InvalidDisposerError                                                                          | yes         | validateDisposers/isWellFormed (also non-string name)                                                                 |
| Non-callable dispose -> InvalidDisposerError, none run before failure                                       | yes         | validation runs before buildKernel; validation errors only trigger release of well-formed entries (after the error)   |
| Duplicate name -> RegistryConflictError('disposers')                                                        | yes         | validateDisposers                                                                                                     |
| Construction failure releases disposers in reverse                                                          | yes         | createKernel catch -> releaseAfterFailedConstruction                                                                  |
| Original error preserved; disposer failure -> Logger.warn                                                   | yes         | release never throws; rethrows original                                                                               |
| Conflicting entries still release well-formed ones once                                                     | yes         | isWellFormed filter (duplicates both released; "once" per entry)                                                      |
| builder.registerDisposer chainable                                                                          | yes         | kernel-builder.ts:437 returns builder                                                                                 |
| Builder: call order into options.disposers                                                                  | yes         | kernel-builder.ts:302                                                                                                 |
| Builder: empty name / non-callable -> InvalidDisposerError at register time                                 | yes         | kernel-builder.ts:438-443                                                                                             |
| Builder: duplicate -> RegistryConflictError('disposers')                                                    | yes         | kernel-builder.ts:444                                                                                                 |
| Builder hands off; builder never runs them                                                                  | yes         | build() == createKernel(options)                                                                                      |
| Failed build releases                                                                                       | yes         | via createKernel                                                                                                      |
| Builder/options parity                                                                                      | yes         | same path                                                                                                             |

Specifically confirmed (re-audit focus):

- InvalidDisposerError for empty name AND non-callable dispose: createKernel (yes) and builder.registerDisposer (yes).
- DisposerFailedError with `cause`: yes (asserted `only.cause === original`, kernel.spec.ts:636).
- Ambient Logger warnings: timeout (Logger.warn naming disposer) and release-failure (Logger.warn) both implemented and asserted.
- 5000 ms through kernel.dispose(): yes, fake-timer test advances KERNEL_DISPOSER_TIMEOUT_MS via kernel.dispose().
- Rejected disposal stays rejected: yes, same promise identity, disposer called once.

## Discrepancies

None blocking. Observations (neither spec-wrong nor code-wrong, informational):

1. Conventions delta is unrelated to disposal (Node engine floor). Consistent with repo: all 15 published packages declare engines.node ">=22"; apps/public-web is private with ">=18.0" (permitted by the "Private packages MAY omit" clause; spec does not forbid a different value); CI workflow node-version grep shows a single match at line 23 ("22"), satisfies floor. Consistent.
2. Spec says "Neither member MAY throw synchronously": satisfied structurally (async runDisposers), but no test asserts it directly. Minor.
3. "Conflicting entries still release well-formed ones exactly once": spec wording "every well-formed entry"; code releases both duplicate-named well-formed entries plus the third (each once). Matches the spec text ("non-empty name and callable dispose").
4. Release-failure warning payload stringifies errors (`String(e)`), losing causes; spec only requires a warning. OK.

## Test Coverage

kernel.spec.ts (describe 'createKernel disposal', lines 519+):

- exposes dispose as its only lifecycle operation
- treats Symbol.asyncDispose as an alias and supports await using
- shares one promise across repeated and concurrent dispose calls
- runs the supplied disposers in reverse order and isolates failures
- resolves dispose for a kernel without disposers
- rejects an empty disposer name
- rejects a non-callable dispose before any disposer runs
- reports each failed disposer as a DisposerFailedError with the original failure as cause
- keeps a rejected disposal rejected on later calls without rerunning disposers
- abandons a hanging disposer after the timeout through kernel.dispose and logs a warning
- rejects a duplicate disposer name with a RegistryConflictError
- releases the disposers in reverse order when construction fails
- keeps the original construction error when a disposer also fails (asserts Logger.warn)
- still releases well-formed entries once when entries conflict

kernel-disposal.spec.ts (unit): validateDisposers (accepts, empty name, non-callable, duplicate -> registry 'disposers'); runDisposers (reverse+sequential, aggregate DisposerFailedError, sync throw, timeout+warn+continue, no timeout in aggregate + late rejection swallowed, timer unref/clear, empty list); createDispose (shared promise); releaseAfterFailedConstruction (well-formed once/malformed ignored; never throws + warns).

kernel-builder.spec.ts: registerDisposer is chainable; hands disposers in call order and builder never runs them; rejects empty name; rejects non-callable dispose; rejects duplicate and keeps first; releases in reverse when build fails; builder vs options disposal parity.

## Missing Tests

Minor / optional:

- No test asserting `dispose()`/`[Symbol.asyncDispose]()` never throw synchronously.
- "Disposers are accepted in order" kernel scenario is covered indirectly (reverse-order tests), no explicit name-matched test.
- Builder: no test that a non-string name (not just empty) is rejected (not required by spec).
- Timer-unref scenario tested at unit level only (kernel-disposal.spec), not via kernel.dispose.
- Hanging-disposer test asserts the warning names 'hanging' but not that no AggregateError entry exists beyond resolving (resolution to undefined implies this).

## Counts

- Spec requirements audited: 6 core (4 kernel + 2 builder) + 1 conventions delta (unrelated)
- Disposal scenarios: 17 kernel + 9 builder = 26 (conventions: 4, unrelated)
- Implemented: 26/26
- Tested: 26/26 (3 with minor indirectness)
- Discrepancies: 0 blocking
- Missing tests: 0 required, 4-5 optional
