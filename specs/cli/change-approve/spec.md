# Change Approve

## Purpose

Approval gates exist so that a human can explicitly sign off before work proceeds past critical checkpoints. `specd change approve spec` and `specd change approve signoff` record these human approval decisions, requiring a reason so each gate clearance is traceable.

## Requirements

### Requirement: Command signatures

```
specd change approve spec <name> --reason <text> [--format text|json|toon]
specd change approve signoff <name> --reason <text> [--format text|json|toon]
```

- `spec` / `signoff` — required sub-verb selecting which approval gate to exercise
- `<name>` — required positional; the name of the change to approve
- `--reason <text>` — required; a human-readable explanation for the approval decision
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Delegates gate state to kernel

The CLI MUST NOT pass `approvalsSpec` or `approvalsSignoff` to `ApproveSpec.execute` or `ApproveSignoff.execute`.

Gate enablement is determined by `config.approvals` baked into the kernel's approve use cases at construction. The CLI passes only `name` and `reason`.

The CLI MUST invoke `kernel.changes.approveSpec` and `kernel.changes.approveSignoff` — not `kernel.specs.*`.

### Requirement: Artifact hash computation

The CLI MUST NOT compute artifact hashes. Hash computation is owned by `ApproveSpec` and `ApproveSignoff` internally from on-disk artifact content using schema-defined pre-hash cleanup rules.

The user never supplies artifact hashes.

### Requirement: Approve spec behaviour

`approve spec` invokes `ApproveSpec`. It is only valid when the change is in `pending-spec-approval` state. On success, the change transitions to `spec-approved`.

### Requirement: Approve signoff behaviour

`approve signoff` invokes `ApproveSignoff`. It is only valid when the change is in `pending-signoff` state. On success, the change transitions to `signed-off`.

### Requirement: Output on success

On success, output depends on `--format`:

- `text` (default): prints to stdout:
- `json` or `toon`: outputs the following to stdout (encoded in the respective format):

where `<gate>` is `spec` or `signoff`.

### Requirement: Error cases

- `--reason` is mandatory; omitting it is a CLI usage error (exit code 1).
- If the change is not in the expected state for the gate, the command exits with code 1 and prints an `error:` message.
- If the change does not exist, exits with code 1.

## Constraints

- Artifact hashes are computed automatically from disk — the user never specifies them
- Both `spec` and `signoff` sub-verbs are required even when only one approval gate is enabled; the gate state enforces which command is currently valid

## Examples

```
specd change approve spec add-oauth-login --reason "spec looks good, proceed"
specd change approve signoff add-oauth-login --reason "implementation verified"
```

## Spec Dependencies

- [`cli:entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`core:change`](../../core/change/spec.md) — approval gates, spec-approved and signed-off states
