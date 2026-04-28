# Workflow Automation

## Purpose

To ensure consistent and efficient agent interactions across the SpecD lifecycle by defining policies for diagnostic output and data extraction. This spec minimizes "AI blindness" by mandating human-optimized text for status checks and machine-optimized formats for data-intensive operations.

## Requirements

### Requirement: Diagnostic Priority

AI agents SHALL prioritize text-based output (`--format text`) for all lifecycle status checks, transition attempts, and validation commands to ensure visibility of human-readable blockers and notes.

### Requirement: Data Extraction

AI agents SHALL use machine-optimized formats (`--format json`, `--format toon`) strictly when structured data extraction is required for subsequent tool calls or internal state management.

### Requirement: Repair Strategy

Agents SHALL follow the "Next Action" recommendations provided in command outputs before attempting to repeat a failed lifecycle operation.

### Requirement: Canonical Command References

Agent-authored workflow instructions and examples MUST use canonical plural command groups for countable resources (for example: `changes`, `specs`, `archives`, `drafts`).

Singular forms MAY be referenced only as aliases.

## Spec Dependencies

- [`cli:cli/command-resource-naming`](../cli/command-resource-naming/spec.md) — canonical plural naming policy used by agent-facing command examples
