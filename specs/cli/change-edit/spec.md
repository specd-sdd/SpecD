# Change Edit

## Purpose

A change's scope often evolves after creation — specs get added, removed, or swapped as understanding deepens. `specd change edit <name>` modifies the spec scope of an existing change by adding or removing spec IDs. Workspaces are never managed directly — they are always derived from the resulting set of `specIds` after the edit.

## Requirements

### Requirement: Command signature

```
specd change edit <name>
  [--add-spec <id>] [--remove-spec <id>]
  [--description <text>]
  [--format text|json|toon]
```

- `<name>` — required positional; the name of the change to edit
- `--add-spec <id>` — repeatable; adds a spec ID to `specIds`. `<id>` follows the same `[<workspace>:]<capability-path>` format as `change create`, defaulting to `default` workspace when prefix is omitted
- `--remove-spec <id>` — repeatable; removes a spec ID from `specIds`
- `--description <text>` — optional; sets or replaces the free-text description of the change
- `--format text|json|toon` — optional; output format, defaults to `text`

At least one flag must be provided; running with no flags is a CLI usage error (exit code 1).

### Requirement: Workspace derivation

After computing the new `specIds`, the CLI derives the new `workspaces` set from the workspace prefixes of all resulting spec IDs — the same logic as `change create`. Workspaces that are no longer referenced by any spec are removed automatically; new workspaces required by added specs are added automatically. The user never specifies workspace IDs directly.

### Requirement: ReadOnly workspace rejection

After resolving the workspace for each `--add-spec` value, the CLI MUST check the workspace's `ownership` from `SpecdConfig`. If any spec's workspace has `readOnly` ownership, the command MUST exit with code 1 and print an error message to stderr:

```text
error: Cannot add spec "<specId>" to change — workspace "<workspace>" is readOnly.

ReadOnly workspaces are protected: their specs and code cannot be modified by changes.
```

This check MUST occur before applying any edits to the change. If multiple specs target readOnly workspaces, one error per spec MUST be printed. The error message MUST NOT suggest remediation steps.

The `--remove-spec` flag is not subject to ownership checks — removing a spec from a change does not write to the workspace.

### Requirement: Invariant enforcement

The change must retain at least one `specId` after editing. If `--remove-spec` operations would leave `specIds` empty, the command exits with code 1 before making any changes.

### Requirement: Approval invalidation

Any modification to `specIds` (and by extension `workspaces`) causes the domain to append an `invalidated` event followed by a `transitioned` event rolling back to `designing`. The CLI reports this in the output. Updating `--description` alone does not trigger invalidation.

### Requirement: Output on success

On success, output depends on `--format`:

- `text` (default): prints a human-readable success message to stdout showing the updated change name, spec IDs, and workspaces. If approval invalidation occurred, a warning is also printed to stderr.
- `json` or `toon`: outputs (encoded in the respective format):

### Requirement: Error cases

- If the change does not exist, exits with code 1.
- If a `--remove-spec` value is not in the current `specIds`, exits with code 1.
- If an `--add-spec` value uses a workspace prefix not declared in `specd.yaml`, exits with code 1.
- If an `--add-spec` value targets a workspace with `readOnly` ownership, exits with code 1.
- If the result would leave `specIds` empty, exits with code 1.

## Constraints

- All edits are applied atomically — either all succeed or none are applied
- The change name and `createdAt` are immutable and cannot be changed
- A discarded change cannot be edited
- Workspaces are always derived from `specIds` — they are never set independently
- Specs targeting readOnly workspaces are rejected via --add-spec before any edits are applied
- \--remove-spec is not subject to ownership checks

## Examples

```
# Add a spec (workspace inferred from prefix, defaults to 'default')
specd change edit add-oauth-login --add-spec auth/register

# Swap a spec — workspace recalculated from resulting specIds
specd change edit add-oauth-login --remove-spec auth/legacy --add-spec auth/oauth-v2

# Add a spec from a different workspace — that workspace is automatically added
specd change edit add-oauth-login --add-spec billing-ws:billing/invoices

# Update description only — no invalidation
specd change edit add-oauth-login --description "Add OAuth2 login via Google and GitHub"
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/core/change/spec.md`](../../core/change/spec.md) — mutable fields, approval invalidation rules
- [`specs/cli/change-create/spec.md`](../change-create/spec.md) — spec id format and workspace derivation logic
- [`specs/core/spec-id-format/spec.md`](../../core/spec-id-format/spec.md) — canonical `workspace:capabilityPath` format
