# Proposal: core-error-refinement

## Motivation

Generic `Error` throws in `@specd/core` use cases cause the CLI to display full stack traces for common user errors. This provides a poor user experience, obscures the actual problem, and violates the project's goal of providing clean, actionable feedback through machine-readable error codes.

## Current behaviour

Critical use cases like `ArchiveChange` and `UpdateSpecDeps` throw standard JavaScript `Error` objects when encountering validation failures or inconsistent states (e.g., dependency mismatches, open implementation files). Because these are not instances of `SpecdError`, the CLI's error handler cannot extract a machine-readable code and falls back to printing the entire stack trace to stderr.

## Proposed solution

We will transition all user-facing error scenarios in the core package from generic `Error` throws to typed `SpecdError` subclasses. This includes:

1.  Creating specific error classes for archiving and dependency management failures.
2.  Refactoring use cases to throw these specific errors with helpful messages and machine-readable codes.
3.  Establishing a new specification `default:_global/error-handling-conventions` to formalize the error handling strategy across the monorepo. This spec will mandate:
    - **Global Contract**: All packages must follow the "Specd Error Contract" (inheriting from `Error`, having a `code: string` and a `specd: true` discriminator).
    - **Core Mandate**: The `@specd/core` package must explicitly use subclasses of `SpecdError`.
    - **Monorepo Packages**: Any package within the monorepo that depends on `@specd/core` MUST extend `SpecdError`. These packages should define their own package-level base error classes (e.g., `SpecdCodeGraphError`, `SpecdCliError`, `SpecdSkillsError`) that extend `SpecdError`, and use them for all domain and application errors.
4.  Refactoring `packages/code-graph` to make `SpecdCodeGraphError` extend `SpecdError` and replacing generic throws in its composition and domain layers.
5.  Refactoring `packages/cli` to introduce `SpecdCliError` and replacing generic throws in formatters, helpers, and command validation logic.
6.  Refactoring `packages/skills` to introduce its own `SpecdSkillsError` and replacing generic throws like "Skill not found".

## Specs affected

### New specs

- `default:_global/error-handling-conventions`: Defines the standards for error handling across the specd ecosystem, including the error contract (code, specd discriminator, clear messaging), naming conventions, and JSDoc requirements.
  - Depends on: `default:_global/conventions`

### Modified specs

- `core:archive-change`: Update requirement to explicitly document typed errors for dependency mismatches, artifact overlaps, and implementation tracking state.
  - Depends on (added): `default:_global/error-handling-conventions`
- `core:update-spec-deps`: Update requirements to specify typed errors for flag validation and dependency lookup failures.
  - Depends on (added): `default:_global/error-handling-conventions`
- `default:_global/conventions`: Add a mandate requiring error classes following the specd error contract for all user-facing error scenarios in use cases.
  - Depends on (added): `none`
- `code-graph:symbol-model`: Refine requirements to mandate that `SpecdCodeGraphError` must extend `SpecdError` and follow the global error contract.
  - Depends on (added): `default:_global/error-handling-conventions`
- `cli:entrypoint`: Define the requirement for CLI-level validation errors to use `SpecdCliError` to ensure clean reporting in the global `handleError` logic.
  - Depends on (added): `default:_global/error-handling-conventions`
- `skills:skill`: Update requirements to specify that skill-related domain errors must use a typed `SpecdSkillsError`.
  - Depends on (added): `default:_global/error-handling-conventions`

## Impact

- **Core Package**: New error classes in `domain/errors/`, refactored use cases in `application/use-cases/`.
- **Code-Graph Package**: `SpecdCodeGraphError` hierarchy alignment and refactored composition/domain logic.
- **CLI Package**: New `SpecdCliError` base and refactored validation/formatting logic.
- **Skills Package**: New `SpecdSkillsError` base and refactored repository logic.
- **Global Conventions**: New standards for all packages.
- **CLI Performance**: Improved error display; no more stack traces for the refactored scenarios across the entire monorepo.
- **Developer Experience**: Clearer guidelines on how to implement error handling in new features.

## Technical context

- The `SpecdError` base class (in `core:src/domain/errors/specd-error.ts`) will be updated to include a `readonly specd = true` property to allow reliable identification across package boundaries without strict `instanceof` checks.
- `ArchiveChange.ts` currently has at least 8 `throw new Error` calls that need attention.
- `UpdateSpecDeps.ts` has several flag-validation errors that are currently generic.
- `SpecdCodeGraphError` currently exists as `CodeGraphError` and extends `Error` directly; it MUST be renamed to `SpecdCodeGraphError` and reparented to `SpecdError` to follow the global naming convention.
- `packages/cli` lacks a base error class for its own validation logic, resulting in generic `Error` being handled as "system errors" with full stack traces.
- `packages/skills` repository throws generic `Error` when a skill is not found.

## Open Questions

- Should we unify implementation-related errors (open files, out-of-scope) into a single `ArchiveImplementationError` or keep them as `OpenImplementationFileError`, etc.?
- Should the new convention spec live in `specs/core/error-handling-conventions/` or simply `specs/core/errors/`? (Defaulting to the more descriptive one for now).
