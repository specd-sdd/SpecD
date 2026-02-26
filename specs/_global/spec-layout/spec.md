# Spec Layout

## Overview

specd specs are organised by scope and live under `specs/` at the monorepo root. Global constraints that apply to all packages live under `specs/_global/`; package-internal specs live under `specs/<package>/`. Every spec subdirectory contains two files: `spec.md` (requirements and design) and `verify.md` (WHEN/THEN scenarios).

## Requirements

### Requirement: Global specs for cross-cutting constraints

Specs that apply to all packages — architecture, coding conventions, commit format, testing rules, storage design — live under `specs/_global/<topic>/`. Any spec in `_global/` is a binding constraint on every package in the monorepo.

### Requirement: Package specs for package-internal concerns

Specs that describe the internals of a specific package live under `specs/<package>/`, where `<package>` is the short package name (e.g. `core`, `cli`, `mcp`, `schema-std`). These specs are not binding on other packages.

### Requirement: Spec file naming

Each spec lives in its own named subdirectory and contains two files: `spec.md` and `verify.md`. The subdirectory name is kebab-case and describes the topic concisely.

- `spec.md` — what the system does: requirements, constraints, examples, rationale
- `verify.md` — how to confirm it works: WHEN/THEN scenarios

The two files are always paired. `spec.md` contains no WHEN/THEN scenarios; `verify.md` contains no requirement prose.

### Requirement: spec.md structure

Every `spec.md` must follow this structure. Sections marked _optional_ may be omitted if not applicable; all other sections are required.

```markdown
# <Title>

## Overview

<!-- 1–3 sentences describing what this spec covers and why it exists. -->

## Requirements

### Requirement: <Name>

<!-- Requirement description using SHALL/MUST for normative statements.
     No WHEN/THEN scenarios here — those go in verify.md. -->

## Constraints

<!-- Bullet list of hard rules that apply across all requirements.
     Omit if there are no constraints beyond the requirements. -->

## Examples

<!-- Optional. Concrete usage examples — YAML snippets, CLI invocations, etc.
     Useful as AI context via contextSections. -->

## Spec Dependencies

<!-- List of other specs this spec depends on or that provide context.
     If none, write: _none_ or _none — this is a global constraint spec_ -->

## ADRs

<!-- Links to ADRs that motivated or constrain this spec.
     If none, omit this section. -->
```

`## Overview`, `## Requirements`, and `## Spec Dependencies` are mandatory. All other sections are included when they add value.

### Requirement: verify.md structure

Every `verify.md` must follow this structure. Scenarios are grouped under requirement headings using the same `### Requirement: <name>` pattern as `spec.md` — this is required for AST-based delta selectors to locate scenario nodes by heading when changes are applied to `verify.md`.

```markdown
# Verification: <Title>

## Requirements

### Requirement: <Name>

#### Scenario: <Name>

- **GIVEN** <precondition> <!-- optional; use when precondition is not obvious -->
- **WHEN** <condition>
- **THEN** <expected outcome>
- **AND** <additional assertion> <!-- optional -->
```

Only scenarios that add information beyond what the requirement prose already states are included. Scenarios that merely restate the obvious happy path are omitted.

### Requirement: Spec Dependencies section

Every `spec.md` must include a `## Spec Dependencies` section listing other specs it depends on or that provide context for it. If there are none, the section must say `_none_`. Global specs with no dependencies use the form `_none — this is a global constraint spec_`.

## Constraints

- `specs/_global/` is for cross-cutting constraints only — not for any single package's implementation details
- Package spec directories use the short package name: `core`, `cli`, `mcp`, `skills`, `schema-std`, `schema-openspec`
- Every spec subdirectory contains exactly two authored files: `spec.md` and `verify.md`; `.specd-metadata.yaml` is a generated system file and is not counted
- Delta files (`spec.md.delta.yaml`, `verify.md.delta.yaml`, etc.) are change artifacts — they live in the change directory alongside the artifact and are never synced to the permanent `specs/` directories
- `spec.md` contains no WHEN/THEN scenarios; `verify.md` contains no requirement prose
- Subdirectory names are kebab-case
- A spec in `specs/<package>/` is not binding on any other package

## Spec Dependencies

_none — this is a global constraint spec_

## ADRs

- [ADR-0011: Spec Layout — Global vs Package-Scoped](../../../docs/adr/0011-spec-layout.md)
