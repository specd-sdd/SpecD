# Get Spec Outline

## Purpose

To provide a unified application service for retrieving the navigable structure (outline) of a spec artifact. This use case decouples the CLI and other delivery mechanisms from the details of artifact retrieval, parsing, and outline generation.

## Requirements

### Requirement: Input

The use case SHALL receive:

- `workspace`: name of the workspace containing the spec.
- `specPath`: path of the spec within the workspace.
- `artifactId`: optional ID of the artifact to outline (e.g., `specs`, `verify`).
- `filename`: optional direct filename of the artifact to outline.

### Requirement: Artifact Resolution

The use case SHALL resolve the target artifact file:

- If `artifactId` is provided, it MUST be resolved to a filename using the active schema's artifact definitions.
- The resolved artifact definition MUST have `scope: 'spec'`. If it does not, the use case MUST throw an error.
- If `filename` is provided, it MUST be used directly.
- If both are provided and resolve to the same file, it MUST be treated as a single target.
- If both resolve to different files, both MUST be processed.
- If neither is provided, the use case MUST resolve ALL spec-scoped artifacts from the active schema and return outlines for each one that exists on disk.

### Requirement: Outline Generation

For each resolved artifact file, the use case SHALL:

- Read the content from the appropriate `SpecRepository`.
- Determine the correct `ArtifactParser` based on the file extension or schema format.
- Parse the content into an AST.
- Call `ArtifactParser.outline(ast)` to generate the hierarchical structure.

The use case SHALL support two detail modes for returned outline families:

- **default**: compact subset defined by the parser's default outline contract (historical behavior)
- **full**: all selector-addressable families for the parser

### Requirement: Result

The use case SHALL return a list of outline results, where each result contains:

- `filename`: the resolved artifact filename.
- `outline`: the hierarchical tree of `OutlineEntry` objects.

When hint mode is enabled by the caller, each result also contains:

- `selectorHints`: a root-level object keyed by node type with placeholder guidance.

`selectorHints` MUST be sourced from parser-provided hint metadata, so new parsers can define their own type-level guidance without use-case changes.

`selectorHints` entries MUST use placeholder values (for example `"<value>"`, `"<contains>"`, `"<level>"`) and MUST NOT duplicate per-node concrete values already visible in `outline` labels.

`outline` entries MUST remain structural and sufficient for selector derivation without embedding repeated hint payload in each node.

## Spec Dependencies

- [`core:core/get-spec`](../get-spec/spec.md) — for reading spec artifact content.
- [`core:core/artifact-parser-port`](../artifact-parser-port/spec.md) — for generating the outline from the AST.
- [`core:core/get-active-schema`](../get-active-schema/spec.md) — for resolving artifact IDs to filenames.
