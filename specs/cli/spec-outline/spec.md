# Spec Outline

## Purpose

To provide a CLI command for inspecting the structural outline of a spec artifact. This command helps users and AI agents quickly understand the sections and addressable nodes of a spec without reading the full file.

## Requirements

### Requirement: Command Interface

The CLI SHALL provide a subcommand `specs outline <specPath>` with the following options:

- `--artifact <id>`: Resolve the artifact filename from the active schema.
- `--file <name>`: Specify a direct filename within the spec directory.
- `--format <fmt>`: Output format (`text`, `json`, `toon`). Default is `text`.
- `--config <path>`: Path to `specd.yaml`.

### Requirement: Output Rendering

The command SHALL render the outline based on the requested format:

- **Text**: Display the outline as formatted JSON (consistent with `json` format).
- **JSON/TOON**: Output an array of objects containing `filename` and the `outline` tree.

When no `--artifact` or `--file` flags are provided, the command MUST display outlines for ALL spec-scoped artifacts that exist on disk.

### Requirement: Deduplication

If both `--artifact` and `--file` are provided and resolve to the same underlying file, the command MUST ensure the outline for that file is only rendered once.

### Requirement: Error Handling

The command SHALL provide clear error messages when:

- The spec ID is invalid or not found.
- The specified artifact ID is unknown in the schema.
- The specified artifact ID refers to an artifact that does not have `scope: 'spec'`.
- The specified file does not exist for the spec.
- The artifact format is not supported for outlining.

## Spec Dependencies

- [`core:core/get-spec-outline`](../../../core/core/get-spec-outline/spec.md) — for retrieving the outline data.
- [`cli:cli/command-resource-naming`](../command-resource-naming/spec.md) — for canonical resource naming conventions.
