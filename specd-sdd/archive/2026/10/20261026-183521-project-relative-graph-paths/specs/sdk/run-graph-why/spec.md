# SDK Run Graph Why

## Purpose

Hosts that need to explain why a path is excluded, classified or indexed should not assemble workspace, configuration and graph-provider wiring themselves. `runGraphWhy` is the thin SDK orchestration entry that opens a graph provider, delegates to the code-graph `ExplainGraphPath` use case, and returns its structured result, whose locations are already expressed as `projectRelativePath`.

## Requirements

### Requirement: runGraphWhy orchestration

`runGraphWhy(ctx: SdkHostContext, input: RunGraphWhyInput): Promise<RunGraphWhyResult>` SHALL:

1. Accept `path` (project-relative, absolute, or `workspace:path`) and an optional pre-opened caller-owned `provider`.
2. When `input.provider` is omitted, open a transient provider using `withOpenGraphProvider(ctx, ...)`; when provided, use it directly.
3. Delegate to the provider's `explainPath(path)` capability, which runs `ExplainGraphPath` with the effective project configuration the provider was created with; the SDK MUST NOT evaluate patterns, resolve ownership, or classify.
4. Return the use case result unchanged: it already expresses every filesystem location as `projectRelativePath`, so the SDK adds no projection of its own.
5. Propagate `SpecdError` failures (for example `UNKNOWN_WORKSPACE`) unchanged.

### Requirement: Public surface

`runGraphWhy`, `RunGraphWhyInput` and `RunGraphWhyResult` SHALL be exported from `@specd/sdk` with full JSDoc. `RunGraphWhyResult` is the `ExplainGraphPathResult` contract of `code-graph:explain-graph-path` and SHALL NOT add presentation fields.

### Requirement: No presenter formatting

`runGraphWhy` SHALL return pure structured data. Terminal layout and styling remain in host presenters.

## Spec Dependencies

- `code-graph:explain-graph-path` — use case delegated to and its result contract
- `sdk:host-context` — host context for configuration and provider access
- `sdk:with-open-graph-provider` — provider lifecycle helper
