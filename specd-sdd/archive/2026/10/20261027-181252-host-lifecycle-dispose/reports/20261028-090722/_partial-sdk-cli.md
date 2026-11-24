# Partial audit: sdk:host-context, cli:host-context, cli:entrypoint (disposal/cleanup/signal/exit)

Change: host-lifecycle-dispose. Read-only audit. Method: merged specs via spec-preview, source read, grep over packages/cli/src, test titles inspected (tests not executed).

## Requirements Summary

sdk:host-context

- SdkHostContext extends AsyncDisposable (kernel, createGraphProvider, dispose); no duplicate config.
- createSdkContext returns dispose = kernel.dispose(), [Symbol.asyncDispose] same function.
- openSpecdHost spreads ctx so result carries disposal members; await using works.
- dispose() must not close graph providers; no API wraps a foreign kernel.
- (pre-existing) mixed configPath/startDir rejected, bootstrap fallback, warnings on config, no config writes.

cli:host-context

- resolveCliContext -> openCliHost helper -> openSpecdHost; returns CliContext (SdkHostContext + config/configFilePath).
- openCliHost wraps openSpecdHost + createSdkContext, forwards input unchanged, registers host.dispose in cleanup registry before returning; failed open registers nothing.
- resolveSdkHostContext and hand-built {kernel, createGraphProvider} in withProvider removed.
- Cleanup registry: reverse order, awaited, idempotent/concurrent share promise, failures -> `warning:` on stderr, exit code unchanged.
- No direct openSpecdHost/createSdkContext in CLI sources except helper and graph index worker.
- Graph index worker disposes host in finally (success + failure), no registry dependency.
- @specd/sdk sole platform dep.

cli:entrypoint (relevant parts)

- Exit codes incl. 130/143 after cleanup.
- Only entrypoint terminates process; helpers (cliError, handleError) throw CliExitError (return type never); entrypoint awaits runCliCleanup on all paths; failing error handler -> cleanup + exit 3; commands must not swallow CliExitError.
- Signal handling: handlers installed by executable entrypoint (not createProgram); first signal -> cleanup then 130/143; second signal -> immediate exit; coexist with prompt cancellation.

## Implementation Status

sdk:host-context (packages/sdk/src/composition/host-context.ts)

- SdkHostContext shape (AsyncDisposable, readonly dispose): IMPLEMENTED.
- createSdkContext dispose delegate + asyncDispose alias (same fn): IMPLEMENTED.
- openSpecdHost spreads ctx -> disposal members on result: IMPLEMENTED.
- Providers not closed by dispose: IMPLEMENTED (dispose only calls kernel.dispose()).
- No foreign-kernel wrapper API: IMPLEMENTED (createSdkContext takes config, builds its own kernel; no other export).
- Pre-existing scenarios (mixed inputs, fallback, warnings): IMPLEMENTED.

cli:host-context

- resolveCliContext via openCliHost: IMPLEMENTED (helpers/cli-context.ts, returns host as CliContext; warnings from config.warnings emitted once).
- openCliHost (helpers/cli-host.ts): IMPLEMENTED. Overloads for OpenSpecdHostInput and {config, options}. Registers `() => host.dispose()` after successful open only; throw during open skips registration.
- resolveSdkHostContext removed: VERIFIED (src/helpers/sdk-host.ts deleted; zero grep hits in src/test).
- No object-literal host stand-in: VERIFIED. withProvider (commands/graph/with-provider.ts) uses options.host or openCliHost({config, options:{kernel}}).
- Direct SDK bootstrap: only helpers/cli-host.ts and graph-index-task.ts call openSpecdHost/createSdkContext. VERIFIED by grep.
- CliContext exposes dispose: IMPLEMENTED via SdkHostContext inheritance (cli-context-types.ts).
- Cleanup registry (helpers/cli-cleanup.ts): IMPLEMENTED. Reverse order, memoized `running` promise, per-cleanup try/catch, `warning: cleanup failed: <msg>` per AggregateError member, never rejects. Cleanups registered after run start are fired immediately (extra behavior, not in spec; harmless).
- Graph index worker (graph-index-task.ts): IMPLEMENTED. host opened outside try, `await host.dispose()` in finally; does not use registry.
- package.json: IMPLEMENTED. Only @specd/sdk among platform pkgs (no @specd/core / @specd/code-graph; no src imports from them). @specd/guide, plugin-\* and schema-std are non-platform per spec.

cli:entrypoint

- run.ts + index.ts: IMPLEMENTED. `void run(process.argv)`; run installs signal handlers, parseAsync in try, toExitCode(error), awaits runCliCleanup(), removes handlers, process.exit(code) only when an error/CliExitError occurred; natural completion leaves process.exitCode to Node (satisfies "exits with process.exitCode, default 0").
- toExitCode: CliExitError -> its code; handleError(err) -> CliExitError code; non-CliExitError thrown by handler -> 3. IMPLEMENTED.
- cliError/handleError throw CliExitError, return type never: IMPLEMENTED (handle-error.ts). handleError rethrows CliExitError first.
- process.exit only in run.ts and helpers/cli-signals.ts: VERIFIED by grep. (process.exitCode set in validate commands; allowed.)
- Commands do not swallow CliExitError: every catch that wraps command work calls handleError (which rethrows) or is a non-CliExitError-throwing best-effort block (edit.ts:164 overlap, approve.ts:162 status reload, plugins install/uninstall inner per-plugin catch). validate.ts:228 rethrows ChangeNotFoundError only, then calls cliError (which throws CliExitError itself, not inside its own try). Not exhaustively proven for all 109 catch sites; a source-guard test covers it (see below).
- Signal handling (helpers/cli-signals.ts): IMPLEMENTED. SIGINT 130, SIGTERM 143; first signal -> runCliCleanup().finally(exit(code)); second signal -> process.exit(code) immediately; returns remover; not called from createProgram.
- Prompts keep own cancellation: no suppression visible (handlers never stopPropagation/preventDefault; only add listeners). Not tested.

## Discrepancies

None blocking. Observations (neither spec nor code clearly wrong):

1. Second-signal exit code: spec says "exit immediately with the same code"; code uses the code of the signal that arrived second (e.g. SIGINT then SIGTERM -> 143). Spec scenario (SIGTERM then second signal -> 143) is satisfied; mixed-signal case is ambiguous in spec. Suggest clarifying spec wording ("code of the first signal" vs "of the received signal") - spec ambiguity, low.
2. registerCliCleanup after cleanup started runs fn immediately (fire and forget). Spec silent. Code-extra, defensible; consider documenting in cli:host-context spec.
3. Windows: SIGTERM listener installed unconditionally; spec says only SIGINT relied upon on Windows. Node tolerates registering SIGTERM on Windows; no code issue.
4. Natural completion does not call process.exit (relies on event loop draining). If a leaked handle keeps the loop alive the process would hang after cleanup; spec says only "process exits with code X". Code is consistent with spec text.

## Test Coverage

SDK (packages/sdk/test/composition/host-context.spec.ts)

- Context exposes kernel/factory/disposal, no config -> "exposes kernel, provider factory and disposal members without a top-level config"
- Context is async-disposable / await using -> "releases the host when an await using scope exits"
- Disposal delegates + alias -> "delegates dispose to the kernel and aliases Symbol.asyncDispose"
- dispose shares kernel promise -> "returns the kernel disposal promise on repeated calls"
- openSpecdHost carries disposal members -> "carries the disposal members through the openSpecdHost spread"
- Providers not closed -> "does not close graph providers created by the host"
- No foreign kernel API -> "exposes no API that wraps a foreign kernel into a host context"
- Same config / new instance / options forwarding / discovery / forced / startDir / mixed rejected / fallback / warnings: existing tests (lines 47-176)
- Config mutation boundary (no write methods): covered by "exposes ... without a top-level config" only partially (see Missing)

CLI

- Cleanup registry (test/helpers/cli-cleanup.spec.ts): reverse order; idempotent/concurrent; failing cleanup warning + no throw; AggregateError per-failure warnings; late registration.
- openCliHost (test/helpers/cli-host.spec.ts): "opens through openSpecdHost and registers the host disposal for cleanup"; "opens an already-resolved config through createSdkContext and registers it too"; "forwards the caller input unchanged..."; "a failed open registers nothing".
- resolveCliContext (test/helpers/cli-context.spec.ts): verbosity -vv kernel options; warnings from config, once; "releases the host through the cleanup registry without the command calling dispose"; "releases the host once when dispose is called as well"; "has no hand-built host and no direct SDK bootstrap outside the helper and the worker" (also asserts sdk-host.ts absent).
- Worker (test/graph-index-task.spec.ts): "disposes the host it opened after a successful run"; "...when indexing fails"; "keeps orchestration on the SDK boundary".
- Entrypoint (test/run.spec.ts): normal completion cleanup/no exit; CliExitError code; exit 0 early; unexpected error -> exit 3 + fatal; failing error handler -> 3; process.exitCode respected; handlers removed; source guards "calls process.exit only from run.ts and helpers/cli-signals.ts", "never throws a CliExitError inside a try whose catch would reclassify it", "has no command catch block that could swallow a CliExitError".
- cliError throws CliExitError: test/handle-error.spec.ts (wrapper maps CliExitError to process.exit; exit-code assertions).
- Signals (test/helpers/cli-signals.spec.ts): first SIGINT -> cleanup then 130; SIGTERM 143; second signal forces immediate exit; removes handlers; "is not triggered by createProgram()"; no handlers at import. Real-process tests (cli-signals-process.spec.ts): SIGINT 130, SIGTERM 143, second signal immediate exit.
- Package dep boundary: test/commands/graph-index.spec.ts:182 asserts no @specd/code-graph in package.json; no explicit test that @specd/core is absent / @specd/sdk is the sole platform dep.

## Missing Tests

1. cli:entrypoint "Prompts keep their own cancellation": no test.
2. cli:host-context "Commands do not need to call dispose" end-to-end (command opens host, process exits): covered only at unit level via resolveCliContext + runCliCleanup; no integration test through run().
3. cli:host-context "CLI package runtime dependencies": no assertion that @specd/core is absent and @specd/sdk present (only code-graph absence tested).
4. sdk:host-context "Explicit configuration never falls back" (configPath + allowBootstrapFallback: true, load fails -> error propagates): no test seen (code handles it: `input.configPath !== undefined` rethrows). Pre-existing scenario but listed in merged spec.
5. sdk:host-context "Host context has no write methods": no dedicated test.
6. cli:entrypoint "Helpers throw CliExitError instead of exiting" - covered indirectly in handle-error.spec.ts; no test named for `cliError('message', undefined, 1)` asserting the throw and that process.exit is not called (the spec's wrapper mocks process.exit, so the "does not call process.exit" half is weakly tested).
7. Mixed-signal second-signal exit code (observation 1) untested.

## Counts

- Spec scenarios audited: sdk:host-context 24 (5 host disposal + 3 SdkHostContext/createSdkContext new + 16 pre-existing), cli:host-context 24, cli:entrypoint (disposal/cleanup/signal/exit-code scenarios) 15.
- Implemented: all audited requirements (63/63 scenarios implemented in code).
- Tested with a clearly matching test: ~56; weak/indirect: 2 (items 6, 2 above); no test: 5 (items 1, 3 partial, 4, 5, plus mixed-signal).
- Code-vs-spec discrepancies: 0 blocking; 4 minor observations.
