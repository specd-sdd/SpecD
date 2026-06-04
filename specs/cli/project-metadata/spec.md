# cli:project-metadata

## Purpose

When debugging project context or verifying optimization status, users need to inspect the persisted state of project-level metadata. The `specd project metadata` command displays the full contents of the `project-metadata.json` file in a structured format.

## Requirements

### Requirement: Display full structure

The command SHALL print the entire contents of `project-metadata.json`, including the `optimized`, `freshness`, and `generated` blocks.

### Requirement: Formatted output

The command SHALL support standard output formats (`text`, `json`, `toon`).

## Spec Dependencies

- [`core:project-metadata`](../../core/project-metadata/spec.md) — defines the source data structure
