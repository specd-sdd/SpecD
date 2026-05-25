# Verification: Inspector Unsaved Draft

## Requirements

### Requirement: unsaved indicator beside Save

#### Scenario: Dirty shows indicator

- **GIVEN** user edited change artifact text
- **WHEN** buffer differs from last loaded content
- **THEN** unsaved indicator is visible next to Save

#### Scenario: Save clears indicator

- **GIVEN** dirty buffer
- **WHEN** save succeeds
- **THEN** indicator disappears
- **AND** buffer matches saved content

### Requirement: close and navigation require confirmation when dirty

#### Scenario: Close panel prompts when dirty

- **GIVEN** dirty artifact open
- **WHEN** user clicks close on inspector
- **THEN** modal offers Save, Discard, Cancel
- **AND** modal chrome conforms to `ui:design-system` (`StudioDialog`)
- **AND** Cancel keeps panel open

#### Scenario: Discard closes without save

- **GIVEN** dirty artifact
- **WHEN** user chooses Discard on modal
- **THEN** panel closes
- **AND** edits are not persisted

#### Scenario: Save then close on confirm

- **GIVEN** dirty artifact
- **WHEN** user chooses Save on modal and save succeeds
- **THEN** navigation or close completes

#### Scenario: Clean close needs no modal

- **GIVEN** no edits since load or save
- **WHEN** user closes panel
- **THEN** no modal is shown

### Requirement: preview diff outline use draft pipelines when dirty

#### Scenario: Preview uses draft merge when dirty

- **GIVEN** dirty delta artifact
- **WHEN** user opens Preview tab
- **THEN** UI calls `previewChangeDraft` with override for open filename
- **AND** rendered markdown matches buffer merge
