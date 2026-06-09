# core:update-project-metadata

## Purpose

To maintain an optimized project context, we need a way for agents to save their optimizations while the system ensures the cache remains valid. The `UpdateProjectMetadata` use case accepts an optimized payload, computes the current hashes for all project context inputs, and persists the full `project-metadata.json` structure.

## Requirements

### Requirement: Hash computation

The use case SHALL compute current SHA-256 hashes for:

- The project's `specd.yaml`
- All `contextFiles` defined in the configuration
- All spec metadata for specs currently included in the project context

### Requirement: Atomicity

The update to `project-metadata.json` SHALL be atomic to prevent corruption.

### Requirement: Payload separation

The use case SHALL only accept the `optimizedContext` string (wrapped in an input object) from the caller. It SHALL NOT allow the caller to provide its own freshness hashes or versioning information. This data is mapped to the internal `optimized.context` field in the persisted file.

## Spec Dependencies

- [`core:project-metadata`](../project-metadata/spec.md) — defines the file structure and location
