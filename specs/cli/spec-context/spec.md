# Spec Context

## Overview

Defines the `specd spec context <workspace:capability-path>` command, which prints the metadata summary for a single spec as it would appear in an AI context block, with optional section filtering and dependency traversal.

## Requirements

### Requirement: Command signature

```
specd spec context <workspace:capability-path>
  [--rules] [--constraints] [--scenarios]
  [--follow-deps [--depth <n>]]
  [--format text|json|toon]
```

- `<workspace:capability-path>` — required positional; the fully-qualified spec ID (e.g. `default:auth/login`)
- `--rules` — when present, includes only the rules sections in the output
- `--constraints` — when present, includes only the constraints sections in the output
- `--scenarios` — when present, includes only the scenarios sections in the output
- `--follow-deps` — when present, follows `dependsOn` links from `.specd-metadata.yaml` transitively and includes each dependency's context in the output
- `--depth <n>` — optional; only valid with `--follow-deps`; limits dependency traversal to N levels (1 = direct deps only, 2 = deps of deps, etc.); defaults to unlimited when `--follow-deps` is passed without `--depth`
- `--format text|json|toon` — optional; output format, defaults to `text`

When none of `--rules`, `--constraints`, or `--scenarios` are passed, all available sections are included (description + rules + constraints + scenarios). When one or more section flags are passed, only those sections are included.

### Requirement: Behaviour

The command reads the spec's `.specd-metadata.yaml` and renders the requested sections. If the metadata is absent or stale (content hashes do not match current artifact files), the command falls back to the schema's `metadataExtraction` declarations to extract content deterministically from the spec's raw artifact files and emits a `warning:` to stderr.

When `--follow-deps` is passed, the command recursively follows the `dependsOn` entries in each spec's `.specd-metadata.yaml`, applying the same section filtering and stale-fallback logic to each dependency. Cycles are detected and silently broken. The root spec is always listed first; dependencies follow in traversal order.

### Requirement: Output

In `text` mode (default), each spec in the output is introduced by a header:

```
### Spec: <workspace>:<capability-path>

<metadata content>
```

When `--follow-deps` is passed, each dependency appears as a subsequent `### Spec:` block after the root.

In `json` or `toon` mode, the output is (encoded in the respective format):

```json
{
  "specs": [
    {
      "spec": "workspace:cap/path",
      "title": "...",
      "description": "...",
      "rules": [...],
      "constraints": [...],
      "scenarios": [...],
      "stale": false
    }
  ],
  "warnings": []
}
```

Only the requested sections are included in each spec object. `description` is always included when not using section filters. When a section is requested but absent, it is omitted from the object (not `null` or `[]`). The root spec is always `specs[0]`; dependencies follow in traversal order.

### Requirement: Error cases

- If the workspace is not configured, exits with code 1.
- If no artifact files exist for the spec at the given path, exits with code 1.
- `--depth` without `--follow-deps` is a CLI usage error (exit code 1).

## Constraints

- This command is read-only — it never updates metadata
- The workspace is always explicit in the path
- Section flags are additive — passing `--rules --constraints` includes both sections
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

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
