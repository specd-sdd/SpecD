# Tasks: Add --artifact filter to change validate

## 1. Core use case

- [x] 1.1 Add optional `artifactId` field to input interface
      `packages/core/src/application/use-cases/validate-artifacts.ts`:
      `ValidateArtifactsInput` — add `artifactId?: string` property
      (Req: Input)

- [x] 1.2 Guard unknown artifact IDs with early failure return
      `packages/core/src/application/use-cases/validate-artifacts.ts`:
      `execute()` — after loading schema, if `input.artifactId` is provided and not in `schema.artifacts()`, return `{ passed: false, failures: [...], warnings: [] }` without throwing
      (Req: Input — artifactId filter, scenario: unknown artifact ID)

- [x] 1.3 Skip required-artifacts check when artifactId is provided
      `packages/core/src/application/use-cases/validate-artifacts.ts`:
      `execute()` — wrap the required-artifacts loop (line 150) in `if (input.artifactId === undefined)`
      (Req: Required artifacts check — skipped when artifactId provided)

- [x] 1.4 Filter per-artifact loop to only the specified artifact
      `packages/core/src/application/use-cases/validate-artifacts.ts`:
      `execute()` — at the top of the per-artifact validation loop (line 200), add `if (input.artifactId !== undefined && artifactType.id !== input.artifactId) continue`
      (Req: Input — only specified artifact validated, others ignored)

## 2. CLI command

- [x] 2.1 Add `--artifact` option to command definition
      `packages/cli/src/commands/change/validate.ts`:
      `registerChangeValidate()` — add `.option('--artifact <artifactId>', 'validate only this artifact')`
      (Req: Command signature — artifact flag)

- [x] 2.2 Pass artifactId through to use case
      `packages/cli/src/commands/change/validate.ts`:
      action handler — read `opts.artifact` and include `artifactId` in the `execute()` input
      (Req: Behaviour — command invokes use case with artifact ID)

## 3. Tests

- [x] 3.1 Test unknown artifactId returns failure without throwing
      `packages/core/test/application/use-cases/validate-artifacts.spec.ts`:
      new test — pass `artifactId: "nonexistent"`, assert `passed: false` with descriptive failure
      (Verify: Unknown artifact ID returns failure)

- [x] 3.2 Test only the specified artifact is validated
      `packages/core/test/application/use-cases/validate-artifacts.spec.ts`:
      new test — pass `artifactId: "specs"`, assert only `specs` is validated, others not checked or reported
      (Verify: Only the specified artifact is validated)

- [x] 3.3 Test dependency order still applies to specified artifact
      `packages/core/test/application/use-cases/validate-artifacts.spec.ts`:
      new test — pass `artifactId: "specs"` when `proposal` is incomplete, assert dependency-blocked failure
      (Verify: Dependency order still applies to the specified artifact)

- [x] 3.4 Test specified artifact with satisfied deps proceeds normally
      `packages/core/test/application/use-cases/validate-artifacts.spec.ts`:
      new test — pass `artifactId: "specs"` when `proposal` is complete, assert validation passes and markComplete called
      (Verify: Specified artifact with satisfied dependencies proceeds normally)

- [x] 3.5 Test required-artifacts check skipped when artifactId provided
      `packages/core/test/application/use-cases/validate-artifacts.spec.ts`:
      new test — pass `artifactId: "proposal"` when `specs` is missing, assert `passed: true` (missing specs not reported)
      (Verify: Required artifacts check skipped when artifactId is provided)
