# Design: normalize-pre-hash-whitespace

## Context

Artifact hashes (`validatedHash`) in SpecD serve as the authoritative baseline for determining whether a file has drifted or remains complete after validation. However, external formatters (Prettier, editor auto-formatting, OS line endings like CRLF) modify whitespace, tabs, and indentation without changing semantic content. Because `applyPreHashCleanup` previously only executed schema regex substitutions and did not normalize whitespace across all artifacts, formatting changes caused spurious drift.

## Goals / Non-goals

**Goals**:

- Unconditionally collapse all consecutive whitespace characters (`\s+`, including ` `, `\t`, `\r\n`, `\r`, `\n`, `\v`, `\f`) to a single space `' '` and trim leading/trailing whitespace across all artifact hash derivations.
- Preserve schema-declared regex substitutions in their declared order _before_ whitespace collapsing so line-anchored regexes (`^`, `$`) match properly.
- Ensure `computeArtifactHash` unconditionally invokes `applyPreHashCleanup` even when no `preHashCleanup` rules are declared on the artifact schema.
- Ensure `FsChangeRepository._deriveFileStatus` and `ValidateArtifacts` compute identical, whitespace-invariant hashes.

**Non-goals**:

- Modifying `SpecArtifact.originalHash` (which remains a raw SHA-256 for concurrent write conflict detection on disk).
- Modifying markdown serialization or formatting on disk during write.

## Decisions

1. **Two-step cleanup in `applyPreHashCleanup`**:
   - Step 1: Execute all `cleanups` (regex substitutions) in loop order.
   - Step 2: Return `result.replace(/\s+/g, ' ').trim()`.
2. **Unconditional invocation in `computeArtifactHash`**:
   - `computeArtifactHash` removes the `cleanups.length > 0` condition and always calls `applyPreHashCleanup(content, cleanups)`.
3. **Storage status derivation symmetry**:
   - `FsChangeRepository._deriveFileStatus` already passes `preHashCleanup` to `applyPreHashCleanup(content, preHashCleanup)`. With `applyPreHashCleanup` handling empty cleanups with whitespace normalization, status derivation naturally acquires whitespace invariance for all artifact types.

## Affected Areas & Concrete Symbols

- [`packages/core/src/domain/services/pre-hash-cleanup.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/domain/services/pre-hash-cleanup.ts):
  - `applyPreHashCleanup(content: string, cleanups: readonly PreHashCleanup[]): string`
- [`packages/core/src/application/use-cases/_shared/compute-artifact-hash.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/_shared/compute-artifact-hash.ts):
  - `computeArtifactHash(content: string, hashContent: (data: string) => string, cleanups: readonly PreHashCleanup[]): string`
- [`packages/core/src/infrastructure/fs/change-repository.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/change-repository.ts):
  - `FsChangeRepository._deriveFileStatus` (verified symmetrical)

## Blast Radius & Impact Analysis

- **Impact**: Pure domain function update with direct application consumers.
- **Risk Assessment**: Low risk. Tested against multiline regex substitutions, Windows/Unix newlines (`\r\n`/`\n`), and repository drift derivation.
- **Downstream Consumers**:
  - `ValidateArtifacts` use case: marks artifacts complete with normalized hash.
  - `FsChangeRepository._deriveFileStatus`: derives status (`complete` vs `in-progress`/`drifted-pending-review`) using normalized hash comparison.

## Testing & Verification Plan

- Unit tests in [`packages/core/test/domain/services/pre-hash-cleanup.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/domain/services/pre-hash-cleanup.spec.ts):
  - Verify regex substitutions apply prior to whitespace collapsing.
  - Verify CRLF, LF, CR, tabs, multiple spaces, and mixed whitespace collapse to single spaces.
  - Verify leading and trailing whitespace is trimmed.
- Use case tests in [`packages/core/test/application/use-cases/validate-artifacts.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/validate-artifacts.spec.ts):
  - Verify that `ValidateArtifacts` stores whitespace-normalized hash and marks complete.
- Repository tests in [`packages/core/test/infrastructure/fs/change-repository.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/infrastructure/fs/change-repository.spec.ts):
  - Verify that status derivation preserves `complete` status across whitespace-only edits.

## Documentation Updates

- Update core storage and validation concepts in `docs/core/use-cases.md` to mention post-cleanup whitespace normalization for `validatedHash` calculation.

## Open Questions

None.
