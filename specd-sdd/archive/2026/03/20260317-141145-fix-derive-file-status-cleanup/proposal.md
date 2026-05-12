# Proposal: Fix \_deriveFileStatus to apply preHashCleanup

## Motivation

`_deriveFileStatus` in `FsChangeRepository` computes a raw SHA-256 of the file on disk and compares it to `validatedHash`, but `validatedHash` was computed by `ValidateArtifacts` after applying `preHashCleanup` rules. This causes artifacts to incorrectly revert to `in-progress` when the file changes in ways the cleanup normalizes (e.g. marking task checkboxes `- [x]` that cleanup strips back to `- [ ]`).

## Current behaviour

`_deriveFileStatus` reads the file, computes `sha256(rawContent)`, and compares against `validatedHash`. The `ValidateArtifacts` use case computes `validatedHash` as `sha256(applyCleanup(rawContent, preHashCleanup))`. When `preHashCleanup` is non-empty and the file has changed in a way the cleanup normalizes, these hashes diverge and the artifact status drops to `in-progress` even though the cleaned content is identical.

## Proposed solution

Pass the artifact type's `preHashCleanup` rules to `_deriveFileStatus` so it can apply the same cleanup before hashing. The method already runs inside `_manifestToChange` which has access to the resolved `ArtifactType` (via `artifactTypeMap`). The fix is to thread the cleanup rules through as an additional parameter.

## Specs affected

### New specs

None.

### Modified specs

- `core:core/change-repository-port`: No change needed — the port is an abstract interface and doesn't define hash derivation.
- `core:core/storage`: The "Artifact status derivation" requirement already says "cleaned hash" (step 3), so the spec is correct. The verify scenarios need a new scenario covering the preHashCleanup case to prevent regression.

The existing spec text at step 3 — "File present and cleaned hash matches `validatedHash` → `complete`" — already mandates cleanup. The implementation simply doesn't follow it.

## Impact

- **`FsChangeRepository._deriveFileStatus`**: Add `preHashCleanup` parameter, apply cleanup before hashing.
- **`FsChangeRepository._manifestToChange`**: Pass `artType.preHashCleanup` to `_deriveFileStatus` at each call site.
- **No port changes**: the port doesn't define derivation; this is infrastructure-only.
- **No breaking changes**: the function is private.

## Open questions

None.
