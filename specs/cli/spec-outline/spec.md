# Spec Outline

## Purpose

To provide a CLI command for inspecting the structural outline of a spec artifact. This command helps users and AI agents quickly understand the sections and addressable nodes of a spec without reading the full file.

## Requirements

### Requirement: Command Interface

The CLI SHALL provide a subcommand `specd specs outline <specPath>` with the following options:

- `--artifact <id>`: Resolve the artifact filename from the active schema.
- `--file <name>`: Specify a direct filename within the spec directory.
- `--format <fmt>`: Output format (`text`, `json`, `toon`). Default is `text`.
- `--full`: Include all selector-addressable node families for the artifact format.
- `--hints`: Include root-level selector hint metadata for the node types present in the response.
- `--config <path>`: Path to `specd.yaml`.

For workflow instructions and agent guidance, canonical plural command naming MUST be used (`specs`, not `spec`). The canonical on-demand form is `specd specs outline <specPath> --artifact <artifactId>`.

### Requirement: Output Rendering

The command SHALL render the outline based on the requested format:

- **Text**: Display the outline as formatted JSON (consistent with `json` format).
- **JSON/TOON**: Output an array of objects containing `filename` and the `outline` tree.

When no `--artifact` or `--file` flags are provided, the command MUST display outlines for ALL spec-scoped artifacts that exist on disk.

### Requirement: Outline detail modes

The command SHALL expose two outline detail modes:

- **Default mode** (without `--full`): returns the historical compact subset per parser:
  - markdown: `section`
  - json: `property`, `array-item`
  - yaml: `pair`
  - plaintext: `paragraph`
- **Full mode** (`--full`): returns all selector-addressable node families for the parser.

The default mode is optimized for low-noise delta authoring and MUST remain stable unless the spec is updated.

### Requirement: Root-level selector hint metadata

When `--hints` is used, the command SHALL return a root-level `selectorHints` object keyed by node type.

The hint values are placeholder-oriented guidance, not per-node concrete values. At minimum each type includes:

- `matches: "<value>"`

Optional placeholders MAY be included when applicable to the node type:

- `contains: "<contains>"`
- `level: "<level>"`

The `outline` entries themselves MUST remain structural and MUST NOT duplicate hint payload per entry.

### Requirement: On-demand outline retrieval for workflows

The command SHALL be suitable as the on-demand retrieval path when another command returns only outline availability references.

Given a spec ID from `availableOutlines`, callers MUST be able to fetch outline detail using:

`specd specs outline <specPath> --artifact <artifactId>`

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
