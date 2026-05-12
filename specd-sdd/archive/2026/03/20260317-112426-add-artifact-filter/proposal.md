# Proposal: Add --artifact filter to change validate

## Motivation

During the design phase, artifacts are authored one at a time. After writing each artifact, the workflow calls `change validate <name> <specId>` to check it. Today this validates **all** artifacts for the given spec — including ones not yet written or already validated. Adding an `--artifact` filter lets the user validate a single artifact, giving faster feedback during iterative authoring.

## Current behaviour

`change validate <name> <specId>` always validates every artifact associated with the spec. There is no way to scope validation to a single artifact. This means:

- Artifacts that haven't been written yet show up as missing (noise).
- Already-validated artifacts are re-checked unnecessarily.
- The user cannot quickly confirm whether the artifact they just wrote passes on its own.

## Proposed solution

Add an optional `--artifact <artifactId>` flag to `change validate`. When provided:

1. The core `ValidateArtifacts` use case accepts an optional `artifactId` parameter.
2. Only the specified artifact is validated — dependency checks, delta validation, structural validation, and `markComplete` apply only to that artifact.
3. The required-artifacts check is skipped (it makes no sense when validating a single artifact).
4. If the artifact ID doesn't exist in the schema, a validation error is returned.

When `--artifact` is omitted, behaviour is unchanged.

## Specs affected

### New specs

None.

### Modified specs

- `core:core/validate-artifacts`: Add optional `artifactId` input parameter; when provided, validate only that artifact and skip the required-artifacts check.
- `cli:cli/change-validate`: Add `--artifact <artifactId>` optional flag to the command signature; pass through to the use case.

## Impact

- **Core use case** (`ValidateArtifacts`): new optional parameter, minor control-flow branch.
- **CLI command** (`change validate`): new optional flag, passed through to the use case.
- **Composition layer**: the `ValidateArtifacts` factory wiring is unchanged (no new ports).
- **No breaking changes**: the parameter is optional; existing callers are unaffected.

## Open questions

None.
