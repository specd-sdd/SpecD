# Proposal: fix-graph-index-worker-config-cascade

## Motivation

`specd graph index` can use two different effective configurations during one command: the parent sees the complete discovered cascade, but the isolated indexing child can lose its local layers. This can make the child index the wrong workspaces, paths, or exclusions while writing to storage selected from the parent's configuration.

## Current behaviour

The problem occurs only when the command uses automatic discovery:

1. The parent starts from the CLI working directory and performs normal config discovery.
2. Discovery builds the active cascade, including eligible `specd.*.yaml` and `specd.local.*.yaml` layers.
3. The parent keeps only the resolved root `configFilePath` when it constructs the child task input.
4. The child calls `openSpecdHost({ configPath })` with that path.
5. Passing `configPath` selects forced mode, which loads only that entrypoint and its explicit `extends` chain. Filename-discovered sibling layers are not added.

For example, if `specd.yaml` defines the base project and `specd.local.yaml` extends it with a different `graph.excludePaths`, the parent applies both files while the child applies only `specd.yaml`.

This does **not** mean forced loading is broken. When the user supplies `--config`, forced loading is the intended behaviour. The bug is that an automatically discovered context is converted into a forced context at the process boundary.

The SQLite storage worker is unrelated: it receives storage paths and runtime data, not project configuration. Other graph commands also remain unaffected because they use their resolved context in the parent process instead of crossing the isolated graph-index task boundary.

## Proposed solution

Preserve the parent's resolution mode in the JSON-safe task descriptor:

- `forced`: explicit `--config`; carry the exact config path and keep current semantics.
- `discovered`: no `--config`, config found by discovery; carry the absolute directory from which the parent started discovery.
- `bootstrap`: no project config; keep the explicit `projectRoot` and `vcsRoot` used today.

The child then follows the matching reconstruction path:

| Parent mode         | Child reconstruction                                | Expected result                                             |
| ------------------- | --------------------------------------------------- | ----------------------------------------------------------- |
| Explicit `--config` | `openSpecdHost({ configPath })`                     | Exact forced chain; no discovered siblings                  |
| Automatic discovery | `openSpecdHost({ startDir })`                       | Same discovery rules and local cascade layers as the parent |
| Bootstrap           | `createSdkContext(createBootstrapGraphConfig(...))` | Existing explicit bootstrap configuration                   |

If discovery succeeded in the parent but no longer succeeds in the child, the command will fail clearly. It will not fall back to bootstrap or silently select another project.

The fix is deliberately narrow. It changes the CLI descriptor and reconstruction branches, plus their tests and specs. It does not alter cascade resolution, serialize `SpecdConfig`, change the generic isolated-worker protocol, or modify the SQLite worker.

## Specs affected

### New specs

None.

### Modified specs

- `cli:graph-index`: distinguish forced, discovered, and bootstrap task descriptors so the isolated child reconstructs the same configuration mode selected by the parent.
  - Depends on (added): `code-graph:isolated-index-worker`, `core:config-loader`
  - Depends on (removed): none
- `code-graph:isolated-index-worker`: record that host-specific task descriptors may carry a JSON-safe discovery anchor while the generic worker continues to transport and validate task input without interpreting configuration.
  - Depends on (added): none
  - Depends on (removed): none
- `core:config-loader`: make explicit that replaying discovery from a host-selected `startDir` preserves discovery semantics, whereas an explicit `configPath` remains forced and excludes filename-discovered siblings.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

The minimum production implementation surface is three CLI files:

- `packages/cli/src/commands/graph/resolve-graph-cli-context.ts`: preserve whether configured context came from an explicit path or discovery, including the absolute discovery start directory.
- `packages/cli/src/commands/graph/index-graph.ts`: construct the corresponding forced, discovered, or bootstrap task descriptor while continuing to derive `storageRoot` from the parent-resolved effective config.
- `packages/cli/src/graph-index-task.ts`: reconstruct discovered context with `startDir` and forced context with `configPath` before invoking `runIndexProjectGraph` once.

Tests will cover context resolution, descriptor construction, child reconstruction, JSON-safe transport, and a fixture where a local layer changes graph configuration. The same fixture will demonstrate that automatic discovery includes the local layer while explicit `--config specd.yaml` intentionally does not.

Fresh code-graph impact analysis rates the three planned CLI source files as **MEDIUM** risk. The descriptor and task flow into `index-graph`, CLI program registration, and their tests; the affected production path remains `graph index`. The analysis does not identify a need to modify the generic code-graph supervisor, protocol, SQLite worker, SDK orchestration, or other graph query commands.

## Technical context

The isolated boundary is a forked child process with validated JSON IPC. A discriminated descriptor containing only mode tags and absolute path strings satisfies the existing JSON boundary. No live kernel, `Map`, adapter instance, or resolved `SpecdConfig` crosses IPC.

The chosen approach replays discovery instead of transmitting the parent's resolved config snapshot. Snapshot transport was considered but rejected because it would expand the IPC contract and couple the task to serialization of richer runtime configuration structures. Letting the child use its inherited CWD implicitly was also rejected: an explicit `startDir` records the parent's choice and remains deterministic if process-launch behaviour changes.

Forced loading must remain unchanged: `--config` means the selected entrypoint plus its explicit `extends` chain, without attaching filename-discovered local siblings. Changing forced loading to merge local files would violate the existing CLI and config-loader contracts.

The child replay introduces a narrow time-of-check/time-of-use window. The intended policy is fail-fast if discovery no longer resolves after the parent succeeded; bootstrap fallback or project substitution would conceal configuration drift and could make the worker write under a lock derived from a different effective config.

## Open questions

None. The downstream specs and design may choose the smallest internal representation that preserves the three resolution modes, but the required behaviour and failure policy are settled.
