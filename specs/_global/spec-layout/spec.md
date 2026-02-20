# Spec Layout

## Overview

specd specs are co-located with the code they describe. Each package has its own `specs/` directory at the monorepo root, scoped to that package. Global constraints that apply to all packages live under `specs/_global/`. Spec files are always named `spec.md` and live in a named subdirectory.

## Requirements

### Requirement: Global specs for cross-cutting constraints

Specs that apply to all packages — architecture, coding conventions, commit format, testing rules, storage design — live under `specs/_global/<topic>/spec.md`. Any spec in `_global/` is a binding constraint on every package in the monorepo.

#### Scenario: Global constraint applies to all packages

- **WHEN** a requirement is defined in `specs/_global/`
- **THEN** it binds all packages in the monorepo without exception

#### Scenario: Package-specific concern is not global

- **WHEN** a requirement only concerns a single package's internals
- **THEN** it must not be placed in `specs/_global/`

### Requirement: Package specs for package-internal concerns

Specs that describe the internals of a specific package live under `specs/<package>/`, where `<package>` is the short package name (e.g. `core`, `cli`, `mcp`, `schema-std`). These specs are not binding on other packages.

#### Scenario: Core use case spec

- **WHEN** a spec describes a use case implemented in `@specd/core`
- **THEN** it lives at `specs/core/<topic>/spec.md`

#### Scenario: CLI command spec

- **WHEN** a spec describes a command implemented in `@specd/cli`
- **THEN** it lives at `specs/cli/<topic>/spec.md`

### Requirement: Spec file naming

Each spec lives in its own named subdirectory and is always named `spec.md`. The subdirectory name is kebab-case and describes the topic concisely.

#### Scenario: Correct spec path

- **WHEN** a spec covers delta merging in `@specd/core`
- **THEN** the file is at `specs/core/delta-merger/spec.md`

#### Scenario: Incorrect co-location

- **WHEN** a spec file is placed directly in `specs/core/spec.md` with no subdirectory
- **THEN** it does not conform to this layout and must be moved

### Requirement: Standard spec file structure

Every `spec.md` file must follow this structure. Sections marked _optional_ may be omitted if not applicable; all other sections are required.

```markdown
# <Title>

## Overview

<!-- 1–3 sentences describing what this spec covers and why it exists. -->

## Requirements

### Requirement: <Name>

<!-- Requirement description using SHALL/MUST for normative statements. -->

#### Scenario: <Name>

- **GIVEN** <precondition> <!-- optional -->
- **WHEN** <condition>
- **THEN** <expected outcome>

## Constraints

<!-- Bullet list of hard rules that ValidateSpec or SchemaRegistry enforce.
     Omit this section if there are no constraints beyond the requirements. -->

## Examples

<!-- Optional. Concrete usage examples — YAML snippets, CLI invocations, etc.
     Useful as AI context via contextSections. -->

## Spec Dependencies

<!-- List of other specs this spec depends on or that provide context.
     If none, write: _none_ or _none — this is a global constraint spec_ -->

## ADRs

<!-- Links to ADRs that motivated or constrain this spec.
     If none, write: _none_ -->
```

`## Overview`, `## Requirements`, and `## Spec Dependencies` are mandatory. `## Constraints`, `## Examples`, and `## ADRs` are included when they add value.

#### Scenario: Mandatory sections present

- **WHEN** a spec file contains `## Overview`, `## Requirements`, and `## Spec Dependencies`
- **THEN** it conforms to the minimum required structure

#### Scenario: Optional section omitted

- **WHEN** a spec has no architectural decisions to reference
- **THEN** `## ADRs` may be omitted entirely

#### Scenario: Constraints section used

- **WHEN** there are hard rules that complement the requirements (e.g. format constraints, uniqueness rules)
- **THEN** they are listed as bullets under `## Constraints`, not embedded inside requirement text

#### Scenario: Examples section used

- **WHEN** a spec benefits from concrete examples (YAML, CLI output, code snippets)
- **THEN** they are placed under `## Examples` so `contextSections` can inject them selectively into AI context

### Requirement: Spec Dependencies section

Every spec must include a `## Spec Dependencies` section listing other specs it depends on or that provide context for it. If there are none, the section must say `_none_`.

#### Scenario: Global spec with no dependencies

- **WHEN** a spec in `specs/_global/` has no dependencies on other specs
- **THEN** its `## Spec Dependencies` section reads `_none — this is a global constraint spec_`

#### Scenario: Package spec referencing global constraints

- **WHEN** a spec in `specs/core/` is constrained by global architecture rules
- **THEN** it lists `specs/_global/architecture/spec.md` in its `## Spec Dependencies` section

## Constraints

- `specs/_global/` is for cross-cutting constraints only — not for any single package's implementation details
- Package spec directories use the short package name: `core`, `cli`, `mcp`, `mcp`, `skills`, `schema-std`, `schema-openspec`
- Spec files are always named `spec.md`, never `README.md` or any other name
- Subdirectory names are kebab-case
- A spec in `specs/<package>/` is not binding on any other package

## Spec Dependencies

_none — this is a global constraint spec_

## ADRs

- [ADR-0011: Spec Layout — Global vs Package-Scoped](../../../docs/adr/0011-spec-layout.md)
