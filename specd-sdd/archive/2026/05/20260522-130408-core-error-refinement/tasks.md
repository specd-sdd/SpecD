# Tasks: core-error-refinement

## 1. Base Hierarchy and Contract

- [x] 1.1 Update `SpecdError` base with discriminator
      `packages/core/src/domain/errors/specd-error.ts`: `SpecdError` — add `readonly specd = true` property
      Approach: define as a public readonly property with a default value of `true` in the abstract class
      (Req: Specd Error Contract)
- [x] 1.2 Update CLI error handler detection
      `packages/cli/src/handle-error.ts`: `handleError` — recognize errors by discriminator
      Approach: check `(err as any).specd === true` instead of/in addition to `instanceof SpecdError`
      (Req: Specd Error Contract)

## 2. New Error Classes

- [x] 2.1 Create Archive error classes
      `packages/core/src/domain/errors/`: New files — `ArchiveDependencyMismatchError`, `ArchiveArtifactMissingError`, `ArchiveImplementationStateError`
      Approach: create classes extending `SpecdError` with appropriate `code` and descriptive messages including fix suggestions
      (Req: core Mandate, Typed errors for archive failures)
- [x] 2.2 Create CLI base and validation error classes
      `packages/cli/src/errors/`: New files — `SpecdCliError`, `CliValidationError`
      Approach: `SpecdCliError` extends `SpecdError`; `CliValidationError` extends `SpecdCliError` with code `CLI_VALIDATION_ERROR`
      (Req: Monorepo Package Mandate, Structured CLI errors)
- [x] 2.3 Create Skills base and not found error classes
      `packages/skills/src/domain/errors/`: New files — `SpecdSkillsError`, `SkillNotFoundError`
      Approach: `SpecdSkillsError` extends `SpecdError`; `SkillNotFoundError` extends `SpecdSkillsError` with code `SKILL_NOT_FOUND`
      (Req: Monorepo Package Mandate, Typed errors for skill operations)

## 3. Package Alignment and Refactoring

- [x] 3.1 Rename and reparent `CodeGraphError`
      `packages/code-graph/src/domain/errors/code-graph-error.ts`: `CodeGraphError` → `SpecdCodeGraphError`
      Approach: rename class and file; change parent from `Error` to `SpecdError` from `@specd/core`
      (Req: Monorepo Package Mandate, Align SpecdCodeGraphError with SpecdError)
- [x] 3.2 Refactor `ArchiveChange` use case
      `packages/core/src/application/use-cases/archive-change.ts`: `ArchiveChange` — replace generic `Error` throws
      Approach: identify all `throw new Error` and replace with specific `Archive*Error` subclasses
      (Req: Typed errors for archive failures)
- [x] 3.3 Refactor `UpdateSpecDeps` use case
      `packages/core/src/application/use-cases/update-spec-deps.ts`: `UpdateSpecDeps` — replace generic `Error` throws
      Approach: use `CliValidationError` or core validation errors for flag/dependency failures
      (Req: Typed errors for dependency update failures)
- [x] 3.4 Refactor CLI formatters and helpers
      `packages/cli/src/formatter.ts`, `packages/cli/src/helpers/parse-comma-values.ts`: replace generic `Error`
      Approach: replace with `CliValidationError` to ensure clean reporting
      (Req: Structured CLI errors)
- [x] 3.5 Refactor Skill repository
      `packages/skills/src/infrastructure/repository/skill-repository.ts`: `SkillRepository` — replace generic `Error`
      Approach: replace "Skill not found" `Error` with `SkillNotFoundError`
      (Req: Typed errors for skill operations)

## 4. Testing and Verification

- [x] 4.1 Update `ArchiveChange` unit tests
      `packages/core/test/application/use-cases/archive-change.spec.ts`: update error assertions
      Approach: change `expect(...).toThrow()` to check for the specific error class instead of generic string
      (Scenario: Dependency mismatch throws ArchiveDependencyMismatchError)
- [x] 4.2 Verify base contract in tests
      `packages/core/test/domain/errors/specd-error.spec.ts`: new test file
      Approach: verify that `SpecdError` subclasses have `specd: true` and conform to naming conventions
      (Scenario: Valid Specd Error)
- [x] 4.3 Verify CLI structured output
      `packages/cli/test/handle-error.spec.ts`: add scenarios
      Approach: mock a `CliValidationError` and verify `handleError` emits structured JSON to stdout
      (Scenario: CLI validation error produces structured output)
- [x] 4.4 Manual E2E Verification
      Approach: trigger real mismatch and invalid format errors in the compiled CLI to confirm clean reporting
      (Manual / E2E verification)
