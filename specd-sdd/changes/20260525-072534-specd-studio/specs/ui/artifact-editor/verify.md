# Verification: Artifact Editor

## Requirements

### Requirement: editor loads artifact via section-aware read hook

#### Scenario: Open file fetches content and hash

- **WHEN** user opens `proposal.md` on an active change
- **THEN** `getChangeArtifact` populates Monaco
- **AND** `originalHash` is stored for save

#### Scenario: Drafted change artifact uses getDraftArtifact

- **GIVEN** drafted change with `listSection` `draft`
- **WHEN** user opens an artifact in the inspector
- **THEN** `getDraftArtifact` populates Monaco
- **AND** `getChangeArtifact` is not called

#### Scenario: Save button disabled while in flight

- **WHEN** save request is pending
- **THEN** Save is disabled
- **AND** second click does not duplicate PUT

#### Scenario: Read-only artifact disables save

- **GIVEN** canonical workspace spec artifact
- **WHEN** editor renders content
- **THEN** Save is hidden or disabled
- **AND** buffer edits are not sent

### Requirement: save button uses inspector save hook

#### Scenario: Save toolbar wires to save hook

- **WHEN** user clicks Save in artifact editor
- **THEN** `hooks-inspector-save` invoked
- **AND** content and hash sent

#### Scenario: Save disabled when read-only

- **GIVEN** canonical read-only artifact
- **WHEN** editor renders
- **THEN** Save hidden or disabled
- **AND** hook not called on click

#### Scenario: Save disabled while request in flight

- **WHEN** save pending
- **THEN** button disabled
- **AND** duplicate PUT prevented

### Requirement: validate button runs ValidateArtifacts for current scope

#### Scenario: Validate calls scoped ValidateArtifacts

- **WHEN** user clicks Validate in editor toolbar
- **THEN** mutate hook validate runs with file scope
- **AND** problems panel updates

#### Scenario: Validate disabled without open change

- **GIVEN** no active change tab
- **WHEN** toolbar renders
- **THEN** Validate disabled
- **AND** no port call

#### Scenario: Validate errors stay in problems panel

- **GIVEN** validation returns findings
- **WHEN** validate completes
- **THEN** findings listed
- **AND** click navigates to artifact

### Requirement: editor supports in-file find and replace

#### Scenario: Find opens Monaco find widget

- **WHEN** user presses editor find shortcut
- **THEN** find widget visible
- **AND** search is scoped to buffer

#### Scenario: Replace updates buffer only

- **WHEN** user replaces one match
- **THEN** editor text changes
- **AND** save not auto-triggered

#### Scenario: Find respects read-only mode

- **GIVEN** read-only artifact
- **WHEN** user opens find
- **THEN** find works
- **AND** replace disabled or hidden
