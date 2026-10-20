# Verification: Workflow Automation

## Requirements

### Requirement: Diagnostic Priority

#### Scenario: Agent uses canonical plural status diagnostics

- **WHEN** an AI agent needs to check the current status of a change
- **THEN** it SHALL use `specd changes status <name> --format text`
- **AND** it MUST NOT use a singular resource group
- **AND** it MUST NOT use `--format json` as the primary diagnostic tool

### Requirement: Data Extraction

#### Scenario: Agent chooses TOON for tool-call preparation

- **GIVEN** an agent needs to retrieve a list of spec IDs to pass to another tool
- **WHEN** it executes the status check
- **THEN** it SHALL use `--format toon` to ensure robust parsing of the spec ID array

#### Scenario: Agent uses JSON only for an explicit exception

- **GIVEN** TOON is unavailable or JSON was explicitly requested
- **WHEN** an agent needs structured extraction
- **THEN** it MAY use `--format json`
- **AND** it MUST NOT present JSON as co-equal with TOON in the default guidance

### Requirement: Spec read surface selection

#### Scenario: Exact artifact authoring uses specs show

- **WHEN** an agent needs exact raw spec or verification content for authoring or review
- **THEN** it uses `specd specs show <spec-id>`

#### Scenario: Semantic working context uses specs context

- **WHEN** an agent needs section filtering, dependency traversal, or optimized-content preference
- **THEN** it uses `specd specs context <spec-id>`

#### Scenario: Materialization diagnostics use specs metadata

- **WHEN** an agent needs the normalized projection, `source`, `regenerated`, or materialization warnings
- **THEN** it uses `specd specs metadata <spec-id>`

#### Scenario: Metadata is not a configuration or default context source

- **WHEN** an agent needs effective project configuration or ordinary semantic working context
- **THEN** it does not use `specd specs metadata`
- **AND** it selects the project status or spec context command whose contract exposes the required data

### Requirement: On-demand outline retrieval

#### Scenario: Agent fetches full outline using canonical command

- **GIVEN** artifact-instruction output includes `availableOutlines: ["core:config"]`
- **WHEN** the agent needs full structure for delta authoring
- **THEN** it runs `specd specs outline core:config --artifact specs`
- **AND** uses that output as the outline source

#### Scenario: Agent avoids inline outline dependency

- **GIVEN** `changes artifact-instruction` output does not include full outline trees
- **WHEN** generating deltas
- **THEN** the agent does not fail due to missing embedded outlines
- **AND** retrieves required detail via `specd specs outline`

### Requirement: Repair Strategy

#### Scenario: Agent follows repair guide after transition failure

- **GIVEN** a transition from `designing` to `ready` fails with `MISSING_ARTIFACT`
- **WHEN** the CLI output provides a Repair Guide
- **THEN** the agent SHALL execute the recommended command (e.g., `/specd-design`)
- **AND** it MUST NOT attempt to force the transition again without addressing the blocker

### Requirement: Canonical Command References

#### Scenario: Agent uses plural canonical groups in instructions

- **WHEN** an agent writes workflow command examples for countable resources
- **THEN** examples use canonical plural groups (`changes`, `specs`, `archives`, `drafts`)
- **AND** singular forms are referenced only as aliases

#### Scenario: Canonical outline command example

- **WHEN** the agent documents outline retrieval
- **THEN** it uses `specd specs outline <specPath> --artifact <artifactId>`

### Requirement: Command Necessity and Freshness

#### Scenario: Agent reuses equivalent data within the same execution step

- **GIVEN** a prior command output in the current skill step already contains the required decision fields
- **WHEN** the agent evaluates whether to run an additional read command
- **THEN** it may skip the extra command only if equivalence is deterministic
- **AND** it records or follows an explicit mapping between required checks and source fields

#### Scenario: Agent does not assume continuity across skill sessions

- **GIVEN** a skill starts without reliable in-memory outputs from earlier invocations
- **WHEN** lifecycle decisions depend on status or context data
- **THEN** the agent re-reads the minimum required state instead of reusing stale assumptions

#### Scenario: Non-deterministic equivalence forces explicit command

- **GIVEN** command-output equivalence cannot be proven for a required check
- **WHEN** the agent decides whether to skip a command
- **THEN** the agent executes the explicit canonical command

### Requirement: Structural Validation and Content Review

#### Scenario: Validate passes but semantic review is still required

- **GIVEN** `specd changes validate` reports success
- **WHEN** artifacts contain requirement wording that could diverge from intent
- **THEN** the workflow still requires explicit content review before progression

#### Scenario: Successful single-artifact spec validation uses inline diff review

- **GIVEN** an existing delta-backed `scope: spec` artifact is validated with `specd changes validate <change-name> <specId> --artifact <artifactId>`
- **AND** validation succeeds
- **WHEN** the command renders an inline diff for that artifact
- **THEN** the agent reviews that inline diff as the immediate surface for unintended removals, contract breakage, or other risky edits

#### Scenario: Inline diff unavailability falls back to diff preview command

- **GIVEN** review is needed for an existing delta-backed `scope: spec` artifact
- **AND** inline diff is unavailable because validation failed or because diff generation reported its dedicated non-fatal failure
- **WHEN** the agent chooses a review surface
- **THEN** it runs `specd changes spec-preview <change-name> <specId> --diff --artifact <artifactId>`

#### Scenario: Overlap or drift risk requires merged preview

- **GIVEN** overlap or drift risk is detected for a spec delta
- **WHEN** the agent assesses whether delta output is safe to accept
- **THEN** the agent runs `specd changes spec-preview <change-name> <specId>` to inspect merged content
- **AND** it does not treat raw delta inspection alone as sufficient

#### Scenario: Single-artifact review uses preview filtering

- **GIVEN** merged review needs only one spec-scoped artifact
- **WHEN** the agent runs preview for content review
- **THEN** it prefers `specd changes spec-preview <change-name> <specId> --artifact <artifactId>` to avoid unrelated output

### Requirement: Cross-skill artifact review and recovery

#### Scenario: Independent verify owns its attempt

- **WHEN** simple verify runs from any active state
- **THEN** it starts before scenario checks and completes only after successful findings and hooks

#### Scenario: Full verify shares one attempt with compliance

- **GIVEN** verify explicitly invokes change-scoped compliance in delegated mode
- **WHEN** scenarios and audit succeed
- **THEN** verify alone starts and completes the shared attempt
- **AND** compliance neither replaces its baseline nor completes it early

#### Scenario: Delegated compliance remains change scoped downstream

- **GIVEN** verify invokes compliance with `--delegated --attempt <attemptId>`
- **WHEN** compliance selects context, scope, dependencies, spec reads, report directory, and filename
- **THEN** each branch follows the same change-scoped path as standalone `--change`
- **AND** only start and complete ownership differ

#### Scenario: Delegated mode requires an explicit attempt

- **WHEN** compliance receives `--delegated` without `--attempt`
- **THEN** it fails before audit work or report creation

#### Scenario: Standalone compliance owns a separate attempt

- **WHEN** change-scoped compliance is invoked independently, even with an existing active attempt
- **THEN** it explicitly starts, audits and reports, then completes on success

#### Scenario: Changed inputs require repeated work

- **GIVEN** fingerprinted inputs change during verification
- **WHEN** the owning skill starts a replacement attempt
- **THEN** it repeats all applicable verification work before completion
- **AND** earlier results cannot complete the new attempt

#### Scenario: Dynamic topology consumption by agent skills

- **GIVEN** a change where `verifying` is disabled or `implementing` is optional and bypassed
- **WHEN** the agent skill reads `changes status --format toon`
- **THEN** it advances along `nextAction.command` and `availableTransitions` directly
- **AND** it does not execute hooks for the bypassed intermediate steps

#### Scenario: Disabled verifying selects only the actual target hooks

- **GIVEN** structured status where `verifying` is disabled and the selected direct target is `done`
- **WHEN** a lifecycle skill advances from `implementing`
- **THEN** it runs hooks and the transition only for the actual source and `done`
- **AND** it selects no `verifying` pre-hook, post-hook, or transition command

#### Scenario: Optional implementing bypass follows status routing

- **GIVEN** structured status where `implementing` is bypassable and `nextAction.command` selects the next legal lifecycle skill
- **WHEN** design completion advances along an advertised direct target in `availableTransitions`
- **THEN** the skill uses that exact target
- **AND** it selects no `implementing` hook or transition command

#### Scenario: Fixed canonical recipes cannot override structured routing

- **GIVEN** a lifecycle template containing operational transition instructions
- **WHEN** its protocol is validated
- **THEN** every target and target hook is derived from fresh structured status
- **AND** an unconditional canonical target recipe fails validation

#### Scenario: Skill does not invent optional-step policy

- **GIVEN** Core advertises a legal shortcut for an optional step with no effective skip checks
- **WHEN** the lifecycle skill consumes structured status
- **THEN** it follows the advertised target
- **AND** it does not require tasks, checks, or user judgment absent from the Core projection

#### Scenario: Explicit design invocation may choose an advertised redesign

- **GIVEN** `nextAction.command` recommends another lifecycle skill
- **AND** `designing` is present in `lifecycle.availableTransitions`
- **WHEN** the user explicitly invokes `specd-design`
- **THEN** the design skill may continue toward `designing`
- **AND** it reports the preferred recommendation without treating it as a veto

#### Scenario: Explicit skill stops when its target is unavailable

- **GIVEN** the target associated with an explicitly invoked lifecycle skill is absent from `lifecycle.availableTransitions`
- **WHEN** that skill evaluates routing
- **THEN** it stops before hooks or transition
- **AND** it reports current blockers and the preferred `nextAction`

#### Scenario: Generated lifecycle guides preserve semantic routing invariants

- **GIVEN** generated lifecycle skill guides for design, implement, verify, and archive
- **WHEN** their protocol semantics are validated
- **THEN** optional-step shortcuts follow Core-advertised targets
- **AND** disabled steps and their hooks are absent from execution routes
- **AND** an empty effective skip-check set needs no invented condition
- **AND** Core alone owns `availableTransitions` and `nextAction` routing decisions
- **AND** `done` remains mandatory regardless of signoff configuration

#### Scenario: specd-verify skips verifying hooks when verifying is disabled

- **GIVEN** a change whose schema disables `verifying` and whose status does not advertise `verifying`
- **WHEN** the `specd-verify` instructions are followed
- **THEN** no `run-hooks <name> verifying` or `hook-instruction <name> verifying` command is executed
- **AND** no transition to `verifying` is attempted

#### Scenario: Approval gating comes from structured status

- **WHEN** a lifecycle template decides whether a sign-off or spec approval gate applies
- **THEN** it reads `lifecycle.approvals` / `availableTransitions` from `changes status --format toon` rather than parsing the text `approvals:` line

### Requirement: Lifecycle template protocol validation

#### Scenario: Unconditional transition recipe fails validation

- **GIVEN** a lifecycle template containing `specd changes transition <name> done --skip-hooks all` that is not conditioned on `nextAction` or on `done` being in `lifecycle.availableTransitions`
- **WHEN** the template protocol validator runs over the real templates
- **THEN** it fails and names the template and line

#### Scenario: Hooks for a possibly disabled step fail validation

- **GIVEN** a lifecycle template that always runs `run-hooks <name> verifying` regardless of the routed hop
- **WHEN** the validator runs
- **THEN** it fails

#### Scenario: Fixed next-skill completion message fails validation

- **GIVEN** a template whose completion message always suggests `/specd-verify`
- **WHEN** the validator runs
- **THEN** it fails and requires the suggestion to come from `nextAction.command`

#### Scenario: Current templates and installed copies pass

- **WHEN** the validator runs over `packages/skills/templates/skills/*/SKILL.md.tpl` and every installed generated copy
- **THEN** it passes

#### Scenario: Routing tests exercise real templates

- **WHEN** the skills test suite is inspected
- **THEN** no routing test relies solely on a routing function defined inside the test file

### Requirement: Implementation traceability policy

#### Scenario: Agent resolves tracked files explicitly before archive

- **GIVEN** an agent has already added relevant implementation links
- **AND** tracked implementation files still remain in `open` state
- **WHEN** the workflow approaches archive
- **THEN** the agent explicitly resolves or ignores those tracked files instead of assuming link creation alone closed review

### Requirement: Context optimization policy

#### Scenario: Agent delegates to optimizer subagent

- **GIVEN** `llmOptimizedContext` is enabled
- **AND** the runtime supports `agents`
- **WHEN** an orchestrator agent needs to optimize context
- **THEN** it launches `specd-project-context-optimizer` or `specd-spec-context-optimizer`
- **AND** it uses the returned optimized content

#### Scenario: Inline optimization fallback

- **GIVEN** `llmOptimizedContext` is enabled
- **AND** the runtime DOES NOT support `agents`
- **WHEN** an orchestrator agent needs to optimize context
- **THEN** it performs the optimization itself using "smart caveman" style
