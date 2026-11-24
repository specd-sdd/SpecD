# Verification: core:workflow-topology

## Requirements

### Requirement: Module of pure workflow functions

#### Scenario: Topology is consumed as named function imports

- **GIVEN** the `workflow-topology` domain module
- **WHEN** its public exports are inspected
- **THEN** it exports `resolveWorkflowPipeline`, `isWorkflowStepEnabled`, `listWorkflowTransitions`, `isWorkflowTransitionLegal`, `listBypassedWorkflowSteps`, and `nextWorkflowStep` as plain functions
- **AND** no `WorkflowTopology` class with static methods is exported
- **AND** internal helpers (raw pipeline construction, forward-target computation, drain normalization) are not exported

### Requirement: Ordered pipeline construction

#### Scenario: Pipeline excludes disabled steps and annotates optional ones

- **GIVEN** a schema with `workflow` declaring `ready`, `implementing [optional]`, `verifying [disabled]`, `done`
- **WHEN** `resolveWorkflowPipeline(schema, approvals)` is called
- **THEN** the pipeline is `drafting`, `designing`, `ready`, `implementing`, `done`, `archivable`, `archiving`
- **AND** `verifying` is excluded from the pipeline
- **AND** `implementing` has attribute `optional: true`

#### Scenario: Noncanonical row order is normalized silently

- **GIVEN** a schema whose `workflow` rows are declared in the order `verifying`, `ready`, `implementing`
- **WHEN** `resolveWorkflowPipeline(schema, approvals)` is called
- **THEN** no error is thrown
- **AND** the pipeline order is `drafting`, `designing`, `ready`, `implementing`, `verifying`, `done`, `archivable`, `archiving`
- **AND** each row's properties (optional, disabled, checks, hooks) are attached to its own step

#### Scenario: Reordered rows cannot skip required steps or spec approval

- **GIVEN** a schema whose `workflow` rows are declared in the order `verifying`, `ready`, `implementing` with none optional
- **AND** `approvals.spec: true`
- **WHEN** `listWorkflowTransitions` is evaluated for `designing` and for `ready`
- **THEN** the forward targets are `designing → ready` and `ready → implementing` only
- **AND** no transition reaches `verifying` or `done` without passing through `ready` and `implementing`, so the spec-approval check bound to `from: ready` always runs

#### Scenario: Explicit noncanonical bedrock declarations are normalized

- **GIVEN** a schema explicitly declaring `archiving`, `designing`, `drafting`, and `archivable` in noncanonical order
- **WHEN** `resolveWorkflowPipeline(schema, approvals)` is called
- **THEN** the resulting axis places `drafting` before `designing`
- **AND** places `archivable` before `archiving`
- **AND** no bedrock declaration changes transition direction or next-step guidance

#### Scenario: Disabling bedrock state throws SchemaValidationError

- **GIVEN** a schema declaring `designing: { disabled: true }`
- **WHEN** `resolveWorkflowPipeline(schema, approvals)` is called
- **THEN** a `SchemaValidationError` is thrown

#### Scenario: Done is mandatory even when signoff is disabled

- **GIVEN** a project with `approvals.signoff: false`
- **AND** a schema declaring `done: { optional: true }` or `done: { disabled: true }`
- **WHEN** `resolveWorkflowPipeline(schema, approvals)` is called
- **THEN** a `SchemaValidationError` is thrown
- **AND** Core does not remove or bypass the completed-delivery boundary

#### Scenario: Disabled signoff skips its check rather than done

- **GIVEN** a project with `approvals.signoff: false`
- **WHEN** topology and predicates evaluate `done -> archivable`
- **THEN** `done` remains in the ordered pipeline
- **AND** `approval.signoff` returns `skip`

#### Scenario: Disabling active approval gate anchor throws SchemaValidationError

- **GIVEN** a project with `approvals.spec: true`
- **AND** a schema declaring `ready: { disabled: true }`
- **WHEN** `resolveWorkflowPipeline(schema, approvals)` is called
- **THEN** a `SchemaValidationError` is thrown

#### Scenario: Drain states are never pipeline steps

- **GIVEN** any schema
- **WHEN** `resolveWorkflowPipeline(schema, approvals)` is called
- **THEN** none of `pending-spec-approval`, `spec-approved`, `pending-signoff`, `signed-off` appears in the pipeline

### Requirement: Forward connectivity by construction

#### Scenario: Disabling every configurable delivery step keeps the path connected

- **GIVEN** a project with `approvals.spec: false`
- **AND** a schema declaring `ready`, `implementing`, and `verifying` as `disabled: true`
- **WHEN** `resolveWorkflowPipeline(schema, approvals)` is called
- **THEN** no error is thrown
- **AND** the pipeline is `drafting`, `designing`, `done`, `archivable`, `archiving`
- **AND** `listWorkflowTransitions('designing', schema, approvals)` includes `done`

#### Scenario: Disabling implementing and verifying routes ready to done

- **GIVEN** a schema declaring `implementing` and `verifying` as `disabled: true`
- **WHEN** `listWorkflowTransitions('ready', schema, approvals)` is evaluated
- **THEN** it includes `done`
- **AND** `listBypassedWorkflowSteps('ready', 'done', schema, approvals)` returns an empty array

### Requirement: Dynamic legal transitions

#### Scenario: Shortcut transitions allowed across optional steps

- **GIVEN** an active pipeline where `implementing` is declared `optional: true`
- **WHEN** `listWorkflowTransitions('ready', schema, approvals)` is evaluated
- **THEN** legal transitions include both `implementing` and `verifying`

#### Scenario: Shortcut stops at the first non-optional step

- **GIVEN** an active pipeline where `implementing` is optional and `verifying` is not
- **WHEN** `listWorkflowTransitions('ready', schema, approvals)` is evaluated
- **THEN** it includes `implementing` and `verifying`
- **AND** it does not include `done`

#### Scenario: Transitions to disabled steps are prohibited

- **GIVEN** a schema where `verifying` is `disabled: true`
- **WHEN** `isWorkflowTransitionLegal('implementing', 'verifying', schema, approvals)` is checked
- **THEN** it returns `false`

#### Scenario: Pipeline order does not invent backward protocol edges

- **GIVEN** `designing` precedes `implementing` in the active pipeline
- **AND** `VALID_TRANSITIONS` does not admit a direct `implementing -> drafting` edge
- **WHEN** `listWorkflowTransitions('implementing', schema, approvals)` is evaluated
- **THEN** `drafting` is not returned solely because it precedes `implementing`

#### Scenario: Redesign re-entry is legal from designing

- **GIVEN** the standard pipeline
- **WHEN** `listWorkflowTransitions('designing', schema, approvals)` is evaluated
- **THEN** it includes `designing`

#### Scenario: Backward VALID_TRANSITIONS edges remain legal

- **GIVEN** the standard pipeline
- **WHEN** `listWorkflowTransitions('verifying', schema, approvals)` is evaluated
- **THEN** it includes `implementing` (retry) and `designing` (redesign)

#### Scenario: Drain states gain no forward shortcuts

- **GIVEN** a change in `pending-signoff` or `pending-spec-approval`
- **WHEN** `listWorkflowTransitions(state, schema, approvals)` is evaluated
- **THEN** it returns only the exits `VALID_TRANSITIONS` defines for that exact state
- **AND** `isWorkflowTransitionLegal('pending-signoff', 'archivable', schema, approvals)` is `false` unless `VALID_TRANSITIONS` admits it
- **AND** `isWorkflowTransitionLegal('pending-spec-approval', 'implementing', schema, approvals)` is `false` unless `VALID_TRANSITIONS` admits it

#### Scenario: Disabled source has no transitions

- **GIVEN** a schema where `verifying` is `disabled: true`
- **WHEN** `listWorkflowTransitions('verifying', schema, approvals)` is evaluated
- **THEN** it returns an empty array

#### Scenario: Legal-transition functions honor the supplied approval snapshot

- **GIVEN** a schema that disables `ready` only when the spec approval anchor is inactive
- **WHEN** `listWorkflowTransitions`, `isWorkflowTransitionLegal`, `listBypassedWorkflowSteps`, and `nextWorkflowStep` are evaluated with the supplied `approvals`
- **THEN** every function derives its active pipeline from that same approval snapshot

### Requirement: Bypassed step detection

#### Scenario: Detection of intermediate optional steps

- **GIVEN** an active pipeline where `implementing` is optional
- **WHEN** transitioning from `ready` to `verifying`
- **THEN** `listBypassedWorkflowSteps('ready', 'verifying', schema, approvals)` returns `['implementing']`

#### Scenario: Immediate step transition returns no bypassed steps

- **GIVEN** an active pipeline
- **WHEN** transitioning from `ready` to `implementing`
- **THEN** `listBypassedWorkflowSteps('ready', 'implementing', schema, approvals)` returns an empty array

#### Scenario: Backward transition returns no bypassed steps

- **GIVEN** an active pipeline
- **WHEN** `listBypassedWorkflowSteps('verifying', 'designing', schema, approvals)` is evaluated
- **THEN** it returns an empty array

### Requirement: Topological forward progression

#### Scenario: Next forward step skips disabled states

- **GIVEN** a pipeline where `verifying` is `disabled: true`
- **WHEN** `nextWorkflowStep('implementing', schema, approvals)` is called
- **THEN** it returns `'done'`

#### Scenario: Next forward step enters an enabled optional step

- **GIVEN** a pipeline where `implementing` is `optional: true`
- **WHEN** `nextWorkflowStep('ready', schema, approvals)` is called
- **THEN** it returns `'implementing'`

#### Scenario: Drain states only return legal next steps

- **GIVEN** a schema where `implementing` is `disabled: true`
- **WHEN** `nextWorkflowStep('spec-approved', schema, approvals)` is called
- **THEN** it returns `null`
- **AND** with `implementing` enabled it returns `'implementing'`
- **AND** `nextWorkflowStep('signed-off', schema, approvals)` returns `'archivable'`
- **AND** `nextWorkflowStep('pending-signoff', schema, approvals)` and `nextWorkflowStep('pending-spec-approval', schema, approvals)` return `null`

#### Scenario: Next step is always a legal transition

- **GIVEN** any schema and every source state
- **WHEN** `nextWorkflowStep(from, schema, approvals)` returns a non-null step
- **THEN** `isWorkflowTransitionLegal(from, step, schema, approvals)` is `true`

#### Scenario: Terminal states return null next forward step

- **GIVEN** a change in `archivable`
- **WHEN** `nextWorkflowStep('archivable', schema, approvals)` is called
- **THEN** it returns `null`

### Requirement: Step enablement and verification boundary

#### Scenario: Disabled verifying step relaxes verification boundary

- **GIVEN** a schema where `verifying` is `disabled: true`
- **WHEN** `isWorkflowStepEnabled('verifying', schema)` is called
- **THEN** it returns `false`

#### Scenario: Disabled verifying never requires verification evidence end to end

- **GIVEN** a change whose schema disables `verifying` and that has no verification attempt or completed evidence
- **WHEN** the change moves `implementing → done → archivable` and is archived, with the real validity reconciler (no test double for verification validity)
- **THEN** status reports verification `not-required` and no `VERIFICATION_REQUIRED`, `VERIFICATION_IN_PROGRESS`, or `VERIFICATION_STALE` blocker
- **AND** `approval.signoff` (when the signoff gate is on) and the archive `verification.current` predicate do not fail for missing verification
- **AND** archive succeeds

#### Scenario: Bedrock states are always enabled

- **WHEN** `isWorkflowStepEnabled` is called for `designing`, `done`, or `archivable`
- **THEN** it returns `true`
