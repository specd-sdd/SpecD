# Verification: cli:change-implementation

## Requirements

### Requirement: Command signature

#### Scenario: Subcommands are reachable

- **WHEN** `specd changes implementation --help` is run
- **THEN** it lists `list`, `add`, `resolve`, `ignore`, `remove`, and `review` as subcommands

### Requirement: List subcommand

#### Scenario: List shows tracked files by review state

- **GIVEN** a change with tracked implementation files in `open`, `resolved`, and `ignored` state
- **WHEN** `specd changes implementation list <name>` is run
- **THEN** the output distinguishes those tracked-file review states

#### Scenario: List shows file-level and symbol-level links

- **GIVEN** a change with one file-level link and one symbol-level refinement
- **WHEN** `specd changes implementation list <name>` is run
- **THEN** the output shows the confirmed links grouped by spec and file
- **AND** symbol refinements are shown only on the symbol-level link

#### Scenario: List resolves composed member links by same-file fallback

- **GIVEN** a symbol-level link stores `VcsAdapter.rootDir`
- **AND** the graph does not expose that exact stored string
- **AND** the same file contains one graph symbol named `rootDir` with the expected kind
- **WHEN** `specd changes implementation list <name>` is run
- **THEN** the CLI uses the same-file fallback on the rightmost member segment
- **AND** the symbol is not reported as stale

#### Scenario: List keeps composed member links stale when fallback is ambiguous

- **GIVEN** a symbol-level link stores `X::Y`
- **AND** the graph does not expose that exact stored string
- **AND** the same file contains multiple graph symbols named `Y`
- **WHEN** `specd changes implementation list <name>` is run
- **THEN** the CLI leaves the symbol marked stale
- **AND** it does not guess between the candidate same-file matches

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

### Requirement: Ignore subcommand

#### Scenario: Ignore marks multiple files as ignored via comma-separated list

- **GIVEN** tracked implementation files `f3.ts` and `f4.ts` are in `open` state
- **AND** both files exist on disk
- **WHEN** `specd changes implementation ignore <name> --file f3.ts,f4.ts` is run
- **THEN** both tracked files move to `ignored`

#### Scenario: Ignoring a missing file fails

- **GIVEN** the file `missing.ts` does not exist on disk
- **WHEN** `specd changes implementation ignore <name> --file missing.ts` is run
- **THEN** the command fails with `ImplementationFileNotFoundError`
- **AND** no tracked-file states are updated

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

### Requirement: Review subcommand

#### Scenario: Review reports stale symbol-level links only

- **GIVEN** a confirmed symbol-level implementation link
- **AND** the target symbol no longer exists in the graph database
- **WHEN** `specd changes implementation review <name>` is run
- **THEN** the review reports that link as stale
- **AND** the stale diagnosis is tied to missing symbol presence, not generic archive materialization errors

#### Scenario: Review retries composed member links before reporting stale

- **GIVEN** a confirmed symbol-level implementation link stores `CodeGraphProvider.analyzeSpecImpact`
- **AND** the graph does not expose that exact stored string
- **AND** the same file contains one graph symbol named `analyzeSpecImpact` with the expected kind
- **WHEN** `specd changes implementation review <name>` is run
- **THEN** the review uses the same-file composed-member fallback
- **AND** it does not report that link as stale

### Requirement: Shared path semantics

#### Scenario: Manual add uses raw project-relative path instead of workspace:path

- **WHEN** `specd changes implementation add <name> --spec core:change --file packages/core/src/domain/entities/change.ts` is run
- **THEN** the command accepts the raw project-relative path
- **AND** it does not require the user to provide `core:src/domain/entities/change.ts`
