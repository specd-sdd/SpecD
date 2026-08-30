# ResolveContextSpecs

## Purpose

Pre-change workflows (for example fast-track) need an authoritative, ID-only answer to “which specs do project and workspace context patterns select?” without compiling or rendering context content. `ResolveContextSpecs` resolves configured `contextIncludeSpecs` / `contextExcludeSpecs` into a provenance-partitioned result and owns the shared content-free helper that `CompileContext` and `GetProjectContext` also use for the same include/exclude order (GetProjectContext with an empty active-workspace set).

## Requirements

### Requirement: Accepts ResolveContextSpecsInput

`execute(input?)` MUST accept an optional `ResolveContextSpecsInput`:

- `workspaces` (`readonly string[]`, optional) — names of workspaces whose **workspace-level** patterns are active. Omitted or empty MUST mean all configured workspaces. Values MUST be deduplicated before resolution.
- `workspacesOnly` (boolean, optional) — when `true`, project-level include/exclude patterns MUST NOT run; the result's `project` array MUST be empty.

`ResolveContextSpecsInput` MUST NOT accept change identity, rendering mode, section filters, dependency-traversal flags, fingerprints, or yaml `config` overrides. Yaml-derived context pattern configuration is baked at construction via `CompileContextConfig`.

### Requirement: Returns ResolveContextSpecsResult

`execute` MUST return `ResolveContextSpecsResult`:

- `project` (`readonly string[]`) — canonical spec IDs included by **project-level** patterns that remain after all excludes
- `workspaces` (`Readonly<Record<string, readonly string[]>>`) — for each **active** workspace name, the canonical IDs included by that workspace's patterns that remain after all excludes

Every active workspace name MUST appear as a key in `workspaces`, even when its array is empty.

### Requirement: Dual listing by include provenance

When project-level patterns and a workspace's patterns both include the same ID and that ID survives excludes, the ID MUST appear in both `project` and `workspaces[<workspace>]`. Exclude operations clear the ID from the effective set entirely (and therefore from every partition). Surviving IDs MUST retain every include source that contributed them.

### Requirement: Shared configured-context helper

Core MUST provide a content-free helper (`resolveConfiguredContextSpecs`) that applies patterns in this fixed order:

1. project-level `contextIncludeSpecs`
2. project-level `contextExcludeSpecs`
3. active-workspace `contextIncludeSpecs` (skip inactive workspaces)
4. active-workspace `contextExcludeSpecs` (skip inactive workspaces)

Callers MUST supply an effective-set `collector` with `include(spec)` / `exclude(spec)` (no provenance arguments). Callers MAY supply an optional `onOperation(op, spec, source)` listener for provenance; the listener MUST NOT replace or alter collector semantics.

The helper MUST NOT render content, read metadata, seed change `specIds` / `specDependsOn`, protect keys, or perform `dependsOn` traversal. Pattern-matcher warnings MAY be discarded by ID-only callers.

`ResolveContextSpecs` and `CompileContext` MUST both invoke this helper for steps 1–4 of configured pattern application so include/exclude order and glob semantics cannot drift.

`GetProjectContext` MUST invoke the same helper for its project-level include/exclude collection with an empty `activeWorkspaces` set so workspace-level patterns never run, while still sharing project glob semantics with `CompileContext` and `ResolveContextSpecs`.

### Requirement: Workspace filter and unknown names

When `workspaces` lists one or more names, only those workspaces are active for workspace-level patterns and for keys emitted under `workspaces`.

Unknown workspace names MUST fail the call by throwing `InvalidInputError` (a `SpecdError` with code `INVALID_INPUT`). The message MUST be:

- one unknown → `Unknown workspace '<name>'`
- several unknown → `Unknown workspaces: '<a>', '<b>', …` (each unknown name quoted, comma-separated)

Unknown names MUST NOT be silently ignored. Generic `Error` MUST NOT be used for this expected validation failure.

### Requirement: workspacesOnly skips project patterns

When `workspacesOnly` is `true`, the use case MUST empty project-level include/exclude arrays before calling the helper so only workspace-level patterns run. `project` MUST be `[]`.

### Requirement: Construction and composition

`ResolveContextSpecs` MUST be constructed with `ListWorkspaces` and a yaml-derived `CompileContextConfig` snapshot. Composition MUST expose `createResolveContextSpecs` (explicit deps and config factory forms) and mount the use case at `kernel.project.resolveContextSpecs`.

### Requirement: Public surface

Core's public barrel MUST export `ResolveContextSpecs`, `ResolveContextSpecsInput`, `ResolveContextSpecsResult`, `createResolveContextSpecs`, and `ResolveContextSpecsDeps`. Hosts that consume `@specd/sdk` MAY obtain these via SDK core re-exports. There MUST NOT be a dedicated SDK orchestration wrapper whose only behaviour is forwarding `kernel.project.resolveContextSpecs.execute`.

## Constraints

- ID-only: no project `context:` entry rendering, no spec content, no metadata materialization, no warning array in the result.
- Does not apply change-scoped seeds, protection, optimized-project-context skipping, or `followDeps` (those remain `CompileContext` responsibilities).
- Dedup key for the effective set is `` `${workspace}:${capPath}` ``.

## Spec Dependencies

- [`core:list-workspaces`](../list-workspaces/spec.md) — configured workspace discovery and active-set selection
- [`core:config`](../config/spec.md) — context include/exclude pattern configuration consumed via `CompileContextConfig`
- [`default:_global/error-handling-conventions`](../../../_global/error-handling-conventions/spec.md) — unknown workspaces MUST be typed `SpecdError` (`InvalidInputError`), not generic `Error`
