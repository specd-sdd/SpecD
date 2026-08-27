# project context-specs

List context-pattern spec IDs partitioned into project vs per-workspace include sources.

This is an ID-only discovery command. It does **not** render context content, metadata, dependency traversal, or warnings. For the full project context block, use [`project context`](./cli-reference.md#project-context).

## Usage

```bash
specd project context-specs [options]
```

## Options

| Option                      | Description                                                                                                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--workspace <name>`        | Activate workspace-level patterns for this workspace. **Repeatable.** When omitted, all configured workspaces are active. Does **not** suppress `project` unless combined with `--workspaces-only`. |
| `--workspaces-only`         | Skip project-level patterns; only resolve and print workspace-level includes.                                                                                                                       |
| `--format text\|json\|toon` | Output format. Default: `text`.                                                                                                                                                                     |
| `--config <path>`           | Config file path.                                                                                                                                                                                   |

Do **not** use a plural `--workspaces <csv>` value flag or a comma-separated list. Workspace name filters are always `--workspace <name>` repeated (same as `specs list` / `specs search`). `--workspaces-only` is a separate boolean mode flag.

## Behaviour

1. Resolves project-level `contextIncludeSpecs` / `contextExcludeSpecs` → `project` (skipped when `--workspaces-only`).
2. Resolves workspace-level include/exclude patterns for the active workspaces → `workspaces.<name>`.
3. Returns IDs **partitioned by the layer that included them**.

`--workspace` only controls which workspace-level pattern sets are active. Project patterns always run unless `--workspaces-only` is set.

A workspace exclude can remove a project-included ID from the effective set (same ordered pipeline as `CompileContext`). Surviving IDs retain every include source that contributed them: if both project and `core` included `core:foo`, it appears under `project` and under `workspaces.core`.

Unknown workspace names fail the command (they are not silently ignored).

## Output

**text** — nested sections:

```text
project:
  default:_global/architecture
  core:workspace

workspaces:
  core:
    core:workspace
    core:compile-context
  cli:
    cli:project-context
```

With `--workspaces-only`, the `project:` section is omitted in text mode.

**json / toon** — structured result:

```json
{
  "project": ["default:_global/architecture", "core:workspace"],
  "workspaces": {
    "core": ["core:workspace", "core:compile-context"],
    "cli": ["cli:project-context"]
  }
}
```

With `--workspaces-only`, `project` is an empty array.

Empty `project` renders as `(none)` when the section is shown. Active workspaces with no remaining sourced IDs render as `(none)` under that name.

## Examples

```bash
# Partitioned IDs for all configured workspaces
specd project context-specs

# Restrict workspace-level patterns to core (project still listed)
specd project context-specs --workspace core

# Only workspace-level patterns for core
specd project context-specs --workspace core --workspaces-only

# Machine-readable
specd project context-specs --format toon
```

## Related

- Core: `ResolveContextSpecs` via `kernel.project.resolveContextSpecs` (types re-exported from `@specd/sdk`)
- CLI host: same pattern as `project context` (`resolveCliContext` → kernel execute)
