---
status: accepted
date: 2026-11-24
decision-makers: specd maintainer
consulted: '-'
informed: '-'
---

# ADR-0032: Host-Neutral Lifecycle Guidance (Phase Intents and Check-Declared Actions)

## Context and Problem Statement

`@specd/core` workflow, status and validity projections (`nextAction`, blockers, check results, domain errors) embedded CLI command strings, agent slash commands and bypass flags (`command`, `bypassFlag`, "run `specd ...`"). That tied core to one delivery host, forced every other host (SDK, MCP, skills) to parse or ignore those strings, and put gate-specific knowledge (approvals, verification, legacy parking states) into the guidance code instead of into the checks that actually fail. How can core describe what is wrong and what should happen next without naming any host's syntax?

## Decision Drivers

- Core must not know the command-line syntax, slash commands or flags of any host.
- The remedy for a failure must come from the component that knows the failure: the check.
- Custom and plugin checks must be able to declare their own remedies without core changes.
- One canonical status must serve the CLI, the SDK, MCP and the skills.
- Legacy parking states (`pending-spec-approval`, `spec-approved`, `pending-signoff`, `signed-off`) must stay drain-only and be gated by checks like everything else.

## Considered Options

1. **Keep commands and flags in core projections** — rejected: it couples core to the CLI and plugin checks cannot declare remedies host-neutrally.
2. **Core exposes only a phase intent and every host derives the remedy** — rejected: each host would have to re-implement gate knowledge (approval, sign-off, verification freshness).
3. **Core exposes a phase intent plus a check-declared action (kind, parameters, host-neutral guidance); each host renders its own syntax** — chosen.
4. **Per-host message templates inside core** — rejected: core would again know every host.

## Decision Outcome

Chosen option 3.

1. **Phase intents.** `LifecycleActionIntent` is strictly a workflow phase: `design`, `implement`, `verify` or `archive`. `nextAction` carries `targetStep`, `actionType`, `reason`, `intent` and an optional `action`.
2. **Checks own remedies and skippability.** `CheckResult.action` holds a `CheckAction` (`approve-spec`, `approve-signoff`, `start-verification`, `refresh-status`, or a plugin kind such as `@x.y`). Skippability comes from the resolved bindings. `CheckPredicateFailedError` carries `checkId`, `checkCode`, `action`, `details` and `skippable`. Core messages never name flags or commands.
3. **Blockers are data, hosts are presenters.** Blockers carry `checkId`, `label` and `isSkippable`. The CLI derives the bypass flag (`--skip-checks <id>`) and the command from them in `guidance-presenter.ts`, and text, JSON and TOON all go through the same projection.
4. **Recovery stays in the reconciler.** Legacy parking states are drain-only and check-gated. Spec-consent recovery is not requested from `ready`, where `approval.spec` blocks progress and consent is renewed. A recovery committed before the requested operation surfaces as `ReconciledOperationBlockedError`, which hosts render as a repair guide.

### Consequences

- Good, because any host renders its own syntax from the same data and custom checks declare their remedies without touching core.
- Good, because core error messages and projections are host-neutral, and that is enforced by source-scan tests.
- Bad, because the public API changed: `SpecOverlapError`, `ArchiveDependencyMismatchError`, `command` and `bypassFlag` in core projections were removed (accepted: pre-release).
- Bad, because about 40 types and four action helpers were exported so that every type referenced by an exported result type is nameable, which widens the public surface.
- Bad, because `nextAction.action` is taken only from the failed predicates of the selected hop, so with stale verification at `archivable` the `start-verification` action stays on the blocker and not on `nextAction`.

### Confirmation

- Source-scan tests forbid flags, commands and slash commands in core (`host-neutral-errors.spec.ts`, `host-neutral-projections.spec.ts`).
- `guidance-presenter` and CLI blocker projection tests assert that raw `isSkippable` never reaches CLI output in text, JSON or TOON.
- `lifecycle-guidance`, `get-status` and `lifecycle-verdict` tests cover intents, actions and the blocker merge.
- SDK barrel type-equality tests and the guide catalog tests cover the exported types.

## More Information

Related ADRs: [ADR-0028](0028-materialized-validity-reconciliation.md) (validity reconciliation, with the update note about `ready`) and [ADR-0030](0030-open-check-registry-and-hook-failure-policies.md) (open check registry).

### Specs

- [`core:lifecycle-engine`](../../specs/core/lifecycle-engine/spec.md)
- [`core:get-status`](../../specs/core/get-status/spec.md)
- [`core:transition-checks`](../../specs/core/transition-checks/spec.md)
- [`core:transition-change`](../../specs/core/transition-change/spec.md)
- [`core:archive-change`](../../specs/core/archive-change/spec.md)
- [`core:change`](../../specs/core/change/spec.md)
- [`core:invalidate-change`](../../specs/core/invalidate-change/spec.md)
- [`cli:change-status`](../../specs/cli/change-status/spec.md)
- [`cli:change-transition`](../../specs/cli/change-transition/spec.md)
- [`skills:skill-templates-source`](../../specs/skills/skill-templates-source/spec.md)
- [`default:_global/error-handling-conventions`](../../specs/_global/error-handling-conventions/spec.md)
