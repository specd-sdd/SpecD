# Tasks: spec-show-artifact-flag

## 1. CLI Implementation

- [x] 1.1 Add `--artifact` option to `spec show` command
      `packages/cli/src/commands/spec/show.ts`: `registerSpecShow` — add `.option('--artifact <name>', ...)` to the command definition.
      Approach: Add the option to the commander command; update the action signature to accept `opts: { artifact?: string, ... }`.
      (Req: Command signature)

- [x] 1.2 Resolve artifact ID to filename via schema
      `packages/cli/src/commands/spec/show.ts`: `registerSpecShow` action — get active schema and lookup artifact.
      Approach: Call `kernel.specs.getActiveSchema.execute()`; find artifact using `schema.artifact(opts.artifact)`.
      (Req: Artifact filtering)

- [x] 1.3 Guard against unknown or out-of-scope artifacts
      `packages/cli/src/commands/spec/show.ts`: `registerSpecShow` action — throw error for invalid artifact IDs.
      Approach: If `opts.artifact` is provided but not found in schema, or if its `scope` is not `spec`, call `cliError()` with a descriptive message and return.
      (Req: Artifact filtering)

- [x] 1.4 Filter artifacts by resolved filename
      `packages/cli/src/commands/spec/show.ts`: `registerSpecShow` action — filter the `result.artifacts` Map.
      Approach: Resolve target filename using `path.basename(artifactType.output)`; filter the artifacts map to only include this file; throw `cliError()` if the requested file is missing from disk.
      (Req: Artifact filtering, Output format)

## 2. Testing

- [x] 2.1 Add automated tests for `--artifact` flag
      `packages/cli/test/commands/spec-show.spec.ts`: new test file or describe block — verify filtering and error cases.
      Approach: Use vitest to mock kernel and verify CLI output/errors for various `--artifact` inputs (valid, unknown, missing on disk).
      (Req: Artifact filtering, Scenario: Unknown artifact ID, Scenario: Artifact missing on disk)

- [x] 2.2 Manual verification
      CLI: `specd spec show` — run the command against a known spec with the new flag.
      Approach: Confirm `specd spec show <specId> --artifact specs` only shows `spec.md`, and same for `verify`.
      (Req: Scenario: Single artifact printed with header)
