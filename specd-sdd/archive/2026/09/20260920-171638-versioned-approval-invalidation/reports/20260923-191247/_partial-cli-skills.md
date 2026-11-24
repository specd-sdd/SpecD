# Compliance audit — CLI and skills batch

Change: `versioned-approval-invalidation`  
Delegated verification attempt: `verification-attempt-3`  
Scope: `cli:change-status`, `cli:change-invalidate`, `cli:change-approve`, `cli:change-transition`, `cli:change-create`, `cli:change-edit`, `cli:change-verification`, `skills:workflow-automation`, `skills:skill-templates-source`, their direct dependencies (depth 1), and applicable global constraints.

## Requirements summary

| Spec                            | Main contract audited                                                                                                                                            | Status                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `cli:change-status`             | Render reconciled state, validity projections, separate active/completed verification evidence, safe fingerprint differences, canonical blockers and next action | Implemented; minor coverage gaps                                               |
| `cli:change-invalidate`         | Independent artifact/workflow flags, thin Core delegation, exact force refusal, policy/evidence/recovery/blocker output                                          | Partially compliant                                                            |
| `cli:change-approve`            | Core-owned fingerprinting/reconciliation, ready/done gate eligibility, materialized evidence output, canonical failure guidance                                  | Partially compliant                                                            |
| `cli:change-transition`         | Canonical status/use-case guidance, no retry/alternate hop/restart flag/self-transition, generic check output                                                    | Implemented                                                                    |
| `cli:change-create`             | Structured policy flags, config-derived defaults, no legacy scalar new-write surface                                                                             | Implemented; missing edge-case tests                                           |
| `cli:change-edit`               | Partial structured policy edits, Core-owned reconciliation, distinct scope/validity effects, blockers and next action in all formats                             | Partially compliant                                                            |
| `cli:change-verification`       | State-independent start/complete/invalidate commands, thin delegation, safe evidence output, stable mismatch guidance                                            | Implemented                                                                    |
| `skills:workflow-automation`    | Fresh-status recovery, in-place preserve review, explicit verification-attempt ownership, delegated compliance sharing                                           | Partially compliant because delegated compliance procedure is incomplete       |
| `skills:skill-templates-source` | Consistent source/generated lifecycle protocol, standalone/delegated attempt ownership, report-only non-change modes                                             | Partially compliant because phrase parity hides an incomplete delegated branch |

## Implementation status and evidence

The CLI commands consistently import the integration surface from `@specd/sdk`, preserving the global architecture rule that CLI is an adapter rather than a business-logic owner. Graph impact confirms the new command handlers are registered from `packages/cli/src/index.ts` and directly covered by their mirrored test files. `registerChangeVerification`, `registerChangeEdit`, and `registerChangeInvalidate` are all classified HIGH risk by the graph because their direct dependents include the CLI entrypoint and their command suites. The shared `summarizeFingerprint` presenter reaches all approval/status/transition/verification presenters and sixteen source/test files, so output-safety behavior is correctly centralized.

Positive implementation evidence:

- Status consumes `kernel.changes.status.execute`, renders `change.state` after that call, emits Core-provided blockers/next action, separates `verification.activeAttempt` from `verification.completed`, strips digest/content fields, and exposes both invalidation policy dimensions.
- Transition obtains status before resolving `next`, delegates the hop once, and on typed transition failures reloads status for a repair guide. It does not expose `--restart-verification`, does not implement attempt start/complete, and substitutes the actual change name through the Core-provided command.
- Create/edit/invalidate expose the new independent policy flags and use shared parsers. Create overlays explicit values on the already validated Core config projection; edit sends only supplied dimensions; invalidate marks overrides as command-scoped.
- Verification start, complete, and invalidate each invoke exactly one corresponding Core use case. Their presenters summarize fingerprints without file contents/digests. Mismatch guidance explicitly requires a new start and repeated work. Repeated invalidation renders the persisted reason returned by Core in text, JSON, and TOON.
- Skill source templates and installed copies contain the new reconciliation and attempt-ownership language. The generated-copy parity test covers `.agents`, `.codex`, `.claude`, `.github`, `.opencode`, and the installed shared protocol.

Executed evidence:

- `@specd/cli`: **82 files, 937 tests passed**.
- `@specd/skills`: **9 files, 59 tests passed**.
- Code graph: current, complete, schema-compatible; 1,214 indexed code files, 280 specs, no stale fingerprint.

## Discrepancies

### CLI-SKILLS-01 — HIGH — Delegated compliance is detected but has no complete workflow branch

**Affected specs:** `skills:workflow-automation`, `skills:skill-templates-source`.

The compliance template correctly detects `--change <name> --delegated --attempt <attemptId>` and says that delegated mode must not start or complete verification. However, all later change-scoped branches are restricted to `mode = change`:

- report placement uses the change directory only for `mode = change`; delegated mode falls into the generic config reports directory (`packages/skills/templates/skills/specd-compliance/SKILL.md.tpl:154-161`);
- scope discovery/status/project context/direct dependencies has a branch for `mode = change` but none for `mode = delegated` (`:171-200`);
- merged change previews are selected only for `mode = change`, so delegated mode is instructed to use the non-change `specs show` path (`:224-228`);
- final filenames enumerate full/change/diff/PR/single but not delegated (`:250-257`).

This is not merely cosmetic. A literal execution cannot determine the delegated audit scope or a valid final report filename, and may audit base specs rather than merged change specs. The current parent verification succeeded only because its delegation prompt supplied the scope, attempt, and exact report path externally.

**Why tests missed it:** `template-workflow.spec.ts:248-271` asserts that key phrases exist and that mode detection ordering is correct, but never executes or structurally checks every downstream mode branch. `generated-skill-protocol.spec.ts` likewise checks phrase parity, not procedural completeness.

**Possible interpretations and resolution:**

1. **Implementation bug (recommended):** treat `delegated` as change-scoped for discovery, report placement, merged previews, dependency expansion, and filename generation, while retaining its distinct attempt ownership. Use conditions equivalent to `mode = change OR mode = delegated`; add a delegated filename or deliberately reuse the change filename. Add an executable/structural test that walks every detected mode through directory, scope, fetch, filename, and attempt-ownership decisions.
2. **Spec/design bug:** if the caller is intended to supply all scope/report details, state that as a required delegated input contract and remove self-contained discovery/report promises. This is weaker and tightly couples verify to compliance internals, so it conflicts with the current reusable compliance design.

### CLI-SKILLS-02 — MEDIUM — `changes edit` text output drops canonical blockers, next action, and explicit scope-change status

**Affected spec:** `cli:change-edit`.

The handler reads `scopeChanged`, `blockers`, and `nextAction` from Core (`packages/cli/src/commands/change/edit.ts:122-131`). JSON/TOON include them (`:175-193`), but text output only renders specs, workspaces, state, policy dimensions, projection changes, and automatic return (`:165-174`, `:210-230`). This violates the merged requirement that text, JSON, and TOON render Core-owned recovery guidance and that `scopeChanged` remain distinct from actual validity change. In the important ungated-preserve case, the text user can see a retained lifecycle state but not the forward-progress blocker or what to do next.

**Possible interpretations and resolution:**

1. **Implementation bug (recommended):** add `scope changed`, `validity changed`, blocker rows (including labels/check IDs if Core supplies them), and the canonical next-action block to text output. Keep structured output unchanged except preferably emit stable empty arrays where its public schema promises them.
2. **Spec too strict:** declare only structured formats machine-complete and reduce text requirements. That conflicts with the rest of the CLI contract, where text is the primary agent/human repair surface.

**Missing test:** an ungated `workflow: preserve` edit returning `ARTIFACT_DRIFT` plus a next action must assert equivalent semantic fields in text, JSON, and TOON.

### CLI-SKILLS-03 — MEDIUM — Edit warning conflates any validity change with approval invalidation

**Affected spec:** `cli:change-edit`.

At `packages/cli/src/commands/change/edit.ts:136-142`, any truthy `validityChanged` prints `warning: approvals invalidated`. The result can contain verification-only or sign-off-only projection changes; the merged spec requires reporting exactly which approval or verification projection changed and warns about approval invalidation only when Core reports such a committed projection change. The structured `projectionChanges` already contains the necessary discriminator, but the warning ignores it.

**Possible interpretations and resolution:**

1. **Implementation bug (recommended):** derive warning wording from `projectionChanges`: name spec approval, sign-off, and/or verification separately. Treat legacy `invalidated` only as a fallback with neutral wording (`validity evidence changed`) rather than asserting approvals.
2. **Core contract ambiguity:** redefine `validityChanged` to mean approval-only. That would make the name misleading and still loses verification/sign-off specificity required by the CLI spec.

**Missing tests:** verification-only drift and sign-off-only recovery must not print `approvals invalidated`; canonical scope reordering/no-op must print no validity warning.

### CLI-SKILLS-04 — MEDIUM — Approval failures do not render committed recovery and canonical next action

**Affected spec:** `cli:change-approve`.

Successful output is strong: materialized status, decorated approver, decision time, verification identity, and safe fingerprint summary are rendered. On failure, however, both approval handlers only call the shared `handleError` (`packages/cli/src/commands/change/approve.ts:40-70`, `:89-119`). They do not consume a reconciled result or query fresh status after a domain rejection. Consequently, when pre-approval reconciliation commits recovery or exposes pending review, text output cannot show the actual state, recovery cause, blockers, and next action as required. Existing wrong-state tests assert only exit code and an `error:` prefix.

This spans the CLI/Core boundary: the approval use cases currently return a change only on success and throw on ineligibility. A generic error may carry a code/metadata, but it is not the complete canonical routing projection.

**Possible interpretations and resolution:**

1. **CLI adaptation (recommended if use-case signatures remain):** catch expected approval eligibility/reconciliation failures, call `GetStatus` once after the failed use-case, and render the same repair guidance as transition without retrying approval.
2. **Core API redesign:** return a discriminated approval result containing reconciliation/status guidance on refusal. This gives the thinnest CLI but is a broader contract change.
3. **Spec relaxation:** require only the stable Core error. This loses the explicitly designed “committed recovery is visible” behavior and leaves approval UX inconsistent with transition/edit/status.

**Missing tests:** stale spec consent recovered to designing, unresolved review in ready, stale verification blocking sign-off, and sign-off recovery to done should all assert no success headline plus canonical state/blockers/next action in text and structured formats.

### CLI-SKILLS-05 — MEDIUM — Force refusal names gates but cannot identify their canonical recovery targets

**Affected spec:** `cli:change-invalidate`; dependency `core:invalidate-change` / Core error contract.

The CLI catches `InvalidateRequiresForceError` and prints one warning per gate, but each warning says only that Core will report the recovery target after rerunning with `--force` (`packages/cli/src/commands/change/invalidate.ts:222-231`). The merged spec requires the refusal itself to name each affected gate **and its canonical recovery target**, with no mutation. Core's error stores only `gates` and a generic message (`packages/core/src/application/errors/invalidate-requires-force-error.ts:12-29`), so the CLI has no target information and correctly avoids inventing it—but the end-to-end contract is unmet.

**Possible interpretations and resolution:**

1. **Cross-layer implementation bug (recommended):** enrich the Core refusal with structured entries such as `{ gate: 'spec', target: 'designing' }` / `{ gate: 'signoff', target: 'done' | null }`, derived by the reconciler, and render them in text/JSON/TOON. Do not make the CLI calculate targets.
2. **Design correction:** if recovery cannot be known until forced mutation, change the spec to require gates only and explain that the target will be returned on success. This weakens the pre-mutation consent prompt and contradicts the stated “exact recovery” objective.

**Missing tests:** separate spec-only, signoff-only, both-gates, and no-return force refusals; assert exact gate-target pairs and zero repository mutation in all formats.

### CLI-SKILLS-06 — LOW — New create-policy scenario coverage is incomplete

**Affected spec:** `cli:change-create`.

Implementation uses shared parsers for both dimensions and resolves both flags correctly, so no code defect was found. Tests cover configured defaults, artifact-only overlay, and invalid artifact policy (`packages/cli/test/commands/change-create.spec.ts:490-558`). They do not cover workflow-only overlay, both flags together, or invalid workflow policy, despite the merged scenarios explicitly addressing independent policy flags and unsupported values.

**Resolution:** add the three symmetrical tests. This is a coverage gap, not current behavioral evidence of failure.

### CLI-SKILLS-07 — LOW — Reconciled status scenario is under-tested across required formats

**Affected spec:** `cli:change-status`.

The implementation has common presenters for safe validity/evidence fields and appears conformant. The new reconciled-validity test exercises JSON only (`packages/cli/test/commands/change/status.spec.ts:1297+`), while the scenario requires text and structured output. There is no direct assertion that text shows the committed recovery cause plus active attempt and stale completed evidence together, nor an explicit TOON assertion.

**Resolution:** parameterize the new scenario over text/JSON/TOON, including digest/content non-disclosure and the earlier-phase rule that stale verification does not replace the normal next action.

## Test coverage assessment

| Area            | Existing coverage                                                                                               | Assessment                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Status          | Broad legacy/status DAG/review/blocker tests plus one new JSON validity/evidence test                           | Good implementation coverage; new cross-format recovery scenario incomplete  |
| Invalidate      | Policies, targets, affected ordering, none semantics, structured success, basic force error                     | Good happy-path coverage; exact gate-target refusal absent                   |
| Approve         | Ready/drain states, success formats, materialized actor/time/fingerprint, empty vs legacy implementation        | Strong success coverage; canonical failure guidance absent                   |
| Transition      | Next/direct hops, checks/hooks, repair guide, no restart flag, committed recovery                               | Strong and aligned                                                           |
| Create          | Defaults and artifact overlay/parser                                                                            | Workflow dimension edge cases missing                                        |
| Edit            | Basic edits, one partial policy update, JSON projection/recovery                                                | Text recovery and projection-specific warnings missing                       |
| Verification    | Single-call delegation, supersession, completion, persisted invalidation reason in all formats, mismatch safety | Strong and aligned                                                           |
| Skill templates | Phrase presence and generated-copy parity                                                                       | Insufficient for control-flow/mode completeness; delegated branch bug passes |

## Spec dependency consistency

- The CLI specs consistently depend on `cli:entrypoint` for registration, formatting, and exit behavior. The commands use Commander, shared `output`/`parseFormat`, and shared error handling; no contradiction was found.
- CLI-to-Core dependency direction is respected: command modules import `@specd/sdk` and delegate to kernel use cases. No direct infrastructure/business-logic dependency was found.
- `cli:change-verification` is consistent with `core:invalidate-verification`, `core:get-status`, `core:change`, and `core:transition-checks`: commands do not transition state, run tests, or calculate fingerprints. The delegated compliance procedural gap is in skill orchestration, not this CLI command.
- `cli:change-transition` is consistent with the Core check registry: readiness and `verification.current` remain generic checks; the CLI does not special-case their predicates.
- `skills:workflow-automation` and `skills:skill-templates-source` are semantically consistent with Core recovery priority and the global architecture/testing rules, except for the incomplete delegated-mode workflow described in CLI-SKILLS-01.
- Generated copies are synchronized for the phrases currently asserted. Synchronization itself is not the problem; the same incomplete delegated branch is faithfully copied.

## Missing tests and edge cases to add

1. Execute a delegated compliance-mode decision table: report directory, scope discovery, merged preview selection, output filename, and absence of start/complete.
2. Edit output parity for text/JSON/TOON with preserve + drift blocker + next action.
3. Edit projection-specific warnings: spec approval, sign-off, verification only, combined, and no-op canonical scope reorder.
4. Approval refusal after committed spec/sign-off recovery with full canonical routing in all formats.
5. Invalidate force refusal with spec-only, signoff-only, both, and null/no-return targets.
6. Create workflow-only, both-policy, and invalid-workflow flag cases.
7. Status committed recovery + simultaneous active attempt/completed stale evidence in text and TOON, including safe difference redaction.
8. A template behavioral test should parse every declared compliance mode and require branches for discovery, content source, report path/name, and verification-attempt ownership; phrase tests alone are insufficient.

## Summary counts

- Specs audited: **9** change specs, plus relevant global constraints and direct dependencies.
- Fully implemented in this batch: **4** (`cli:change-status`, `cli:change-transition`, `cli:change-create`, `cli:change-verification`), with low-severity test gaps noted for two.
- Partially compliant: **5** (`cli:change-invalidate`, `cli:change-approve`, `cli:change-edit`, `skills:workflow-automation`, `skills:skill-templates-source`).
- Findings: **7 total** — **1 high**, **4 medium**, **2 low**.
- Confirmed product/protocol defects: **5** (findings 01–05).
- Test-only gaps: **2** (findings 06–07), plus missing regression coverage attached to the confirmed defects.
- Test execution: **996 passing** across CLI and skills; no failing suite, demonstrating that the present tests do not detect the listed contract gaps.
