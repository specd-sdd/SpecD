# Workflow Automation

## Purpose

To ensure consistent and efficient agent interactions across the SpecD lifecycle by defining policies for diagnostic output and data extraction. This spec minimizes "AI blindness" by mandating human-optimized text for status checks and machine-optimized formats for data-intensive operations.

## Requirements

### Requirement: Diagnostic Priority

AI agents SHALL prioritize text-based output (`--format text`) for all lifecycle status checks, transition attempts, and validation commands to ensure visibility of human-readable blockers and notes.

### Requirement: Data Extraction

AI agents SHALL use machine-optimized formats strictly when structured data extraction is required for subsequent tool calls or internal state management.

Agents MUST prefer `--format toon` for structured extraction. Agents MAY use `--format json` only when `toon` is unavailable or explicitly requested.

### Requirement: On-demand outline retrieval

When artifact-instruction responses provide only outline availability references (for example `availableOutlines`), AI agents MUST retrieve full outline content on demand using the canonical command:

`specd specs outline <specPath> --artifact <artifactId>`

Agents MUST NOT rely on embedded full outline trees in `changes artifact-instruction` output.

### Requirement: Repair Strategy

Agents SHALL follow the "Next Action" recommendations provided in command outputs before attempting to repeat a failed lifecycle operation.

### Requirement: Canonical Command References

Agent-authored workflow instructions and examples MUST use canonical plural command groups for countable resources (for example: `changes`, `specs`, `archives`, `drafts`).

Singular forms MAY be referenced only as aliases.

For outline retrieval examples, the canonical form is `specd specs outline <specPath> --artifact <artifactId>`.

### Requirement: Command Necessity and Freshness

AI agents MUST avoid redundant command invocations when a prior command in the same skill execution already provides the required fields with equivalent semantics.

A command MAY be skipped only when both conditions hold:

1. The required information is already available from a prior command output in the current execution step.
2. The information is still fresh for the current decision boundary.

Agents MUST NOT assume continuity across separate skill invocations. When a skill may run later, in a different session, or without reliable in-memory state, the agent SHALL re-read the minimal required state before making lifecycle decisions.

When equivalence is not deterministic, agents SHALL run the explicit command instead of reusing inferred state.

### Requirement: Structural Validation and Content Review

Agents SHALL treat `specd changes validate` as structural/state validation only. A successful validation MUST NOT be interpreted as semantic approval of artifact content.

Agents MUST perform content review of requirements, constraints, and intent alignment before progressing lifecycle steps that depend on artifact correctness.

When overlap or drift risk exists for spec deltas, agents SHALL verify merged content with `specd changes spec-preview <change-name> <specId>` before accepting the delta outcome.

When review only needs one spec-scoped artifact, agents SHOULD prefer `specd changes spec-preview <change-name> <specId> --artifact <artifactId>` to reduce unnecessary output volume.

## Spec Dependencies

- [`cli:cli/command-resource-naming`](../cli/command-resource-naming/spec.md) — canonical plural naming policy used by agent-facing command examples
