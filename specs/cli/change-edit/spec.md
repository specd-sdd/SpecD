# Change Edit

## Purpose

A change's scope often evolves after creation — specs get added, removed, or swapped as understanding deepens. `specd change edit <name>` modifies the spec scope of an existing change by adding or removing spec IDs. Workspaces are never managed directly — they are always derived from the resulting set of `specIds` after the edit.

## Requirements

### Requirement: Command signature

```
specd change edit <name>
  [--add-spec <id>] [--remove-spec <id>]
  [--description <text>] [--invalidation-policy <policy>]
  [--format text|json|toon] [--config <path>]
```

- `<name>` — required positional; the name of the change to edit
- `--add-spec <id>` — repeatable; adds a spec ID to `specIds`. `<id>` follows the `[<workspace>:]<capability-path>` format of `core:spec-id-format`; the value is passed to `EditChange` unchanged and the use case validates it and resolves a missing workspace to `default`
- `--remove-spec <id>` — repeatable; removes a spec ID from `specIds`; passed unchanged
- `--description <text>` — optional; sets or replaces the free-text description of the change
- `--invalidation-policy <policy>` — optional; sets the invalidation policy of the change (`none`, `surgical`, `downstream`, or `global`)
- `--format text|json|toon` — optional; output format, defaults to `text`
- `--config <path>` — optional; path to `specd.yaml`

Each value is one whole spec ID and is never split on commas. The command does not validate, qualify, or normalize spec IDs.

At least one of `--add-spec`, `--remove-spec`, `--description`, or `--invalidation-policy` must be provided; running with none of them is a CLI usage error (exit code 1). The usage check happens before configuration is resolved, so a missing `specd.yaml` never masks the usage error.

### Requirement: Workspace derivation

The command derives no workspaces itself. `EditChange` derives the `workspaces` set from the workspace prefixes of all resulting spec IDs (the `Change.workspaces` getter): workspaces no longer referenced by any spec disappear, and workspaces required by added specs appear. The command only prints the `workspaces` of the returned change. The user never specifies workspace IDs directly.

### Requirement: ReadOnly workspace rejection

The command MUST NOT resolve workspaces or check ownership itself. `EditChange` rejects specs in `readOnly` workspaces with `ReadOnlyWorkspaceError` before any edit is applied (see `core:edit-change`), and the command MUST map that error to exit code 1 and print its message to stderr, with one line per offending spec and no remediation steps.

The `--remove-spec` flag is not subject to ownership checks — removing a spec from a change does not write to the workspace.

### Requirement: Approval invalidation

Any modification to `specIds` (and by extension `workspaces`) causes the domain to append an `invalidated` event followed by a `transitioned` event rolling back to `designing`. The CLI reports this in the output. Updating `--description` alone does not trigger invalidation.

### Requirement: Output on success

On success, output depends on `--format`:

- `text` (default): prints a human-readable success message to stdout showing the updated change name, spec IDs, and workspaces. If approval invalidation occurred, a warning is also printed to stderr.
- `json` or `toon`: outputs `{ result: "ok", name, specIds, workspaces, invalidated, state }` (encoded in the respective format); `specIds` and `workspaces` are arrays, one whole name per element.

### Requirement: Error cases

- If the change does not exist, exits with code 1.
- If a `--remove-spec` value is not in the current `specIds`, exits with code 1.
- If an `--add-spec` value is not a valid spec ID, exits with code 1 and prints the `InvalidSpecIdError` message, which quotes the full value.
- If an `--add-spec` value uses a workspace not declared in `specd.yaml`, exits with code 1 and prints the `WorkspaceNotFoundError` message.
- If an `--add-spec` value targets a workspace with `readOnly` ownership, exits with code 1.
- If `--invalidation-policy` is not one of `none`, `surgical`, `downstream`, or `global`, exits with code 1 and prints the `InvalidInputError` message from `EditChange`.

## Constraints

- All edits are applied atomically — either all succeed or none are applied
- The change name and `createdAt` are immutable and cannot be changed
- A discarded change cannot be edited
- Workspaces are always derived from `specIds` — they are never set independently
- Specs targeting readOnly workspaces are rejected by `EditChange` before any edits are applied
- \--remove-spec is not subject to ownership checks
- The command holds no spec ID or ownership rule; it forwards raw values to the use case

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

- [`cli:entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`core:change`](../../core/change/spec.md) — mutable fields, approval invalidation rules
- [`cli:change-create`](../change-create/spec.md) — spec id format and workspace derivation logic
- [`core:spec-id-format`](../../core/spec-id-format/spec.md) — canonical `workspace:capabilityPath` format
- [`core:edit-change`](../../core/edit-change/spec.md) — validation, `readOnly` rejection, invalidation policy and `specIds` rules live in the use case
