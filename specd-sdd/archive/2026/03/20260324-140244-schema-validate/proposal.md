# Proposal: schema-validate

## Motivation

There is no CLI command to check whether a schema YAML file is valid. Schema errors surface only at runtime when another command (e.g. `spec validate`, `change create`) triggers schema resolution. Authors editing or extending schemas need a dedicated, fast feedback loop that tells them immediately whether their schema is correct — both structurally (YAML + Zod) and semantically (ID format, dependency graph, template references, workflow validity).

## Current behaviour

- `specd schema show` loads and displays the active schema but is not designed as a validation tool — errors appear as unstructured exceptions rather than a diagnostic report.
- `specd schema fork` and `specd schema extend` create schema files but offer no post-creation validation step.
- `buildSchema` (domain) and `parseSchemaYaml` (infrastructure) already perform thorough validation, but they are only reachable indirectly through `ResolveSchema`.

## Proposed solution

Add a `specd schema validate` CLI command with two modes:

1. **Project schema (default)** — resolves the project's active schema through the full pipeline (config → extends chain → plugins → overrides → merge → build). Reports whether the resolved schema is valid. An optional `--raw` flag validates only the base schema before merging plugins and overrides — useful for isolating base schema errors from merge-layer errors.

2. **External file (`--file <path>`)** — validates a schema YAML file that is not part of the project. Resolves its `extends` chain (the file can inherit from installed or workspace schemas) but does not apply project plugins or overrides. This is the "is this file correct?" check for schema authors developing schemas outside the project.

Both modes are backed by a new `ValidateSchema` use case in core that encapsulates the validation logic, keeping the CLI as a thin adapter per the architecture spec.

Output follows the same `--format text|json|toon` convention. Exit code 0 on success, 1 on validation failure.

## Specs affected

### New specs

- `core:core/validate-schema`: Use case spec — defines `ValidateSchema` in the application layer with two execution modes (project and file), dependencies on `SchemaRegistry` and `buildSchema`.
- `cli:cli/schema-validate`: CLI command spec — signature, modes, output format, exit codes, error handling.

### Modified specs

- `cli:cli/entrypoint`: no-op — the new command follows existing conventions without changing them.
- `core:core/resolve-schema`: no-op — `ResolveSchema` is used as-is for the project mode.
- `core:core/build-schema`: no-op — `buildSchema` is used as-is for semantic validation.
- `cli:cli/spec-validate`: no-op — reference pattern only.

## Impact

- **Core package**: new use case `ValidateSchema` in `application/use-cases/`. Uses existing `SchemaRegistry` port and `buildSchema` domain service — no new ports, no new domain types.
- **CLI package**: new command file `packages/cli/src/commands/schema/validate.ts`, registration in the schema command group. Thin adapter that calls the core use case.

## Open questions

None.
