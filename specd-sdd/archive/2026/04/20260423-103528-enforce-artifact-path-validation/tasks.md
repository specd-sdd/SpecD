# Tasks: enforce-artifact-path-validation

## 1. Expected path model

- [x] 1.1 Add a pure expected artifact filename resolver
      `packages/core/src/domain/services/artifact-filename.ts`: `expectedArtifactFilename()` — compute the single change-directory path for change-scoped and spec-scoped artifacts.
      Approach: use `path.basename(artifactType.output)`; for spec-scoped keys parse `workspace:capabilityPath`; return `deltas/<workspace>/<capability-path>/<basename>.delta.yaml` only when `artifactType.delta === true` and `specExists === true`, otherwise return `specs/<workspace>/<capability-path>/<basename>`.
      (Req: Expected spec-scoped artifact path; Delta files)

- [x] 1.2 Use the resolver from artifact sync
      `packages/core/src/domain/entities/change.ts`: `Change.syncArtifacts()` — accept optional precomputed spec-existence data and update stale filenames while preserving file state and validated hash.
      Approach: keep the method pure; do not import repositories; if existence data is absent, preserve existing filenames and use current default for newly added files.
      (Req: Artifact filenames use expected paths; Manifest structure)

## 2. Manifest persistence and repository wiring

- [x] 2.1 Wire spec existence into fs change storage
      `packages/core/src/composition/change-repository.ts` and `packages/core/src/composition/kernel-internals.ts`: `FsChangeRepositoryOptions` / `FS_CHANGE_STORAGE_FACTORY` — add optional `resolveSpecExists(specId)` and wire it from the kernel's `SpecRepository` map.
      Approach: resolve the workspace with `parseSpecId`, call the matching spec repository, and return `false` when the workspace repo is absent.
      (Req: Artifact filenames use expected paths)

- [x] 2.2 Normalize manifest filenames on save and load
      `packages/core/src/infrastructure/fs/change-repository.ts`: `FsChangeRepository.save()` and `_manifestToChange()` — compute a spec-existence map before syncing artifacts.
      Approach: call `change.syncArtifacts(artifactTypes, specExistence)` before serializing; when loading legacy manifests, rewrite stale `specs/...` filenames to expected `deltas/...` paths while preserving state and `validatedHash`.
      (Req: Artifact filenames use expected paths; Atomic writes)

- [x] 2.3 Align scaffold directories with expected filenames
      `packages/core/src/infrastructure/fs/change-repository.ts`: `scaffold()` — ensure directory creation follows the same expected-path logic as the manifest.
      Approach: reuse `expectedArtifactFilename()` or the same `specExists` facts instead of separately branching to a different path.
      (Req: New spec-scoped artifacts; Delta files; Workspace segment is always present)

## 3. Validation behavior

- [x] 3.1 Add structured validation file metadata
      `packages/core/src/application/use-cases/validate-artifacts.ts`: `ValidationFileResult`, `ValidationFileStatus`, `ValidateArtifactsResult`, and `ValidationFailure` — add `files` and optional `filename`.
      Approach: keep `failures` and `warnings` unchanged for compatibility; append `files` entries for validated, missing, and skipped expected files.
      (Req: Result shape)

- [x] 3.2 Validate only the expected file path
      `packages/core/src/application/use-cases/validate-artifacts.ts`: `ValidateArtifacts.execute()` — resolve the expected filename before disk reads and never probe alternate paths.
      Approach: compute target spec existence from `SpecRepository`, call `expectedArtifactFilename()`, and use that filename for missing checks, raw content reads, hash computation, and file result metadata.
      (Req: Expected file path validation; Per-file validation)

- [x] 3.3 Make delta application strict for existing specs
      `packages/core/src/application/use-cases/validate-artifacts.ts`: delta processing block — require the expected delta for existing delta-capable specs and validate direct files only for new specs or non-delta artifacts.
      Approach: remove the fallback that derives a delta beside a direct file; when the expected delta is missing, record a failure with `filename` and skip `markComplete`.
      (Req: Delta application preview and conflict detection)

## 4. CLI output

- [x] 4.1 Render file paths from validation metadata
      `packages/cli/src/commands/change/validate.ts`: `executeSingle()` and `executeBatch()` — print validated and missing paths from `result.files`.
      Approach: in text mode, print `file: <path>` for validated/skipped entries and `missing: <path>` for missing entries before error lines.
      (Req: Behaviour; Output on success; Output on failure)

- [x] 4.2 Include spec-preview guidance and structured files
      `packages/cli/src/commands/change/validate.ts`: text and JSON/TOON rendering — include the `specd change spec-preview <name> <specId>` note in text output and include `files` in structured output.
      Approach: preserve the first success/failure line; append the note after warnings/errors; for batch JSON, include each spec result's `files`.
      (Req: Output on success; Output on failure; Batch mode)

## 5. Documentation

- [x] 5.1 Document the CLI output contract
      `docs/cli/cli-reference.md`: `change validate` — describe `file:`, `missing:`, `spec-preview` note, and `files` in structured output.
      Approach: update the command reference because command-specific output semantics are machine-consumed behavior.
      (Req: Output on success; Output on failure; global docs: CLI documentation)

- [x] 5.2 Document the core validation result shape
      `docs/core/use-cases.md`: `ValidateArtifacts` — add `files: ValidationFileResult[]` and optional `ValidationFailure.filename`.
      Approach: update the public use-case return type section and keep existing failure/warning descriptions intact.
      (Req: Result shape; global docs: Core documentation)

## 6. Tests

- [x] 6.1 Cover domain artifact sync paths
      `packages/core/test/domain/entities/change.spec.ts`: `Change.syncArtifacts()` — assert existing delta-capable specs use `deltas/...`, new specs use `specs/...`, stale filenames normalize, and state/hash are preserved.
      Approach: pass a spec-existence map to sync and assert the artifact file entries exactly.
      (Req: Expected spec-scoped artifact path; Artifact filenames use expected paths)

- [x] 6.2 Cover repository manifest persistence
      `packages/core/test/infrastructure/fs/change-repository.spec.ts`: `FsChangeRepository` — assert initial save/load manifests contain expected filenames and legacy stale manifests normalize.
      Approach: use temp directories, a `resolveSpecExists` stub, and inspect `manifest.json` after save/load.
      (Req: Artifact filenames use expected paths)

- [x] 6.3 Cover strict validation paths
      `packages/core/test/application/use-cases/validate-artifacts.spec.ts`: `ValidateArtifacts` — assert missing expected delta fails even with a direct file, existing delta validates, new direct file validates, and `result.files` reports expected filenames.
      Approach: use typed port mocks; avoid filesystem in application tests.
      (Req: Expected file path validation; Per-file validation; Delta application preview and conflict detection; Result shape)

- [x] 6.4 Cover CLI rendering
      `packages/cli/test/commands/change-validate.spec.ts`: `change validate` — assert success `file:` lines, failure `missing:` lines, `spec-preview` note, and JSON `files`.
      Approach: stub the kernel validation result with `files` entries and assert stdout plus exit code.
      (Req: Behaviour; Output on success; Output on failure)

- [x] 6.5 Run package verification
      `packages/core` and `packages/cli`: package tests plus lint/typecheck commands used by CI.
      Approach: run `pnpm --filter @specd/core test`, `pnpm --filter @specd/cli test`, and the repo's standard lint/typecheck scripts after implementation.
      (Req: global testing)

## 7. Manual verification

- [x] 7.1 Verify existing-spec manifest path end to end
      `.specd/changes/<id>/manifest.json`: create a change for an existing spec and confirm the `specs` file entry is `deltas/<workspace>/<capability-path>/spec.md.delta.yaml`.
      Approach: use `node packages/cli/dist/index.js change new ...` or the existing creation flow, then inspect the manifest after the command returns.
      (Req: Artifact filenames use expected paths)

- [x] 7.2 Verify missing expected delta output
      `node packages/cli/dist/index.js change validate <name> <specId> --artifact specs` — run with only a wrong direct `specs/.../spec.md` file present.
      Approach: confirm text output reports `missing: deltas/.../spec.md.delta.yaml` and does not validate the direct file.
      (Req: Expected file path validation; Output on failure)

- [x] 7.3 Verify successful delta output and preview note
      `node packages/cli/dist/index.js change validate <name> <specId> --artifact specs` — run with the expected delta file present.
      Approach: confirm text output reports `file: deltas/.../spec.md.delta.yaml` and includes `specd change spec-preview <name> <specId>`.
      (Req: Output on success)

- [x] 7.4 Verify structured output includes files
      `node packages/cli/dist/index.js change validate <name> <specId> --artifact specs --format json` — run success and failure cases.
      Approach: confirm JSON includes `files` with expected filenames and statuses.
      (Req: Result shape; Output on success; Output on failure)
