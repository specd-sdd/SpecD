# Spec Context

## Purpose

Agents need structured spec content they can consume directly as context, without parsing raw Markdown themselves. The `specd spec context <workspace:capability-path>` command prints the metadata summary for a single spec as it would appear in an AI context block, with optional section filtering and dependency traversal.

## Requirements

### Requirement: Command signature

The command MUST support:

```bash
specd specs context <specPath> [options]
```

- `<specPath>` — required positional; the fully-qualified spec ID (e.g. `default:auth/login`)
- `--mode <mode>` — optional; `list|summary|full|hybrid` (default: `full`)
- `--rules` — when present, includes only the rules sections in the output
- `--constraints` — when present, includes only the constraints sections in the output
- `--scenarios` — when present, includes only the scenarios sections in the output
- `--follow-deps` — when present, follows `dependsOn` links transitively and includes each dependency's context in the output
- `--depth <n>` — optional; only valid with `--follow-deps`; limits dependency traversal to N levels (1 = direct deps only); defaults to unlimited when `--follow-deps` is passed without `--depth`
- `--optimized` — optional; force prefer optimized context
- `--no-optimized` — optional; suppress preference for optimized context
- `--format text|json|toon` — optional; output format, defaults to `text`

When none of `--rules`, `--constraints`, or `--scenarios` are passed, all available sections are included (description + rules + constraints + scenarios). When one or more section flags are passed, only those sections are included. Section flags have no effect in list or summary modes.

### Requirement: Behaviour

The command reads the active project config and renders the requested spec according to the configured `contextMode`. It reads the spec's `.specd-metadata.yaml` and renders the requested sections only when the selected mode is full-shaped. If the metadata is absent or stale (content hashes do not match current artifact files), the command falls back to the schema's `metadataExtraction` declarations where available and emits a `warning:` to stderr.

When `--follow-deps` is passed, the command recursively follows the `dependsOn` entries in each spec's `.specd-metadata.yaml`, applying the same display mode and stale-fallback logic to each dependency. Cycles are detected and silently broken. The root spec is always listed first; dependencies follow in traversal order.

By default, if `llmOptimizedContext` is enabled in config, the command MUST prefer `optimizedDescription` and `optimizedContext` from fresh metadata.

The effective `llmOptimizedContext` value is overridden to `false` if `--no-optimized` is passed, or if section flags are provided that exclude either rules or constraints (e.g. only `--rules` or only `--constraints` is passed).

When optimization is effectively enabled (including when both rules and constraints are requested or defaulted), it prefers `optimizedDescription` and `optimizedContext` from fresh metadata.

The command MUST emit a `stale-optimization` warning to stderr when the effective `llmOptimizedContext` is `true` but optimized fields are missing or stale.

The warning MUST include remediation instructions: "Launch specd-spec-context-optimizer agent to refresh".

### Requirement: Output

In `text` mode (default), each spec entry in the output is introduced by a header:

```
### Spec: <workspace>:<capability-path>
Mode: <list|summary|full>
```

List-mode entries include only the spec ID and mode/source metadata. Summary-mode entries include title and description when available. Full-mode entries include the rendered metadata content, filtered by section flags when present.

When `--follow-deps` is passed, each dependency appears as a subsequent `### Spec:` block after the root using the same display mode.

In `json` or `toon` mode, the output includes `specs` and `warnings`. Only fields available for the selected display mode are included in each spec object. The root spec is always `specs[0]`; dependencies follow in traversal order.

### Requirement: Error cases

- If the workspace is not configured, exits with code 1.
- If no artifact files exist for the spec at the given path, exits with code 1.
- `--depth` without `--follow-deps` is a CLI usage error (exit code 1).

## Constraints

- This command is read-only — it never updates metadata
- The workspace is always explicit in the path
- Section flags are additive for full-mode output — passing `--rules --constraints` includes both sections
- Section flags have no effect in `list` or `summary` modes
- `--follow-deps` traversal uses the same cycle detection as `CompileContext`
- Stale/absent metadata is never a hard error — the fallback is always attempted

## Examples

```
# Full context for one spec
$ specd spec context default:auth/login

### Spec: default:auth/login

**Description:** Handles user authentication via login form

### Rules
...

# Only rules and scenarios
$ specd spec context default:auth/login --rules --scenarios

### Spec: default:auth/login

### Rules
...
### Scenarios
...

# Follow deps, limit to direct dependencies
$ specd spec context default:auth/login --follow-deps --depth 1

### Spec: default:auth/login
...
### Spec: default:auth/shared-errors
...

# JSON output with section filter
$ specd spec context default:auth/login --constraints --format json
{"specs":[{"spec":"default:auth/login","constraints":[...],"stale":false}],"warnings":[]}
```

## Spec Dependencies

- [`cli:entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`core:config`](../../core/config/spec.md) — `contextMode` accepted values and default
- [`core:get-spec-context`](../../core/get-spec-context/spec.md) — use case and result shape for spec context entries
