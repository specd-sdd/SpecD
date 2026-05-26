# Verification: Change Scope Dialog

## Requirements

### Requirement: dialog shows high-impact warning

#### Scenario: Warning visible on open

- **WHEN** `studio-change-scope-dialog` opens
- **THEN** an alert banner mentions invalidate and removing specs

### Requirement: each spec is one card with scope remove and dependencies

#### Scenario: Add spec form is before spec cards

- **WHEN** `studio-change-scope-dialog` shows the edit step
- **THEN** the **Add spec** field and button appear above `studio-change-scope-spec-cards`
- **AND** only one `datalist#studio-scope-dialog-spec-suggestions` exists in the dialog

#### Scenario: Add spec creates a new card

- **GIVEN** user types a valid spec ID and submits Add spec
- **WHEN** ID is not already in draft
- **THEN** a new spec card appears with empty dependencies

#### Scenario: Add dep uses shared spec suggestions

- **GIVEN** `specSuggestions` includes `default:architecture`
- **WHEN** user focuses **depends-on** on a spec card
- **THEN** that input uses `list="studio-scope-dialog-spec-suggestions"`
- **AND** browser autocomplete can offer `default:architecture` like **Add spec**

#### Scenario: Self-dependency is ignored

- **GIVEN** spec card `ui:demo`
- **WHEN** user submits **Add dep** with `ui:demo`
- **THEN** no dependency chip is added for that spec

#### Scenario: Remove spec via card header

- **GIVEN** a spec card is visible
- **WHEN** user clicks ✕ on the card header
- **THEN** that card is removed from the list until Save

#### Scenario: Add dependency on the same card

- **GIVEN** spec `ui:demo` card is open
- **WHEN** user adds dependency `default:architecture`
- **THEN** dependency chip appears in that card’s body

### Requirement: dialog persists scope and dependsOn on save

#### Scenario: Scope PATCH on confirm

- **GIVEN** user confirmed a scope change on the confirm sub-step
- **WHEN** user clicks **Apply scope change**
- **THEN** `patchChange` runs with `addSpecIds` and `removeSpecIds`
- **AND** dialog closes on success

#### Scenario: Dependency PATCH without scope change

- **GIVEN** only `dependsOn` values changed
- **WHEN** user clicks **Save changes**
- **THEN** `updateSpecDependencies` runs for each edited spec
- **AND** scope PATCH is not invoked

### Requirement: scope save uses PATCH and confirm step

#### Scenario: Scope change shows confirm sub-step

- **GIVEN** user removed a spec from draft
- **WHEN** user clicks **Save changes**
- **THEN** dialog shows confirm copy with add/remove lists
- **AND** PATCH runs only after **Apply scope change**

#### Scenario: Dependencies only skips confirm

- **GIVEN** scope unchanged and only `dependsOn` edited
- **WHEN** user clicks **Save changes**
- **THEN** `updateSpecDependencies` runs without confirm sub-step

### Requirement: dialog uses StudioDialog chrome

#### Scenario: dialog uses StudioDialog chrome — primary path

- **WHEN** data-testid=studio-change-scope-dialog. Large layout (max-w-2xl) with scrollable body. Actions:
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: dialog uses StudioDialog chrome — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented

### Requirement: view uses SpecdDataPort hooks only

#### Scenario: No core import

- **WHEN** `@specd/ui` is inspected
- **THEN** `ChangeScopeDialog` does not import `@specd/core`
