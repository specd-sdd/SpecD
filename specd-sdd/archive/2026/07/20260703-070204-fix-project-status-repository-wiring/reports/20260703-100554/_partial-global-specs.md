# Compliance Audit Report: Global Specs Adherence

**Date:** 2026-07-03  
**Change ID:** `20260703-070204-fix-project-status-repository-wiring`  
**Audited Files:** 8 modified/created files

---

## Executive Summary

A comprehensive compliance audit check was performed against the project-wide global specifications (`default:_global/*`) for the modified/created files in the current change.

All audited files demonstrate a high level of adherence to the architectural, coding, testing, and linting guidelines. Only minor style/convention deviations regarding test file layout mirroring and behavior test description patterns were identified.

| Category                                  | Status                 | Notes                                                                                                             |
| :---------------------------------------- | :--------------------- | :---------------------------------------------------------------------------------------------------------------- |
| **Architecture (`_global/architecture`)** | **PASS**               | Clean Hexagonal layers, manual DI, correct package boundaries.                                                    |
| **Conventions (`_global/conventions`)**   | **PASS**               | Strict TypeScript, ESM-only, kebab-case, JSDoc coverage, no `any`.                                                |
| **Testing (`_global/testing`)**           | **PASS with Warnings** | Vitest used. Some files deviate from direct path mirroring or the strict `"given/when/then"` description pattern. |
| **ESLint (`_global/eslint`)**             | **PASS**               | No rule violations detected; formatting and JSDoc rules are fully respected.                                      |

---

## Detailed File Audit Results

### 1. `packages/core/src/composition/shared-repository-wiring.ts`

- **Architecture:**
  - Belongs to the `composition/` layer. It performs the orchestration and wiring of repository adapters (fs-based `SpecRepository`, `ChangeRepository`, `SchemaRepository`).
  - Correctly delegates to factory functions and imports `node:fs` and `node:path` only at this composition level.
  - Does not export any concrete adapter implementations to public barrels.
- **Conventions:**
  - TypeScript strict mode compliant.
  - ESM-only relative imports use `.js` extension (e.g. `../application/specd-config.js`).
  - No `any` type usage.
  - Complete JSDoc annotations on all exported interfaces (`SharedSpecRepositoryMapOptions`, `SharedChangeRepositoryOptions`) and functions (`resolveMetadataPathForWorkspace`, `createSharedSpecRepositories`, `createSharedChangeRepository`).
- **Testing:**
  - Covered by `packages/core/test/composition/shared-repository-wiring.spec.ts`.
  - The tests verify repository construction and metadata path derivation, utilizing isolated temporary directories with cleanups.
- **ESLint:**
  - Fully compliant.

### 2. `packages/core/src/composition/use-cases/list-workspaces.ts`

- **Architecture:**
  - Sits in `composition/use-cases/` and provides a public entry point factory `createListWorkspaces` to wire the `ListWorkspaces` use case.
  - Dependencies are manually injected into the constructor (`new ListWorkspaces(...)`).
- **Conventions:**
  - All overloads and interfaces are JSDoc documented.
  - Named exports only, kebab-case name, ESM imports with `.js` extensions.
- **Testing:**
  - The use-case behavior is thoroughly tested in `packages/core/test/application/use-cases/list-workspaces.spec.ts`.
  - _Non-compliance warning:_ The test file path does not mirror the source file path (tested in `test/application/` instead of `test/composition/`). However, the factory export is verified via `barrel-kernel-coverage.spec.ts`.
- **ESLint:**
  - Fully compliant.

### 3. `packages/core/src/composition/use-cases/list-changes.ts`

- **Architecture:**
  - Composition layer wiring for `ListChanges`. Wires up `ChangeRepository` manually.
- **Conventions:**
  - ESM compliant, kebab-case, named exports only.
  - Complete JSDoc annotations on `ListChangesContext`, `FsListChangesOptions`, and all three signatures of `createListChanges`.
- **Testing:**
  - Behavior tested under `packages/core/test/application/use-cases/list-changes.spec.ts`.
  - _Non-compliance warning:_ No mirroring test file under `test/composition/use-cases/`.
- **ESLint:**
  - Fully compliant.

### 4. `packages/core/src/composition/use-cases/list-drafts.ts`

- **Architecture:**
  - Composition layer wiring for `ListDrafts`. Wires up `ChangeRepository` manually.
- **Conventions:**
  - Fully ESM compliant, kebab-case, named exports only.
  - Full JSDoc coverage.
- **Testing:**
  - Behavior tested under `packages/core/test/application/use-cases/list-drafts.spec.ts`.
  - _Non-compliance warning:_ No mirroring test file under `test/composition/use-cases/`.
- **ESLint:**
  - Fully compliant.

### 5. `packages/core/src/composition/use-cases/list-discarded.ts`

- **Architecture:**
  - Composition layer wiring for `ListDiscarded`. Wires up `ChangeRepository` manually.
- **Conventions:**
  - Fully ESM compliant, kebab-case, named exports only.
  - Full JSDoc coverage.
- **Testing:**
  - Behavior tested under `packages/core/test/application/use-cases/list-discarded.spec.ts`.
  - _Non-compliance warning:_ No mirroring test file under `test/composition/use-cases/`.
- **ESLint:**
  - Fully compliant.

### 6. `packages/core/src/composition/use-cases/get-status.ts`

- **Architecture:**
  - Composition layer wiring for the `GetStatus` use case.
  - Correctly imports and instantiates concrete infrastructure dependencies (`FsFileReader`, `GitVcsAdapter`, `VcsImplementationDetector`) to compose the use case graph.
- **Conventions:**
  - Fully ESM compliant, kebab-case, named exports only.
  - All overloads and context structures have thorough JSDoc annotations.
- **Testing:**
  - Behavior tested under `packages/core/test/application/use-cases/get-status.spec.ts`.
  - _Non-compliance warning:_ No mirroring test file under `test/composition/use-cases/`.
- **ESLint:**
  - Fully compliant.

### 7. `packages/sdk/src/orchestration/build-project-status-snapshot.ts`

- **Architecture:**
  - SDK orchestration level. Permitted to import and coordinate modules from `@specd/code-graph` and `@specd/core`.
  - Does not introduce circular dependencies.
- **Conventions:**
  - Local imports use `.js` extension, named exports, kebab-case name.
  - Proper JSDoc annotations for `BuildProjectStatusSnapshotOptions`, `BuildProjectStatusSnapshotResult`, and `buildProjectStatusSnapshot`.
- **Testing:**
  - Unit tested in `packages/sdk/test/orchestration/build-project-status-snapshot.spec.ts`.
  - Mocks ports/contexts and verifies the correct invocation of core and code-graph operations.
- **ESLint:**
  - Fully compliant.

### 8. `packages/cli/src/commands/project/status.ts`

- **Architecture:**
  - CLI subcommand adapter. Contains no business logic.
  - Correctly delegates status retrieval entirely to `@specd/sdk` via `buildProjectStatusSnapshot` and `openSpecdHost`.
  - Adheres to the constraint of not declaring direct runtime dependencies on both `@specd/core` and `@specd/code-graph`.
- **Conventions:**
  - ESM-only relative imports (using `.js` extension).
  - Proper JSDoc annotations on `ProjectStatusOptions` and `registerProjectStatus`.
- **Testing:**
  - Integration tested in `packages/cli/test/commands/project-status.spec.ts`.
  - _Non-compliance warning:_ Path mirroring is violated. The source path is `packages/cli/src/commands/project/status.ts` but the test path is `packages/cli/test/commands/project-status.spec.ts` (flattened with a hyphen, missing the subfolder).
- **ESLint:**
  - Fully compliant.

---

## Detailed Compliance Deviations

> [!WARNING]
>
> ### 1. Test File Path Mirroring
>
> According to `default:_global/testing`:
> _Test files live in a `test/` directory at the package root, mirroring the `src/` structure._
>
> - The wiring/composition use cases under `packages/core/src/composition/use-cases/*` are not mirrored under `packages/core/test/composition/use-cases/*`. Instead, they are tested via `barrel-kernel-coverage.spec.ts` (for exports) and behaviorally via their underlying application-level tests.
> - The CLI status command is at `packages/cli/src/commands/project/status.ts` but its test is at `packages/cli/test/commands/project-status.spec.ts` instead of `packages/cli/test/commands/project/status.spec.ts`.

> [!NOTE]
>
> ### 2. Behavior Test Description Pattern
>
> According to `default:_global/testing`:
> _Test descriptions follow the pattern `"given <state>, when <action>, then <outcome>"` for behaviour tests._
>
> - While behavioral tests in `get-status.spec.ts` and others make use of structured `describe` contexts, the literal phrase `"given/when/then"` is not systematically utilized at the `it` assertion level in all test suites. The tests do, however, test exact behaviors without snapshots.
