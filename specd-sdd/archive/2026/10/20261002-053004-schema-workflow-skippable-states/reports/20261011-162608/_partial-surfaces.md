# Delegated compliance audit — schema/CLI/skills surfaces

- Change: `schema-workflow-skippable-states`
- Outer attempt: `verification-attempt-6`
- Scope: `schema-std:standard-schema`, `cli:change-status`, `cli:change-transition`, `skills:workflow-automation`
- Mode: delegated, read-only; this audit did not start or complete verification and did not mutate lifecycle state.
- Sources: merged `changes spec-preview` output, change deltas, graph search/impact, implementation and tests. The graph reported `CONTENT_UNKNOWN`, so graph evidence was supplemented with direct inspection.

## Requirements summary

1. `schema-std:standard-schema`: workflow rows accept `optional` and `disabled`; optional rows can be bypassed after skip checks, disabled rows leave the active axis/graph, bedrock states cannot be disabled, and hooks do not run for bypassed steps.
2. `cli:change-status`: render the check-derived topology without local recomputation, annotate optional steps, exclude disabled steps, and expose legal shortcut transitions.
3. `cli:change-transition`: `--next` forwards the sentinel to Core; Core selects the next active hop, supports checked optional bypasses/disabled steps, and unavailable happy-path hops render an error/repair guide.
4. `skills:workflow-automation`: lifecycle skills must read fresh canonical status, dynamically consume `nextAction.command` and `lifecycle.availableTransitions`, advance directly over optional/disabled steps, and never synthesize hooks for bypassed steps.

## Implementation status

| Spec                         | Status                    | Evidence                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema-std:standard-schema` | Implemented               | `WorkflowStepZodSchema` accepts both flags and normalizes them to `false` (`packages/core/src/infrastructure/schema-yaml-parser.ts:270-301`); `WorkflowStep` exposes their semantics (`packages/core/src/domain/value-objects/workflow-step.ts:96-143`). Topology validation and skip semantics are exercised by `workflow-topology.spec.ts` and transition tests.     |
| `cli:change-status`          | Implemented               | Text renders check-derived `availableTransitions` and `[optional]` annotations (`packages/cli/src/commands/change/status.ts:296-306`); structured output preserves `validTransitions`, `availableTransitions`, optionality and blocker fields (`:501-516`). Disabled rows are excluded upstream by `GetStatus`, as required by the spec's no-local-recomputation rule. |
| `cli:change-transition`      | Implemented               | CLI maps `--next` to the literal sentinel and delegates to `TransitionChange` (`packages/cli/src/commands/change/transition.ts:354-378`), while typed unavailable-next failures use the repair-guide path. Core tests cover skip checks and hook suppression.                                                                                                          |
| `skills:workflow-automation` | **Not fully implemented** | Shared/status recovery guidance exists, but lifecycle progression remains encoded as fixed state branches and explicit per-state hook calls. It does not generally retrieve structured status or drive progression from `nextAction.command` / `availableTransitions`. See finding F1.                                                                                 |

## Discrepancies

### F1 — HIGH — generated lifecycle skills still hardcode the canonical pipeline and can execute hooks for a step the active schema bypasses

The merged skill contract says skills **MUST** consume `nextAction.command` and `lifecycle.availableTransitions` dynamically from `changes status --format toon`, advance directly along that path, and not execute hooks for bypassed intermediate steps.

Evidence:

- `specd-implement` reads only text status (`.agents/skills/specd-implement/SKILL.md:21-34`) and, from `ready`/`spec-approved`, unconditionally runs `implementing` pre-hooks then explicitly transitions to `implementing` (`:69-87`). If `implementing` is optional and the status recommends a direct later hop, the skill neither reads `availableTransitions` structurally nor follows it.
- `specd-verify` encodes `implementing → verifying → done → archivable`, including unconditional hooks for those named states (`.agents/skills/specd-verify/SKILL.md:58-103`, `:324-370`). With disabled `verifying`, invoking this skill from `implementing` still instructs the agent to run `verifying` hooks before attempting the hardcoded transition—the exact behavior the requirement forbids.
- `specd-design` similarly hardcodes `designing` and `ready` hooks/transitions from text status (`.agents/skills/specd-design/SKILL.md:41-77`, `:373-411`).
- `specd-archive` admits only `archivable`/`archiving` and runs fixed `archiving` hooks (`.agents/skills/specd-archive/SKILL.md:24-47`, `:70-75`), rather than treating the structured next action/available hops as the canonical progression input.
- Repository search finds `nextAction` handling only in `specd-new`; the main design/implement/verify/archive skills do not consume `lifecycle.availableTransitions` at all.

Two possible resolutions:

1. **Implementation correction (preferred, consistent with the proposal/delta):** update generated skill templates and synchronized `.agents`/`.codex` outputs so every lifecycle entry reads structured status and routes from `nextAction.command` plus `availableTransitions`; only run hooks for the actual source/target steps that will be exited/entered. Add protocol tests for disabled `verifying` and optional `implementing` bypasses.
2. **Spec correction:** narrow `skills:workflow-automation` so dynamic routing applies only to a separate orchestrator, and explicitly permit individual skills to remain state-specific. This would weaken the intended end-to-end schema-driven workflow and conflicts with the new scenario and proposal intent, so it is not recommended.

Impact: the Core/CLI can correctly advertise and execute a legal schema-specific shortcut while the agent instructions still choose a fixed intermediate step and run its hooks. This makes skippable/disabled states unreliable in the primary automated workflow even though domain behavior is correct.

## Test coverage

Executed package suites (the package scripts expand the supplied filters to their full Vitest suites):

- Core: **236 files / 2984 tests passed**.
- CLI: **86 files / 1101 tests passed**.
- Skills: **9 files / 62 tests passed**.

Coverage observed:

- Schema parser tests cover workflow declaration parsing/defaulting; topology tests cover disabled steps, optional bypasses, bedrock/approval-anchor validation, and legal progression.
- CLI status has a direct assertion for text `[optional]`, structured optionality and shortcut `availableTransitions` (`packages/cli/test/commands/change/status.spec.ts:1439-1513`).
- CLI transition tests cover forwarding `to: 'next'` and `HappyPathNextUnavailableError`; Core transition tests cover optional-step skip checks and successful bypass (`packages/core/test/application/use-cases/transition-change.spec.ts:3542-3594`) plus hook suppression (`:3596+`).
- **Missing regression:** no skill protocol/template test asserts that a disabled `verifying` step is skipped without running verifying hooks, or that optional `implementing` is bypassed according to `nextAction.command`/`availableTransitions`. Existing skill tests pass because they preserve the hardcoded workflow rather than enforcing the new merged requirement.

## Dependency conformance (direct depth 1)

- `schema-std:standard-schema → core:workflow-model`: conformant. Parser/value-object support is present, and topology owns validation/active-axis behavior.
- `cli:change-status → core:get-status`, `core:transition-checks`, `core:lifecycle-engine`: conformant. CLI projects the Core payload and does not rebuild topology locally.
- `cli:change-transition → core:transition-change`, `core:get-status`, `core:lifecycle-engine`: conformant. CLI delegates target resolution/execution and uses fresh status for failure guidance.
- `skills:workflow-automation → cli:change-status`, `cli:change-transition`: declared but behaviorally non-conformant. The dependent skills invoke those commands, yet do not consume the dynamic structured fields required by the dependency contract.

## Summary counts

- Specs audited: **4**
- Fully conformant: **3**
- Partially/non-conformant: **1**
- Findings: **1 HIGH**, **0 MEDIUM**, **0 LOW**
- Missing regression areas: **1** (dynamic skill routing and hook suppression across schema-bypassed lifecycle steps)
- Audit result: **FAIL** for full compliance until F1 is resolved or explicitly dismissed by changing the specification.
