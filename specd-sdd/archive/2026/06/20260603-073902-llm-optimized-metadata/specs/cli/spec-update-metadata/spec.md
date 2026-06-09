# cli:spec-update-metadata

## Purpose

Agents need a CLI command to safely update spec metadata with LLM-optimized fields. The `specd spec update-metadata <workspace:capability-path>` command accepts a partial metadata JSON/YAML and delegates to `UpdateSpecMetadata` to ensure a safe merge with deterministic fields.

## Requirements

### Requirement: Command signature

The command SHALL accept a qualified spec ID (`<workspace:capability-path>`).

### Requirement: Partial schema input

The command SHALL accept a partial metadata payload from stdin or a file via the `--file` flag. This payload SHALL be validated to ensure it only contains allowed fields for an update.

### Requirement: Delegation

The command SHALL delegate to the `UpdateSpecMetadata` use case.

## Spec Dependencies

- [`core:update-spec-metadata`](../../core/update-spec-metadata/spec.md) — provides the logic for merging and saving
