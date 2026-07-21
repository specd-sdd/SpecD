# Graph CLI Context

## Purpose

Graph subcommands share config resolution, bootstrap mode, and `CodeGraphProvider` lifecycle. `resolveGraphCliContext` and `withProvider` centralize that wiring through `@specd/sdk`, while the CLI adapter retains bootstrap semantics, signal handling, and format-aware error reporting.

## Requirements

### Requirement: resolveGraphCliContext uses SDK imports

`resolveGraphCliContext` MUST resolve configured mode via `resolveCliContext` / `openSpecdHost` and MUST import platform types exclusively from `@specd/sdk` re-exports.

In bootstrap mode (`--path` or no-config fallback), the command MUST use a synthetic single-workspace project rooted at the resolved VCS root.

### Requirement: withProvider delegates to withOpenGraphProvider

`withProvider` in `packages/cli/src/commands/graph/with-provider.ts` MUST open and close the graph provider through `withOpenGraphProvider` from `@specd/sdk`, building a `SdkHostContext` from the resolved config (and kernel when available).

CLI-only concerns retained in `withProvider`:

- `SIGINT` / `SIGTERM` signal handlers for configured commands
- explicit `process.exit(0)` after close when required to release native graph-store threads
- format-aware fatal error reporting before provider open

### Requirement: Graph command platform imports

Graph command handlers (`search`, `hotspots`, `impact`) MUST obtain shared provider lifecycle through `withProvider` in this module. `graph stats` MUST bootstrap through `openSpecdHost` and manage its provider lifecycle through the SDK without `resolveGraphCliContext` or a pre-open lock probe.

`graph index` MUST delegate indexing orchestration to `runIndexProjectGraph` from `@specd/sdk`; it does not open a long-lived provider through `withProvider` because the worker subprocess performs indexing in isolation.

Graph command handlers MUST obtain host symbols from `@specd/sdk` via this module or `cli:host-context`.

### Requirement: Lock helpers via SDK barrel

Graph commands MUST NOT perform host-managed pre-open lock probes. Provider availability errors, including indexing-busy state, SHALL be surfaced by the opened provider lifecycle owned by the SDK.

## Spec Dependencies

- [`cli:host-context`](../host-context/spec.md) — configured-mode host bootstrap
- [`cli:entrypoint`](../entrypoint/spec.md) — exit codes and error formatting
- [`core:config`](../../core/config/spec.md) — bootstrap vs configured mode
- [`sdk:with-open-graph-provider`](../../sdk/with-open-graph-provider/spec.md) — provider lifecycle wrapper
- [`sdk:composition`](../../sdk/composition/spec.md) — host-adapter barrel re-exports
