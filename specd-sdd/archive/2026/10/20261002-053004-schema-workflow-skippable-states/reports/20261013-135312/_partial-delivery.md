# Delivery, CLI, schema, and skill compliance audit

## Audit scope and method

- Change: `schema-workflow-skippable-states`
- Delegated verification attempt: `verification-attempt-8` (not started or completed by this audit)
- Specs audited: `schema-std:standard-schema`, `cli:change-status`, `cli:change-transition`, `skills:workflow-automation`, `core:change-manifest`, `core:archive-change`, `core:approve-spec`, and `core:approve-signoff`
- Inputs: merged `changes spec-preview` views, direct change deltas, project context, direct dependencies reported by change status, graph-first symbol discovery, implementation and tests, and user-facing documentation.
- Graph: not stale (`stale: false`, coverage complete); content health was `CONTENT_UNKNOWN`, so direct reads were used after graph discovery to verify exact behavior.
- Focused test evidence: 8 files / 337 tests passed, covering CLI status/transition, archive, approvals, repository hydration, and generated skill protocols.

## Requirements summary

1. The standard schema exposes optional/disabled workflow flags while retaining the canonical delivery rows and approval anchors.
2. Status renders Core's `availableTransitions`, `availableSteps`, and `nextAction`, annotating optional steps and omitting disabled ones.
3. Transition CLI delegates `--next` to Core rather than maintaining a local state table.
4. Lifecycle skills consume Core routing and suppress hooks for bypassed or disabled intermediate steps.
5. A change's manifest schema identity is sovereign: repository hydration and change-scoped use cases resolve `SchemaProvider.get(change.schemaName)`.
6. Archive, spec approval, and signoff retain their existing gates while no longer comparing a change against the workspace default schema.

## Implementation status by spec

### `schema-std:standard-schema` — compliant

- `packages/schema-std/schema.yaml` declares the five delivery rows (`designing`, `ready`, `implementing`, `verifying`, `archiving`) with explicit `optional: false` and `disabled: false` defaults.
- Drain-only approval states are not declared as workflow rows.
- The merged verification artifact covers row membership and parsing of optional/disabled flags.
- The user documentation now distinguishes all four cases: mandatory; optional with an empty effective set; optional with checks; disabled. It explicitly says the effective set composes registry and schema bindings.

### `cli:change-status` — compliant

- Text and structured rendering use the `GetStatus` projection; text annotates optional rows with `[optional]`, while structured output preserves the optional field.
- Drafted structured output defensively clears transitions, steps, and the command as required.
- Tests directly cover optional annotations, preservation of shortcut transitions, and drafted output.

### `cli:change-transition` — implementation compliant, artifact wording issue

- The CLI passes `to: 'next'` unchanged to `TransitionChange`; there is no local from/to next table.
- Repair guidance consumes `status.nextAction` and Core blockers.
- Tests cover disabled-step advancement, drain-state failures, signed-off drain behavior, and stream separation.
- Finding D-1 below records an inconsistency in the merged requirement's claim about optional-step behavior for `--next`.

### `skills:workflow-automation` — compliant

- Design, implement, verify, and archive templates all require fresh structured status, treat `nextAction.command` as canonical, and restrict targets to `lifecycle.availableTransitions`.
- Templates explicitly prohibit hooks for bypassed/disabled intermediate steps. Implement and verify contain phase-specific guards for bypassing `implementing`/`verifying`.
- Protocol tests assert the dynamic-routing phrases in generated copies and reject fixed routing recipes.
- Documentation consistently states that skills do not inspect tasks/YAML or reinterpret an empty skip-check set; Core chooses the recommendation.

### `core:change-manifest` — compliant

- `FsChangeRepository` hydrates a change from the manifest schema identity even when the workspace default name differs.
- The repository test verifies successful hydration with a different active schema and preserves the manifest schema name.
- Version mismatch remains advisory.

### `core:archive-change` — implementation compliant, contradictory legacy test

- `ArchiveChange.execute` loads the change first and resolves `SchemaProvider.get(loadedChange.schemaName)` before reconciliation and peer discovery.
- A positive test proves a custom recorded schema is requested and archive succeeds even when the provider's default is different.
- Finding D-2 documents a retained legacy test whose title/assertion still treats a default-name mismatch as a required `SchemaMismatchError`.

### `core:approve-spec` — compliant

- Disabled gate remains the first check and therefore performs no repository I/O.
- After loading, the use case resolves `SchemaProvider.get(change.schemaName)`.
- A dedicated test proves the sovereign named lookup and successful historic drain behavior.

### `core:approve-signoff` — compliant

- Disabled gate remains the first check; the named sovereign schema is loaded before refresh/reconciliation.
- Verification-currentness and atomic fingerprint requirements remain distinct and unchanged.
- A dedicated test proves the named lookup and successful historic drain behavior.

## Discrepancies and findings

### D-1 — Medium — `cli:change-transition` merged requirement overstates `--next` optional-step bypass

**Spec evidence:** the merged `Next-transition resolution` requirement says that when intermediate steps are optional and skip checks pass, `--next` advances directly without visiting the bypassed steps.

**Implementation and global-documentation evidence:** `TransitionChange` resolves `to: 'next'` solely with `WorkflowTopology.nextForwardStep`, which returns the closest enabled forward step. `docs/guide/workflow.md` explicitly calls this a topology primitive and says optional policy/furthest shortcut selection belongs to status guidance; agents must follow `nextAction`, not treat `--next` as policy selection. The verification artifact only tests disabled-step skipping and contains no optional-step `--next` scenario.

**Assessment:** code and the detailed workflow guide agree with each other, while the merged CLI requirement is ambiguous/incorrect. Either the requirement must say that `--next` skips disabled rows only and that optional shortcut choice comes from an explicit Core-projected target, or Core must change `--next` and add an optional-step test. The first interpretation best matches the design and existing documentation.

**Impact:** a consumer reading only the normative CLI spec may expect `--next` to perform conditional optional-step selection that it does not perform.

### D-2 — Low — archive test suite retains an assertion for the superseded schema-mismatch contract

**Evidence:** `packages/core/test/application/use-cases/archive-change.spec.ts` still contains `given the active schema name differs ... throws SchemaMismatchError`, constructed with a provider whose only schema has another name. The same suite also contains the new positive sovereign-schema test.

**Assessment:** production behavior is correct because it requests the recorded name. The older test passes only because the test provider represents an unresolved named lookup as `SchemaMismatchError`; this conflicts with the merged requirement that default-name mismatch itself must not produce that error and unresolved sovereign references propagate not-found/validation errors.

**Impact:** the suite encodes two competing interpretations and could legitimize regression to workspace-default comparison. Rename/reframe it as an unresolved-provider error test using the canonical error, or remove it in favor of the sovereign-schema case.

## Test coverage

| Area                                       | Evidence                                                        | Result                                 |
| ------------------------------------------ | --------------------------------------------------------------- | -------------------------------------- |
| Standard workflow flags                    | schema parser/build/topology suites plus schema YAML inspection | Covered                                |
| Status optional/disabled projection        | CLI status tests, including structured and text output          | Covered                                |
| Transition delegation and disabled skip    | CLI transition and Core transition tests                        | Covered                                |
| Skill dynamic routing and hook suppression | generated-skill protocol and template workflow tests            | Covered                                |
| Manifest schema sovereignty                | filesystem change repository test                               | Covered                                |
| Archive schema sovereignty                 | positive named-schema archive test                              | Covered, with D-2 legacy contradiction |
| Approval schema sovereignty                | approve-spec and approve-signoff named-schema tests             | Covered                                |
| Optional `--next` semantics                | No scenario demonstrating conditional optional bypass           | Missing/ambiguous per D-1              |

Focused execution result: **337/337 tests passed**. Passing tests do not resolve D-1 because the normative optional `--next` claim lacks a corresponding scenario.

## Missing or insufficient tests

1. Add a CLI/Core acceptance scenario fixing the chosen meaning of `--next` when the immediate enabled step is optional. Under the current design it should assert that `--next` enters that closest step while `GetStatus.nextAction.targetStep` may recommend a farther explicit shortcut.
2. Replace the legacy archive mismatch test with a canonical unresolved-sovereign-schema error assertion; keep the existing successful named-resolution test.

## Spec dependency chain and consistency

- `schema-std:standard-schema` depends on `core:workflow-model`; the delivery rows and optional/disabled vocabulary conform.
- `cli:change-status` depends on `core:get-status`, `core:transition-checks`, and `core:lifecycle-engine`; its rendering is projection-only and conformant.
- `cli:change-transition` depends on `core:transition-change` and `core:lifecycle-engine`; delegation is conformant, but D-1 is inconsistent with the topology primitive documented globally.
- `skills:workflow-automation` depends on the CLI status/transition specs and Core status/checks. Its templates correctly consume Core's projection and do not duplicate optional policy.
- `core:change-manifest`, `core:archive-change`, `core:approve-spec`, and `core:approve-signoff` conform to `core:change`, schema-provider, composition, and transition-check dependencies by resolving the schema identity recorded on the change.
- No conflict was found with project-wide architecture guidance. The only cross-document conflict is D-1 between the merged CLI requirement and the workflow guide/current implementation.

## Summary counts

- Specs audited: **8**
- Fully compliant: **6**
- Implementation compliant with artifact/test debt: **2**
- Findings: **2** (`0` high, `1` medium, `1` low)
- Missing/insufficient focused test cases: **2**
- Focused tests: **337 passed, 0 failed**

## Audit conclusion

The implementation behavior is coherent across schema, Core projections, CLI rendering, sovereign schema resolution, and lifecycle skills. Documentation now answers the optional-step ambiguity correctly: an empty effective skip-check set is an unconditional bypass recommendation, a non-empty set is conditional, disabled removes the step, and skills follow Core. Compliance is not fully clean because the normative `cli:change-transition` wording still assigns optional-policy selection to `--next`, and the archive suite retains one legacy mismatch assertion. D-1 should be resolved before declaring artifact-to-implementation compliance complete.
