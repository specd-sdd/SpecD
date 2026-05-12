# Design: spec-show-artifact-flag

## Affected areas

- `registerSpecShow()` in `packages/cli/src/commands/spec/show.ts`
  Change: Add `--artifact <name>` option. Resolve artifact ID to filename via schema. Filter output.
  Impact: Minimal. back-compatible if flag is omitted.

## Approach

1.  **Update CLI Options**: Add `.option('--artifact <name>', 'filter by artifact ID')` to the `spec show` command.
2.  **Schema Resolution**:
    - Invoke `kernel.specs.getActiveSchema.execute()` to get the current project schema.
    - If `--artifact` is provided:
      - Look up the artifact definition: `schema.artifact(opts.artifact)`.
      - **Guard**: If the artifact ID is unknown, exit with code 1 and an error message.
      - **Guard**: If the artifact ID has `scope: 'change'`, exit with code 1 and an error message (since `spec show` only handles spec-scoped content).
      - Resolve the target filename: `path.basename(artifactType.output)`.
3.  **Filtering**:
    - Filter the `result.artifacts` map from `kernel.specs.get.execute()`.
    - If `--artifact` was requested:
      - Ensure the resolved filename exists in the results.
      - If missing, exit with code 1 (Standard behavior for `spec show` is to skip missing files, but an explicit request via `--artifact` should be strict).
      - Only include that single artifact in the output list.
4.  **Output Generation**:
    - Maintain existing header logic for `text` mode.
    - Maintain existing array logic for `json`/`toon` mode.

## Key decisions

- **Decision** → Use `path.basename(artifactType.output)` to resolve the filename.
  Rationale → This is the standard resolution logic used elsewhere in the core (e.g., `GetArtifactInstruction`) for spec-scoped artifacts like `spec.md` and `verify.md`.
- **Decision** → Error when an explicitly requested artifact is missing on disk.
  Rationale → While `spec show` normally skips missing files silently, if a user or script explicitly asks for `--artifact verify`, receiving an empty output or a success with no content is ambiguous. An explicit error is safer for automation.

## Testing

### Automated tests

- New test file `packages/cli/test/commands/spec/show.spec.ts` (if it doesn't exist) or update existing ones.
- Scenarios:
  - `spec show <specId> --artifact specs` -> outputs only `spec.md`.
  - `spec show <specId> --artifact verify` -> outputs only `verify.md`.
  - `spec show <specId> --artifact nonexistent` -> error: unknown artifact.
  - `spec show <specId> --artifact proposal` -> error: not a spec-scoped artifact.
  - `spec show <specId> --artifact verify` (when verify.md is missing) -> error: artifact missing on disk.

### Manual / E2E verification

- Run `specd spec show cli:cli/spec-show --artifact specs`.
- Run `specd spec show cli:cli/spec-show --artifact verify --format json`.
- Run `specd spec show cli:cli/spec-show --artifact nonexistent` (expect error).
