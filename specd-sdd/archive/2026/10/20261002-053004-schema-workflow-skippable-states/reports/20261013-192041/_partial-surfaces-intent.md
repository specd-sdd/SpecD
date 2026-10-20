# Compliance Partial — CLI, skills, documentation, and intent

- Change: `schema-workflow-skippable-states`
- Mode: delegated (`verification-attempt-9`); this audit neither started nor completed the attempt
- Scope: `cli:change-status`, `cli:change-transition`, `skills:workflow-automation`, their direct/global dependencies, `proposal.md`, `design.md`, documentation/examples, and archived `custom-checks-and-resilient-hooks`
- Merged-spec source: `changes spec-preview` for all three assigned change specs
- Graph state: `stale: false`, `fingerprintMismatch: false`, coverage complete; content health is `CONTENT_UNKNOWN` because observations are absent, so graph evidence was supplemented with direct focused reads

## Requirements Summary

### `cli:change-status`

1. The adapter must project `GetStatus` lifecycle data without locally recomputing topology or filtering transitions.
2. Optional steps must be annotated, disabled steps omitted, and check-permitted shortcuts preserved in `availableTransitions`.
3. `nextAction`, blockers, labels, repair information, reconciled state, evidence freshness, and schema identity must remain Core-owned projections.
4. Structured and text forms must remain compatible with drafted changes, schema-derived DAGs, task counts, display states, review data, and implementation tracking.

### `cli:change-transition`

1. The CLI must pass explicit targets or literal `to: 'next'` into `TransitionChange`; it must not choose topology routes itself.
2. `--next` means the nearest subsequent enabled step. It skips disabled rows but still enters an enabled optional step.
3. A farther optional shortcut is a separate Core recommendation exposed by `GetStatus.nextAction`; callers enact it using the explicit advertised target.
4. The adapter must pass `skipChecks`, preserve legacy flag translations, expose Core failures through the repair guide, and avoid hooks for unvisited/bypassed steps through Core execution.

### `skills:workflow-automation`

1. Lifecycle skills must begin from fresh structured status and use `nextAction.command` plus `lifecycle.availableTransitions` as the routing authority.
2. Skills must not infer optionality from tasks, YAML, or an empty `skipChecks` field, and must not invent additional bypass policy.
3. Hooks run only for states actually entered/exited; disabled or bypassed intermediate steps receive no hooks.
4. Structural validation is not semantic approval; lifecycle skills must review content and preserve attempt ownership rules.

### Proposal/design intent and documentation semantics

The proposal's central intent is present: schema-owned optional/disabled topology, separate entry checks and `step-skip` checks, dynamic binding composition, Core-owned routing, hook suppression, and sovereign change-schema resolution. The completed design refines the proposal's broad “schema-aware `--next`” wording into a deliberate split: `--next` is nearest-step and deterministic, while `nextAction` owns farther predicate-checked shortcut recommendations. This refinement is explicit in the design, merged specs, implementation, and tests; it is not an accidental divergence.

The documentation now states the four distinct cases correctly:

| Declaration      | Effective skip-check set | Meaning                                                                   |
| ---------------- | ------------------------ | ------------------------------------------------------------------------- |
| neither flag     | irrelevant               | mandatory step                                                            |
| `optional: true` | empty                    | step remains enterable; Core recommends unconditional bypass              |
| `optional: true` | non-empty                | bypass only when every effective binding passes; otherwise enter the step |
| `disabled: true` | none allowed             | step is absent and cannot be entered                                      |

“Effective” explicitly includes registry/plugin bindings as well as inline `skipChecks`. Consequently, `optional: true` plus no inline `skipChecks` does **not** imply “disabled”, and does not necessarily imply an empty effective set. The agent does not choose: Core evaluates the effective set and publishes `nextAction`.

## Implementation Status

### `cli:change-status` — COMPLIANT

- `packages/cli/src/commands/change/status.ts` renders lifecycle transitions, available steps, blockers, and `nextAction` from the status result.
- It does not introduce a second static-transition filter for active changes.
- Tests cover optional annotations, shortcut visibility, disabled-step omission at the projection contract, Core-owned next action, drafted read-only behavior, blocker labels, schema DAGs, evidence, and review output.

### `cli:change-transition` — COMPLIANT

- `packages/cli/src/commands/change/transition.ts:364-374` constructs `requestedTarget` as literal `'next'` when `--next` is used and forwards it unchanged to `kernel.changes.transition.execute`.
- The CLI performs no optionality or shortcut selection. It uses `GetStatus` only for the pre-transition state and post-failure repair guide.
- `packages/cli/test/commands/change/transition.spec.ts:94-120` proves that even when status recommends `verifying`, `--next` remains `{ to: 'next' }` and the mocked Core result enters nearest optional `implementing`; the output is `ready → implementing` and does not claim `verifying`.
- Existing tests cover explicit targets, unavailable-next failures, `skipChecks`, legacy aliases, repair guides, hook selectors, structured progress, and pending approval states.

### `skills:workflow-automation` — COMPLIANT

- All four generated lifecycle templates (`specd-design`, `specd-implement`, `specd-verify`, `specd-archive`) demand fresh structured status, honor `nextAction.command`, restrict targets to `availableTransitions`, and prohibit hooks for bypassed/disabled states.
- The templates explicitly stop when status routes to another skill instead of falling back to a hardcoded lifecycle recipe.
- `packages/skills/test/template-workflow.spec.ts` asserts the routing contract across generated templates, including the `availableTransitions` and `nextAction.command` protocol.

### Documentation/examples — COMPLIANT

- `docs/guide/custom-schemas.md:71-97` gives a four-case decision table and defines effective registry-plus-inline bindings.
- `docs/guide/schemas.md:165-172`, `docs/schemas/schema-format.md:704-718`, and `docs/core/custom-checks.md:118` consistently distinguish optional from disabled and assign route choice to Core.
- Generated guide content in `packages/guide/src/infrastructure/generated/guides.ts` contains the updated wording, so source docs and shipped on-demand guide data are aligned.
- The custom-schema example without inline `skipChecks` is no longer misleading because the adjacent explanation says registry bindings can still make it conditional (notably `workflow.tasksEmpty` for `implementing`).

### Archived `custom-checks-and-resilient-hooks` compatibility — COMPLIANT

- The archived contract introduced the open check registry, uniform `skipChecks`, governance, dynamic failure projection, and legacy CLI translations.
- The present implementation retains those contracts while adding the orthogonal `step-skip` scope and topology behavior.
- CLI still compiles `--allow-out-of-scope` and `--allow-overlap` into `skipChecks`; Core input remains free of the legacy booleans.
- Repair guides still project check labels, remediation commands, and bypass advice only for skippable checks.
- No contradiction or regression was found between archived intent and the merged current specs.

## Discrepancies

No correctness or specification discrepancies found.

### Clarification reviewed: proposal phrase “schema-aware `--next` advancement” — NOT A FINDING

- **Possible spec-drift interpretation:** read alone, the proposal phrase could be interpreted as requiring `--next` to take the farthest passing optional shortcut.
- **Possible implementation-bug interpretation:** under that isolated reading, forwarding `'next'` to nearest-step resolution would appear too conservative.
- **Resolution/evidence:** the completed design explicitly separates nearest-step `--next` from Core's farther `nextAction` shortcut (`design.md`, “Core-owned optional-path recommendation” and testing strategy). The merged `cli:change-transition` delta says the same, and its verify scenario requires the explicit `GetStatus.nextAction` target for the optional shortcut. Proposal intent is still fulfilled because `--next` is schema-aware (disabled steps are absent from topology) without conflating a convenience one-hop operation with conditional orchestration guidance.

### Clarification reviewed: `optional: true` plus omitted/empty inline `skipChecks` — NOT A FINDING

- **Possible documentation/spec-drift interpretation:** an example with no inline checks could look like an accidental alias for disabled or unconditional behavior.
- **Possible implementation-bug interpretation:** registry bindings might appear to violate the apparent empty YAML declaration.
- **Resolution/evidence:** all current guides define the _effective_ set as registry/plugin plus inline declarations. Only an actually empty effective set passes vacuously. An optional step remains present and explicitly enterable; a disabled step is removed and may not declare skip checks. The agent follows Core's projected route.

## Test Coverage

Focused execution performed during this audit:

- CLI status + transition suites: **2 files, 90 tests passed**.
- Skills workflow-template suite: **1 file, 18 tests passed**.

Coverage mapped to assigned requirements:

- `--next` literal forwarding and nearest optional entry despite a farther status recommendation: directly covered.
- Optional annotation and available shortcut projection in status: directly covered.
- Core-owned `nextAction` rather than CLI recomputation: directly covered.
- Dynamic skill routing and hook suppression language: template assertions cover all lifecycle templates.
- Custom checks, legacy aliases, skippability, and repair guide compatibility from the archived change: directly covered in transition CLI tests.
- Documentation delivery: generated-guide source contains the corrected semantics; the broader guide suite is handled by the parent full-verification matrix.

## Missing Tests

No blocking missing tests.

Low-priority hardening opportunity (not a compliance failure): add a narrow guide snapshot/assertion that explicitly checks the complete four-row optional/disabled table and the phrase that effective bindings include registry plus inline declarations. Current generated content is correct, and broader guide synchronization tests protect generation, but a semantic wording assertion would make accidental future ambiguity more obvious.

## Dependency Chain

- `cli:change-status` → `core:get-status` → lifecycle verdict/check evaluation → `core:workflow-topology` + `core:transition-checks` + sovereign schema.
- `cli:change-transition` → `core:transition-change` → `WorkflowTopology.nextForwardStep` for literal `'next'`, or explicit-target legality/bypass evaluation → effective transition and `step-skip` bindings → source/target hooks.
- `skills:workflow-automation` → structured `changes status` (`nextAction`, `availableTransitions`) → explicit lifecycle skill/target → CLI transition; skills do not reproduce Core policy.
- Schema authorship → `optional`/`disabled` + registry bindings + inline `skipChecks` → Core effective set → status recommendation; documentation mirrors this chain.
- Archived `custom-checks-and-resilient-hooks` → registry/governance/`skipChecks` foundation → current change's `step-skip` topology extension; compatibility remains additive.

Graph impact classified `packages/cli/src/commands/change/transition.ts` as HIGH risk and exposed dependencies through CLI helpers, formatter/error presentation, SDK host context, and Core composition. Focused adapter tests plus the parent full test matrix are proportionate to that risk.

## Summary counts

- Assigned change specs audited: **3**
- Intent/design documents audited: **2**
- Archived baseline changes cross-checked: **1**
- Documentation families checked: **4** (custom schemas, schema overview, schema format, custom checks; plus generated guide payload)
- Focused tests passed: **108**
- Critical discrepancies: **0**
- High discrepancies: **0**
- Medium discrepancies: **0**
- Low discrepancies: **0**
- Non-blocking hardening opportunities: **1**
- Overall result: **COMPLIANT**
