# Proposal: normalize-pre-hash-whitespace

## Motivation

External formatting tools (Prettier, editor autofixers, OS newline converters) frequently alter whitespace, tabs, carriage returns (`\r\n`, `\r`, `\n`), indentation, and word wrapping in markdown artifacts. Because artifact hash derivation only applied schema-declared regex cleanup substitutions without normalizing remaining whitespace across all artifacts, trivial formatting changes altered content hashes and caused false-positive artifact drift detection.

## Current behaviour

Currently, `applyPreHashCleanup` executes only the regex substitution rules declared on an artifact type in the schema (e.g. checkbox normalization `- [x]` to `- [ ]`). Artifacts that do not declare cleanup rules are hashed directly from raw content, and even artifacts with cleanup rules retain raw line breaks and variable whitespace formatting. As a consequence:

- Running Prettier or saving with CRLF/LF changes invalidates validated artifact hashes.
- Validated artifacts unexpectedly transition to `drifted-pending-review` or `in-progress`.

## Proposed solution

Implement universal post-cleanup whitespace normalization:

1. `applyPreHashCleanup` in `@specd/core` executes schema-declared regex substitutions in order (preserving line breaks for multiline `^` and `$` patterns).
2. `applyPreHashCleanup` then performs a universal second step that collapses all consecutive whitespace characters (`\s+`, covering spaces, tabs `\t`, `\v`, `\f`, and all newline formats `\r\n`, `\r`, `\n`) into a single space `' '` and trims leading and trailing whitespace (`result.replace(/\s+/g, ' ').trim()`).
3. `computeArtifactHash` unconditionally invokes `applyPreHashCleanup` for all artifacts, ensuring consistent, whitespace-invariant hashing across all artifact types whether or not they declare schema cleanups.

## Specs affected

### New specs

None.

### Modified specs

- `core:validate-artifacts`: Refines artifact hash calculation rules to require universal whitespace normalization (`\s+` to `' '`, `.trim()`) on cleaned artifact content before computing SHA-256 hashes.
  - Depends on (added): none
  - Depends on (removed): none

- `core:storage`: Refines `_deriveFileStatus` specification to state that artifact status derivation checks the file content on disk using `applyPreHashCleanup` with universal whitespace normalization against `validatedHash`.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- **Affected code areas**:
  - `packages/core/src/domain/services/pre-hash-cleanup.ts`: `applyPreHashCleanup`
  - `packages/core/src/application/use-cases/_shared/compute-artifact-hash.ts`: `computeArtifactHash`
  - `packages/core/src/infrastructure/fs/change-repository.ts`: `FsChangeRepository._deriveFileStatus`
- **Blast radius**: Low. Pure domain service normalization in `@specd/core` consumed consistently across validation and storage adapters.
- **Backwards compatibility**: Existing validated artifacts in active changes will have stable hashes recalculated on next validation.

## Technical context

- **Alternatives evaluated**:
  - _Line-by-line trim_: Ruled out because text formatters like Prettier can re-wrap long paragraphs across lines (soft wrap), changing line break positions within sentences and altering line-trimmed hashes. Total whitespace collapsing (`\s+` -> `' '`) is resilient against line wraps.
- **Preservation of multiline regexes**: Schema regex substitutions run _before_ whitespace collapsing, allowing patterns with line anchors (`^`, `$`) like `^(\s*-\s+)\[x\]` to match multiline lists before collapsing.
- **Universal coverage**: Every artifact (proposal, design, tasks, specs, verify, deltas) passes through the same normalization pipeline.

## Open questions

None.
