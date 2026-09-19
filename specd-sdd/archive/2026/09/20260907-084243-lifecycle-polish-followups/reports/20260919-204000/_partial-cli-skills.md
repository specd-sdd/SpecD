# Final compliance audit — CLI and skills

## Audit basis

This final read-only pass inspected the current merged `spec-preview` output for
`cli:change-status`, `skills:skill-templates-source`, `cli:change-archive`, and
`cli:change-artifact-instruction`; their direct dependency contracts; current source and
tests; and graph-indexed public registration symbols. The graph is current (41,209
symbols; no stale workspaces). No source, spec, or change artifact was modified.

## Requirements and evidence

### `cli:change-status`

The contract requires Core-derived lifecycle/DAG/review/tracking projections, drafted
read-only rendering, and drift-aware human/structured display state. Graph navigation
locates `registerChangeStatus` at `packages/cli/src/commands/change/status.ts`.
It delegates to `kernel.changes.status.execute`, projects Core's lifecycle data, and uses
`displayStatus ?? effectiveStatus ?? state` for artifact rendering and structured DAG
entries. This provides the required canonical fallback when historic Core payloads lack
`displayStatus`, without local lifecycle recomputation.

`packages/cli/test/commands/change/status.spec.ts` covers drafted output, fallback
rendering, DAG order/children, drift-aware state, `hasTasks`, warnings, and check-derived
lifecycle projections.

**Status: conformant.**

### `skills:skill-templates-source`

The merged fast-track requirement requires a Step 2 confirmation stop and dependents
terminology/selector usage. The fast-track template explicitly stops pending user choice,
uses `--direction dependents` for file and symbol impact, and avoids describing
downstream as dependents. Its template contract test asserts the stop copy, absence of
downstream-dependent wording, the dependents regression requirement, and metadata.

This remains consistent with `skills:workflow-automation` and
`core:transition-checks`: fast-track is manual-only and does not advance lifecycle
approval states itself.

**Status: conformant.**

### `cli:change-archive`

The new contract names `specd changes archive <name>` as canonical while preserving
`specd change archive <name>`. `packages/cli/src/index.ts` defines one `changes` group
and `.alias('change')`, then installs `registerChangeArchive` on that same group. Both
spellings therefore resolve to the identical archive handler and Core use-case call.
The handler delegates archive semantics, hooks, progress, and overlap evaluation to
Core, matching `core:archive-change`, `core:hook-execution-model`, and
`cli:command-resource-naming`.

The archive command tests cover normal/error results, structured progress, hook phase
forwarding, overlap, and archive options.

**Status: conformant.**

### `cli:change-artifact-instruction`

The contract requires a read-only delegation to `GetArtifactInstruction`; the hygiene
addition requires context before fetching the current instruction immediately before
authoring, with neither template I/O as context nor prefetching later instructions.
Graph navigation locates `registerChangeArtifactInstruction` in the CLI handler, which
delegates directly to `kernel.changes.getArtifactInstruction.execute` and only formats
the returned rules/instruction/template/delta payload.

Shared workflow guidance loads change context before instruction calls, and the design
template fetches the current instruction in Step 6 “Immediately after” before Step 7
authorship. Existing command tests cover text/JSON projection and domain-error routing;
Core context coverage confirms instructions are not injected into compiled context.

**Status: conformant.**

## Discrepancies

None. The audited implementation matches the merged change requirements and the relevant
direct dependency/global constraints.

## Test coverage gaps

### P3 — literal archive alias parsing

Archive handler tests use a synthetic parent command, so they do not execute the complete
top-level registration for both literal forms (`changes archive` and `change archive`).
The actual implementation shares one Commander group and alias, making this a
non-blocking regression-test opportunity rather than a behavior discrepancy.

## Totals

| Metric                      |              Count |
| --------------------------- | -----------------: |
| Specs audited               |                  4 |
| Discrepancies               |                  0 |
| Dependency/global conflicts |                  0 |
| Test gaps                   | 1 P3, non-blocking |
| Blocking findings           |                  0 |
