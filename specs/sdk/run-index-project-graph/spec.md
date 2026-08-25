# SDK Run Index Project Graph

## Purpose

`graph index` requires listing workspaces, resolving VCS state, and invoking `IndexProjectGraph` with the correct project graph config. Hosts should not assemble this pipeline manually. `runIndexProjectGraph` provides the SDK orchestration entry used by CLI (with optional lock wrapper) and future hosts.

## Requirements

### Requirement: runIndexProjectGraph orchestration

`runIndexProjectGraph(ctx: SdkHostContext, input: RunIndexProjectGraphInput):
Promise<RunIndexProjectGraphResult>` SHALL reject lifecycle hooks paired with an
explicit provider using `InvalidProviderLifecycleError`, resolve config and all or
selected workspaces, prepare project root, graph config, version, VCS, force, and
progress inputs, and invoke `IndexProjectGraph` on an opened provider.

An explicit `input.provider` MUST already be open. The SDK MUST NOT close,
recreate, or retry that caller-owned provider; force still reaches
`IndexProjectGraph` as a logical full-reindex intent.

For a transient provider, the SDK SHALL use `withOpenGraphProvider`. If, and only
if, `input.force` is true and initial `open()` rejects with the typed recoverable
storage-open error, the use case SHALL request exactly one recovery through the
helper: after that provider is closed, call `provider.recreate()`, then retry
`open()` and the index operation once. It MUST preserve caller hooks and run cleanup
exactly once per provider lifetime.

The SDK MUST rethrow non-recoverable errors, an untyped error, a recovery failure,
or a second open failure without deletion or further retry.

### Requirement: Lock acquisition out of scope

Subprocess lock for concurrent index exclusion (`acquireGraphIndexLock`) MUST NOT run inside `runIndexProjectGraph`. CLI adapters MAY call lock helpers in a `beforeOpen` hook passed to `withOpenGraphProvider`.

### Requirement: Progress callback passthrough

When `input.onProgress` is provided, the orchestration MUST forward progress events from `IndexProjectGraph` without transformation.

### Requirement: Result passthrough

`RunIndexProjectGraphResult` MUST match `IndexProjectGraph` result fields (indexed file/symbol counts, per-workspace breakdown, errors) without lossy mapping.

### Requirement: Repair lifecycle passthrough

The SDK SHALL report the final full-rebuild result without lossy mapping. It owns
the force-only decision to recover a typed failed open, while Code Graph owns the
`recreate()` primitive and its closed-provider precondition. Normal reads and
non-forced indexing surface the original typed open failure unchanged.

## Spec Dependencies

- [`sdk:with-open-graph-provider`](../with-open-graph-provider/spec.md) — provider lifecycle wrapper
- [`code-graph:index-project-graph`](../../../../specs/code-graph/index-project-graph/spec.md) — indexing use case
- [`core:list-workspaces`](../../../../specs/core/list-workspaces/spec.md) — workspace enumeration
