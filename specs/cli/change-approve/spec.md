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

The command MUST NOT compute fingerprints itself. It SHALL delegate spec approval to `ApproveSpec` and sign-off to `ApproveSignoff`, which reconcile fresh inputs and create the canonical artifact and implementation fingerprints.

Spec approval is available only in reconciled `ready` after required artifact validation with no non-task drift or pending review. Sign-off is available only in reconciled `done` with valid verification evidence.

### Requirement: Approve spec behaviour

`approve spec` invokes `ApproveSpec`. It is valid when the change is in a binding `from` state for `approval.spec` (currently `ready`) or, for drain, `pending-spec-approval`. On success from `ready`, the change stays in `ready` with a recorded spec approval. It MUST NOT print a transition to `pending-spec-approval`. Help text MUST use bound-`from` language, with `ready` as the current example.

### Requirement: Approve signoff behaviour

`approve signoff` invokes `ApproveSignoff`. It is valid when the change is in a binding `from` state for `approval.signoff` (currently `done`) or, for drain, `pending-signoff`. On success from `done`, the change stays in `done` with a recorded signoff. Help text MUST use bound-`from` language, with `done` as the current example.

### Requirement: Output on success

Success output SHALL identify the approved gate, resulting materialized status `valid`, approver, decision time, and summarized fingerprint scope. Sign-off output SHALL distinguish an observed empty implementation map from legacy missing evidence and show the normalization algorithm without printing file contents.

If pre-approval reconciliation commits recovery or reveals a blocker, the command SHALL render the returned state, reasons, and next action and MUST NOT report approval success.

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
- [`core:change`](../../core/change/spec.md) — approval records consumed by transition checks
- [`core:transition-checks`](../../core/transition-checks/spec.md) — approval.spec / approval.signoff
