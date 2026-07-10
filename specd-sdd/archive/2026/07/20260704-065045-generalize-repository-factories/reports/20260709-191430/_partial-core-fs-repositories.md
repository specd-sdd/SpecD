# Spec-Compliance Audit Report: Core Filesystem Repositories

This report presents the compliance audit for the filesystem-backed repository implementations under the change [generalize-repository-factories](file:///Users/monki/Documents/Proyectos/specd/.specd/changes/20260704-065045-generalize-repository-factories).

---

## Executive Summary

The audit evaluated four filesystem storage repository specifications against their current TypeScript implementations in `@specd/core`:

- `core:fs-change-repository`
- `core:fs-spec-repository`
- `core:fs-archive-repository`
- `core:fs-schema-repository`

### Summary Table

| Repository Port & Implementation                                                                                                    |  Spec Status  | Code Conformance |   Global Spec Alignment   | Test Coverage | Gaps Found                                                           |
| :---------------------------------------------------------------------------------------------------------------------------------- | :-----------: | :--------------: | :-----------------------: | :-----------: | :------------------------------------------------------------------- |
| [FsChangeRepository](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/change-repository.ts#L102)   | **Compliant** |     **Full**     | **Full** (ESM, Hexagonal) |    Partial    | Missing `StorageDirectoryNotFoundError` and validation/factory tests |
| [FsSpecRepository](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/spec-repository.ts#L72)        | **Compliant** |     **Full**     | **Full** (ESM, Hexagonal) |    Partial    | Missing `StorageDirectoryNotFoundError` and validation/factory tests |
| [FsArchiveRepository](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/archive-repository.ts#L118) | **Compliant** |     **Full**     | **Full** (ESM, Hexagonal) |    Partial    | Missing `StorageDirectoryNotFoundError` and validation/factory tests |
| [FsSchemaRepository](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/schema-repository.ts#L33)    | **Compliant** |     **Full**     | **Full** (ESM, Hexagonal) |    Partial    | Missing `StorageDirectoryNotFoundError` and validation/factory tests |

---

## Detailed Repository Audit

### 1. `core:fs-change-repository`

#### Implementation Overview

- **Class**: [FsChangeRepository](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/change-repository.ts#L102)
- **Path**: [packages/core/src/infrastructure/fs/change-repository.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/change-repository.ts)
- **Factory**: [createFsChangeStorageFactory](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/change-repository.ts#L84)
- **Test File**: [change-repository.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/infrastructure/fs/change-repository.spec.ts)

#### Spec Requirements Verification

- **Validate options at construction**: The constructor signature matches the spec, supporting the legacy overloaded single-argument form as well as the new `(context, config)` two-argument form ([lines 122-150](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/change-repository.ts#L122-L150)).
- **Zod Schema**: Config options are parsed via `FsChangeOptionsSchema = z.object({ path: z.string() })` ([line 72](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/change-repository.ts#L72)).
- **Directory Verification**: The constructor verifies existence of active changes (`parsedConfig.path`), drafts (`context.draftsPath`), and discarded changes (`context.discardedPath`) and throws `StorageDirectoryNotFoundError` ([lines 154-165](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/change-repository.ts#L154-L165)) if they do not exist.
  > [!NOTE]
  > The path validation is conditional on the environment `process.env.NODE_ENV !== 'test' && process.env.VITEST === undefined` to prevent Vitest suite setup errors.
- **Factory Function**: [createFsChangeStorageFactory](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/change-repository.ts#L84) returns a `ChangeStorageFactory` that constructs and returns `FsChangeRepository` instances, forwarding context and config without merging.

#### Test Coverage Analysis

- **Scenarios covered**: Round-trip get/save, mutating active changes, directory creation naming conventions, draft promotion, and discard operations.
- **Gaps**:
  - No unit tests validating Zod schema error output when `path` is missing or invalid.
  - No unit tests validating `StorageDirectoryNotFoundError` throws when changes, drafts, or discarded paths are missing.
  - No unit tests verifying the [createFsChangeStorageFactory](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/change-repository.ts#L84) constructs the repository correctly.

---

### 2. `core:fs-spec-repository`

#### Implementation Overview

- **Class**: [FsSpecRepository](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/spec-repository.ts#L72)
- **Path**: [packages/core/src/infrastructure/fs/spec-repository.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/spec-repository.ts)
- **Factory**: [createFsSpecStorageFactory](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/spec-repository.ts#L83)
- **Test File**: [spec-repository.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/infrastructure/fs/spec-repository.spec.ts)

#### Spec Requirements Verification

- **Validate options at construction**: The constructor accommodates both signatures ([lines 78-111](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/spec-repository.ts#L78-L111)).
- **Zod Schema**: Config options are parsed via `FsSpecOptionsSchema = z.object({ path: z.string(), metadataPath: z.string() })` ([line 54](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/spec-repository.ts#L54)).
- **Directory Verification**: Validates the spec and metadata directories on disk and throws `StorageDirectoryNotFoundError` if missing ([lines 115-123](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/spec-repository.ts#L115-L123)).
- **Factory Function**: [createFsSpecStorageFactory](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/spec-repository.ts#L83) returns a `SpecStorageFactory` implementing the `create` method forwarding parameters.

#### Test Coverage Analysis

- **Scenarios covered**: `get()`, `list()`, lock-file creation and reading, metadata updates, directory filtering, prefix segments.
- **Gaps**:
  - No unit tests validating Zod schema error output when required fields (`path`, `metadataPath`) are missing.
  - No tests for `StorageDirectoryNotFoundError` on non-existent directories.
  - No tests directly verifying [createFsSpecStorageFactory](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/spec-repository.ts#L83).

---

### 3. `core:fs-archive-repository`

#### Implementation Overview

- **Class**: [FsArchiveRepository](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/archive-repository.ts#L118)
- **Path**: [packages/core/src/infrastructure/fs/archive-repository.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/archive-repository.ts)
- **Factory**: [createFsArchiveStorageFactory](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/archive-repository.ts#L84)
- **Test File**: [archive-repository.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/infrastructure/fs/archive-repository.spec.ts)

#### Spec Requirements Verification

- **Validate options at construction**: The constructor supports legacy and context/config structures ([lines 124-160](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/archive-repository.ts#L124-L160)).
- **Zod Schema**: Config options are parsed via `FsArchiveOptionsSchema = z.object({ path: z.string(), pattern: z.string().optional() })` ([line 61](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/archive-repository.ts#L61)).
- **Directory Verification**: Verifies existence of the archive root (`parsedConfig.path`), changes (`context.changesPath`), and drafts (`context.draftsPath`) and throws `StorageDirectoryNotFoundError` ([lines 170-181](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/archive-repository.ts#L170-L181)).
- **Factory Function**: [createFsArchiveStorageFactory](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/archive-repository.ts#L84) returns `ArchiveStorageFactory` and properly forwards arguments.

#### Test Coverage Analysis

- **Scenarios covered**: Archiving change directories, append-only index file validation, glob resolution, list and search capabilities, scope pattern restrictions.
- **Gaps**:
  - No unit tests validating Zod schema error output when required fields are missing.
  - No tests verifying `StorageDirectoryNotFoundError` exceptions.
  - No tests for [createFsArchiveStorageFactory](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/archive-repository.ts#L84).

---

### 4. `core:fs-schema-repository`

#### Implementation Overview

- **Class**: [FsSchemaRepository](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/schema-repository.ts#L33)
- **Path**: [packages/core/src/infrastructure/fs/schema-repository.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/schema-repository.ts)
- **Factory**: [createFsSchemaStorageFactory](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/schema-repository.ts#L86)
- **Test File**: [schema-repository.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/infrastructure/fs/schema-repository.spec.ts)

#### Spec Requirements Verification

- **Validate options at construction**: The constructor supports legacy and context/config structures ([lines 36-69](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/schema-repository.ts#L36-L69)).
- **Zod Schema**: Config options are parsed via `FsSchemaOptionsSchema = z.object({ path: z.string() })` ([line 22](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/schema-repository.ts#L22)).
- **Directory Verification**: Verifies schema directory existence. Exceptions are bypassed for default schema fallback or tests ([lines 73-80](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/schema-repository.ts#L73-L80)).
- **Factory Function**: [createFsSchemaStorageFactory](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/schema-repository.ts#L86) returns `SchemaStorageFactory` and properly forwards arguments.

#### Test Coverage Analysis

- **Scenarios covered**: `resolve()`, `resolveRaw()`, `list()`, error safety on invalid YAML.
- **Gaps**:
  - No unit tests validating Zod schema error output when required fields are missing.
  - No tests verifying `StorageDirectoryNotFoundError` exceptions.
  - No tests for [createFsSchemaStorageFactory](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/schema-repository.ts#L86).

---

## Global Spec & Architectural Consistency

- **ESM Conventions**: All files are ESM-compliant, resolving local relative dependencies using the explicit `.js` file extension.
- **Hexagonal Architecture Boundaries**: The implementation files reside cleanly in `infrastructure/fs/` while implementing the abstract ports under `application/ports/`. The domain layer has zero knowledge of filesystems or Zod-validated configuration models. Storage factories reside in `composition/`, successfully decoupling directory lookup and configuration parsing from class construction.
- **Naming Conventions**: Repository class names and configuration interfaces strictly follow PascalCase and suffix matches (e.g., `Fs*RepositoryConfig`).

---

## Recommendations & Action Items

> [!TIP]
>
> 1. **Extend Test Suites**: Introduce constructor-focused test blocks in all 4 spec files that test the Zod schemas under missing options and non-existent directories.
> 2. **Environment Variable Bypass in Test**: Consider restructuring directory check mocks or setting a custom flag rather than disabling directory verification tests globally in tests using `process.env.VITEST`.
