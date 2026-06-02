# Proposal: improve-change-dependency-visibility

## Motivation

AI agents and users working on a `specd` change currently lack visibility into the dependencies between specs within that change. This makes it difficult to understand the relationship graph and the transitive context available when working on specific specs.

## Current behaviour

- `specd changes deps <name> <specId>` requires a `specId` and only supports modifying dependencies for that specific spec. There is no command to list all spec dependencies registered in the change.
- `specd changes status <name>` displays the artifact lifecycle DAG but does not expose spec-to-spec dependencies (`specDependsOn` in the manifest).
- Agents must manually inspect the `manifest.json` or run `spec metadata` for every spec to reconstruct the dependency graph.

## Proposed solution

Enhance the CLI and core use cases to expose spec dependencies in a clear, machine-readable, and human-readable way:

1.  **Enhance `changes deps`**:
    - Support a zero-argument (specId-wise) call `specd changes deps <name>` that lists **all** specs in the change's scope (even those with no dependencies) and their dependencies.
    - Support calling `specd changes deps <name> <specId>` without modification flags to display the current dependencies for that specific spec.
    - Support `--format text|json|toon` for both modes.
    - **Expected Text Output (`changes deps <name>`)**:
      ```
      spec dependencies for change <name>:
      - workspace:spec-path-1: dep1, dep2
      - workspace:spec-path-2: (none)
      ```
2.  **Enhance `changes status`**:
    - Add a "spec dependencies" section to the status output, listing **all** specs in the change and their dependencies using a bulleted list format.
    - **Expected Text Output**:
      ```
      spec dependencies:
        workspace:spec-path-1: dep1, dep2
        workspace:spec-path-2: (none)
      ```
    - In JSON/toon mode, ensure the dependencies are clearly represented (e.g., in a `specDependsOn` field).

## Specs affected

### Modified specs

- `cli:change-status`: Add requirement to include spec dependencies in the status output (both text and structured).
  - Depends on (added): none
  - Depends on (removed): none
- `cli:change-deps`: Add requirement to support listing all spec dependencies when called without a `specId`.
  - Depends on (added): none
  - Depends on (removed): none
- `core:get-status`: Ensure the `GetStatus` result includes the change's `specDependsOn` data.
  - Depends on (added): none
  - Depends on (removed): none
- `core:update-spec-deps`: Verify or update to ensure it supports the listing logic if needed by the CLI.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- **CLI**: `change status` and `change deps` commands will have updated output and argument handling.
- **Core**: `GetStatus` use case and its result type will be updated to include spec dependency information.

## Technical context

- The change manifest already stores `specDependsOn` as a map of `specId -> string[]`.
- `GetStatus` already returns the `Change` entity, which includes `specDependsOn`, but the `GetStatusResult` and CLI projection might need to be more explicit about it for structured output.
- In text mode, `change status` should list dependencies after the DAG or in a dedicated section using the bulleted format agreed.

## Open questions

- none
