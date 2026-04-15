# Post-Archive Changeset Hook — Verification

## Scenario: Generate changeset for single package change

### Given

- A change named `add-overlap-detection` affecting specs `core:spec-overlap/spec`
- The change is in `archivable` state
- The hook `archive-create-changeset` is configured

### When

- The change is archived via `change archive add-overlap-detection`
- Post-archive hooks execute

### Then

- A changeset file `.changeset/add-overlap-detection.md` is created
- The changeset contains `@specd/core` with `patch` type
- The description includes the change summary and affected spec

## Scenario: Generate changeset for multi-package change

### Given

- A change named `refactor-core-cli` affecting specs `core:storage/spec` and `cli:change-archive/spec`
- The change is in `archivable` state

### When

- The change is archived

### Then

- A changeset file `.changeset/refactor-core-cli.md` is created
- The changeset contains entries for both `@specd/core` and `@specd/cli`
- Each entry has the appropriate bump type

## Scenario: Skip changeset for no-package change

### Given

- A change named `update-global-docs` affecting only `default:architecture/spec`
- The change is in `archivable` state

### When

- The change is archived

### Then

- No changeset file is created (default workspace has no npm package)
- Hook completes successfully without error

## Scenario: Overwrite existing changeset

### Given

- A changeset file `.changeset/add-feature.md` already exists
- A change named `add-feature` is archived

### When

- The change is archived

### Then

- The existing changeset is overwritten with fresh content
- File modification time is updated

## Scenario: Hook failure is non-blocking

### Given

- A change is archived
- The `.changeset/` directory is not writable

### When

- Post-archive hooks execute, including `archive-create-changeset`

### Then

- Hook logs a warning about the failure
- Archive operation completes successfully
- No changeset file is created
- Exit code is 0 (success)
