# Verification: Delta Merger

## Requirements

### Requirement: Function signature

#### Scenario: deltaOperations omitted

- **WHEN** `mergeSpecs` is called without `deltaOperations`
- **THEN** it uses the specd defaults: `ADDED`, `MODIFIED`, `REMOVED`, `RENAMED`, `FROM`, `TO`

#### Scenario: deltaOperations provided

- **WHEN** `mergeSpecs` is called with `deltaOperations.added: "AÑADIDO"`
- **THEN** it parses `## AÑADIDO Requirements` sections from the delta, not `## ADDED Requirements`

### Requirement: Apply order

#### Scenario: RENAMED resolved before MODIFIED

- **WHEN** a delta renames block `Old` to `New` and also modifies `New`
- **THEN** RENAMED runs first, then MODIFIED applies to the already-renamed block using `New`

### Requirement: Conflict detection

#### Scenario: Conflict throws before any mutation

- **WHEN** the delta contains a conflict (e.g. same block in both MODIFIED and REMOVED)
- **THEN** `mergeSpecs` throws `DeltaConflictError` and the returned spec is never produced

### Requirement: Pure function

#### Scenario: Base spec unchanged

- **WHEN** `mergeSpecs(base, delta, configs)` is called
- **THEN** `base.content` is unchanged after the call
