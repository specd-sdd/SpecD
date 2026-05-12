# Proposal: enforce-artifact-path-validation

## Motivation

Change manifests must be trustworthy from the moment a change is created. Today a newly created change can tell agents to write `specs/...` files for existing specs even though the correct artifact is a delta under `deltas/...`, which leads agents and users toward the wrong file.

## Current behaviour

For spec-scoped artifacts, `Change.syncArtifacts()` initially records `specs/<workspace>/<capability-path>/<filename>` regardless of whether the spec already exists. `FsChangeRepository.scaffold()` separately creates a `deltas/<workspace>/<capability-path>/` directory for existing specs with delta-capable artifacts, so the manifest and scaffolded directory can disagree until a delta appears and later load logic resolves it.

`ValidateArtifacts` can also fall back to validating a direct `specs/...` artifact when no delta is present. That fallback is valid for brand-new specs, but it is incorrect for an existing spec whose expected artifact is a delta.

## Proposed solution

Make expected artifact path resolution explicit and consistent across manifest persistence, scaffolded directories, validation, and CLI reporting. Existing specs with delta-capable spec-scoped artifacts must be tracked and validated through `deltas/<workspace>/<capability-path>/<filename>.delta.yaml`; new specs must continue to use `specs/<workspace>/<capability-path>/<filename>`.

`specd change validate` should report the concrete file path it validated, or the concrete expected path it could not validate, and should remind users to inspect the merged result with `specd change spec-preview`.

## Specs affected

### New specs

_none_

### Modified specs

- `core:core/change-layout`: clarify expected path selection for spec-scoped artifacts based on spec existence and delta capability.
  - Depends on (added): none
- `core:core/change-manifest`: require persisted artifact filenames to match the expected change artifact path from creation time.
  - Depends on (added): `core:core/change-layout`
- `core:core/validate-artifacts`: require validation to use the expected artifact path and fail when the expected file is missing.
  - Depends on (added): `core:core/change-layout`, `core:core/change-manifest`
- `cli:cli/change-validate`: require validation output to include validated or missing file paths plus `spec-preview` guidance.
  - Depends on (added): `core:core/validate-artifacts`

## Impact

Affected core areas include artifact synchronization, change repository scaffold/load behavior, and artifact validation. The most relevant files are `packages/core/src/domain/entities/change.ts`, `packages/core/src/infrastructure/fs/change-repository.ts`, `packages/core/src/application/use-cases/create-change.ts`, `packages/core/src/application/use-cases/edit-change.ts`, and `packages/core/src/application/use-cases/validate-artifacts.ts`.

Affected CLI behavior is concentrated in `packages/cli/src/commands/change/validate.ts`, with tests expected in the corresponding core and CLI test suites.

## Technical context

The domain entity currently cannot know whether a spec exists because `syncArtifacts()` is pure. The path decision therefore needs either an explicit spec-existence input or an application/infrastructure helper that resolves the expected path before persistence. The important invariant is that all consumers see the same expected path in the manifest, validation result, and CLI output.

The user explicitly wants the manifest to be correct from the start because some agents read it directly despite the preferred workflow. The validator should likewise reject wrong-place files: if an existing spec expects `deltas/.../spec.md.delta.yaml`, then a direct `specs/.../spec.md` file in the change directory must not make validation pass.

## Open questions

_none_
