# Change Verification

## Purpose

Users and skills need to start, complete, and withdraw verification independently of lifecycle position. The CLI delegates these operations to application use cases and reports active attempts, completed evidence, freshness, and canonical recovery guidance.

## Requirements

### Requirement: Command group and signature

The CLI SHALL expose:

```text
specd changes verification start <name> [--format text|json|toon]
specd changes verification complete <name> [--format text|json|toon]
specd changes verification invalidate <name>
  --reason <text>
  [--format text|json|toon]
```

`--reason` is mandatory audit evidence. The transition command MUST NOT expose a verification restart or invalidation flag.

All three commands SHALL support any lifecycle state of an active change. They do not require `verifying` or move the change merely to verify; independent mandatory gate recovery remains owned by reconciliation.

### Requirement: Start and complete delegation

Start SHALL call `StartVerification.execute({ name })`, which refreshes tracking and resolution, runs the registered implementation-input checks, and captures the attempt baseline only after they pass. Repeating start creates a new active attempt and preserves superseded history. Output SHALL identify the attempt and any supersession without claiming successful verification.

Complete SHALL call `CompleteVerification.execute({ name })`. It requires an active attempt, fresh resolvable inputs, and equality with that attempt's baseline before recording successful evidence. It records the caller's declaration of completed checks and does not execute tests. Missing attempts or mismatches fail without baseline replacement or successful evidence. Output SHALL identify the completed attempt and fingerprint scope without dumping source contents.

Both commands SHALL be thin adapters. They MUST NOT implement fingerprint calculation, projection mutation, or independent recovery. Completion and the transition predicate reuse the same freshness evaluator, but the predicate MUST NOT invoke completion.

Start and complete SHALL identify the affected attempt or completed evidence and safe fingerprint scope in every output format. They MAY show blockers or recovery effects returned by their Core use case, but MUST NOT synthesize a lifecycle next action locally. Callers that need a canonical next action after these state-independent operations use `changes status`. The invalidation command retains the explicit next-action requirement below because its Core result supplies that guidance.

### Requirement: Delegation to InvalidateVerification

The command SHALL call `InvalidateVerification.execute({ name, reason })`. It MUST NOT calculate fingerprints, mutate manifest projections, append events, run verification, or issue a lifecycle transition itself.

### Requirement: Success and idempotent output

Text output SHALL state whether verification was newly invalidated or was already stale, identify the retained completed-verification record, and show any sign-off consequence, committed recovery state, blockers, and canonical next action.

JSON and TOON SHALL expose the equivalent typed result, including `invalidated`, verification status, persisted reason, current state, blockers, automatic return when present, and next action. Text SHALL identify the same persisted reason. On an idempotent repeat with a different requested reason, every format reports the original retained invalidation reason rather than echoing the unused new input. Output MUST NOT reveal source contents or misrepresent invalidation as a new verification attempt.

### Requirement: Error handling

Commands exit with code `1` for an unknown or inactive change, missing required reason, absent required attempt or completed evidence, unresolved inputs, fingerprint mismatch, or reconciliation/configuration failure. Stable Core error codes and actionable guidance SHALL be preserved. Mismatch guidance recommends inspecting changes and repeating start plus verification work before completion, never immediate completion after resetting a baseline.

An already stale completed verification is a successful idempotent result, not an error.

An unsupported `--format` value MUST fail before any of the three mutating use cases is invoked. A formatting error MUST NOT leave a newly started attempt, completed record, or invalidation behind.

### Requirement: Safe public output projection

JSON and TOON SHALL expose a stable, whitelisted CLI projection of each Core result rather than serialize the raw use-case object. The projection MUST include documented attempt/evidence identifiers, status, safe fingerprint summary, and applicable reconciliation fields while excluding source contents and raw file hashes. Text, JSON, and TOON MUST agree on the meaning of fields they share.

### Requirement: Status and skill discoverability

The command MAY be presented as a manual corrective action when the user explicitly wants to withdraw completed verification. It MUST NOT be suggested as the normal way to enter or repeat `verifying`.

Normal verification begins through explicit start from any active state. Status SHALL distinguish active attempts from completed evidence. Independent verify and change-scoped compliance invoke start and complete; when verify delegates to compliance, compliance shares the explicitly supplied attempt and returns findings, while verify alone completes after all checks succeed. Baseline renewal uses another start and repeated checks in place, never a self-transition or required exit/re-entry.

## Constraints

- The CLI is a thin adapter over `StartVerification`, `CompleteVerification`, and `InvalidateVerification`.
- Invalidation preserves fingerprints and history.
- No force flag bypasses missing verification evidence.
- Only explicit start requests baseline capture; transitions and invalidation never do.

## Spec Dependencies

- [cli:entrypoint](../../cli/entrypoint/spec.md) — command registration, formatting, and exit-code conventions
- [core:invalidate-verification](../../core/invalidate-verification/spec.md) — authoritative manual invalidation
- [core:get-status](../../core/get-status/spec.md) — canonical state, blockers, and next-action guidance
- [core:change](../../core/change/spec.md) — state-independent start/completion contracts and evidence
- [core:transition-checks](../../core/transition-checks/spec.md) — input checks and shared freshness evaluation
