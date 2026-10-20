# Delivery and context audit

## Scope

`schema-std:standard-schema`, `cli:change-status`, `cli:change-transition`, `skills:workflow-automation`, `core:compile-context`, `core:get-artifact-instruction`, and `core:get-hook-instructions`.

## Requirements and implementation

- Standard schema, CLI status/transition output, automation guidance, context compilation, artifact instructions, and hook instructions expose the schema-driven lifecycle model described by the proposal.
- CLI and skill tests cover `--next`, disabled-step bypass, optional-step display, repair guidance, sovereign schema behavior, and the separation of explicit verification evidence from lifecycle transitions.
- Documentation and skills remain consistent with the archived custom-check/hook foundation: custom predicates are not converted into hooks, and bypassed lifecycle steps do not synthesize hook execution.

## Test coverage

- `@specd/cli`: 86 files / 1,101 tests passed.
- `@specd/skills`: 9 files / 62 tests passed.
- `@specd/schema-std` test command exited successfully.

## Findings

No delivery-specific behavioral discrepancy was found. However, the repository-wide typecheck cannot complete because Core fails, and repository lint fails on Core files touched by this change. Therefore these delivery surfaces cannot be declared globally compliant yet.

## Summary

Delivery behavior and tests align with the proposal, but the shared quality gates remain blocking.
