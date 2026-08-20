# Graph CLI Context

## Purpose

Graph subcommands share config resolution, bootstrap mode, and `CodeGraphProvider` lifecycle. `resolveGraphCliContext` and `withProvider` centralize that wiring through `@specd/sdk`, while the CLI adapter retains bootstrap semantics and format-aware error reporting.

## Requirements

### Requirement: resolveGraphCliContext uses SDK imports

`resolveGraphCliContext` MUST resolve configured mode via `resolveCliContext` / `openSpecdHost` and MUST import platform types exclusively from `@specd/sdk` re-exports.

Configured mode, whether selected by `--config` or by successful configuration discovery, MUST use the resolved configuration's project root without requiring a VCS repository. Its VCS root value SHALL be absent when repository detection is unavailable, so provider health can represent unavailable VCS data without rejecting the configured command.

In bootstrap mode (`--path` or no-config fallback), the command MUST require a resolved VCS root and use a synthetic single-workspace project rooted at that VCS root.

### Requirement: withProvider delegates to withOpenGraphProvider

`withProvider` in `packages/cli/src/commands/graph/with-provider.ts` MUST open and close the graph provider through `withOpenGraphProvider` from `@specd/sdk`, building a `SdkHostContext` from the resolved config (and kernel when available).

`withProvider` MUST retain format-aware fatal error reporting before provider open. It MUST NOT install graph-store-specific signal handlers or force a successful `process.exit(0)` to release backend-native threads. Provider cleanup is completed by the SDK lifecycle helper; normal command completion returns control to the CLI runtime.

### Requirement: Graph command platform imports

Graph command handlers (`search`, `hotspots`, `impact`, `stats`) MUST obtain shared provider lifecycle through `withProvider` in this module. They MUST resolve configured and bootstrap context through the shared graph CLI context instead of owning a backend-specific host bootstrap or shutdown path.

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
