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
