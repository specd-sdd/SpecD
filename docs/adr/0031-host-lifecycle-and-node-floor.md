---
status: accepted
date: 2026-10-27
decision-makers: specd maintainer
consulted: '-'
informed: '-'
---

# ADR-0031: Host Lifecycle (Kernel Disposers), Single CLI Exit Point, and Node.js >= 22

## Context and Problem Statement

Hosts open a `Kernel` through `@specd/sdk` but had no way to close it. Upcoming runtime plugins (check plugins loaded from `specd.yaml`) will own resources such as connections, child processes and on-disk caches that must be released when a host stops. The CLI also had no signal handling, and commands ended the process with direct `process.exit()` calls (24 sites), so no asynchronous cleanup could ever run on an early exit. Finally, no package declared a Node.js floor even though the code now relies on explicit resource management (`Symbol.asyncDispose`, `await using`) and the installed native dependencies and CI already target modern Node.js.

## Decision Drivers

- Core must stay unaware of plugins; whoever owns a resource must be able to register its cleanup.
- A failed `build()` / `createKernel()` must not leak resources already initialised by the host.
- Cleanup must be asynchronous, ordered, failure-isolated and bounded in time.
- `await using` should work, independently of hosts that close manually.
- The CLI must run cleanup on normal completion, on error exits and on `SIGINT` / `SIGTERM`.
- The supported Node.js version must be explicit and equal to the tested one.

## Considered Options

1. **Plugin list owned by the SDK** — rejected: it reimplements plugin lifecycle knowledge that belongs to `plugin-manager`.
2. **Kernel-only registry (`kernel.registerDisposer`)** — rejected: plugins are initialised before the kernel exists, so a failed construction would leak them.
3. **Named opaque disposers carried by `KernelOptions` and accumulated by `KernelBuilder`, released by `createKernel` on failure** — chosen.
4. **Keep `process.exit()` in CLI helpers** — rejected: an asynchronous cleanup cannot be awaited from synchronous exits.
5. **`process.on('exit')` / `FinalizationRegistry` for cleanup** — rejected: synchronous / unreliable.
6. **Keep Node.js >= 20** — rejected: Node.js 20 reached end of life in April 2026 and CI only runs Node.js 22.

## Decision Outcome

1. **Kernel disposers.** `KernelOptions.disposers` takes `{ name, dispose }` entries (non-empty unique names). `Kernel.dispose()` (alias `[Symbol.asyncDispose]`) runs them in reverse registration order, one at a time, with failure isolation (`AggregateError` of `DisposerFailedError`), a fixed 5000 ms timeout per disposer (warn and abandon, never a failure) and an idempotent shared promise. `KernelBuilder.registerDisposer(name, fn)` accumulates them; `createKernel` releases them in reverse order before propagating a construction failure, keeping the original error.
2. **SDK host.** `SdkHostContext` is `AsyncDisposable`; `dispose()` delegates to the kernel and does not close graph providers (callers own what they create).
3. **CLI.** Hosts are opened through `openCliHost`, which registers the host disposal in a cleanup registry. Helpers (`cliError`, `handleError`) throw `CliExitError` instead of calling `process.exit()`; `handleError` rethrows it first. Only the entrypoint (`run()`) and the signal handlers end the process, always after awaiting cleanup. `SIGINT` / `SIGTERM` run cleanup and exit with 130 / 143; a second signal forces exit. Natural completion does not call `process.exit` so piped output flushes and `process.exitCode` is respected.
4. **Node.js floor.** Every published package declares `engines.node: ">=22"`, enforced by `dev/scripts/check-engines.js` as part of `preflight:check`.

### Consequences

- Good, because plugins can register their own cleanup without core knowing about them, and a half-started host leaks nothing.
- Good, because the CLI cleans up on every exit path and on signals.
- Good, because the Node.js floor is explicit, tested and enforced.
- Bad, because `Kernel` and `SdkHostContext` gained required members, a breaking change for hand-built literals (accepted: nothing from this branch had been released).
- Bad, because roughly 21 `process.exit` sites and about 50 tests had to be migrated to `CliExitError`.
- Bad, because a hanging disposer is abandoned rather than killed, costing up to 5 s and possibly leaking until the process ends.

### Confirmation

- Unit tests for the disposal module, kernel, builder, SDK host, CLI cleanup registry, signal handlers and `run()`.
- Source-scan tests: `process.exit(` only in `run.ts` and `helpers/cli-signals.ts`; no hand-built host and no direct SDK bootstrap in CLI commands; no command `catch` block that could swallow a `CliExitError`.
- `node dev/scripts/check-engines.js` in `preflight:check`.

## More Information

### Specs

- [`core:kernel`](../../specs/core/kernel/spec.md)
- [`core:kernel-builder`](../../specs/core/kernel-builder/spec.md)
- [`sdk:host-context`](../../specs/sdk/host-context/spec.md)
- [`cli:host-context`](../../specs/cli/host-context/spec.md)
- [`cli:entrypoint`](../../specs/cli/entrypoint/spec.md)
- [`default:_global/conventions`](../../specs/_global/conventions/spec.md)
