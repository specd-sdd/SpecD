# Change Validate

## Overview

Defines the `specd change validate <name> <workspace:capability-path>` command, which validates a change's artifact files against the active schema for a specific spec and marks passing artifacts as complete.

## Requirements

### Requirement: Command signature

```
specd change validate <name> <workspace:capability-path> [--format text|json|toon]
```

- `<name>` — required positional; the name of the change to validate
- `<workspace:capability-path>` — required positional; the spec ID to validate against (e.g. `default:auth/oauth`). Must be one of the change's declared `specIds`.
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Behaviour

The command invokes the `ValidateArtifacts` use case. It resolves `schemaRef` and `workspaceSchemasPaths` from the loaded `SpecdConfig` and passes them along with the change name and spec ID.

### Requirement: Output on success

In `text` mode (default), when all artifacts pass:

```
validated <name>/<workspace:capability-path>: all artifacts pass
```

In `text` mode, when there are warnings but no failures:

```
validated <name>/<workspace:capability-path>: pass (N warning(s))
warning: <artifactId> — <description>
...
```

In `json` or `toon` mode, the output is (encoded in the respective format):

```json
{ "passed": true, "failures": [], "warnings": [{ "artifactId": "...", "description": "..." }] }
```

### Requirement: Output on failure

In `text` mode, the command prints each failure to stdout, exits with code 1:

```
validation failed <name>/<workspace:capability-path>:
  error: <artifactId> — <description>
  ...
  warning: <artifactId> — <description>
  ...
```

In `json` or `toon` mode, the output is (encoded in the respective format):

```json
{"passed": false, "failures": [{"artifactId": "...", "description": "..."}], "warnings": [...]}
```

The process exits with code 1 when `passed` is `false`, regardless of format.

### Requirement: Spec ID not in change

If the given `<workspace:capability-path>` is not declared in the change's `specIds`, the command exits with code 1 and prints an `error:` message to stderr.

### Requirement: Error cases

- If the change does not exist, exits with code 1.
- If the schema cannot be resolved, exits with code 3.

## Constraints

- `schemaRef` and `workspaceSchemasPaths` are always resolved from the loaded config — never supplied by the user
- Validation output (failures and warnings) goes to stdout; only CLI/system errors go to stderr
- The command marks artifacts as complete in the manifest when they pass

## Examples

```
specd change validate add-oauth-login default:auth/oauth
specd change validate update-billing default:billing/invoices
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/core/change/spec.md`](../../core/change/spec.md) — artifact status, validation, approval invalidation
- [`specs/core/spec-id-format/spec.md`](../../core/spec-id-format/spec.md) — canonical `workspace:capabilityPath` format
