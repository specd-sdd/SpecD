# Change Edit

## Purpose

A change's scope often evolves after creation — specs get added, removed, or swapped as understanding deepens. `specd change edit <name>` modifies the spec scope of an existing change by adding or removing spec IDs. Workspaces are never managed directly — they are always derived from the resulting set of `specIds` after the edit.

## Requirements

### Requirement: Command signature

The canonical command is:

```text
specd changes edit <name>
  [--add-spec <id> ...] [--remove-spec <id> ...]
  [--description <text>]
  [--artifact-policy none|surgical|downstream|global]
  [--workflow-policy preserve|redesign]
  [--format text|json|toon]
  [--config <path>]
```

Scope options remain repeatable and use `[<workspace>:]<capability-path>` (`core:spec-id-format`); each value is one whole spec ID, is never split on commas, and is passed to `EditChange` unchanged (the command does not validate, qualify, or normalize spec IDs). At least one of `--add-spec`, `--remove-spec`, `--description`, `--artifact-policy`, or `--workflow-policy` is required; running with none of them is a CLI usage error (exit code 1) checked before configuration is resolved, so a missing `specd.yaml` never masks the usage error. The CLI maps only supplied policy dimensions to the structured `EditChange` input and does not synthesize unspecified values.

### Requirement: Workspace derivation

The command derives no workspaces itself. `EditChange` derives the `workspaces` set from the workspace prefixes of all resulting spec IDs (the `Change.workspaces` getter): workspaces no longer referenced by any spec disappear, and workspaces required by added specs appear. The command only prints the `workspaces` of the returned change. The user never specifies workspace IDs directly.

### Requirement: ReadOnly workspace rejection

The command MUST NOT resolve workspaces or check ownership itself. `EditChange` rejects specs in `readOnly` workspaces with `ReadOnlyWorkspaceError` before any edit is applied (see `core:edit-change`), and the command MUST map that error to exit code 1 and print its message to stderr, with one line per offending spec and no remediation steps.

The `--remove-spec` flag is not subject to ownership checks — removing a spec from a change does not write to the workspace.

### Requirement: Approval invalidation

The command SHALL delegate scope and policy edits to `EditChange` and MUST NOT invalidate approvals or move lifecycle state itself.

Output SHALL report `scopeChanged` separately from actual validity changes, which approval or verification projections became stale or revoked, which artifact files require review, canonical blockers and next action, and any automatic return committed by reconciliation. With a required stale spec approval, it SHALL report `designing` even when the workflow policy is `preserve`. Without that gate, a preserved state remains visible together with the forward-progress blocker.

The command SHALL warn that approval was invalidated only when Core reports a committed projection change. A scope edit that leaves the approved canonical spec set and all fingerprinted inputs unchanged MUST NOT emit that warning. Any retained legacy `invalidated` field is deprecated and reflects actual validity change, not merely scope mutation.

Description-only and policy-only edits MUST NOT be described as approval invalidation unless core reports a separately detected fresh drift.

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
- If `--artifact-policy` is not one of `none`, `surgical`, `downstream`, or `global`, or `--workflow-policy` is not `preserve` or `redesign`, exits with code 1 and prints the `InvalidInputError` message.

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

- [`cli:entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, and output conventions
- [`core:change`](../../core/change/spec.md) — mutable fields and validity projections
- [`core:edit-change`](../../core/edit-change/spec.md) — canonical structured edit, reconciliation result, validation, and `readOnly` rejection
- [`core:config`](../../core/config/spec.md) — structured invalidation policy contract
- [`cli:change-create`](../change-create/spec.md) — shared spec ID option conventions
- [`core:spec-id-format`](../../core/spec-id-format/spec.md) — canonical spec ID format
