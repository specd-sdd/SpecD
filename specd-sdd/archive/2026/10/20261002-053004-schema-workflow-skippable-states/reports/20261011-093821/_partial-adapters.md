# Partial Compliance Audit — Schema, CLI, and Skills

## Scope

`schema-std:standard-schema`, `cli:change-status`, `cli:change-transition`, and `skills:workflow-automation`, plus relevant global constraints and direct dependencies.

## Requirements summary

The batch exposes optional/disabled lifecycle configuration in the standard schema, renders dynamic pipeline/status projections, delegates `--next` to Core topology, and defines attempt ownership so full verification shares one attempt with delegated compliance.

## Implementation status

- Standard schema declares the workflow/check structures consumed by Core.
- CLI status displays Core-owned availability/next action and annotates optional steps while omitting disabled ones.
- CLI transition delegates `next` target resolution and check execution to Core rather than retaining a separate next-state table.
- Skills protocol requires independent verify to own one attempt and delegated compliance to reuse it without starting/completing another.
- After attempt `verification-attempt-5`, targeted CLI tests passed: 2 files / 89 tests; the generated skill protocol test passed: 1 file / 2 tests.
- The compliance invocation honored delegated ownership: it did not start or complete another attempt.

## Discrepancies

No additional adapter-specific discrepancy was found. Adapter behavior is affected by topology findings T-01 through T-03, but the CLI and skills themselves delegate consistently to the currently implemented Core contracts.

## Test coverage

Coverage exists for incomplete-task availability, dynamic next action, optional/disabled pipeline rendering, drafted hop suppression, `--next` success/failure paths, disabled-step skipping, pending-state behavior, and attempt ownership text generation.

## Dependency/global compliance

Adapters delegate inward to Core, preserve ESM/TypeScript conventions, and use Vitest. No project-wide architecture or convention violation was found.

## Counts

- Specs audited: 4
- Findings: 0 adapter-local
- Relevant tests passed: 91
