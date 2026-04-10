# Spec Resolve Path

## Purpose

Tools and skills that encounter filesystem paths (e.g. relative links in `spec.md`) need to convert them into logical spec identifiers for use in `dependsOn` fields. The `specd spec resolve-path <path>` command resolves a filesystem path to the canonical `workspace:prefixed/capability/path` identifier used in `.specd-metadata.yaml`.

## Requirements

### Requirement: Command signature

```
specd spec resolve-path <path> [--format text|json|toon] [--config <path>]
```

- `<path>` — required positional; filesystem path (absolute or relative to cwd) pointing to a spec directory or a file within one (e.g. `specs/core/change/spec.md` or `specs/core/change`)
- `--format` — optional; output format, defaults to `text`
- `--config` — optional; path to `specd.yaml`

### Requirement: Path resolution

1. Resolve `<path>` to an absolute path (relative to `process.cwd()`)
2. If the path points to a file, use its parent directory
3. For each workspace in config, check if the resolved directory falls under `workspace.specsPath`
4. If multiple workspaces match, use the most specific (longest `specsPath` prefix)
5. Compute the relative path from `specsPath`, prepend the workspace's `prefix` (if set)
6. Output `workspace:prefixed/capability/path`

### Requirement: Output format

In `text` mode (default), the command prints the spec identifier to stdout:

```
workspace:capability-path
```

For example: `core:core/change`.

In `json` or `toon` mode, the output is an object:

```json
{
  "workspace": "core",
  "specPath": "core/change",
  "specId": "core:core/change"
}
```

### Requirement: Error cases

- Path does not fall under any configured workspace's `specsPath` — exit 1, error message to stderr
- Resolved path does not exist on disk — exit 1, error message to stderr

## Constraints

- The resolver is a pure function — no I/O, just path math against config
- When a path matches multiple workspaces, the most specific (longest `specsPath` prefix) wins
- File paths are resolved to their parent directory before matching

## Spec Dependencies

- [`cli:cli/entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`core:core/config`](../../core/config/spec.md) — workspace and prefix configuration
- [`core:core/spec-id-format`](../../core/spec-id-format/spec.md) — canonical `workspace:capabilityPath` format
