# Verification: UpdateImplementationTracking

## Requirements

### Requirement: Input contract

#### Scenario: Execute accepts implementation-tracking mutation input

- **WHEN** `UpdateImplementationTracking.execute(...)` is called
- **THEN** it accepts `name`, `action`, and `file`
- **AND** it optionally accepts `specId` and `symbols` for link mutations

#### Scenario: Invalid specId rejected before any mutation

- **WHEN** `add` is called with `specId: 'Bad Id'`
- **THEN** `InvalidSpecIdError` is thrown and the change is untouched

#### Scenario: Bare specId normalized

- **WHEN** `add` is called with `specId: 'auth/login'`
- **THEN** the link is recorded for `default:auth/login`

#### Scenario: specId is validated for start

- **WHEN** `start` is called with `specId: 'Bad Id'`
- **THEN** `InvalidSpecIdError` is thrown and tracking is not activated

#### Scenario: Add without specId fails with a typed input error

- **WHEN** `add` is called with `file: 'a.ts'` and no `specId`
- **THEN** `InvalidInputError` stating that `specId` is required is thrown and the change is untouched

#### Scenario: Unknown workspace in specId is rejected

- **WHEN** `add` is called with `specId: 'nope:auth/login'`
- **THEN** `WorkspaceNotFoundError` is thrown and the change is untouched

#### Scenario: specId is validated for any action

- **WHEN** `resolve` is called with `specId: 'Bad Id'` and a valid file
- **THEN** `InvalidSpecIdError` is thrown and the file stays unchanged

### Requirement: Add mutation creates or enriches implementation links

#### Scenario: Add requires file existence and opens tracking when needed

- **GIVEN** a change exists and the target file exists on disk
- **WHEN** `action = add` is executed for an untracked file
- **THEN** a confirmed implementation link is created or enriched
- **AND** the file becomes tracked with review state `open`

#### Scenario: Add allows specId declared in change or existing in canonical repository

- **GIVEN** a change exists with declared specIds and access to workspace spec repositories
- **WHEN** `action = add` is executed with a `specId` present in `change.specIds` or present in `SpecRepository`
- **THEN** the implementation link is created successfully

#### Scenario: Add throws SpecNotFoundError when specId is absent from change and repository

- **GIVEN** a change exists with a declared specId list
- **WHEN** `action = add` is executed with a `specId` that is not in `change.specIds` and not found in `SpecRepository`
- **THEN** the use case throws `SpecNotFoundError`

#### Scenario: Batch add with invalid specId fails atomically and leaves change untouched

- **GIVEN** an atomic batch add request with multiple files and an invalid `specId`
- **WHEN** `action = add` is executed
- **THEN** `SpecNotFoundError` is thrown
- **AND** no files from the batch are added to `trackedImplementationFiles` or `implementationLinks`

### Requirement: Remove mutation removes implementation links

#### Scenario: Remove with symbols deletes only those refinements

- **GIVEN** a confirmed `specId + file` link has multiple symbol refinements
- **WHEN** `action = remove` is executed with one symbol
- **THEN** only that symbol refinement is removed

### Requirement: Resolve mutation closes tracked-file review

#### Scenario: Resolve requires tracked existing file

- **GIVEN** a tracked file exists on disk
- **WHEN** `action = resolve` is executed
- **THEN** the tracked file moves to `resolved`

### Requirement: Unresolve mutation reopens tracked-file review

#### Scenario: Unresolve reopens resolved file

- **GIVEN** a tracked file exists on disk in `resolved` state
- **WHEN** `action = unresolve` is executed
- **THEN** the tracked file moves to `open`

#### Scenario: Unresolve refuses removed file

- **GIVEN** a tracked file is in `removed` state
- **WHEN** `action = unresolve` is executed
- **THEN** the use case throws `ImplementationFileNotFoundError`

### Requirement: Ignore mutation preserves tracked history

#### Scenario: Ignore preserves confirmed links for tracked file

- **GIVEN** a tracked file has confirmed implementation links
- **WHEN** `action = ignore` is executed
- **THEN** the file moves to `ignored`
- **AND** the confirmed links remain present

### Requirement: Start mutation activates implementation tracking

#### Scenario: Start mutation activates tracking on change without requiring file

- **GIVEN** an existing change where implementation tracking is inactive
- **WHEN** calling `UpdateImplementationTracking.execute({ name, action: 'start' })`
- **THEN** `isImplementationTrackingActive` becomes `true` on the change
- **AND** the updated implementation tracking projection is returned
- **AND** subsequent `start` calls succeed idempotently

### Requirement: Change must exist

#### Scenario: Unknown change throws ChangeNotFoundError

- **WHEN** `UpdateImplementationTracking.execute({ name: "missing", ... })` is called
- **THEN** it throws `ChangeNotFoundError`

### Requirement: Missing-file validation uses typed errors

#### Scenario: Missing file throws ImplementationFileNotFoundError

- **WHEN** a file-required mutation targets a missing or invalid file
- **THEN** the use case throws `ImplementationFileNotFoundError`

### Requirement: Persistence and result projection

#### Scenario: Mutation persists and returns implementation projection

- **WHEN** a mutation succeeds
- **THEN** it persists through `ChangeRepository.mutate`
- **AND** the result includes the resulting `ImplementationTrackingProjection`

### Requirement: Config-based factory delegates through resolveUpdateImplementationTrackingDeps

#### Scenario: createUpdateImplementationTracking config form derives UpdateImplementationTrackingDeps through resolveUpdateImplementationTrackingDeps

- **WHEN** `createUpdateImplementationTracking(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `UpdateImplementationTrackingDeps` through `resolveUpdateImplementationTrackingDeps(resolver)`
- **AND** `resolveUpdateImplementationTrackingDeps(resolver)` resolves:
  - `changes: ChangeRepository`
  - `files: FileReader`
  - `projectRoot: string`
  - `specRepositories: ReadonlyMap<string, SpecRepository>`
- **AND** the factory delegates to canonical `createUpdateImplementationTracking(deps)`

### Requirement: File names are whole names

#### Scenario: Name with a comma is matched exactly

- **GIVEN** the tracked file `SpecD — Análisis de identidad LogicalSymbol, dependencias y casos de uso.md`
- **WHEN** `ignore` is called with `file` set to that exact name
- **THEN** the tracked file moves to `ignored`
- **AND** no part of the name is treated as a separate file

#### Scenario: Missing name is reported whole

- **WHEN** `resolve` is called with `files: ['a,b.md']` and no such file exists
- **THEN** `ImplementationFileNotFoundError` quotes `a,b.md`

#### Scenario: Leading and trailing spaces are preserved

- **GIVEN** a tracked file named `spaced.md` with a leading and trailing space
- **WHEN** `resolve` is called with exactly that name
- **THEN** the file is resolved and stored with the same string

#### Scenario: Quote, backslash, and non-ASCII names are preserved

- **WHEN** `add` records `"quoted".md`, `back\slash.md`, and `ñandú.md`
- **THEN** the manifest stores each string exactly as given

#### Scenario: Equivalent array input through the SDK

- **WHEN** an SDK caller passes `files: ['a.md', 'b, c.md']`
- **THEN** the use case handles exactly two files
- **AND** `b, c.md` is matched as one name, never as `b` and `c.md`

#### Scenario: Quote, backslash, and non-ASCII names are each preserved separately

- **WHEN** `add` is called once with `"quoted".md`, once with `back\slash.md`, and once with `ñandú.md` on a POSIX host
- **THEN** each call stores its own string exactly as given

#### Scenario: Duplicate names collapse to one

- **WHEN** `ignore` is called with `files: ['a.ts', 'a.ts']` and `a.ts` is tracked
- **THEN** `a.ts` is validated and applied once

#### Scenario: Both file and files are combined

- **WHEN** `resolve` is called with `file: 'a.ts'` and `files: ['b.ts']`
- **THEN** both `a.ts` and `b.ts` are resolved

#### Scenario: Windows error quotes the original value

- **GIVEN** a Windows host and no tracked file `a/b.ts`
- **WHEN** `resolve` is called with `file: 'a\\b.ts'`
- **THEN** `ImplementationFileNotFoundError` quotes `a\\b.ts`, not `a/b.ts`

#### Scenario: Case-only difference denotes the same file on a case-insensitive host

- **GIVEN** a tracked file `Docs/Notes.md` and a case-insensitive host (Windows or macOS)
- **WHEN** `resolve` is called with `docs/notes.md`
- **THEN** the tracked file `Docs/Notes.md` moves to resolved
- **AND** the manifest keeps the spelling `Docs/Notes.md`

#### Scenario: Case-only difference is distinct on a case-sensitive host

- **GIVEN** a tracked file `Docs/Notes.md` and a case-sensitive host (Linux)
- **WHEN** `resolve` is called with `docs/notes.md`
- **THEN** `docs/notes.md` is not matched to the tracked file and the typed not-tracked or not-found error is thrown

#### Scenario: New-batch case aliases collapse on case-insensitive hosts

- **GIVEN** a Windows or macOS host and neither spelling is tracked yet
- **WHEN** `add` receives `files: ['Docs/Notes.md', 'docs/notes.md']`
- **THEN** one tracked file and one link are stored
- **AND** the stored spelling is `Docs/Notes.md`, the first value supplied

#### Scenario: New-batch case variants remain distinct on Linux

- **GIVEN** a Linux host and both case-distinct paths exist
- **WHEN** `add` receives `files: ['Docs/Notes.md', 'docs/notes.md']`
- **THEN** two distinct tracked files and links are stored

### Requirement: Path separators are normalized on Windows hosts

#### Scenario: Backslash path matches the tracked forward-slash entry on Windows

- **GIVEN** a Windows host and the tracked file `packages/core/x.ts`
- **WHEN** `resolve` is called with `file: 'packages\\core\\x.ts'`
- **THEN** the tracked file `packages/core/x.ts` moves to `resolved`

#### Scenario: Stored name uses forward slashes on Windows

- **GIVEN** a Windows host
- **WHEN** `add` records `file: 'src\\domain\\change.ts'`
- **THEN** the manifest stores `src/domain/change.ts`

#### Scenario: Backslash is preserved on POSIX hosts

- **GIVEN** a Linux or macOS host
- **WHEN** `add` records a file named `back\\slash.md`
- **THEN** the manifest stores `back\\slash.md` unchanged

#### Scenario: Comma names are unaffected by separator normalization

- **GIVEN** a Windows host
- **WHEN** `ignore` is called with `file: 'docs\\Análisis, dependencias.md'`
- **THEN** the name is `docs/Análisis, dependencias.md` and the comma is untouched

#### Scenario: Normalization applies to batches and every action

- **GIVEN** a Windows host
- **WHEN** `ignore` is called with `files: ['a\\b.ts', 'c\\d.ts']`
- **THEN** both entries are normalized to `a/b.ts` and `c/d.ts` before validation

#### Scenario: Every other action normalizes on Windows

- **GIVEN** a Windows host and tracked files `a/b.ts` and `c/d.ts`
- **WHEN** `resolve`, `unresolve`, `remove`, and `add` are each called with the backslash form of those paths
- **THEN** each action matches or stores the forward-slash form

#### Scenario: Separator helper is a pure function of the platform

- **WHEN** `toLogicalFilePath('a\\b.ts', 'win32')` and `toLogicalFilePath('a\\b.ts', 'linux')` are called
- **THEN** the first returns `a/b.ts` and the second returns `a\\b.ts`

### Requirement: Multi-file mutations are all-or-nothing

#### Scenario: A missing fourth file leaves the change untouched

- **GIVEN** four tracked files `f1.ts`, `f2.ts`, `f3.ts`, `missing.ts`, where `missing.ts` does not exist
- **WHEN** `resolve` is called with all four
- **THEN** `ImplementationFileNotFoundError` is thrown for `missing.ts`
- **AND** `f1.ts`, `f2.ts`, and `f3.ts` remain `open`

#### Scenario: All valid files are applied together

- **WHEN** `ignore` is called with two valid tracked files
- **THEN** both move to `ignored` in one persisted mutation
- **AND** `ChangeRepository.mutate` is called exactly once
