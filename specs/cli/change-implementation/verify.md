# Verification: cli:change-implementation

## Requirements

### Requirement: Command signature

#### Scenario: Subcommands are reachable

- **WHEN** `specd changes implementation --help` is run
- **THEN** it lists `list`, `add`, `resolve`, `ignore`, `remove`, and `review` as subcommands

### Requirement: Add subcommand

#### Scenario: Add creates tracked file when none existed

- **GIVEN** `packages/core/src/domain/entities/change.ts` is not yet tracked
- **WHEN** `specd changes implementation add <name> --spec core:change --file packages/core/src/domain/entities/change.ts` is run
- **THEN** the confirmed file-level link is created
- **AND** the file is added to `trackedImplementationFiles` with state `open`

#### Scenario: Add refines an existing spec-plus-file link with symbols

- **GIVEN** a file-level link already exists for `core:change` and `packages/core/src/domain/entities/change.ts`
- **WHEN** `specd changes implementation add <name> --spec core:change --file packages/core/src/domain/entities/change.ts --symbol Change.transition` is run
- **THEN** the same `spec + file` link is enriched with the symbol refinement
- **AND** no duplicate peer file-level link is created

#### Scenario: Adding a link to a missing file fails

- **GIVEN** the file `packages/core/src/missing-file.ts` does not exist on disk
- **WHEN** `specd changes implementation add <name> --spec core:change --file packages/core/src/missing-file.ts` is run
- **THEN** the command fails with `ImplementationFileNotFoundError`
- **AND** the change manifest is not modified

### Requirement: Resolve subcommand

#### Scenario: Resolve closes tracked-file review for multiple files via comma-separated list

- **GIVEN** tracked implementation files `f1.ts` and `f2.ts` are in `open` state
- **AND** both files exist on disk
- **WHEN** `specd changes implementation resolve <name> --file f1.ts,f2.ts` is run
- **THEN** both tracked files move to `resolved`

#### Scenario: Resolving a missing file fails

- **GIVEN** the file `missing.ts` does not exist on disk
- **WHEN** `specd changes implementation resolve <name> --file missing.ts` is run
- **THEN** the command fails with `ImplementationFileNotFoundError`
- **AND** no tracked-file states are updated

#### Scenario: Resolving an untracked file fails

- **GIVEN** `packages/core/src/untracked.ts` exists on disk
- **AND** it is not currently tracked by the change
- **WHEN** `specd changes implementation resolve <name> --file packages/core/src/untracked.ts` is run
- **THEN** the command fails
- **AND** it does not create a new tracked entry

#### Scenario: Resolving a removed file fails

- **GIVEN** `packages/core/src/missing.ts` is tracked as `removed`
- **WHEN** `specd changes implementation resolve <name> --file packages/core/src/missing.ts` is run
- **THEN** the command fails with `ImplementationFileNotFoundError`
- **AND** the state remains `removed`

### Requirement: Unresolve subcommand

#### Scenario: Unresolving an existing file reopens review

- **GIVEN** `packages/core/src/example.ts` is tracked as `resolved`
- **AND** it exists on disk
- **WHEN** `specd changes implementation unresolve <name> --file packages/core/src/example.ts` is run
- **THEN** the file state moves to `open`

#### Scenario: Unresolving an untracked file fails

- **GIVEN** `packages/core/src/untracked.ts` exists on disk
- **AND** it is not currently tracked by the change
- **WHEN** `specd changes implementation unresolve <name> --file packages/core/src/untracked.ts` is run
- **THEN** the command fails
- **AND** it does not create a new tracked entry

#### Scenario: Unresolving a removed file fails

- **GIVEN** `packages/core/src/missing.ts` is tracked as `removed`
- **AND** it does not exist on disk
- **WHEN** `specd changes implementation unresolve <name> --file packages/core/src/missing.ts` is run
- **THEN** the command fails with `ImplementationFileNotFoundError`
- **AND** the state remains `removed`

### Requirement: Ignore subcommand

#### Scenario: Ignore marks multiple files as ignored via comma-separated list

- **GIVEN** tracked implementation files `f3.ts` and `f4.ts` are in `open` state
- **AND** both files exist on disk
- **WHEN** `specd changes implementation ignore <name> --file f3.ts,f4.ts` is run
- **THEN** both tracked files move to `ignored`

#### Scenario: Ignoring a new missing file fails

- **GIVEN** the file `new-missing.ts` is NOT currently tracked
- **AND** it does not exist on disk
- **WHEN** `specd changes implementation ignore <name> --file new-missing.ts` is run
- **THEN** the command fails with `ImplementationFileNotFoundError`
- **AND** no tracked-file states are updated

#### Scenario: Ignoring a missing-but-tracked file succeeds

- **GIVEN** `packages/core/src/deleted.ts` is tracked as `removed`
- **AND** it does not exist on disk
- **WHEN** `specd changes implementation ignore <name> --file packages/core/src/deleted.ts` is run
- **THEN** the file state moves to `ignored`

#### Scenario: Ignoring a linked tracked file preserves confirmed links

- **GIVEN** `packages/core/src/example.ts` is already tracked by the change
- **AND** a confirmed implementation link exists for that file
- **WHEN** `specd changes implementation ignore <name> --file packages/core/src/example.ts` is run
- **THEN** the file state moves to `ignored`
- **AND** the confirmed implementation link remains present

### Requirement: Remove subcommand

#### Scenario: Removing one symbol preserves the remaining refinements

- **GIVEN** a confirmed `spec + file` link with symbols `["Change.invalidate", "Change.transition"]`
- **WHEN** `specd changes implementation remove <name> --spec core:change --file <path> --symbol Change.invalidate` is run
- **THEN** only `Change.transition` remains on that link

#### Scenario: Removing last symbol preserves explicit file-level link

- **GIVEN** a `spec + file` link whose file-level presence was explicitly created earlier
- **AND** it currently has one remaining symbol refinement
- **WHEN** that last symbol is removed
- **THEN** the explicit file-level link remains

### Requirement: Shared path semantics

#### Scenario: Manual add uses raw project-relative path instead of workspace:path

- **WHEN** `specd changes implementation add <name> --spec core:change --file packages/core/src/domain/entities/change.ts` is run
- **THEN** the command accepts the raw project-relative path
- **AND** it does not require the user to provide `core:src/domain/entities/change.ts`

### Requirement: List subcommand

#### Scenario: List renders SDK outcomes without fallback

- **GIVEN** stored links resolve through a re-export, hierarchy path, ambiguity, and incomplete coverage
- **WHEN** `changes implementation list` runs
- **THEN** it renders the SDK projection with stored values unchanged
- **AND** no CLI same-file or rightmost-segment query occurs

### Requirement: Review subcommand

#### Scenario: Review distinguishes missing from inconclusive absence

- **GIVEN** one absent symbol has current complete coverage and another has dirty or parse-failed coverage
- **WHEN** implementation review runs
- **THEN** the first is missing and the second unresolved
- **AND** neither stored link is mutated

### Requirement: Start subcommand

#### Scenario: Start explicitly activates implementation tracking

- **GIVEN** an active change where implementation tracking is inactive
- **WHEN** running `specd changes implementation start <name>`
- **THEN** it executes `UpdateImplementationTracking` with action `'start'`
- **AND** tracking becomes active
- **AND** re-running `start` succeeds idempotently
