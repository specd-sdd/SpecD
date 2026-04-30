# Verification: Workflow Automation

## Requirements

### Requirement: Diagnostic Priority

#### Scenario: Agent chooses text format for status checks

- **WHEN** an AI agent needs to check the current status of a change
- **THEN** it SHALL use `specd change status <name> --format text`
- **AND** it MUST NOT use `--format json` as the primary diagnostic tool

### Requirement: Data Extraction

#### Scenario: Agent chooses JSON for tool-call preparation

- **GIVEN** an agent needs to retrieve a list of spec IDs to pass to another tool
- **WHEN** it executes the status check
- **THEN** it SHALL use `--format json` or `--format toon` to ensure robust parsing of the spec ID array

### Requirement: On-demand outline retrieval

#### Scenario: Agent fetches full outline using canonical command

- **GIVEN** artifact-instruction output includes `availableOutlines: ["core:core/config"]`
- **WHEN** the agent needs full structure for delta authoring
- **THEN** it runs `specd specs outline core:core/config --artifact specs`
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

#### Scenario: Overlap or drift risk requires merged preview

- **GIVEN** overlap or drift risk is detected for a spec delta
- **WHEN** the agent assesses whether delta output is safe to accept
- **THEN** the agent runs `specd changes spec-preview <change-name> <specId>` to inspect merged content
- **AND** it does not treat raw delta inspection alone as sufficient

#### Scenario: Single-artifact review uses preview filtering

- **GIVEN** merged review needs only one spec-scoped artifact
- **WHEN** the agent runs preview for content review
- **THEN** it prefers `specd changes spec-preview <change-name> <specId> --artifact <artifactId>` to avoid unrelated output
