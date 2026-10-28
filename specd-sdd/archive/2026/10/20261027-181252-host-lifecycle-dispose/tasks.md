# Tasks: host-lifecycle-dispose

## 1. Core: errors and disposal module

- [x] 1.1 Add `InvalidDisposerError`
      `packages/core/src/application/errors/invalid-disposer-error.ts`: new class extending `SpecdError`
      Approach: `get code(): 'INVALID_DISPOSER'`, constructor `(detail: string)` calls `super(\`Invalid kernel disposer: ${detail}\`)`; add TSDoc like `RegistryConflictError`; export it from the same barrel that exports `RegistryConflictError`
      (Req: KernelOptions accepts named disposers)
- [x] 1.2 Add `DisposerFailedError`
      `packages/core/src/application/errors/disposer-failed-error.ts`: new class extending `SpecdError`
      Approach: `code = 'DISPOSER_FAILED'`, fields `disposerName: string`; constructor `(disposerName, cause)` calls `super(\`Disposer '${disposerName}' failed\`)`then assigns`this.cause = cause`(the`SpecdError` constructor takes only a message); export from the errors barrel
      (Req: Kernel disposal)
- [x] 1.3 Create the disposal module skeleton with `KernelDisposer` and the timeout constant
      `packages/core/src/composition/kernel-disposal.ts`: `KernelDisposer { readonly name: string; readonly dispose: () => void | Promise<void> }`, `KERNEL_DISPOSER_TIMEOUT_MS = 5000`
      Approach: named exports only, explicit return types, TSDoc on every export
      (Req: KernelOptions accepts named disposers, Kernel disposal)
- [x] 1.4 Implement `validateDisposers`
      `packages/core/src/composition/kernel-disposal.ts`: `validateDisposers(disposers)`
      Approach: iterate; non-string/empty `name` or non-function `dispose` → `InvalidDisposerError`; track names in a `Set`; a repeated name → `new RegistryConflictError('disposers', name)`
      (Req: KernelOptions accepts named disposers)
- [x] 1.5 Implement `runDisposers` ordering and isolation
      `packages/core/src/composition/kernel-disposal.ts`: `runDisposers(disposers)`
      Approach: `for (const d of [...disposers].reverse())`, start each with `Promise.resolve().then(() => d.dispose())` (sync throws become rejections), `await` it before the next; collect `new DisposerFailedError(d.name, cause)` on rejection; after the loop, if errors exist throw `new AggregateError(errors, \`${n} disposer(s) failed: ${names}\`)`
      (Req: Kernel disposal)
- [x] 1.6 Add the per-disposer timeout to `runDisposers`
      `packages/core/src/composition/kernel-disposal.ts`: `runDisposers` inner race
      Approach: race the disposer promise against a `setTimeout(KERNEL_DISPOSER_TIMEOUT_MS)` whose handle gets `.unref()` and is cleared in `finally`; on timeout call `Logger.warn(\`Disposer '${name}' did not finish within 5000 ms; abandoning it\`, { disposer: name, timeoutMs })`, attach `.catch(() => {})` to the abandoned promise, continue, and do NOT add a timeout to the error list
      (Req: Kernel disposal)
- [x] 1.7 Implement `createDispose`
      `packages/core/src/composition/kernel-disposal.ts`: `createDispose(disposers)`
      Approach: `let disposal: Promise<void> | undefined; return () => (disposal ??= runDisposers(disposers))` so repeated and concurrent calls share one promise and each disposer runs once
      (Req: Kernel disposal)
- [x] 1.8 Implement `releaseAfterFailedConstruction`
      `packages/core/src/composition/kernel-disposal.ts`: `releaseAfterFailedConstruction(disposers: readonly unknown[])`
      Approach: filter well-formed entries (`typeof name === 'string' && name !== ''` and `typeof dispose === 'function'`), `try { await runDisposers(filtered) } catch (err) { Logger.warn('Failed to release disposers after kernel construction failure', { errors: ... }) }`; never throws
      (Req: Failed construction releases registered disposers)

## 2. Core: kernel wiring

- [x] 2.1 Extend `KernelOptions` with `disposers`
      `packages/core/src/composition/kernel.ts`: `KernelOptions` — add `readonly disposers?: readonly KernelDisposer[]`
      Approach: import the type from `./kernel-disposal.js`; optional so existing callers compile
      (Req: KernelOptions accepts named disposers)
- [x] 2.2 Make `Kernel` async-disposable
      `packages/core/src/composition/kernel.ts`: `Kernel` interface — `extends AsyncDisposable` and add `dispose(): Promise<void>` with TSDoc
      Approach: `[Symbol.asyncDispose]` comes from `AsyncDisposable`; document that after `dispose()` other members are unspecified
      (Req: Kernel disposal, Kernel is a plain object, not a class)
- [x] 2.3 Move the existing `createKernel` body into `buildKernel`
      `packages/core/src/composition/kernel.ts`: new private `buildKernel(config, options, disposers)`
      Approach: rename without behaviour change; add `const dispose = createDispose(disposers)` and add `dispose` plus `[Symbol.asyncDispose]: dispose` to the returned literal
      (Req: Kernel disposal)
- [x] 2.4 Rewrite `createKernel` as the validating, cleaning wrapper
      `packages/core/src/composition/kernel.ts`: `createKernel`
      Approach: `const disposers = options?.disposers ?? []; try { validateDisposers(disposers); return await buildKernel(config, options, disposers) } catch (err) { await releaseAfterFailedConstruction(disposers); throw err }`; the original error is always the rejection
      (Req: Failed construction releases registered disposers)
- [x] 2.5 Export the new core types
      `packages/core/src/composition/index.ts` and `packages/core/src/public.ts`: export `type KernelDisposer` next to `KernelOptions`; export `InvalidDisposerError` and `DisposerFailedError` where `RegistryConflictError` is exported
      Approach: type-only export for `KernelDisposer`; keep named exports only
      (Req: KernelOptions accepts named disposers)

## 3. Core: kernel builder

- [x] 3.1 Add `disposers` to the builder state
      `packages/core/src/composition/kernel-builder.ts`: `KernelBuilderState`, `cloneOptions`
      Approach: add `readonly disposers: KernelDisposer[]`; in `cloneOptions` set `disposers: [...(base?.disposers ?? [])]`
      (Req: Builder registers named disposers)
- [x] 3.2 Forward disposers in `toKernelOptions`
      `packages/core/src/composition/kernel-builder.ts`: `toKernelOptions`
      Approach: add `...(state.disposers.length > 0 ? { disposers: [...state.disposers] } : {})`
      (Req: Builder hands disposers to the kernel)
- [x] 3.3 Declare `registerDisposer` on the `KernelBuilder` interface
      `packages/core/src/composition/kernel-builder.ts`: `KernelBuilder`
      Approach: `registerDisposer(name: string, dispose: () => void | Promise<void>): this` with TSDoc listing `@throws {InvalidDisposerError}` and `@throws {RegistryConflictError}`
      (Req: Builder supports fluent registration methods)
- [x] 3.4 Implement `registerDisposer`
      `packages/core/src/composition/kernel-builder.ts`: builder object next to `registerCheck`
      Approach: empty name → `throw new InvalidDisposerError('name must be a non-empty string')`; existing name → `throw new RegistryConflictError('disposers', name)`; otherwise `options.disposers.push({ name, dispose })` and `return builder`
      (Req: Builder registers named disposers)
- [x] 3.5 Confirm `build()` needs no change
      `packages/core/src/composition/kernel-builder.ts`: `build()`
      Approach: it already returns `createKernel(config, toKernelOptions(options))`; add a TSDoc sentence that registered disposers belong to the kernel on success and are released by `createKernel` on failure; the builder never runs them
      (Req: Builder hands disposers to the kernel)

## 4. Core: tests

- [x] 4.1 Unit tests for `validateDisposers`
      `packages/core/test/composition/kernel-disposal.spec.ts` (new)
      Approach: empty name → `InvalidDisposerError`; non-function → `InvalidDisposerError`; duplicate → `RegistryConflictError` whose message names registry `disposers`
      (Req: KernelOptions accepts named disposers)
- [x] 4.2 Unit test: reverse order, each awaited
      `packages/core/test/composition/kernel-disposal.spec.ts`
      Approach: disposers a, b, c push to an array and await a tick; expect `['c','b','a']` and that `b` does not start before `c` resolves
      (Req: Kernel disposal; scenario: Disposers run in reverse registration order)
- [x] 4.3 Unit test: failing disposer is isolated
      `packages/core/test/composition/kernel-disposal.spec.ts`
      Approach: `b` rejects; expect all three ran, rejection is `AggregateError` with one `DisposerFailedError` (message `Disposer 'b' failed`, `cause` is the original)
      (Req: Kernel disposal; scenario: A failing disposer does not stop the others)
- [x] 4.4 Unit test: hanging disposer is abandoned
      `packages/core/test/composition/kernel-disposal.spec.ts` with `vi.useFakeTimers()`
      Approach: first disposer never settles, second is healthy; advance 5000 ms; expect `Logger.warn` called with the disposer name, the healthy disposer ran, and `runDisposers` resolved with no `AggregateError`
      (Req: Kernel disposal; scenario: A hanging disposer is abandoned after the timeout)
- [x] 4.5 Unit test: timeout timer does not keep the process alive
      `packages/core/test/composition/kernel-disposal.spec.ts`
      Approach: spy on `setTimeout`, assert the returned handle's `unref` was called and `clearTimeout` ran after a normal disposer
      (Req: Kernel disposal; scenario: The timeout does not keep the process alive)
- [x] 4.6 Unit test: empty list resolves
      `packages/core/test/composition/kernel-disposal.spec.ts`
      Approach: `await runDisposers([])` resolves without calling `Logger.warn`
      (Req: Kernel disposal; scenario: No disposers)
- [x] 4.7 Kernel test: replace the "no lifecycle" assertion
      `packages/core/test/composition/kernel.spec.ts`
      Approach: invert the existing "Kernel has no methods or lifecycle" test into "exposes dispose as its only lifecycle operation" (has `dispose` and `[Symbol.asyncDispose]`; no `initialize`/`shutdown`; no emitter); keep the immutability test
      (Req: Kernel is a plain object, not a class; scenarios: Kernel exposes dispose as its only lifecycle operation, Use cases are immutable after creation)
- [x] 4.8 Kernel test: alias and `await using`
      `packages/core/test/composition/kernel.spec.ts`
      Approach: assert `kernel[Symbol.asyncDispose] === kernel.dispose` and that `{ await using k = await createKernel(config, { disposers: [d] }) }` runs `d`
      (Req: Kernel disposal; scenario: Symbol.asyncDispose is an alias)
- [x] 4.9 Kernel test: shared promise
      `packages/core/test/composition/kernel.spec.ts`
      Approach: call `dispose()` twice concurrently and once after settle; expect identical promise references and a single disposer call
      (Req: Kernel disposal; scenario: Repeated and concurrent calls share one disposal)
- [x] 4.10 Kernel tests for option validation
      `packages/core/test/composition/kernel.spec.ts`
      Approach: ordered accept (`b` runs before `a`), empty name rejected, duplicate name rejected with `RegistryConflictError`
      (Req: KernelOptions accepts named disposers; scenarios: Disposers are accepted in order, Empty name is rejected, Duplicate name is rejected)
- [x] 4.11 Kernel tests for failed construction
      `packages/core/test/composition/kernel.spec.ts`
      Approach: force a construction failure (for example an unregistered storage adapter in the config); expect disposers ran in reverse order before the rejection; a rejecting disposer does not replace the original error and a warning is logged; with duplicate names plus a well-formed entry, the well-formed entry is released once
      (Req: Failed construction releases registered disposers; scenarios: Disposers run when construction fails, The original error is preserved, Conflicting entries still release well-formed ones)
- [x] 4.12 Builder tests for registration
      `packages/core/test/composition/kernel-builder.spec.ts`
      Approach: `registerDisposer` returns the builder; call order reaches the kernel options; empty name rejected; duplicate rejected with `RegistryConflictError` and first registration kept
      (Req: Builder registers named disposers, Builder supports fluent registration methods)
- [x] 4.13 Builder tests for ownership on build
      `packages/core/test/composition/kernel-builder.spec.ts`
      Approach: successful `build()` then `kernel.dispose()` runs the disposer once and the builder did not run it; failing `build()` releases in reverse order; builder-built and options-built kernels dispose in the same order
      (Req: Builder hands disposers to the kernel)
- [x] 4.14 Fix hand-built kernel fixtures in core tests
      `packages/core/test`: the one `as Kernel` fixture found by `grep -rn "as Kernel" packages/core/test`
      Approach: add `dispose` and `[Symbol.asyncDispose]` stubs so the suite typechecks
      (Req: Kernel disposal)

## 5. SDK

- [x] 5.1 Make `SdkHostContext` async-disposable
      `packages/sdk/src/composition/host-context.ts`: `SdkHostContext`
      Approach: `export interface SdkHostContext extends AsyncDisposable { readonly kernel; readonly createGraphProvider; readonly dispose: () => Promise<void> }` with TSDoc stating that `dispose` delegates to the kernel and does not close graph providers
      (Req: SdkHostContext shape, Host disposal)
- [x] 5.2 Return the disposal members from `createSdkContext`
      `packages/sdk/src/composition/host-context.ts`: `createSdkContext`
      Approach: `const dispose = (): Promise<void> => kernel.dispose()`; return `{ kernel, createGraphProvider: () => createCodeGraphProvider(config, options?.graph), dispose, [Symbol.asyncDispose]: dispose }`
      (Req: createSdkContext, Host disposal)
- [x] 5.3 Confirm `openSpecdHost` carries the members
      `packages/sdk/src/composition/host-context.ts`: `openSpecdHost`
      Approach: it already spreads the context; keep the body and add a unit test (task 7.4) proving the symbol-keyed property survives the spread
      (Req: Host disposal)
- [x] 5.4 Update the host-context TSDoc and exports check
      `packages/sdk/src/composition/index.ts` and `packages/sdk/src/index.ts`
      Approach: `SdkHostContext` stays exported; do NOT export `KernelDisposer` from the SDK
      (Req: Host disposal)

## 6. SDK: tests

- [x] 6.1 Update `SdkHostContext` literals in SDK tests
      `packages/sdk/test` (12 references: `composition/host-context.spec.ts`, `composition/with-open-graph-provider.spec.ts`, `orchestration/*.spec.ts`)
      Approach: add `dispose: vi.fn(async () => {})` and `[Symbol.asyncDispose]: vi.fn(async () => {})` to each literal
      (Req: SdkHostContext shape)
- [x] 6.2 Test the context shape
      `packages/sdk/test/composition/host-context.spec.ts`
      Approach: assert `kernel`, `createGraphProvider`, `dispose`, `[Symbol.asyncDispose]` exist and there is no top-level `config`; assert `await using ctx = await createSdkContext(config)` compiles and calls the asyncDispose member on scope exit
      (Req: SdkHostContext shape; scenarios: Context exposes kernel, provider factory and disposal only, Context is async-disposable)
- [x] 6.3 Test `createSdkContext` delegation
      `packages/sdk/test/composition/host-context.spec.ts`
      Approach: keep the three existing scenarios; add: `context.dispose` calls `kernel.dispose()` and `context[Symbol.asyncDispose] === context.dispose`
      (Req: createSdkContext; scenario: Context disposal delegates to the kernel)
- [x] 6.4 Test host disposal through `openSpecdHost`
      `packages/sdk/test/composition/host-context.spec.ts`
      Approach: two `host.dispose()` calls return the kernel's promise and each registered disposer ran once; `await using host = await openSpecdHost(input)` releases at scope exit; the result has `dispose` and `[Symbol.asyncDispose]`
      (Req: Host disposal; scenarios: dispose shares the kernel disposal, await using releases the host, openSpecdHost result carries disposal members)
- [x] 6.5 Test graph providers are not closed and no foreign-kernel API exists
      `packages/sdk/test/composition/host-context.spec.ts`
      Approach: a provider from `createGraphProvider()` has `close` spied and not called after `host.dispose()`; assert the SDK barrel exports no function that builds an `SdkHostContext` around an external kernel
      (Req: Host disposal; scenarios: Graph providers are not closed by dispose, No API wraps a foreign kernel)

## 7. CLI: exit and cleanup primitives

- [x] 7.1 Add `CliExitError`
      `packages/cli/src/helpers/cli-exit-error.ts` (new)
      Approach: `class CliExitError extends SpecdCliError { readonly exitCode: number }` with `get code(): 'CLI_EXIT'` and message `CLI exit ${exitCode}`; TSDoc explains it is a control-flow signal that `handleError` rethrows before classification
      (Req: Cleanup runs before the process exits)
- [x] 7.2 Add the cleanup registry
      `packages/cli/src/helpers/cli-cleanup.ts` (new)
      Approach: `registerCliCleanup(fn)`, `runCliCleanup()` (memoized promise, reverse order, sequential, each wrapped in `try/catch` writing `warning: cleanup failed: <message>` to stderr, one line per inner error of an `AggregateError`), `resetCliCleanupForTests()`; a cleanup registered after the run started is invoked immediately
      (Req: CLI cleanup registry)
- [x] 7.3 Add `openCliHost`
      `packages/cli/src/helpers/cli-host.ts` (new)
      Approach: two overloads (`OpenSpecdHostInput` → `OpenSpecdHostResult`; `{ config, options? }` → `SdkHostContext`), discriminate on `'config' in input`, call `openSpecdHost` or `createSdkContext`, then `registerCliCleanup(() => host.dispose())` before returning; kernel options are supplied by callers (no import of `cli-context.ts`, avoids a cycle)
      (Req: CLI host-opening helper)
- [x] 7.4 Add the signal handlers
      `packages/cli/src/helpers/cli-signals.ts` (new)
      Approach: `installCliSignalHandlers(): () => void` registering `process.on('SIGINT')` → 130 and `process.on('SIGTERM')` → 143; first signal `void runCliCleanup().finally(() => process.exit(code))`; second signal `process.exit(code)` immediately; returns a remover; never installs anything at import time
      (Req: Signal handling)
- [x] 7.5 Add `run()`
      `packages/cli/src/run.ts` (new)
      Approach: install signals; `try { await createProgram().parseAsync([...argv]) } catch (err) { exitCode = toExitCode(err) }`; `await runCliCleanup()`; remove signals; `if (exitCode !== undefined) process.exit(exitCode)`; `toExitCode` returns `CliExitError.exitCode`, otherwise runs `handleError(err)` inside a `try/catch` that extracts the `CliExitError` code (3 for unexpected errors); natural completion does not call `process.exit`
      (Req: Cleanup runs before the process exits)
- [x] 7.6 Switch `index.ts` to `run()`
      `packages/cli/src/index.ts`
      Approach: keep the shebang and `export { createProgram } from './program.js'`; replace the `program.parseAsync(...).catch(handleError)` block with `void run(process.argv)`
      (Req: Cleanup runs before the process exits)

## 8. CLI: error helpers and exit sites

- [x] 8.1 Make `cliError` throw
      `packages/cli/src/handle-error.ts`: `cliError`
      Approach: keep signature and `never`; after writing output replace `process.exit(exitCode)` with `throw new CliExitError(exitCode)`
      (Req: Cleanup runs before the process exits)
- [x] 8.2 Make `handleError` rethrow and throw
      `packages/cli/src/handle-error.ts`: `handleError`
      Approach: first statement `if (err instanceof CliExitError) throw err`; replace both `process.exit(3)` with `throw new CliExitError(3)`; keep return type `never`
      (Req: Cleanup runs before the process exits)
- [x] 8.3 Convert exit sites in change commands
      `packages/cli/src/commands/change/archive.ts` (181, 193), `run-hooks.ts` (235), `transition.ts` (416, 434), `create.ts` (74)
      Approach: replace each `process.exit(n)` with `throw new CliExitError(n)` keeping the same code and the preceding output
      (Req: Cleanup runs before the process exits)
- [x] 8.4 Convert exit sites in plugin commands
      `packages/cli/src/commands/plugins/install.ts` (137), `uninstall.ts` (70), `update.ts` (120)
      Approach: same replacement with code 1
      (Req: Cleanup runs before the process exits)
- [x] 8.5 Convert exit sites in graph, schema and project update
      `packages/cli/src/commands/graph/index-graph.ts` (137, code 0), `commands/schema/validate.ts` (120, code 1), `commands/project/update.ts` (64, code 1)
      Approach: same replacement; code 0 is a valid `CliExitError` code
      (Req: Cleanup runs before the process exits)
- [x] 8.6 Convert exit sites in `project init`
      `packages/cli/src/commands/project/init.ts` (125 → 1, 181 → 0, 194 → 0, 204 → 0, 214 → 0, 225 → 0, 265 → 1)
      Approach: same replacement; check that each site is not followed by code that assumed the process already ended
      (Req: Cleanup runs before the process exits)
- [x] 8.7 Replace the mocked-exit sentinel check in `spec optimizations`
      `packages/cli/src/commands/spec/optimizations.ts`: `isProcessExitError`
      Approach: replace the regex on `process.exit(N)` with `error instanceof CliExitError`; the enclosing `catch` rethrows it unchanged
      (Req: Cleanup runs before the process exits; scenario: Commands do not swallow CliExitError)
- [x] 8.8 Audit generic `catch` blocks
      `packages/cli/src`: every `catch` in the files touched by tasks 8.3–8.7 and any command that wraps `cliError`
      Approach: `grep -rn "catch" packages/cli/src/commands` filtered to those files; each block must call `handleError(err, …)` (which rethrows `CliExitError`) or rethrow `CliExitError` explicitly; fix any that swallow it
      (Req: Cleanup runs before the process exits; scenario: Commands do not swallow CliExitError)

## 9. CLI: host call sites

- [x] 9.1 Extend `CliContext`
      `packages/cli/src/helpers/cli-context-types.ts`: `CliContext`
      Approach: `export interface CliContext extends SdkHostContext { readonly config: SpecdConfig; readonly configFilePath: string | null }`
      (Req: CliContext exposes dispose)
- [x] 9.2 Route `resolveCliContext` through the helper
      `packages/cli/src/helpers/cli-context.ts`: `resolveCliContext`
      Approach: call `openCliHost({ ...(configPath ? { configPath } : {}), options: { kernel: buildCliKernelOptions({ onLog }) } })`; keep the warning emission once per call; return the host unchanged as `CliContext`
      (Req: resolveCliContext delegates to openSpecdHost)
- [x] 9.3 Use the helper in `project status`
      `packages/cli/src/commands/project/status.ts`
      Approach: replace `openSpecdHost({...})` with `openCliHost({...})` (same arguments)
      (Req: Host bootstrap entry point)
- [x] 9.4 Use the helper in `project dashboard`
      `packages/cli/src/commands/project/dashboard.ts` (two call sites, ~157 and ~205)
      Approach: replace both `openSpecdHost({...})` with `openCliHost({...})`
      (Req: Host bootstrap entry point)
- [x] 9.5 Remove the hand-built host in `withProvider`
      `packages/cli/src/commands/graph/with-provider.ts`: `withProvider`
      Approach: drop the `kernel?: Kernel | null` option, keep `host?: SdkHostContext`; when `host` is absent call `openCliHost({ config, options: { kernel: buildCliKernelOptions() } })`; delete the `{ kernel, createGraphProvider }` literal
      (Req: CLI host-opening helper)
- [x] 9.6 Update `withProvider` callers
      `packages/cli/src/commands/graph/resolve-graph-cli-context.ts` and the graph commands (`hotspots`, `impact`, `index-graph`, `search`, `stats`)
      Approach: pass the `CliContext` as `host` where they passed `kernel`; keep bootstrap mode (no config) unchanged
      (Req: CLI host-opening helper)
- [x] 9.7 Delete `resolveSdkHostContext`
      `packages/cli/src/helpers/sdk-host.ts`: file removed; callers `commands/change/implementation.ts:178` and `commands/change/status.ts:208`
      Approach: pass the `CliContext` they already hold to `enrichImplementationTracking` and the implementation helpers (`SdkHostContext` parameter)
      (Req: CLI host-opening helper; scenario: No hand-built host context)
- [x] 9.8 Dispose the host in the graph worker
      `packages/cli/src/graph-index-task.ts`: `runGraphIndexTask`
      Approach: keep `openSpecdHost`/`createSdkContext` direct; wrap `runIndexProjectGraph(host, …)` in `try { return await … } finally { await host.dispose() }`
      (Req: Graph index worker releases its host)

## 10. CLI: tests

- [x] 10.1 Extend the shared test helpers
      `packages/cli/test/commands/helpers.ts`
      Approach: add `dispose`/`[Symbol.asyncDispose]` to `makeMockKernel` and `MockKernel`; add `makeMockHost(overrides?)` returning a complete `CliContext`; add `runCommand(program, argv)` that awaits `parseAsync`, catches `CliExitError` and calls the mocked `process.exit(code)`
      (Req: CliContext exposes dispose, Cleanup runs before the process exits)
- [x] 10.2 Test the cleanup registry
      `packages/cli/test/helpers/cli-cleanup.spec.ts` (new)
      Approach: reverse order; two concurrent calls share one promise; a failing cleanup writes a `warning:` line, does not stop the others and does not throw or change `process.exitCode`
      (Req: CLI cleanup registry; scenarios: Cleanups run in reverse order, Idempotent and concurrent, A failing cleanup does not stop the others or the exit code)
- [x] 10.3 Test `openCliHost`
      `packages/cli/test/helpers/cli-host.spec.ts` (new)
      Approach: mock `@specd/sdk`; after `openCliHost`, `runCliCleanup()` calls `host.dispose`; the `{ config }` form goes through `createSdkContext` and registers too
      (Req: CLI host-opening helper; scenarios: Helper registers the host for cleanup, Helper covers both bootstrap forms)
- [x] 10.4 Update `resolveCliContext` tests
      `packages/cli/test/helpers/cli-context.spec.ts`
      Approach: keep verbosity, warning and onLog scenarios; assert the helper path returns `config`, `configFilePath`, `kernel`, `createGraphProvider`, `dispose`; calling `dispose` twice releases once; a command that never calls `dispose` has the host released by `runCliCleanup()`
      (Req: resolveCliContext delegates to openSpecdHost, CliContext exposes dispose; scenarios: Host bootstrap uses SDK through the helper, CliContext carries dispose, Commands do not need to call dispose)
- [x] 10.5 Add source-scan tests for host bootstrap
      `packages/cli/test/helpers/cli-context.spec.ts`
      Approach: read `packages/cli/src/**/*.ts` (excluding `graph-index-task.ts`, `helpers/cli-host.ts`), assert no `openSpecdHost(` / `createSdkContext(` calls, no object literal pairing `kernel` with `createGraphProvider`, and that `helpers/sdk-host.ts` does not exist
      (Req: Host bootstrap entry point, CLI host-opening helper; scenarios: No direct SDK bootstrap in commands, No hand-built host context, Commands use resolveCliContext or the helper)
- [x] 10.6 Test the graph worker
      `packages/cli/test/graph-index-task.spec.ts`
      Approach: assert `host.dispose` is called after a successful run and after `runIndexProjectGraph` rejects
      (Req: Graph index worker releases its host; scenarios: Worker disposes on success, Worker disposes on failure)
- [x] 10.7 Test `run()`
      `packages/cli/test/run.spec.ts` (new)
      Approach: mock `createProgram` and spy `process.exit`; cases: normal completion (cleanup awaited, no `process.exit`), `CliExitError(1)` (cleanup then `process.exit(1)`), unexpected error (`fatal:` on stderr, exit 3, cleanup awaited), `process.exitCode = 1` respected on natural completion, source scan that `process.exit(` appears only in `run.ts` and `helpers/cli-signals.ts`
      (Req: Cleanup runs before the process exits; scenarios: Cleanup runs after normal completion, Cleanup runs before an error exit, Unhandled errors still clean up, process.exitCode is respected, Only the entrypoint terminates the process)
- [x] 10.8 Test the signal handlers
      `packages/cli/test/helpers/cli-signals.spec.ts` (new)
      Approach: `process.emit('SIGINT')` runs cleanup then exits 130; `SIGTERM` exits 143; a second signal during cleanup exits immediately; `createProgram()` leaves `process.listenerCount('SIGINT')` unchanged; installing handlers does not remove pre-existing listeners
      (Req: Signal handling; scenarios: First SIGINT runs cleanup, Second signal forces exit, createProgram installs no handlers, Prompts keep their own cancellation, Interrupted by SIGINT, Terminated by SIGTERM)
- [x] 10.9 Update `handleError` tests
      `packages/cli/test/handle-error.spec.ts`
      Approach: replace every `expect(process.exit).toHaveBeenCalledWith(n)` with an assertion that a `CliExitError` with `exitCode: n` is thrown; add: `cliError` writes output and throws without calling `process.exit`; `handleError(new CliExitError(1))` rethrows it and writes nothing
      (Req: Cleanup runs before the process exits; scenario: Helpers throw CliExitError instead of exiting)
- [x] 10.10 Test that commands do not swallow `CliExitError`
      `packages/cli/test/commands/exit-propagation.spec.ts` (new)
      Approach: for the commands that wrap `cliError` in a generic `try/catch`, run them through `runCommand` with a failing precondition and assert the `CliExitError` reaches the entrypoint with the expected code
      (Req: Cleanup runs before the process exits; scenario: Commands do not swallow CliExitError)
- [x] 10.11 Migrate the `process.exit` mocking tests
      the 54 files under `packages/cli/test` that use `mockProcessExit` / spy on `process.exit`
      Approach: route `program.parseAsync(...)` through `runCommand` and keep asserting `process.exit` calls, or assert `CliExitError` where an action is called directly; update mocked `resolveCliContext` return values to `makeMockHost()`; list the files with `grep -rln "process.exit\|spyOn(process" packages/cli/test` and work through them
      (Req: Cleanup runs before the process exits)
- [x] 10.12 Add the grep guard for exits
      `packages/cli/test/run.spec.ts` (same source scan as 10.7) or a lint rule
      Approach: fail if `process.exit(` appears in `packages/cli/src` outside `run.ts` and `helpers/cli-signals.ts`
      (Req: Cleanup runs before the process exits; scenario: Only the entrypoint terminates the process)

## 11. Toolchain, manifests and docs

- [x] 11.1 Add `ESNext.Disposable` to the base lib
      `tsconfig.base.json`: `compilerOptions.lib`
      Approach: `"lib": ["ES2022", "ESNext.Disposable"]`; run `pnpm typecheck` to confirm every package still compiles
      (Req: Kernel disposal, Host disposal)
- [x] 11.2 Declare `engines.node` in the three modified packages
      `packages/core/package.json`, `packages/sdk/package.json`, `packages/cli/package.json`
      Approach: add `"engines": { "node": ">=22" }`
      (Req: Node.js engine floor)
- [x] 11.3 Declare `engines.node` in the other published packages
      `packages/code-graph`, `guide`, `mcp`, `plugin-agent-claude`, `plugin-agent-codex`, `plugin-agent-copilot`, `plugin-agent-opencode`, `plugin-agent-standard`, `plugin-manager`, `schema-std`, `skills`, `specd` `/package.json`
      Approach: same `"engines": { "node": ">=22" }` value in all 12; leave `apps/public-web` (private) untouched
      (Req: Node.js engine floor)
- [x] 11.4 Add the engines check script
      `dev/scripts/check-engines.js` (new)
      Approach: read `packages/*/package.json` and `apps/*/package.json`; for each with `"private": false` assert `engines.node === '>=22'` and equality across them; read `node-version` from `.github/workflows/ci.yml` and assert it satisfies `>=22`; print offenders and exit 1
      (Req: Node.js engine floor; scenarios: Published packages declare the floor, One common value, Floor matches CI, Private packages may omit it)
- [x] 11.5 Wire the script into preflight
      root `package.json` (`preflight:check`) and `dev/scripts/preflight-check.js`
      Approach: run `node dev/scripts/check-engines.js` as part of `preflight:check`
      (Req: Node.js engine floor)
- [x] 11.6 Update README and ADR 0003
      `README.md:226` and `docs/adr/0003-esm-only.md`
      Approach: README "Node.js >= 20" → "Node.js >= 22"; add a short dated note in ADR 0003 that the supported floor is now Node.js >= 22 without rewriting its history
      (Req: Node.js engine floor)
- [x] 11.7 Add the ADR for host lifecycle
      `docs/adr/` (next free number after 0030; check with `ls docs/adr`)
      Approach: MADR format; decision: named opaque disposers in core, release on failed construction, `CliExitError` and a single exit point, Node floor 22; rejected alternatives from the design
      (Req: Kernel disposal, Cleanup runs before the process exits, Node.js engine floor)
- [x] 11.8 Update core docs
      `docs/core/overview.md` and `docs/core/errors.md`
      Approach: overview: `dispose()`, `[Symbol.asyncDispose]`, `KernelOptions.disposers`, `KernelBuilder.registerDisposer`; errors: `InvalidDisposerError` (`INVALID_DISPOSER`) and `DisposerFailedError` (`DISPOSER_FAILED`)
      (Req: Kernel disposal, KernelOptions accepts named disposers, Builder registers named disposers)
- [x] 11.9 Update SDK and CLI docs
      `docs/sdk/index.md` and `docs/cli/cli-reference.md`
      Approach: SDK: `SdkHostContext.dispose`, `await using host = await openSpecdHost()`, graph providers are closed by their creator; CLI: exit codes 130 and 143 and that Ctrl-C triggers cleanup
      (Req: Host disposal, Signal handling)
- [x] 11.10 Add the changeset pair
      `.changeset/20261027-host-lifecycle-dispose.md` and `.changeset/20261027-host-lifecycle-dispose-specd.md`
      Approach: follow the existing pair convention (package file lists `@specd/core`, `@specd/sdk`, `@specd/cli` plus the 12 packages that only gain `engines`; `-specd` file for `@specd/specd`); body lists the specs affected (`core:kernel`, `core:kernel-builder`, `sdk:host-context`, `cli:host-context`, `cli:entrypoint`, `default:_global/conventions`) and states the new Node floor and the breaking shape change of `Kernel` and `SdkHostContext`
      (Req: Node.js engine floor)

## 12. Verification

- [x] 12.1 Build, typecheck and test
      repo root
      Approach: `pnpm build && pnpm typecheck && pnpm test` all green; `pnpm lint` clean
      (Req: all)
- [x] 12.2 Manual: normal run leaves no cleanup warning
      `node packages/cli/dist/index.js project status --format text`
      Approach: expect exit 0 and no `warning: cleanup failed`
      (Req: CLI cleanup registry)
- [x] 12.3 Manual: error exit prints once with code 1
      `node packages/cli/dist/index.js changes status does-not-exist`
      Approach: `error:` appears exactly once and `echo $?` prints 1
      (Req: Cleanup runs before the process exits)
- [x] 12.4 Manual: Ctrl-C and SIGTERM
      a long command such as `node packages/cli/dist/index.js graph index`
      Approach: Ctrl-C → exit 130 and no stale lock; two quick Ctrl-C → immediate exit; `kill -TERM <pid>` → exit 143 (POSIX only)
      (Req: Signal handling)
- [x] 12.5 Manual: SDK `await using`
      a scratch script using `openSpecdHost` and a registered test disposer
      Approach: the disposer logs once at scope exit; a second `host.dispose()` is a no-op
      (Req: Host disposal)
- [x] 12.6 Manual: engines script
      `node dev/scripts/check-engines.js`
      Approach: exits 0; temporarily remove one `engines` field → exits 1 naming that package; restore it
      (Req: Node.js engine floor)

## 13. Review follow-ups (verification audit)

- [x] 13.1 Harden `toExitCode` so `run()` never rejects
      `packages/cli/src/run.ts`: `toExitCode`
      Approach: in the `catch (inner)` branch return `inner.exitCode` for a `CliExitError` and `3` for anything else instead of rethrowing, so a failing error handler still reaches `runCliCleanup()` and `process.exit(3)`; update the TSDoc (drop the `@throws` that no longer applies)
      (Req: Cleanup runs before the process exits; scenario: A failing error handler still cleans up and exits 3)
- [x] 13.2 Test the failing-error-handler path
      `packages/cli/test/run.spec.ts`
      Approach: mock `handleError` (via `vi.spyOn` on the module or `vi.mock`) to throw a plain `Error`; `parseAsync` rejects with an unexpected error; expect cleanup ran, `process.exit` called with 3 and `run()` resolved without rejecting
      (Req: Cleanup runs before the process exits; scenario: A failing error handler still cleans up and exits 3)
- [x] 13.3 Name the helper tests after the new verify scenarios
      `packages/cli/test/helpers/cli-host.spec.ts`
      Approach: rename the existing forwarding and failed-open tests to "Helper forwards the caller input unchanged" and "A failed open registers nothing" (the assertions already exist: `openSpecdHost` / `createSdkContext` called with the exact input; no cleanup registered when opening rejects)
      (Req: CLI host-opening helper; scenarios: Helper forwards the caller input unchanged, A failed open registers nothing)
- [x] 13.4 Re-run build, typecheck, lint and tests
      repo root
      Approach: `pnpm build && pnpm typecheck && pnpm lint && pnpm test`, all green; refresh tracking for `run.ts` and the two test files
      (Req: all)

## 14. Review follow-ups: coverage gaps (verification audit F3, F5)

- [x] 14.1 Assert the exit code of the successful and failed `graph index` paths
      `packages/cli/test/commands/graph-index.spec.ts`
      Approach: add "ends a successful run with exit code 0 and reports no error" (`process.exit` called once with 0, empty stderr) and "ends a failed run with exit code 3 and one error message"; reintroducing the old `throw new CliExitError(0)`-inside-`try` defect makes the first one fail (mutation-checked)
      (Req: Cleanup runs before the process exits; scenario: Commands do not swallow CliExitError)
- [x] 14.2 Test SIGINT/SIGTERM end to end in a real process
      `packages/cli/test/fixtures/signal-child.ts` (new) and `packages/cli/test/helpers/cli-signals-process.spec.ts` (new)
      Approach: spawn the fixture with `node --import tsx`; send `SIGINT` → exit 130 after cleanup ran; `SIGTERM` → 143; with a hanging cleanup a second signal exits immediately with 143; POSIX only (skipped on win32)
      (Req: Signal handling; scenarios: First SIGINT runs cleanup, Second signal forces exit, Interrupted by SIGINT, Terminated by SIGTERM)
- [x] 14.3 Unit-test the engines check
      `dev/scripts/check-engines.js` and `packages/cli/test/dev/check-engines.spec.ts` (new)
      Approach: let the script read `SPECD_REPO_ROOT` (default: the real repo root); fixtures cover pass, missing engines, disagreeing floors, CI Node below the floor, private package omitting engines, and the real repository
      (Req: Node.js engine floor; scenarios: Published packages declare the floor, One common value, Floor matches CI, Private packages may omit it)
- [x] 14.4 Refresh the stale LLM-optimized context warned by `changes context`
      specs `core:get-status` and `core:change` (outside this change's scope)
      Approach: run the `specd-spec-context-optimizer` agent for each spec, as the shared skill context requires; no spec content changes
      (Req: none; process directive)

## 15. Review follow-ups: second verification audit (spec wording, exit grace period, test gaps)

- [x] 15.1 Exit grace period in `run.ts`
      `packages/cli/src/run.ts`
      Approach: export `CLI_EXIT_HINT_MS = 1000` and `CLI_EXIT_FORCE_MS = 5000`; on natural completion arm two `unref`'d timers after `runCliCleanup()`: at 1 s write `warning: waiting for open handles to close (<types from process.getActiveResourcesInfo?.()>); forcing exit in 4 s` to stderr, at 5 s write `warning: process did not exit after cleanup; forcing exit` and `process.exit(process.exitCode ?? 0)`; never change the exit code
      (Req: Process exit grace period)
- [x] 15.2 Test the exit grace period with fake timers
      `packages/cli/test/run.spec.ts`
      Approach: clean exit prints nothing and the timers are `unref`'d; hint after 1000 ms; forced exit after 5000 ms with the original exit code (0 and a non-zero `process.exitCode`)
      (Req: Process exit grace period; scenarios: Clean exit prints nothing, Waiting hint after 1 second, Exit forced after 5 seconds, Grace timers do not keep the process alive)
- [x] 15.3 Second signal keeps the first signal's exit code
      `packages/cli/src/helpers/cli-signals.ts`, `packages/cli/test/helpers/cli-signals.spec.ts` (and the process-level spec)
      Approach: remember the first signal's code and use it for the immediate exit on a second signal; add SIGINT-then-SIGTERM (130) and SIGTERM-then-SIGINT (143) cases; assert the SIGTERM handler is installed regardless of `process.platform` (stub `win32`)
      (Req: Signal handling; scenarios: Second signal forces exit, A different second signal keeps the first exit code, SIGTERM handler is installed on every platform)
- [x] 15.4 `registerCliCleanup` after cleanup started
      `packages/cli/test/helpers/cli-cleanup.spec.ts`
      Approach: after `runCliCleanup()` starts, `registerCliCleanup(fn)` invokes `fn` immediately; a failing `fn` writes a `warning:` line and does not change `process.exitCode`
      (Req: CLI cleanup registry; scenario: Cleanup registered after cleanup started runs immediately)
- [x] 15.5 End-to-end release through `run()`
      `packages/cli/test/run.spec.ts`
      Approach: a command that opens a host via the helper and never calls `dispose`; after `run()` settles the host's `dispose` was called once
      (Req: CliContext exposes dispose; scenario: Commands do not need to call dispose)
- [x] 15.6 Core disposal test gaps
      `packages/core/test/composition/kernel.spec.ts`, `kernel-builder.spec.ts`
      Approach: through `createKernel`: non-callable `dispose` → `InvalidDisposerError` with no disposer run; `DisposerFailedError` instances with `cause` in the `AggregateError`; hanging disposer abandoned after 5000 ms through `kernel.dispose()` (fake timers) with a warning via the ambient `Logger`; second `dispose()` after a rejected disposal returns the same rejected promise; builder `registerDisposer('x', undefined)` → `InvalidDisposerError`; builder options carry disposers in call order
      (Req: Kernel disposal, KernelOptions accepts named disposers, Builder registers named disposers; scenarios: Non-callable dispose is rejected, A failing disposer does not stop the others, A hanging disposer is abandoned after the timeout, A rejected disposal stays rejected on later calls, Disposers reach the kernel options in call order)
- [x] 15.7 SDK and CLI package test gaps
      `packages/sdk/test/composition/host-context.spec.ts`, `packages/cli/test/package-deps.spec.ts` (or the existing dependency guard)
      Approach: `openSpecdHost({ configPath, allowBootstrapFallback: true })` with an unloadable path propagates the config error and builds no fallback; the host context type exposes no `initProject` / `addPlugin` / `removePlugin`; `packages/cli/package.json` lists `@specd/sdk` and neither `@specd/core` nor `@specd/code-graph` under dependencies
      (Req: openSpecdHost, Config mutation boundary, CLI package runtime dependencies; scenarios: Explicit configuration never falls back, Host context has no write methods, package.json declares SDK as specd platform dependency)
- [x] 15.8 Prompt cancellation next to signal handlers and `cliError` contract
      `packages/cli/test/helpers/cli-signals.spec.ts`, `packages/cli/test/run.spec.ts`
      Approach: with the handlers installed, a prompt-style raw Ctrl-C key event is not consumed by them; `cliError` throws `CliExitError` and `process.exit` is not called
      (Req: Signal handling, Cleanup runs before the process exits; scenarios: Prompts keep their own cancellation, Helpers throw CliExitError instead of exiting)
- [x] 15.9 Re-run build, typecheck, lint and tests; refresh implementation tracking
      repo root
      Approach: `pnpm build && pnpm typecheck && pnpm lint && pnpm test`, all green; refresh tracking for the touched files
      (Req: all)

## 16. Review follow-ups: optional test gaps from the second verification audit

- [x] 16.1 Reject a non-string disposer name in the builder
      `packages/core/src/composition/kernel-builder.ts`, `packages/core/test/composition/kernel-builder.spec.ts`
      Approach: `registerDisposer` throws `InvalidDisposerError` when `typeof name !== 'string'` as well as for the empty string; test with a numeric name
      (Req: Builder registers named disposers; scenario: Empty name is rejected)
- [x] 16.2 Assert `dispose()` never throws synchronously
      `packages/core/test/composition/kernel.spec.ts`
      Approach: a disposer that throws synchronously; `kernel.dispose()` returns a promise without throwing and rejects with an `AggregateError`
      (Req: Kernel disposal)
- [x] 16.3 Assert the resource types listed by the exit hint
      `packages/cli/test/run.spec.ts`
      Approach: mock `process.getActiveResourcesInfo` to return duplicates; the hint line lists each distinct type once
      (Req: Process exit grace period; scenario: Waiting hint after 1 second)
- [x] 16.4 Exercise the exit grace period in a real process
      `packages/cli/test/fixtures/run-child.ts` (new), `packages/cli/test/run-process.spec.ts` (new)
      Approach: spawn the fixture running the real `guide` command; `clean` ends by itself with exit code 0 and no warning; `leak` (a cleanup leaves a ref'd interval) prints the 1 s hint naming `Timeout`, then the 5 s forced-exit warning and ends with code 0 after at least 5 s
      (Req: Process exit grace period; scenarios: Clean exit prints nothing, Waiting hint after 1 second, Exit forced after 5 seconds)
