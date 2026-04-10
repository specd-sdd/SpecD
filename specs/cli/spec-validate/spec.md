# Spec Validate

## Purpose

Specs that violate the schema's structural rules can break downstream tooling and confuse agents. The `specd spec validate` command validates spec artifacts against the active schema's structural rules, supporting a single spec, all specs in a workspace, or all specs across all workspaces.

## Requirements

### Requirement: Command signature

`specd spec validate [specPath] [--all] [--workspace <name>] [--format text|json|toon] [--config <path>]`

Exactly one scope must be provided:

- `<specPath>` — validate a single spec
- `--all` — validate all specs across all workspaces
- `--workspace <name>` — validate all specs in a workspace

### Requirement: Scope resolution

Only `scope: 'spec'` artifacts from the active schema are validated. Change-scoped
artifacts are ignored.

### Requirement: Artifact filename derivation

The filename to load from the spec directory is derived from `artifactType.output()`
by extracting the basename (e.g. `specs/**/spec.md` → `spec.md`).

### Requirement: Missing artifact handling

If a required (`optional: false`) artifact file is absent from the spec directory,
it counts as a validation failure.

### Requirement: Structural validation

If an artifact type defines `validations`, the file content is parsed with the
appropriate format parser and the validation rules are evaluated against the AST.

### Requirement: Text output — single spec

Pass: `validated <workspace:path>: all artifacts pass`
Fail: `validation failed <workspace:path>:` followed by indented error lines.

### Requirement: Text output — multiple specs

Summary line: `validated N specs: X passed, Y failed`
Followed by each failed spec with indented errors.

### Requirement: JSON output

Returns the full `ValidateSpecsResult` object.

### Requirement: Exit code

Exit 0 when all specs pass. Exit 1 when any spec has failures or when the spec/workspace is not found.

### Requirement: Error — spec not found

If a single `<specPath>` does not exist, write error to stderr, exit 1.

### Requirement: Error — workspace not found

If `--workspace <name>` references an unknown workspace, write error to stderr, exit 1.

## Constraints

- The command contains no validation logic — all rules are evaluated by the `ValidateSpecs` use case
- Only `scope: 'spec'` artifacts are checked

## Spec Dependencies

- `default:_global/architecture` — adapter packages contain no business logic
- `default:_global/conventions` — error types, named exports
