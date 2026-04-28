# Command Resource Naming

## Purpose

Inconsistent singular/plural command-group naming increases cognitive load and makes CLI usage less predictable. This spec defines one canonical naming policy for countable CLI resource groups and standardizes alias behavior so commands, docs, and skills stay coherent while preserving compatibility.

## Requirements

### Requirement: Canonical plural groups

For countable CLI resources, the canonical command-group name SHALL be plural.

Canonical groups in scope include:

- `changes`
- `specs`
- `archives`
- `drafts`

### Requirement: Singular aliases

Each canonical plural group SHALL accept a singular alias for backward compatibility.

Aliases in scope include:

- `change` as alias of `changes`
- `spec` as alias of `specs`
- `archive` as alias of `archives`
- `draft` as alias of `drafts`

### Requirement: Help and docs canonical display

CLI help and project documentation SHALL present canonical plural command groups as the primary form. Singular aliases MAY be shown as aliases only.

### Requirement: Behavioral equivalence

For any canonical group and its singular alias, command behavior, outputs, and exit codes MUST be equivalent for the same subcommand and arguments.

## Constraints

- This policy applies to command-group naming only; it does not rename domain entities or internal use-case identifiers.
- Introducing plural canonicals MUST NOT break existing singular invocations.

## Spec Dependencies

- [`cli:cli/entrypoint`](../entrypoint/spec.md) — CLI parsing and command registration conventions
