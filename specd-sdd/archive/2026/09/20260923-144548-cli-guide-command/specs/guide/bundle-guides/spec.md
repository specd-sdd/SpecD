# Guide Bundle Compilation

## Purpose

To achieve zero runtime dependency on `@specd/core` and eliminate runtime Markdown parsing latency, `@specd/guide` compiles its guide catalog at package build time. This spec defines the build-time bundling script (`scripts/bundle-guides.ts`), input validation for Docusaurus frontmatter, heading hierarchy parsing, exact line range computation, and generation of the static TypeScript catalog.

## Requirements

### Requirement: Build-Time Compilation Script

The package MUST provide a build-time script (`scripts/bundle-guides.ts`) that runs during `pnpm build` of `@specd/guide`:

- The script MUST locate and process all Markdown files in `docs/guide/*.md`.
- The script MUST parse YAML frontmatter and Markdown headings.
- The script MUST emit a strongly typed static TypeScript file at `src/infrastructure/generated/guides.ts`.

### Requirement: Mandatory Frontmatter Validation

The compilation script MUST validate frontmatter fields for every file in `docs/guide/`:

- `title`: Non-empty string.
- `description`: Non-empty string.
- `sidebar_position`: Integer greater than or equal to 0.
- If any required frontmatter field is missing, empty, or of invalid type, the script MUST fail the build with an error identifying the offending file and field.

### Requirement: Heading and Line Range Extraction

The script MUST parse the Markdown document structure from the body text (excluding YAML frontmatter) to extract sections and line bounds:

- Heading extraction MUST recognize Markdown headings at all levels (`#` through `######`).
- The script MUST compute 1-indexed `startLine` and `endLine` for each section relative to the frontmatter-free document body:
  - `startLine`: The exact line index where the section heading appears.
  - `endLine`: The line immediately preceding the next heading of equal or shallower depth, or the final line of the document for the last section.
- Section line count MUST be computed as `endLine - startLine + 1`.

### Requirement: Static Catalog Artifact Generation

The generated TypeScript file (`src/infrastructure/generated/guides.ts`) MUST:

- Export an immutable array of `GuideTopic` records containing all pre-parsed guides.
- Export an index map mapping topic identifiers to their corresponding array indices for $O(1)$ lookup.
- Be committed or generated deterministically such that packages depending on `@specd/guide` can build cleanly without requiring filesystem access to `docs/guide/`.

## Constraints

- Build script MUST execute purely during package build; runtime code MUST NOT invoke the bundler.
- All line numbers in the generated catalog MUST be 1-indexed.

## Spec Dependencies

- [`guide:conventions`](../conventions/spec.md) — package layout and zero-core-dependency constraints
- [`guide:guide-model`](../guide-model/spec.md) — GuideTopic and GuideSection domain definitions
