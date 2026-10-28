# Proposal: host-lifecycle-dispose

## Motivation

Hosts open a `Kernel` (through `@specd/sdk`) but have no way to close it. Upcoming runtime plugins (check plugins loaded from `specd.yaml`) will own resources — connections, child processes, on-disk caches — that must be released when the host stops. Without a lifecycle in the base, every host would improvise its own cleanup. This change adds that base now, independent of plugins, so the plugin work can build on it.

## Current behaviour

- `Kernel` (`core:kernel`, `createKernel` in `packages/core/src/composition/kernel.ts`) is an immutable facade with no close or dispose operation.
- `KernelBuilder` (`core:kernel-builder`) accumulates additive registrations and `build()` is defined as equivalent to `createKernel(config, options)`; neither has a place to register cleanup work.
- `SdkHostContext` (`sdk:host-context`, `packages/sdk/src/composition/host-context.ts`) is `{ kernel, createGraphProvider }`, `readonly`, with no close operation. `createGraphProvider()` returns a fresh `CodeGraphProvider` per call and the host does not track them.
- `resolveCliContext` (`packages/cli/src/helpers/cli-context.ts`) calls `openSpecdHost` and returns only `{ config, configFilePath, kernel }`: the host object is discarded, so the CLI could not close it even if it had a close operation.
- `SpecdPlugin.destroy()` exists in `plugin-manager`, but nothing in `packages/*/src` calls it.
- The CLI installs no `SIGINT`/`SIGTERM` handlers (no `process.on` in `packages/cli/src`). Commands call `process.exit()` directly (`handle-error.ts`, `commands/change/archive.ts`), and 61 files obtain a context through `resolveCliContext`, so a per-command `finally` would both miss early exits and require touching every command.
- `tsconfig.base.json` has `target: ES2022` and `lib: ["ES2022"]`, so `using` / `await using` and `Symbol.asyncDispose` types are not available.
- No package declares `engines`; CI only runs Node 22.
- Hosts are opened in more places than `resolveCliContext`: `commands/project/status.ts`, `commands/project/dashboard.ts` (two call sites) and `graph-index-task.ts` call `openSpecdHost` directly, `commands/graph/with-provider.ts` calls `createSdkContext`, and `helpers/sdk-host.ts` (`resolveSdkHostContext`) builds an `SdkHostContext` object literal `{ kernel, createGraphProvider }` around a kernel it does not own. `graph-index-task.ts` is a separate worker entry (`tsup src/index.ts src/graph-index-task.ts`) with its own process.
- `cliError` (`packages/cli/src/handle-error.ts`) is typed `never` and ends with a synchronous `process.exit(exitCode)`; there are 24 `process.exit(` calls and 184 `cliError(`/`handleError(` uses in `packages/cli/src`. An async cleanup cannot be awaited inside them.
- The kernel's logger writes through `pino.destination({ dest, sync: true })` or `pino.destination(1)` (`packages/core/src/infrastructure/logging/pino-logger.ts`), so the kernel owns no asynchronous resource today and `kernel.dispose()` has nothing to flush on its own.
- `CodeGraphProvider` already has `close()`, and the SDK already has the scoped helper `withOpenGraphProvider` (`packages/sdk/src/composition/with-open-graph-provider.ts`) that closes it in `finally`.
- Test fixtures build `SdkHostContext` literals by hand (`createGraphProvider: vi.fn()` in 10+ places across `packages/cli/test`), and 66 CLI test files reference `resolveCliContext` / `CliContext`.
- `core:kernel` describes the kernel as immutable after construction; a disposed flag is internal mutable state and the wording must be reconciled.

## Proposed solution

1. **Generic disposer list in core.** `KernelOptions` gains an additive disposer registration, and `KernelBuilder` gains `registerDisposer(name, fn)` that feeds it (keeping `build()` equivalent to `createKernel`). Core knows nothing about plugins: a disposer is a named opaque async function. The owner of a resource registers one disposer that encapsulates its own cleanup rules; plugin knowledge stays in `plugin-manager`.
2. **Kernel closes.** `Kernel` gains an idempotent `dispose()` and a `[Symbol.asyncDispose]` alias. It runs the registered disposers in reverse registration order, isolates failures so one does not stop the others, aggregates errors, and bounds the wait for a hanging disposer.
3. **Failed construction cleans up.** If `build()` / `createKernel` fails after disposers were registered, they are run (reverse order) before the error propagates, so a half-started host leaks nothing.
4. **SDK.** `SdkHostContext` gains `dispose()` and `[Symbol.asyncDispose]` (so `await using host = await openSpecdHost()` works); it delegates to `kernel.dispose()`. Disposers are registered on the builder by whoever composes the host.
5. **CLI.** Keep the closeable host reachable from the CLI context and centralize cleanup in the CLI layer instead of per command: a cleanup registry fed by `resolveCliContext`, run from the entrypoint after `parseAsync` settles, from `handleError` before `process.exit`, and from new `SIGINT`/`SIGTERM` handlers. Commands are not edited.
6. **Toolchain.** Add `ESNext.Disposable` to `lib` in `tsconfig.base.json` and declare `engines.node: ">=22"` in every published package.

`dispose()` is the primary API and works for hosts that do not use `using`. `Symbol.asyncDispose` is the automatic path for consumers that write `await using`.

## Specs affected

### New specs

None.

### Modified specs

- `core:kernel`: add `dispose()`, `[Symbol.asyncDispose]`, idempotency, reverse-order execution, error aggregation, timeout and construction-failure cleanup.
  - Depends on (added): none
  - Depends on (removed): none
- `core:kernel-builder`: add `registerDisposer(name, fn)`, its equivalence with the matching `KernelOptions` entry, and cleanup of registered disposers when `build()` fails.
  - Depends on (added): none
  - Depends on (removed): none
- `sdk:host-context`: add `dispose()` and `[Symbol.asyncDispose]` to `SdkHostContext`, delegating to the kernel; define behaviour for graph providers created by the host.
  - Depends on (added): `core:kernel-builder`
  - Depends on (removed): none
- `cli:host-context`: keep the closeable host reachable through `CliContext`, define the cleanup registry and its triggers (entrypoint, `handleError`, `SIGINT`/`SIGTERM`) and exit-code rules.
  - Depends on (added): none
  - Depends on (removed): none

- `cli:entrypoint`: add the interruption exit codes 130 (`SIGINT`) and 143 (`SIGTERM`) to the exit-code table (it currently states "No other exit codes are used"), and define that every exit path awaits CLI cleanup first (`CliExitError` instead of a direct `process.exit` in `cliError` / `handleError`).
  - Depends on (added): none
  - Depends on (removed): none
- `default:_global/conventions`: add a requirement that every published package declares `engines.node` with one common minimum (`>=22`, matching the Node version CI installs).
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- **core**: `packages/core/src/composition/kernel.ts` (`createKernel`, `Kernel`, `KernelOptions`) and `packages/core/src/composition/kernel-builder.ts`. `createKernel` has 3 same-name candidates in the graph and is called by the SDK, the builder and tests; the change is additive (new members and options, no signature break), so existing callers are unaffected.
- **sdk**: `packages/sdk/src/composition/host-context.ts` (`createSdkContext`, `openSpecdHost`); `SdkHostContext` is re-exported through the SDK barrel (`sdk:composition`), so its type change is part of the public surface.
- **cli**: `packages/cli/src/helpers/cli-context.ts` and `cli-context-types.ts` (`resolveCliContext`, `CliContext`), `packages/cli/src/index.ts`, `packages/cli/src/handle-error.ts`. The 61 files that call `resolveCliContext` should need no edit if cleanup stays centralized.
- **build / manifests**: `tsconfig.base.json` `lib`; `engines.node: ">=22"` in published package manifests (no CI matrix change, CI already runs Node 22); a changeset.
- **cli, more call sites**: `commands/project/status.ts`, `commands/project/dashboard.ts`, `commands/graph/with-provider.ts`, `graph-index-task.ts` and `helpers/sdk-host.ts` open or wrap hosts outside `resolveCliContext`; cleanup registration must sit below all of them (a CLI helper wrapping `openSpecdHost` / `createSdkContext`), not only in `resolveCliContext`.
- **cli, exit paths**: `handle-error.ts` (`cliError`, `handleError`) and the 24 `process.exit(` call sites.
- **Published manifests**: 15 packages have `private: false` and get `engines` (`cli`, `code-graph`, `core`, `guide`, `mcp`, `plugin-agent-claude`, `-codex`, `-copilot`, `-opencode`, `-standard`, `plugin-manager`, `schema-std`, `sdk`, `skills`, `specd`); `apps/public-web` is private and the root manifest has no `engines`. No `.npmrc` `engine-strict`, no Node version in README/CONTRIBUTING to update.
- **Build tooling**: `tsup@8.5.1` (esbuild 0.27) lowers `using` / `await using`; `vitest@4`, `typescript-eslint@8.58` parse them. `lib` change applies to every package through `tsconfig.base.json`.
- **Docs**: guides for core and sdk under `docs/` and `packages/guide` content describing `Kernel`, `SdkHostContext` and host bootstrap.
- **Tests**: kernel, builder, host-context and cli-context unit tests; `await using`, double-dispose, failing-disposer isolation and failed-`build()` cleanup.

## Technical context

- Agreed with the user: `dispose()` first, `Symbol.asyncDispose` as an automatic layer on top, "independently of doing it by hand, just in case".
- Agreed: `plugin-manager` is the one that knows how plugins work. It will register a single disposer (its plugin session's `destroyAll`) on the `KernelBuilder` before `build()`, and also register the plugins' checks there. The SDK only wires `plugin-manager` to the builder. Core's list is generic. That plugin side belongs to the follow-up change `check-plugins-runtime`; this change only provides the mechanism.
- Rejected: the SDK keeping the list of plugins and destroying them itself (it would reimplement plugin lifecycle that belongs in `plugin-manager`); a kernel-only registry without builder support (plugins are initialized before the kernel exists, so a failed `build()` would leak them); `process.on('exit')` for cleanup (synchronous, cannot await an async `destroy()`); `FinalizationRegistry` as a closer (not reliable; at most a "host not closed" warning).
- `cli:host-context` requires `@specd/sdk` to be the only direct platform dependency of the CLI, so cleanup must go through the SDK, not `core`.
- Breaking changes are acceptable: nothing from this branch has been released.
- Engines analysis (installed versions): `better-sqlite3@12.8.0` (via `code-graph`, hence the whole product) declares `20.x || 22.x || 23.x || 24.x || 25.x`; `@ast-grep/napi@0.42.3` `>=10`; `cli` direct deps (`boxen@8`, `commander@13`) `>=18`; remaining packages have no restrictive dependency. `Symbol.asyncDispose` exists from Node 20.4. Node 20 reached EOL in April 2026. `pino@10` declares no `engines`, so its real floor is unverified.

## Open questions

None. All questions raised during the proposal and its review were resolved with the user (see **Resolved decisions**).

## Resolved decisions

1. **`engines.node`**: `>=22`, one common value in every published package, matching the Node version CI already runs. Node 20 reached EOL in April 2026.
2. **CLI access to `dispose`**: `CliContext` gains `dispose`, backed by the SDK host, because `resolveCliContext` currently drops the host.
3. **Hanging disposer**: fixed timeout of a few seconds (not configurable), with a warning through the kernel logger that names the resource.
4. **Error aggregation**: `AggregateError` (`SuppressedError` is not in the ES2022 lib).
5. **Use after dispose**: only `dispose()` is guaranteed idempotent; other operations on a disposed kernel are unspecified.
6. **Graph providers**: `dispose()` does not close providers created by `createGraphProvider()`; callers own what they create.
7. **Disposer registration shape**: named, `registerDisposer(name, fn)`, so timeout warnings and aggregated errors identify the failing resource.
8. **Synchronous exits**: `cliError` / `handleError` throw a dedicated `CliExitError` carrying the exit code instead of calling `process.exit` directly; the entrypoint catches it, runs cleanup, then exits. Implementation must verify that no command swallows generic errors before they reach the entrypoint.
9. **Where cleanup is registered in the CLI**: one CLI helper wraps `openSpecdHost` and `createSdkContext` and registers the host's `dispose`; `resolveCliContext`, `status.ts`, `dashboard.ts` and `with-provider.ts` all use it. The worker entry `graph-index-task.ts` runs its own cleanup in its own process.
10. **`resolveSdkHostContext` literal**: remove the hand-built `SdkHostContext` by passing the real host through, and add a small test factory for `SdkHostContext` fixtures.
11. **Signal semantics**: the first `SIGINT` / `SIGTERM` runs cleanup and exits with 130 / 143; a second signal forces immediate exit; the timeout timer is `unref`'d; interactive prompts (`@clack/prompts`) keep handling their own `SIGINT`; Windows has no real `SIGTERM`, so only `SIGINT` is relied on there.
12. **Concurrency and timeout**: concurrent `dispose()` calls return the same promise; after a timeout the hanging disposer is abandoned (it may keep running) and the remaining disposers proceed.
13. **`core:kernel` wording**: reword "immutable after construction" to "the set of use cases is immutable; the kernel has an internal one-way closed state".
