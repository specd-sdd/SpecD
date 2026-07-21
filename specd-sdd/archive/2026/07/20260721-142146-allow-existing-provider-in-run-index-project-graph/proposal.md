# Proposal: allow-existing-provider-in-run-index-project-graph

## Motivation

Long-lived host applications (such as MCP servers, API servers, or background daemons) maintain an in-memory `CodeGraphProvider` instance to serve frequent graph query requests efficiently. Currently, `runIndexProjectGraph` in `@specd/sdk` forcibly wraps indexing inside `withOpenGraphProvider`, which opens a transient provider and closes its underlying storage connections when done. This breaks persistent provider connections in long-lived hosts or forces host authors to duplicate complex project orchestration code manually. Furthermore, `runIndexProjectGraph` currently exposes `beforeOpen` but does not expose `afterClose`, creating an asymmetry with `WithOpenGraphProviderOptions`.

## Current behaviour

`runIndexProjectGraph` accepts `RunIndexProjectGraphInput`, creates a new `CodeGraphProvider` via `withOpenGraphProvider`, runs `IndexProjectGraph`, and closes the provider upon completion. `RunIndexProjectGraphInput` forwards `beforeOpen` to `withOpenGraphProvider` but omits `afterClose`. Long-lived hosts that already possess an open `CodeGraphProvider` cannot pass their instance to `runIndexProjectGraph`. If they attempt to call `provider.index()` directly, they must manually resolve workspace lists, Git repository roots, commit references, and graph configurations.

## Proposed solution

Extend `RunIndexProjectGraphInput` in `@specd/sdk` with optional `provider?: CodeGraphProvider` and `afterClose?: (provider: CodeGraphProvider) => Promise<void>` properties.

- **When `input.provider` is provided**: `runIndexProjectGraph` expects the provider to be already open and executes `IndexProjectGraph` directly on `input.provider`. It MUST NOT close `input.provider` (even if indexing fails).
- **Validation Guard**: If `input.provider` is provided AND either `input.beforeOpen` or `input.afterClose` is also provided, `runIndexProjectGraph` MUST throw an `InvalidProviderLifecycleError` (subclass of `SpecdError` with `code: 'INVALID_PROVIDER_LIFECYCLE'`) because lifecycle hooks only apply to transient provider creation/closing.
- **When `input.provider` is omitted**: `runIndexProjectGraph` preserves transient provider behavior using `withOpenGraphProvider(ctx, ...)`, forwarding both `beforeOpen` and `afterClose` hooks to `withOpenGraphProvider`, and closing the transient provider upon completion.

## Specs affected

### New specs

(None)

### Modified specs

- `sdk:run-index-project-graph`: Support an optional existing open `CodeGraphProvider` instance and an optional `afterClose` hook in `RunIndexProjectGraphInput`. Specify validation guard throwing `InvalidProviderLifecycleError` when hooks and provider are combined, as well as lifecycle and provider ownership semantics.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- `@specd/sdk`: `RunIndexProjectGraphInput` interface, `InvalidProviderLifecycleError` class, and `runIndexProjectGraph` function in `packages/sdk/src/orchestration/run-index-project-graph.ts` (and domain errors module).
- Long-lived hosts (MCP server, API integrations): Can invoke `runIndexProjectGraph(ctx, { provider: myProvider })` to perform in-place hot indexing on an existing open provider without losing database connections. Passing invalid combinations throws a machine-readable `SpecdError`.
- Backward compatibility: Fully preserved; existing CLI and script invocations without `input.provider` or `input.afterClose` remain unchanged.

## Technical context

- `runIndexProjectGraph` relies on `withOpenGraphProvider`, which accepts `WithOpenGraphProviderOptions` (`beforeOpen` and `afterClose`).
- For long-lived processes, closing the provider closes SQLite / storage connections, making subsequent queries fail.
- Throwing a `SpecdError` (`InvalidProviderLifecycleError`) guards against silent ignoring of hooks when `input.provider` is passed.

## Open questions

(None)
