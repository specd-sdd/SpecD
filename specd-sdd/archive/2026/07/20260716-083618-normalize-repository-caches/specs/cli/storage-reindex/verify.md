# Verification: Storage Reindex

## Requirements

### Requirement: Command signature

#### Scenario: No flags rebuilds all indexes

- **GIVEN** a project with configured workspaces `default` and `billing`
- **WHEN** `specd storage reindex` is run
- **THEN** `ChangeRepository.reindex()`, `SpecRepository.reindex()` for each workspace, and `ArchiveRepository.reindex()` are invoked
- **AND** the process exits with code 0

#### Scenario: --changes rebuilds change indexes only

- **WHEN** `specd storage reindex --changes` is run
- **THEN** only `ChangeRepository.reindex()` is invoked
- **AND** no spec or archive reindex methods are invoked

#### Scenario: --specs rebuilds spec indexes only

- **GIVEN** configured workspaces `default` and `billing`
- **WHEN** `specd storage reindex --specs` is run
- **THEN** `SpecRepository.reindex()` is invoked for each configured workspace
- **AND** change and archive reindex methods are not invoked

#### Scenario: --archive rebuilds archive index only

- **WHEN** `specd storage reindex --archive` is run
- **THEN** only `ArchiveRepository.reindex()` is invoked
- **AND** change and spec reindex methods are not invoked

#### Scenario: Combined resource flags rebuild selected targets

- **WHEN** `specd storage reindex --changes --specs` is run
- **THEN** `ChangeRepository.reindex()` and each workspace `SpecRepository.reindex()` are invoked
- **AND** `ArchiveRepository.reindex()` is not invoked

### Requirement: Port delegation

#### Scenario: Repositories obtained through normal composition wiring

- **WHEN** `specd storage reindex` runs
- **THEN** repository instances are obtained through the same composition/kernel wiring used by other storage commands

#### Scenario: CLI does not touch fs-cache files directly

- **WHEN** `specd storage reindex` runs
- **THEN** the command does not read or write files under `{configPath}/tmp/fs-cache/`
- **AND** it does not parse or emit JSONL index wire shapes

#### Scenario: Per-bucket change reindex methods are not called

- **WHEN** `specd storage reindex --changes` runs
- **THEN** the command invokes `ChangeRepository.reindex()` only
- **AND** it does not call `reindexActive`, `reindexDrafts`, or `reindexDiscarded`

### Requirement: Output format

#### Scenario: Text output lists every rebuilt target when rebuilding all

- **GIVEN** workspaces `default` and `billing`
- **WHEN** `specd storage reindex` completes successfully
- **THEN** stdout contains `reindexed changes`
- **AND** stdout contains `reindexed specs (default)`
- **AND** stdout contains `reindexed specs (billing)`
- **AND** stdout contains `reindexed archive`

#### Scenario: Text output lists only selected targets

- **WHEN** `specd storage reindex --changes --archive` completes successfully
- **THEN** stdout contains `reindexed changes` and `reindexed archive`
- **AND** stdout does not contain any `reindexed specs` line

#### Scenario: JSON output reflects rebuilt targets

- **GIVEN** workspaces `default` and `billing`
- **WHEN** `specd storage reindex --format json` completes successfully
- **THEN** stdout is valid JSON with `reindexed.changes` equal to `true`
- **AND** `reindexed.specs` equals `["default", "billing"]`
- **AND** `reindexed.archive` equal to `true`

#### Scenario: JSON output omits targets not rebuilt

- **WHEN** `specd storage reindex --changes --format json` completes successfully
- **THEN** stdout is valid JSON with `reindexed.changes` equal to `true`
- **AND** `reindexed` does not contain `specs` or `archive` keys

#### Scenario: TOON output matches JSON data model

- **WHEN** `specd storage reindex --changes --format toon` completes successfully
- **THEN** stdout encodes the same `reindexed` object shape as JSON mode in Token-Oriented Object Notation (toon)

### Requirement: Error cases

#### Scenario: Reindex failure exits code 3

- **GIVEN** `ArchiveRepository.reindex()` throws an error
- **WHEN** `specd storage reindex --archive` is run
- **THEN** the process exits with code 3
- **AND** stderr contains an `error:` message

#### Scenario: Errors go to stderr regardless of format

- **GIVEN** a selected `reindex()` call fails
- **WHEN** `specd storage reindex --format json` is run
- **THEN** stderr contains a plain-text `error:` message
- **AND** stdout does not contain the error payload

#### Scenario: Spec reindex is no-op with no configured workspaces

- **GIVEN** the project has no configured workspaces
- **WHEN** `specd storage reindex --specs` completes successfully
- **THEN** stdout contains no `reindexed specs` workspace lines
- **AND** JSON output has `reindexed.specs` as an empty array or omits workspace entries
