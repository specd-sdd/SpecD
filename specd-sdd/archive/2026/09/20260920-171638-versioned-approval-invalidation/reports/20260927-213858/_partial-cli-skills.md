# Partial audit — CLI, skills, and public protocol

## Requirements summary

Scope: `cli:change-status`, `cli:change-invalidate`, `cli:change-approve`, `cli:change-transition`, `cli:change-create`, `cli:change-edit`, `cli:change-verification`, `skills:workflow-automation`, and `skills:skill-templates-source`.

The merged contracts require the CLI to remain a thin adapter over Core-owned decisions; expose reconciled validity, blockers, recovery, and next action consistently; validate inputs before mutation; provide safe whitelisted JSON/TOON projections; keep text output semantically aligned; and teach generated lifecycle skills to use explicit verification attempts, delegated compliance ownership, and canonical status guidance.

## Implementation status

**PASS.** CLI commands and source templates conform:

- `changes status` exposes reconciled state, materialized validity, checks, blockers, active/completed verification, transitions, and Core-owned next action.
- create/edit/approve/invalidate/transition commands present projection changes and recovery without implementing validity policy locally.
- edit text output includes returned blocker codes and the exact Core-owned next action; JSON and TOON retain equivalent typed meaning.
- verification `start`, `complete`, and `invalidate` validate `--format` before context resolution/use-case invocation. Invalidate also requires a non-empty reason before mutation.
- structured verification output is explicitly whitelisted: it contains safe identifiers, status, algorithms/counts, persisted reason and applicable recovery, while excluding raw hashes, source content, and internal fields.
- start/complete do not invent a lifecycle next action; invalidate renders the action supplied by Core. Documentation states the same rule.
- repeated invalidation reports the retained original reason in text, JSON, and TOON.
- source and installed skill copies agree on attempt ownership: verify starts/completes the outer attempt, delegated compliance never does, and findings route back without falsely completing verification.
- lifecycle skills begin from fresh status, respect committed automatic recovery, do not hand-roll invalidation, preserve ungated workflow state when allowed, and retain archive live-preflight rules.

## Discrepancies

None found in this batch.

The prior CLI-1, CLI-2, CLI-3, and DOC-1 findings are resolved: edit renders blockers/guidance; format validation precedes mutations; the contract now deliberately limits next-action output for start/complete while retaining Core-owned guidance for invalidate; and documentation describes safe projections rather than raw use-case serialization.

## Test coverage

- `packages/cli/test/commands/change/verification.spec.ts`: delegation, reason validation, pre-mutation format validation for all three commands, safe JSON/TOON projections, semantic parity, persisted reasons, and structured errors.
- `packages/cli/test/commands/change-edit.spec.ts`: preserved-state blockers and Core-owned next action in text.
- `packages/cli/test/commands/change/status.spec.ts`: validity and verification projections plus renew-in-place guidance.
- change create/approve/invalidate/transition suites cover flags, safe errors, gate consequences, and presentation.
- `packages/skills/test/template-workflow.spec.ts`: canonical reconciliation language, attempt ownership, complete delegated decision matrix, preserve routing, live archive preflight, and implementation-link draining.
- `packages/skills/test/generated-skill-protocol.spec.ts`: installed/source-template protocol parity.

Passing suites: CLI **82 files / 955 tests**; skills **9 files / 61 tests**; SDK **9 files / 73 tests**; agent plugins **23 tests** total (Claude 5, Codex 4, Copilot 4, OpenCode 5, Standard 5).

## Missing tests

No material missing scenario was identified. Documentation and templates are asserted where protocol drift would be consequential, while command behavior is covered at presenter and adapter boundaries.

## Spec dependency chain

The CLI entrypoint, Core use-case, GetStatus, spec-ID, configuration, docs, SDK review, command resource naming, agent, context, metadata, and transition-check dependencies were checked at depth one. The templates remain the source of truth and installed copies are synchronized by tests.

## Summary counts

- Specs audited: 9
- Merged scenarios inventoried: 256
- Confirmed discrepancies: 0
- Material missing tests: 0
- Result: PASS
