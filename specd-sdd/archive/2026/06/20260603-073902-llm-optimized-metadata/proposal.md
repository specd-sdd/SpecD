# Proposal: llm-optimized-metadata

## Motivation

The `specd-metadata` skill currently optimizes the full metadata of a spec and attempts to overwrite the deterministic `metadata.json` file. This causes conflicts or loss of deterministic data. We need to separate deterministic metadata generation (done by the core archiver) from AI-optimized metadata (done by the agent) so both can coexist safely and update independently. Furthermore, the agent needs a way to save just the optimized fields without managing the entire metadata JSON structure.

Similarly, the project-level context (compiled from `specd.yaml`, context files, and global specs) can be very large and needs LLM optimization. Currently, there is no mechanism to store, invalidate, or update an optimized version of the project context.

## Current behaviour

For specs, `metadata.json` is generated deterministically at archive time based on the schema's `metadataExtraction` rules. When the LLM agent runs to "optimize" metadata, it tries to write its changes back into the same structure, which risks breaking downstream tooling or discarding human-curated fields.

For the project context, `specd project context` compiles the raw contents of all included files and specs every time. It does not support an optimized, cached version.

## Proposed solution

We will separate deterministic metadata from LLM-optimized content by adding two new optional fields, `optimizedDescription` and `optimizedContext`, to the spec metadata schema.
The `ArchiveChange` workflow will continue to natively generate deterministic metadata, effectively invalidating the LLM fields when a spec is modified and archived.
For specs, the context compilers and Code Graph indexer will prefer these optimized fields if they exist and are not empty, and the CLI will warn if they are missing when `llmOptimizedContext: true` is set. Specifically, `change context` will emit warnings if either the project context optimization is missing/stale OR if any of the specs included in the context are missing their `optimizedContext`.

To allow agents to save these fields safely, we will introduce an `UpdateSpecMetadata` use case and a `specd spec update-metadata` CLI command. This command will accept a partial metadata payload via stdin or the `--file` flag. Before saving, the backend will perform a fresh extraction of the deterministic fields and merge them with the provided partial payload.

For the project context, we will introduce `project-metadata.json` stored in the resolved `configPath` (as defined in the project configuration). This file will store an `optimized` block alongside `freshness` data (hashes of `specd.yaml`, context files, and included spec metadata). We will introduce an `UpdateProjectMetadata` use case and a `specd project update-metadata` command. The command will only accept the optimized content payload (`{ "optimizedContext": "..." }`) from the agent via stdin or the `--file` flag; the backend use case will strictly handle computing and saving the invalidation hashes and the full file structure. The `GetProjectContext` use case will verify these hashes to determine if the optimized context is fresh.

## Specs affected

### New specs

- `core:update-spec-metadata`: Define the `UpdateSpecMetadata` use case that performs fresh extraction, merges with partial input, and saves the updated spec metadata.
  - Depends on: `core:spec-metadata`, `core:save-spec-metadata`
- `cli:spec-update-metadata`: Define the `specd spec update-metadata` command that accepts a partial metadata schema and delegates to `UpdateSpecMetadata`. Standardizes on the `--file` flag for file input.
  - Depends on: `core:update-spec-metadata`
- `core:project-metadata`: Define the storage and schema for `project-metadata.json`, including the separation between the agent-provided payload (`optimized.context`) and the internal persistence schema (version, generated, and freshness hashes).
  - Depends on: `core:config`
- `core:update-project-metadata`: Define the `UpdateProjectMetadata` use case that accepts optimized project context, computes invalidation hashes, and saves to `project-metadata.json`.
  - Depends on: `core:project-metadata`
- `cli:project-update-metadata`: Define the `specd project update-metadata` command that delegates to `UpdateProjectMetadata`. Standardizes on the `--file` flag for file input.
  - Depends on: `core:update-project-metadata`
- `cli:project-metadata`: Define the `specd project metadata` command to view the full persisted structure of `project-metadata.json`, mirroring the behavior of `specd spec metadata`.
  - Depends on: `core:project-metadata`

### Modified specs

- `core:spec-metadata`: Add `optimizedDescription` and `optimizedContext` to `SpecMetadata` and `strictSpecMetadataSchema`.
  - Depends on (added): none
  - Depends on (removed): none
- `core:compile-context`: Prefer `optimizedContext` (if it exists and is not empty) as a fallback over `context` when `llmOptimizedContext` is active. Emit warnings if `llmOptimizedContext` is true but optimized fields are missing for the project or any spec.
  - Depends on (added): none
  - Depends on (removed): none
- `core:get-spec-context`: Prefer `optimizedContext` (if it exists and is not empty) as a fallback over `context` when `llmOptimizedContext` is active.
  - Depends on (added): none
  - Depends on (removed): none
- `core:get-project-context`: Implement cache invalidation logic using `project-metadata.json` hashes. If fresh and `llmOptimizedContext: true`, use `optimized.context`.
  - Depends on (added): `core:project-metadata`
  - Depends on (removed): none
- `cli:change-context`: Surface warnings when `llmOptimizedContext: true` is active but optimized fields are missing (for both specs and project). Warnings will be displayed as standard CLI warnings (typically to `stderr`).
  - Depends on (added): none
  - Depends on (removed): none
- `cli:project-context`: Surface a warning when `llmOptimizedContext: true` is active but the optimized project context is missing or stale. Warnings will be displayed as standard CLI warnings.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:indexer`: Prefer `optimizedDescription` (if it exists and is not empty) as a fallback over `description` for index searching and display.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- **Core schema**: `strictSpecMetadataSchema` and `SpecMetadata` interface in `parse-metadata.ts` will expand.
- **Core schema**: Introduction of a new schema for `project-metadata.json`.
- **Core Use Cases**: Introduction of `UpdateSpecMetadata` and `UpdateProjectMetadata`.
- **CLI Commands**: Introduction of `specd spec update-metadata`, `specd project update-metadata`, and `specd project metadata`.
- **CLI output**: Context commands will include a new warning state when `llmOptimizedContext: true` is active but optimized fields are missing or stale. The warning MUST include an instruction on how to generate the missing metadata. Standard CLI warning placement (stderr) is used.
- **Code Graph**: BM25 searches will benefit from optimized descriptions.
- **Agent context**: The injected context blocks will use the optimized content, significantly reducing token usage at the project level.
- **Agent workflows**: Agents can now safely inject optimizations without reading/rewriting whole files or handling invalidation logic.

## Technical context

### Project Metadata Schema (Internal Persistence)

The `project-metadata.json` file uses the following contract to manage optimized content and freshness:

```json
{
  "version": 1,
  "optimized": {
    "context": "Optimized context..."
  },
  "freshness": {
    "algorithm": "sha256",
    "inputs": {
      "config": {
        "path": "specd.yaml",
        "hash": "..."
      },
      "contextFiles": [
        {
          "path": "AGENTS.md",
          "hash": "..."
        }
      ],
      "specMetadata": [
        {
          "id": "core:spec-metadata",
          "hash": "..."
        }
      ]
    },
    "combinedHash": "..."
  },
  "generated": {
    "at": "2026-06-03T10:30:00.000Z"
  }
}
```

### Invalidation & Update Strategies

- **Spec Metadata Invalidation**: `ArchiveChange` completely overwrites `metadata.json` without `optimizedDescription`/`optimizedContext`, naturally invalidating them when a spec is modified.
- **Spec Metadata Update (PATCH)**: Agents use `specd spec update-metadata`. The backend (`UpdateSpecMetadata`) performs a fresh deterministic extraction, merges the agent's partial payload, and saves the result.
- **Project Context Invalidation**: `GetProjectContext` verifies the hashes in `project-metadata.json` against current files/specs. If any mismatch, the optimized context is ignored.
- **Project Context Update**: `specd project update-metadata` accepts an `optimizedContext` payload (e.g., `{ "optimizedContext": "..." }`). The backend use case (`UpdateProjectMetadata`) computes current hashes and writes the full structured `project-metadata.json`.
- **Field Usage**: `optimizedContext` (spec) and `optimized.context` (project) are drop-in replacements for their deterministic counterparts in context compilers. `optimizedDescription` (spec) is a fallback for `description` in the code graph.
