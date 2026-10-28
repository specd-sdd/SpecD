# Spec compliance: host-lifecycle-dispose (delegated, attempt verification-attempt-3)

## Summary

- Scenarios audited: ~99 (26 core disposal + ~73 sdk/cli). All implemented and tested. Zero blocking discrepancies.
- Tests: core 3321, sdk 86, cli 1216 pass; tsc, eslint, prettier clean; build ok.
- Only low-risk optional test gaps remain (see Missing Tests in partials).

## Detailed Findings

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

# Partial audit: sdk:host-context, cli:host-context, cli:entrypoint (change host-lifecycle-dispose, re-audit)

Test runs: packages/cli targeted suites PASS (79/0); packages/sdk suite PASS (86/0).

## Requirements Summary

sdk:host-context: SdkHostContext shape (AsyncDisposable, no config copy), createSdkContext, openSpecdHost (configPath/startDir exclusive, opt-in bootstrap fallback never for explicit configPath), Host disposal (delegates to kernel.dispose, same fn as asyncDispose, no provider close, no foreign-kernel wrap API), Config mutation boundary.

cli:host-context: resolveCliContext via helper, kernel options kept in CLI, host bootstrap entry point (no direct openSpecdHost/createSdkContext), openCliHost helper (registers dispose, input unchanged, failed open registers nothing, no hand-built host), CliContext exposes dispose, cleanup registry (reverse order, idempotent, failures warn, late registration immediate), graph worker disposes in finally, @specd/sdk sole platform dependency.

cli:entrypoint (relevant parts): exit codes 130/143, cleanup before exit on every path, CliExitError, failing error handler -> 3, only entrypoint calls process.exit, signal handling (first/second signal, first signal's code, SIGTERM on all platforms, no handlers from createProgram, prompts keep Ctrl-C), NEW Process exit grace period (1000ms hint, 5000ms force, unref, silent on clean exit), host SDK dependency boundary.

## Implementation Status

All scenarios IMPLEMENTED. Key confirmations:

- Second signal uses FIRST signal's code: cli-signals.ts shared `firstCode`; second handler (any signal) calls process.exit(firstCode). OK.
- SIGTERM handler installed unconditionally (SIGNAL_EXIT_CODES loop, no platform check). OK.
- Grace period: run.ts CLI_EXIT_HINT_MS=1000, CLI_EXIT_FORCE_MS=5000, both setTimeout(...).unref(); hint writes `warning: waiting for open handles to close (<types>); forcing exit in 4 s`; force writes `warning: process did not exit after cleanup; forcing exit` then process.exit(process.exitCode ?? 0). Armed only on natural completion, after runCliCleanup and handler removal; no process.exit on natural path. Explicit exits (CliExitError/unhandled) exit immediately, no timers. OK.
- Explicit config never falls back: host-context.ts catch rethrows when configPath !== undefined, flag !== true, or error not ConfigNotFoundError. OK.
- Mixed configPath+startDir rejected before loader. OK.
- SdkHostContext has only kernel/createGraphProvider/dispose/[Symbol.asyncDispose]; no initProject/addPlugin/removePlugin; no wrap-foreign-kernel API (createSdkContext takes config, creates kernel itself). OK.
- cli-cleanup.ts: reverse order, memoized `running`, runOne swallows+warns (`warning: cleanup failed: ...`, one per AggregateError member), late register invokes immediately. OK.
- openCliHost registers `host.dispose()` only after a successful open (await before register), forwards input unchanged. OK.
- graph-index-task.ts: host opened via openSpecdHost/createSdkContext directly (permitted exception), `finally { await host.dispose() }`, no cli-cleanup import. OK.
- Grep of CLI src: openSpecdHost/createSdkContext only in helpers/cli-host.ts and graph-index-task.ts; process.exit only in run.ts and helpers/cli-signals.ts; no resolveSdkHostContext; no hand-built host literal; no @specd/core or @specd/code-graph imports in CLI src.
- packages/cli/package.json deps: @specd/sdk is the only of core/code-graph/sdk. OK.

## Discrepancies

No spec-vs-code contradictions found. Minor observations (not spec violations):

1. Signal handlers are removed (removeSignalHandlers) before the grace period on the natural path, so a SIGINT/SIGTERM during the 0-5s grace window gets Node's default behaviour (killed by signal, shell-visible 130/143 on POSIX, but no cleanup/explicit code). Spec is silent; arguably fine since cleanup already ran.
2. Signal path `runCliCleanup().finally(() => process.exit(code))`: a cleanup registered late (fire-and-forget, spec-mandated immediate invocation) is not awaited, so process.exit may preempt it. Inherent to the spec ("invoked immediately"); spec could note it.
3. Spec says hint line states "when the exit will be forced"; code says "forcing exit in 4 s" (relative remaining time). Compliant.
4. Spec text for "Interrupted by SIGINT ... (or been abandoned by a second signal)" consistent with code.

## Test Coverage

sdk:host-context (packages/sdk/test/composition/host-context.spec.ts, barrel.spec.ts):

- Shape/kernel+factory+disposal only: "exposes kernel, provider factory and disposal members without a top-level config"
- Async-disposable / await using: "releases the host when an await using scope exits"
- Same config: "passes the same config to createKernel and createCodeGraphProvider"; awaits kernel: covered implicitly by async tests
- New instance per call: "returns a new provider on each createGraphProvider call"
- Disposal delegates + alias: "delegates dispose to the kernel and aliases Symbol.asyncDispose"
- Discovery cwd: "loads config via discovery when configPath is omitted"; startDir: "uses discovery mode from an explicit startDir when provided"; forced: "uses forced configPath when provided"; mixed: "rejects mixed configPath and startDir inputs before loader creation"
- Options forwarded: "forwards sdk options to createKernel and createGraphProvider" (+ graph options test)
- Warnings: "preserves loader warnings on the returned config", "keeps warnings on config instead of duplicating them..."
- Fallback: "uses a synthetic graph host only when discovery fallback is enabled"; explicit never falls back: "never falls back to a synthetic host when an explicit configPath cannot be loaded"
- Host disposal: "returns the kernel disposal promise on repeated calls", "carries the disposal members through the openSpecdHost spread", "does not close graph providers created by the host", "exposes no API that wraps a foreign kernel into a host context"
- Mutation boundary: "exposes no config mutation methods on the host context"

cli:host-context:

- Host via helper / shape: helpers/cli-host.spec.ts "opens through openSpecdHost and registers..."; cli-context.spec.ts "reads bootstrap warnings from config and returns the CLI context shape"
- Verbosity: "maps -vv to trace console destination via openSpecdHost options.kernel"; warnings once: "emits each warning once per bootstrap call"; onLog wiring: partially via -vv/buildCliKernelOptions tests
- No direct SDK bootstrap / no hand-built host / resolveSdkHostContext gone: cli-context.spec.ts "has no hand-built host and no direct SDK bootstrap outside the helper and the worker"
- Helper: cli-host.spec.ts four tests (registers, createSdkContext form, forwards unchanged, failed open registers nothing)
- CliContext dispose: cli-context.spec.ts "releases the host through the cleanup registry without the command calling dispose", "releases the host once when dispose is called as well"; run-host-release.spec.ts "disposes a host whose command never calls dispose"
- Registry: cli-cleanup.spec.ts (reverse order; idempotent/concurrent; failing cleanup; AggregateError; late registration; late failure warns)
- Worker: graph-index-task.spec.ts "disposes the host it opened after a successful run" / "...when indexing fails"
- Dependencies: package-deps.spec.ts "depends on @specd/sdk as the sole specd platform package"

cli:entrypoint:

- Cleanup paths: run.spec.ts (normal, CliExitError, code 0 early exit, unexpected error -> 3, failing handler -> 3, process.exitCode)
- cliError throws CliExitError: handle-error.spec.ts "cliError writes its output and throws a CliExitError without calling process.exit"
- Only entrypoint exits / no swallow: run.spec.ts "calls process.exit only from run.ts and helpers/cli-signals.ts", "never throws a CliExitError inside a try whose catch would reclassify it", "has no command catch block that could swallow a CliExitError"
- Signals: cli-signals.spec.ts (SIGINT 130, SIGTERM 143, second signal, SIGINT->SIGTERM = first code, SIGTERM->SIGINT, win32 SIGTERM handler, no stdin touch, removal, createProgram, import-time); cli-signals-process.spec.ts (real-process 130/143 and second signal first code)
- Grace period: run.spec.ts "prints nothing and never forces the exit..." (2 timers, all unref'd), "warns after the hint delay...", "forces the exit after the force delay with the original exit code", "forces the exit with code 0...", "does not arm the grace period after an explicit exit"

## Missing Tests

- Prompts keep their own cancellation: only indirectly checked ("does not touch stdin"); no test with an actual clack prompt. Low risk.
- "Clean exit prints nothing" is verified by timers being unref'd rather than by a real process ending by itself (no subprocess test). Acceptable.
- Natural-path signal during grace window (observation 1) untested/unspecified.
- Hint warning containing resource types (getActiveResourcesInfo) not asserted (only prefix and "forcing exit in 4 s").
- Late-registered cleanup racing with signal exit (observation 2) untested.

## Counts

Scenarios audited: sdk:host-context 24, cli:host-context 21, cli:entrypoint relevant 28 (exit codes SIGINT/SIGTERM 2, cleanup 8, signals 6, grace 4, deps 1, plus Cleanup-path guards) = approx 73.
Implemented: all. Tested: all (3 weakly: Prompts cancellation, Clean exit via unref only, onLog callback via indirect tests).
Spec-vs-code discrepancies: 0 blocking; 2 non-blocking observations (grace-window signals; late cleanup vs signal exit).
