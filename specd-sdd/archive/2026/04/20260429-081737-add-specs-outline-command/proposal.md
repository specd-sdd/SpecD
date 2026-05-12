# Proposal: add-specs-outline-command

## Motivation

AI agents and developers need a quick way to understand the navigable structure of a spec artifact without reading its entire content. Providing a dedicated "outline" command improves discovery and allows tools to target specific sections of a spec more efficiently.

## Current behaviour

Currently, `specd specs show` displays the full content of an artifact. There is no command to retrieve just the hierarchical structure (headings, keys, etc.) parsed by the domain's `ArtifactParser`. AI agents must read the full file to understand its structure, which is token-inefficient.

## Proposed solution

Introduce `specd specs outline <specPath>` command. This command will:

- Resolve the target spec and artifact.
- Use the domain's `ArtifactParser.outline(ast)` to generate a navigable structure.
- Output the outline in a hierarchical text format or structured JSON/TOON formats.
- Support filtering by artifact ID (`--artifact`) or direct filename (`--file`). If both resolve to the same file, it MUST only be displayed once.

## Specs affected

### New specs

- `core:core/get-spec-outline`: Use case that coordinates artifact retrieval and outline generation.
  - Depends on: `core:core/get-spec`, `core:core/artifact-parser-port`, `core:core/get-active-schema`
- `cli:cli/spec-outline`: CLI command implementation and output formatting.
  - Depends on: `core:core/get-spec-outline`, `cli:cli/command-resource-naming`

### Modified specs

_none_

## Impact

- `@specd/core`: New use case `GetSpecOutline`.
- `@specd/cli`: New subcommand `specs outline`.
- No impact on existing domain models or data structures as it uses existing `ArtifactParser` functionality.

## Technical context

- The command will reuse the artifact resolution logic from `specd specs show`.
- `ArtifactParser.outline(ast)` returns a tree of `OutlineEntry` objects.
- Text output should represent nesting depth through indentation.
- The use case will require `SpecRepository` access for reading the artifact content.

## Open questions

_none_
