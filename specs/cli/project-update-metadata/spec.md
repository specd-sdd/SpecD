# cli:project-update-metadata

## Purpose

Agents need a CLI command to save optimized project context. The `specd project update-metadata` command provides this capability, ensuring that only the content is provided while the backend handles the integrity and invalidation logic.

## Requirements

### Requirement: Input payload

The command SHALL accept the payload containing `optimizedContext` as JSON/YAML from stdin or a file via the `--file` flag.

### Requirement: Delegation

The command SHALL delegate to the `UpdateProjectMetadata` use case.

## Spec Dependencies

- [`core:update-project-metadata`](../../core/update-project-metadata/spec.md) — provides the update and hashing logic
