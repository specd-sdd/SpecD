# Spec compliance: host-lifecycle-dispose (delegated, attempt verification-attempt-4)

## Summary

- All disposal, cleanup, signal and exit-grace-period scenarios implemented and tested. Zero blocking discrepancies.
- Tests: core 3323, sdk 86, cli 1219 pass; tsc, eslint clean; build ok.
- Minor optional gaps only (see Missing Tests in partials). Note: core partial's remark that core:kernel lacks disposal scenarios in merged verify is incorrect; the merged preview contains them.

## Detailed Findings

# Partial audit: core:kernel + core:kernel-builder (disposal), attempt 4

Test run: `pnpm vitest run test/composition` in packages/core -> 54 files, 270 tests, all passed.

## Requirements Summary

core:kernel

- R1 Kernel disposal: dispose()/[Symbol.asyncDispose] identical, never throw sync, reverse order awaited sequentially, idempotent shared promise, failure isolation -> AggregateError of DisposerFailedError (message `Disposer '<name>' failed`, cause), 5000 ms unref'd timeout with Logger warn and not in aggregate, closed state, empty = no work, opaque.
- R2 KernelOptions accepts named disposers: non-empty name + callable -> InvalidDisposerError; dup -> RegistryConflictError('disposers'); before any disposer runs; array order = registration order.
- R3 Failed construction releases disposers: reverse order, same isolation/timeout, malformed/conflicting entries still release well-formed ones once, original error preserved, release failures only warned.
- Kernel "no lifecycle ops besides dispose" wording (Kernel is plain object literal).
  core:kernel-builder
- R4 registerDisposer: chainable, call order, InvalidDisposerError on empty/non-string name or non-callable dispose, RegistryConflictError('disposers') on dup.
- R5 Builder hands disposers to kernel: kernel runs them, builder never; failed build relies on createKernel; builder == options disposal.

## Implementation Status

All implemented.

- kernel-disposal.ts: runOne (Promise.resolve().then converts sync throws; timer.unref; clearTimeout in finally; late rejection swallowed), runDisposers (reverse, sequential, AggregateError of DisposerFailedError, warn on timeout), createDispose (`??=` memoized; async fn so never throws sync), validateDisposers (isWellFormed: string, non-empty, function; dup -> RegistryConflictError('disposers', name)), releaseAfterFailedConstruction (filters well-formed, never throws, warns).
- kernel.ts: Kernel extends AsyncDisposable; `dispose` and `[Symbol.asyncDispose]` are the same function reference; createKernel validates then buildKernel inside try, catch -> release -> rethrow original.
- kernel-builder.ts: registerDisposer checks `typeof name !== 'string' || name === ''` (new non-string check present), typeof dispose, dup; toKernelOptions passes disposers in order; build() = createKernel(config, toKernelOptions).
- errors: InvalidDisposerError (INVALID_DISPOSER), DisposerFailedError (DISPOSER_FAILED, cause, disposerName) exported via application/errors/index.ts -> application/index.ts; KernelDisposer type exported from composition/index.ts.

## Discrepancies

None blocking.

- Minor/spec-doc: the merged preview contains a verify.md only for core:kernel-builder; no core:kernel disposal scenarios appear in the preview (kernel R1-R3 have no verify scenarios in the spec artifact). Tests exist anyway. Consider adding scenarios to kernel verify delta if intended.
- Minor: I did not verify the `@specd/core` package-root re-export chain end to end (src/index.ts grep showed no direct match; exports go through `export *` of application/index.ts). Not confirmed by a build/import check.
- Minor: "closed state" is documentation-only (unspecified behaviour); nothing enforced, consistent with spec.

## Test Coverage

core:kernel (test/composition/kernel.spec.ts `createKernel disposal`, kernel-disposal.spec.ts)

- dispose + asyncDispose present, only lifecycle op: "exposes dispose as its only lifecycle operation"
- alias + await using: "treats Symbol.asyncDispose as an alias and supports await using"
- idempotent/concurrent: "shares one promise across repeated and concurrent dispose calls"; createDispose "shares one promise across repeated and concurrent calls and runs each disposer once"
- reverse order + isolation: "runs the supplied disposers in reverse order and isolates failures"; runDisposers "runs disposers in reverse registration order, awaiting each before the next", "isolates a failing disposer and aggregates DisposerFailedError entries", "converts a synchronous throw into an isolated failure"
- DisposerFailedError message + cause: "reports each failed disposer as a DisposerFailedError with the original failure as cause"
- never throws sync (new): "never throws synchronously, even when a disposer throws synchronously"
- rejected disposal stays rejected, no rerun: "keeps a rejected disposal rejected on later calls without rerunning disposers"
- timeout: "abandons a hanging disposer after the timeout through kernel.dispose and logs a warning"; "abandons a hanging disposer after the timeout, warns, and continues"; "does not report a timeout in the aggregate error and swallows a late rejection"; "unrefs the timeout timer and clears it after a normal disposer"
- no disposers: "resolves dispose for a kernel without disposers"; "resolves without doing any work for an empty list"
- KernelOptions validation: "rejects an empty disposer name", "rejects a non-callable dispose before any disposer runs", "rejects a duplicate disposer name with a RegistryConflictError"; validateDisposers suite (4 tests)
- construction failure: "releases the disposers in reverse order when construction fails", "keeps the original construction error when a disposer also fails", invalid/conflicting-entries test at kernel.spec.ts ~L759 (releases `good` once); releaseAfterFailedConstruction suite (2 tests)
  core:kernel-builder (test/composition/kernel-builder.spec.ts)
- "registerDisposer is chainable"
- "hands registered disposers to the kernel in call order and the builder never runs them" (covers call-order + kernel runs + builder did not run)
- "rejects an empty disposer name"; "rejects a non-string disposer name" (new); "rejects a non-callable dispose"; "rejects a duplicate disposer name and keeps the first registration"
- "releases registered disposers in reverse order when build fails"
- "disposes a builder-built kernel the same way as an options-built kernel"

## Missing Tests

- Builder scenario "Disposers reach the kernel options in call order" is only checked indirectly (via dispose order, reversed), not by inspecting options; acceptable.
- No test that builder dup/invalid error message/category string for RegistryConflictError('disposers') in builder (kernel-disposal.spec checks `'disposers'` message regex only).
- No test for non-string name through createKernel options path (only via builder); isWellFormed handles it.
- No test asserting package-root (`@specd/core`) exports of InvalidDisposerError/DisposerFailedError.

## Counts

Requirements: 5 (3 kernel, 2 builder). Verify scenarios present: 8 builder-side (all covered); 0 kernel-side in preview. Implemented: 5/5. Fully tested: 5/5. Discrepancies: 0 blocking, 3 minor. Core composition tests: 270/270 pass.

# Partial audit: sdk:host-context, cli:host-context, cli:entrypoint (attempt 4)

## Requirements Summary

- sdk:host-context: 5 reqs (SdkHostContext shape, createSdkContext, openSpecdHost, Host disposal, Config mutation boundary), 22 scenarios.
- cli:host-context: 8 reqs (delegation, kernel options, entry point, host helper, CliContext dispose, cleanup registry, graph worker, runtime deps), 22 scenarios.
- cli:entrypoint (touched reqs): Exit codes, Cleanup before exit, Signal handling, Process exit grace period, SDK dependency boundary; 26 scenarios in the touched reqs (other reqs unrelated to this change).

## Implementation Status

All implemented.

- sdk host-context.ts: SdkHostContext extends AsyncDisposable; dispose = () => kernel.dispose(); [Symbol.asyncDispose] same fn; no config field; createGraphProvider closes over config, no provider tracking/closing; mixed configPath+startDir throws; fallback skipped when configPath set or error not ConfigNotFoundError; no foreign-kernel wrapper exported; no write methods.
- cli helpers/cli-host.ts: openCliHost wraps openSpecdHost/createSdkContext, forwards input unchanged, registerCliCleanup(() => host.dispose()) only after open succeeds. resolveSdkHostContext and hand-built {kernel, createGraphProvider} gone (grep clean).
- cli-cleanup.ts: reverse order, memoized promise, failures -> `warning: cleanup failed:` on stderr, late registration invoked immediately (runOne).
- cli-context.ts: resolveCliContext returns the host (CliContext = SdkHostContext + config/configFilePath), warnings from config.warnings once.
- graph-index-task.ts: opens host directly (permitted), host.dispose() in finally, no registry use.
- run.ts: installs signal handlers; awaits runCliCleanup on all paths; toExitCode handles CliExitError / handleError throw -> 3; natural completion arms two unref'd timers: CLI_EXIT_HINT_MS=1000 (warning with distinct resource types via Set, silent otherwise), CLI_EXIT_FORCE_MS=5000 (warning + process.exit(process.exitCode ?? 0)). process.exit only in run.ts and cli-signals.ts (grep).
- cli-signals.ts: SIGINT/SIGTERM handlers on all platforms (no platform check); second signal exits with firstCode; installed only from run(), not createProgram/import. index.ts only calls run.
- package.json cli deps: @specd/sdk only; zero src imports of @specd/core or @specd/code-graph.

## Discrepancies

None blocking. Observations (non-defects):

- Grace period only armed on natural completion path (matches spec wording "on the normal completion path").
- Signal handlers are removed after cleanup, before the grace period; a signal during grace period uses Node default (spec silent).
- Hint warning wording "waiting for open handles to close (types); forcing exit in 4 s" satisfies "when the exit will be forced".

## Test Coverage

Test runs: sdk 86/86 pass; cli 1219/1219 pass (vitest, json reporter).
sdk (packages/sdk/test/composition/host-context.spec.ts): shape ('exposes kernel, provider factory and disposal members without a top-level config'), same config ('passes the same config to createKernel and createCodeGraphProvider'), new instance per call, discovery/startDir/forced/mixed rejection, options forwarded, warnings preserved/not duplicated, fallback ('uses a synthetic graph host only when discovery fallback is enabled'), explicit config never falls back ('never falls back to a synthetic host when an explicit configPath cannot be loaded'), dispose delegation + alias, repeated calls share promise, 'releases the host when an await using scope exits', spread carries members, 'does not close graph providers created by the host', 'exposes no API that wraps a foreign kernel', 'exposes no config mutation methods'.
cli host-context: helpers/cli-context.spec.ts (-vv kernel options, warnings from config / once, onLog path, 'releases the host through the cleanup registry without the command calling dispose', 'releases the host once when dispose is called as well', 'has no hand-built host and no direct SDK bootstrap outside the helper and the worker'); helpers/cli-host.spec.ts (4 tests: openSpecdHost+register, createSdkContext+register, forwards unchanged, failed open registers nothing); helpers/cli-cleanup.spec.ts (reverse order, idempotent/concurrent, failure isolation, AggregateError, late registration, late failure warning); graph-index-task.spec.ts (disposes after success, disposes on failure); run-host-release.spec.ts; package-deps.spec.ts.
cli entrypoint: run.spec.ts (cleanup after normal completion, CliExitError code, unexpected error -> 3, failing handler -> 3, exitCode respected, silent when ends by itself with timers unref'd, hint after 1000ms, 'lists the distinct open resource types in the hint line', force after 5000ms with original code and with 0, no grace after explicit exit, handlers removed, source guards for process.exit and CliExitError swallowing); run-process.spec.ts real process (clean: exit 0 and no warning; leak: hint with 'Timeout', forced-exit warning, elapsed >= 5000, exit 0); helpers/cli-signals.spec.ts (SIGINT 130, SIGTERM 143, second signal immediate, SIGINT->SIGTERM 130, SIGTERM->SIGINT 143, win32 SIGTERM handler, no stdin touch/prompt coexistence, handler removal, createProgram installs nothing, no import-time install); helpers/cli-signals-process.spec.ts real process (SIGINT 130, SIGTERM 143, second signal keeps first code 130).

## Missing Tests (minor)

- Real-process leak test does not assert the hint is emitted at ~1 s (only that it appears and total >= 5 s); timing of hint covered by fake-timer test only.
- 'process.exit is not called by grace-period logic' on clean exit verified via fake timers only (real-process test checks exit 0, no warning).
- Prompt-cancellation scenario covered indirectly (no stdin touch), no real prompt test.
- 'Cleanup runs before error exit' etc. covered via mocked program, not real process.

## Counts

Scenarios audited: ~70 (sdk 22, cli:host-context 22, cli:entrypoint touched ~26). Implemented: all. Tested: all (a few indirectly, listed above). Failing tests: 0. Discrepancies: 0 blocking.
