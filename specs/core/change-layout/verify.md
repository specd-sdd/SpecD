# Verification: Change Directory Layout

## Requirements

### Requirement: Root files

#### Scenario: Change-scoped artifacts are flat at the root

- **WHEN** a change produces `proposal.md` and `tasks.md` (both `scope: change`)
- **THEN** those files are located at `<change-dir>/proposal.md` and `<change-dir>/tasks.md` with no subdirectory prefix

#### Scenario: manifest.json is always at the root

- **WHEN** any change directory is inspected
- **THEN** `manifest.json` is located directly at the change directory root, never in a subdirectory

### Requirement: New spec-scoped artifacts

#### Scenario: New spec in the default workspace

- **WHEN** a change creates a new `spec.md` for capability `core/config` in the `default` workspace
- **THEN** the file is located at `specs/default/core/config/spec.md` within the change directory

#### Scenario: New spec in a named workspace

- **WHEN** a change creates a new `spec.md` for capability `invoices` in the `billing` workspace
- **THEN** the file is located at `specs/billing/invoices/spec.md` within the change directory

#### Scenario: Spec and verify are siblings under the same capability path

- **WHEN** a change creates both `spec.md` and `verify.md` for capability `auth/login` in the `default` workspace
- **THEN** both files are located under `specs/default/auth/login/` — `spec.md` and `verify.md` as siblings

### Requirement: Delta files

#### Scenario: Delta file for an existing spec

- **WHEN** a change modifies an existing `spec.md` for capability `core/config` in the `default` workspace
- **THEN** a delta file is produced at `deltas/default/core/config/spec.md.delta.yaml` within the change directory

#### Scenario: Delta file naming includes the artifact filename

- **WHEN** a delta file targets `verify.md` for capability `auth/login` in the `default` workspace
- **THEN** the delta file is located at `deltas/default/auth/login/verify.md.delta.yaml`

#### Scenario: No delta file for a new spec

- **WHEN** a change creates a brand-new capability with no existing spec
- **THEN** no delta file exists for that capability — only the new `spec.md` under `specs/<workspace>/<path>/`

#### Scenario: Direct spec file is not a substitute for an existing delta

- **GIVEN** `default:core/config` already exists
- **AND** `spec.md` is delta-capable in the active schema
- **WHEN** tooling resolves the expected artifact path for that spec
- **THEN** the expected path is `deltas/default/core/config/spec.md.delta.yaml`
- **AND** `specs/default/core/config/spec.md` is not treated as an equivalent path

### Requirement: Expected spec-scoped artifact path

#### Scenario: Existing delta-capable spec expects a delta path

- **GIVEN** `default:core/config` already exists
- **AND** the schema artifact `specs` declares `delta: true` with output `spec.md`
- **WHEN** specd resolves the change artifact path for that spec
- **THEN** the expected path is `deltas/default/core/config/spec.md.delta.yaml`

#### Scenario: New spec expects a direct specs path

- **GIVEN** `default:core/new-capability` does not exist yet
- **AND** the schema artifact `specs` declares output `spec.md`
- **WHEN** specd resolves the change artifact path for that spec
- **THEN** the expected path is `specs/default/core/new-capability/spec.md`

#### Scenario: Specs and deltas paths are not interchangeable

- **GIVEN** a spec-scoped artifact has resolved expected path `deltas/default/core/config/spec.md.delta.yaml`
- **WHEN** a direct file also exists at `specs/default/core/config/spec.md`
- **THEN** tooling still reports and validates only the delta path

### Requirement: Workspace segment is always present

#### Scenario: Single workspace — segment still required

- **WHEN** a project has only one workspace named `default` and a change creates a new spec
- **THEN** the file is at `specs/default/<capability-path>/spec.md`, not `specs/<capability-path>/spec.md`

#### Scenario: Multi-workspace change uses distinct prefixes

- **WHEN** a change touches specs in both the `default` and `billing` workspaces
- **THEN** files for each workspace are under their respective `specs/default/` and `specs/billing/` subtrees with no overlap

### Requirement: Full change directory structure

#### Scenario: Change with only new specs has no deltas/ subtree

- **WHEN** a change creates only new capabilities and modifies no existing specs
- **THEN** the change directory contains a `specs/` subtree but no `deltas/` directory

#### Scenario: Change with only modifications has no specs/ subtree

- **WHEN** a change modifies only existing capabilities and creates no new specs
- **THEN** the change directory contains a `deltas/` subtree but no `specs/` directory

#### Scenario: Mixed change has both subtrees

- **WHEN** a change creates one new spec and modifies one existing spec
- **THEN** the change directory contains both a `specs/` and a `deltas/` subtree
