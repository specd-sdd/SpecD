# Partial compliance audit: schema, CLI, skills, and documentation surfaces

## Scope and method

- Change: `schema-workflow-skippable-states`
- Delegated outer attempt: `verification-attempt-10` (no attempt start/complete performed)
- Merged change specs audited exhaustively:
  - `schema-std:standard-schema`
  - `cli:change-status`
  - `cli:change-transition`
  - `skills:workflow-automation`
- Global constraints reviewed: architecture, conventions, docs, testing, error handling, continuous integration, ESLint, and logging.
- Intent sources reviewed: `proposal.md`, `design.md`, task group 20, schema/reference guides, generated guides, installed/generated lifecycle skills, CLI adapters, and focused tests.
- Code navigation began with `specd graph`; graph queries returned no observable result in this checkout, so the audit used the permitted textual fallback after recording that limitation.
- Focused execution evidence:
  - CLI status + transition: 90 tests passed.
  - Skills protocol + workflow templates: 21 tests passed.
  - `@specd/schema-std` package test command exited 0 (the package has no emitted test cases).

## Requirements summary

| Spec                         | Requirements | Verification scenarios | Result                                                       |
| ---------------------------- | -----------: | ---------------------: | ------------------------------------------------------------ |
| `schema-std:standard-schema` |           11 |                     13 | Conformant                                                   |
| `cli:change-status`          |           18 |                     43 | Conformant                                                   |
| `cli:change-transition`      |           15 |                     45 | Conformant                                                   |
| `skills:workflow-automation` |           11 |                     34 | Conformant, with one minor regression-test gap               |
| **Total**                    |       **55** |                **135** | **55 implemented; 1 minor test/documentation safeguard gap** |

## Intent assessment

The proposal/design intent is represented consistently across the four merged specs, runtime surfaces, and documentation:

1. `optional: true` does **not** disable a step. The step stays enabled and explicitly enterable; optionality only permits Core to advertise and execute a legal shortcut.
2. The bypass policy uses the **effective** `step-skip` binding set, which is the composition of registry/plugin bindings and schema `skipChecks`, not merely the inline YAML array.
3. An empty effective binding set passes vacuously. Consequently, `optional: true` plus no effective skip checks means that Core recommends the shortcut unconditionally. This is not equivalent to `disabled`: the optional step remains in the active pipeline and remains a legal explicit destination.
4. A non-empty effective set makes the shortcut conditional on every applicable predicate. A failing predicate makes Core recommend entering the closest optional step; it does not remove that step.
5. `disabled: true` removes the step from the active pipeline and legal target set and disallows skip checks for that step.
6. Agents do not decide which path to take from task contents, YAML inspection, or private policy. They consume fresh `nextAction.command`, `nextAction.targetStep`, and `lifecycle.availableTransitions` from Core and run hooks only for the actual source/target steps.
7. `--next` has intentionally narrower semantics: it advances to the closest enabled topological successor. It does not apply optional-step recommendation policy; the status projection owns farther checked shortcuts.

This resolves the earlier ambiguity directly. The documentation decision tables in `docs/guide/custom-schemas.md`, `docs/guide/workflow.md`, `docs/guide/schemas.md`, and `docs/schemas/schema-format.md` all distinguish the four cases and explain effective bindings. The same wording is present in `packages/guide/src/infrastructure/generated/guides.ts`.

## Implementation status by spec

### `schema-std:standard-schema`

All 11 merged requirements are represented. The standard schema retains its mandatory default workflow (`optional: false`, `disabled: false`) while its normative contract permits custom schemas/overrides to declare optional and disabled steps. This is a compatibility-preserving implementation of capability rather than a behavioral change to the shipped default.

Evidence:

- `packages/schema-std/schema.yaml:643-727` declares the canonical workflow rows explicitly and preserves the standard mandatory path.
- The merged Lifecycle Steps requirement defines delivery rows, protocol anchors, drain-only historical states, optional/disabled semantics, bedrock immutability, and hook suppression.
- Parser/build/topology behavior is covered in Core suites outside this assigned surface, including empty-effective-set behavior at `packages/core/test/domain/services/lifecycle-verdict.spec.ts:87` and step-skip binding suites in `transition-checks.spec.ts`.

No discrepancy found.

### `cli:change-status`

All 18 merged requirements are implemented by projection/delegation rather than local lifecycle policy.

Evidence:

- `packages/cli/src/commands/change/status.ts:298-308` prints Core-provided `availableTransitions` and annotates optional entries from `availableSteps`.
- `packages/cli/src/commands/change/status.ts:503-519` serializes the same transition and step projection for structured output without recomputing routing.
- `packages/cli/test/commands/change/status.spec.ts:1448-1514` proves optional annotation plus preservation of Core's explicit and shortcut alternatives in text and JSON.
- Focused status/transition suite passed.

Disabled steps are excluded by Core before reaching this adapter; the CLI does not maintain a competing filter or topology table. No discrepancy found.

### `cli:change-transition`

All 15 merged requirements are implemented. The adapter forwards user intent and delegates target/topology resolution to Core.

Evidence:

- `packages/cli/src/commands/change/transition.ts:337-375` compiles `--skip-checks` and legacy aliases into `TransitionChangeInput.skipChecks` without implementing bypass policy.
- The command passes `to: 'next'` unchanged when requested and does not consult status as a routing table.
- Repair-guide behavior consumes `GetStatus` after failures with refresh disabled, preserving Core's canonical blocker/next-action projection.
- `packages/cli/test/commands/change/transition.spec.ts:1640-1720` covers unavailable `--next` guidance and custom check forwarding; the broader focused suite passed.

No discrepancy found.

### `skills:workflow-automation`

All 11 merged requirements are present in source templates and installed copies. Schema-aware routing is explicit in design, implement, verify, and archive skills.

Evidence:

- `packages/skills/test/generated-skill-protocol.spec.ts:103-113` requires every lifecycle skill template and installed copy to contain `nextAction.command`, `lifecycle.availableTransitions`, and bypassed-step handling.
- `packages/skills/test/template-workflow.spec.ts:338-347` specifically checks that verify omits verifying hooks when bypassed/disabled and implement follows published routing without entering a bypassed implementing step.
- Source and installed skills state that structured status is canonical and that hooks run only for the actual source/target.
- Focused skills suites passed.

No behavioral discrepancy found. One minor safeguard gap is recorded below.

## Discrepancies

### MINOR — Task 20.6's semantic generated-guide regression assertion is absent

**Expected:** `tasks.md:618-621` says generated guide content must be synchronized **and** relevant guide tests must guard the authority and empty-effective-set rules. The design likewise calls for documentation examples to assert optional-vs-disabled semantics and Core-owned recommendation wording.

**Actual:**

- The source documentation and `packages/guide/src/infrastructure/generated/guides.ts` are synchronized and contain the correct semantics.
- `packages/guide/test/integration/guide-engine.test.ts` checks topic presence, retrieval, outlines, and slicing, but contains no assertion for the optional/disabled decision table, empty effective set, or Core-owned `nextAction` authority.
- Repository-wide test search finds runtime coverage for empty effective sets and skills routing, but no generated-guide semantic assertion matching task 20.6.

**Impact:** A future guide regeneration or content edit could silently remove or blur the exact explanation that resolved the user's ambiguity while all current guide tests still pass. Runtime behavior is unaffected.

**Alternative interpretations:**

- The implementation may be considered acceptable because generated content is currently byte-synchronized and runtime/skill tests protect behavior.
- However, under the literal task/design contract, synchronization alone is insufficient: a durable content assertion was explicitly requested. On that reading this is a genuine missing test, not a spec defect.

**Recommended repair:** Add a guide integration test that retrieves `custom-schemas`, `workflow`, and/or `schemas` from the generated catalog and asserts at least:

- empty effective `step-skip` set => unconditional Core recommendation;
- optional step remains explicitly enterable;
- disabled step is absent/unenterable;
- skills consume Core `nextAction` rather than selecting a path.

## Test coverage and missing tests

Coverage is strong for behavior:

- Core has direct empty-effective-set lifecycle verdict coverage.
- CLI status tests cover optional annotation and simultaneous explicit/shortcut transition projection.
- CLI transition tests cover `--next`, skip-check forwarding, and repair guidance.
- Skills tests cover routing tokens in all generated/installed copies and hook suppression for disabled/bypassed steps.
- Focused executed total: 111 passing tests; schema-std package command exited successfully.

Missing test:

- One semantic generated-guide regression test as described in the MINOR finding.

No missing runtime scenario was identified for the four assigned specs.

## Global-spec consistency

- **Architecture:** CLI and skills remain adapters; they delegate lifecycle policy to Core. No business-rule duplication or new dependency inversion violation found.
- **Conventions / ESLint:** Changed TypeScript surfaces use existing naming/export/type patterns. Focused tests compile and run; no `any`, default export, or filename issue observed in the assigned implementation.
- **Docs:** Documentation stays under the established scoped directories and generated guide bundle is synchronized. ADR-0030 already captures the durable check/disablement policy, avoiding ADR duplication.
- **Testing:** Tests use Vitest, explicit assertions, and mirrored `.spec.ts` names. The only deficiency is the missing semantic guide assertion above.
- **Error handling:** CLI continues to map typed Core failures to actionable repair guidance; no new generic expected-failure path was introduced in these surfaces.
- **Continuous integration:** No CI workflow change or cross-platform-incompatible fixture was introduced in this scope.
- **Logging:** No direct production `console.*` usage or logging-policy change found.

## Summary counts

- Specs audited: 4
- Merged requirements audited: 55
- Merged verification scenarios reviewed: 135
- Requirements implemented: 55
- Focused tests executed: 111 passed, 0 failed
- Conformant specs: 4
- Critical findings: 0
- Major findings: 0
- Minor findings: 1 (missing documentation regression assertion)
- Runtime/spec contradictions: 0
- Intent contradictions: 0

## Audit verdict

**PASS WITH MINOR ISSUE.** Runtime, merged specs, CLI projections, skills, and current documentation all express the intended semantics correctly. The only issue is the absence of the explicitly planned semantic regression assertion for generated guide content; this does not invalidate behavior but should be fixed to make the documentation contract durable.
