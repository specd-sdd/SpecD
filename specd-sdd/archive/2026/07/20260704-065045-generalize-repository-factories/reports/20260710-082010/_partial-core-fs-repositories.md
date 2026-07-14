# Spec Compliance Audit Report: Filesystem Repositories

## 1. Executive Summary

This report presents the compliance audit for the filesystem-backed repositories implemented under the `generalize-repository-factories` change. The repositories audited are:

- `core:fs-change-repository` -> [FsChangeRepository](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/change-repository.ts#L102)
- `core:fs-spec-repository` -> [FsSpecRepository](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/spec-repository.ts#L72)
- `core:fs-archive-repository` -> [FsArchiveRepository](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/archive-repository.ts#L118)
- `core:fs-schema-repository` -> [FsSchemaRepository](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/schema-repository.ts#L33)

### Compliance Rating: **Mostly Compliant with Significant Test Gaps**

- **Structural and Architectural Design**: Excellent. The codebase strictly adheres to Hexagonal Architecture boundaries and ESM/TypeScript strict conventions. Configuration schema validation is cleanly isolated from context validation.
- **Key Architectural Divergence**: Creator factory functions (`createFs*StorageFactory`) are defined in the `composition/` layer rather than the `infrastructure/` layer. This is an architectural necessity to preserve hexagonal boundaries (avoiding importing composition interfaces into infrastructure files) but diverges slightly from the literal wording of the specs.
- **Major Test Coverage Gaps**: None of the constructor-time directory existence checks (`StorageDirectoryNotFoundError`) or Zod schema validation errors are tested. In fact, a test environment guard (`process.env.NODE_ENV !== 'test'`) disables these checks during testing, rendering the scenarios untestable. The factory creators themselves are also completely untested in the unit/integration suite.

---

## 2. Detailed Spec-by-Spec Analysis

### A. Spec: `core:fs-change-repository`

- **Spec Reference**: `core:fs-change-repository`
- **Implementation**: [FsChangeRepository](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/change-repository.ts#L102)
- **Test Suite**: [change-repository.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/infrastructure/fs/change-repository.spec.ts)
- **Factory**: [createFsChangeStorageFactory](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/change-repository.ts#L84)

#### Requirement Verification

- [x] **Validate options at construction**: The constructor parses configuration via [FsChangeOptionsSchema](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/change-repository.ts#L72) (validating `path`). Workspace/context properties are kept separate in [ChangeRepositoryConfig](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/change-repository.ts#L56).
- [ ] **Constructor directory verification**: The constructor contains code to verify that `path`, `context.draftsPath`, and `context.discardedPath` exist. However, this check is disabled in test environments using `process.env.NODE_ENV !== 'test' && process.env.VITEST === undefined`.
- [x] **Storage factory registration**: Exposes `createFsChangeStorageFactory()` yielding a `ChangeStorageFactory` instance. The factory forwards parameters without merging.

#### Compliance & Global Conventions

- Uses ES modules (`import/export` and `.js` file extensions).
- Follows the kebab-case file naming convention (`change-repository.ts`).
- Lives in the infrastructure layer (`infrastructure/fs/`) and does not import from composition.
- Private backing fields are prefixed with an underscore (e.g., `_changesPath`, `_draftsPath`).

#### Test Coverage Status

- **Coverage Rating**: Partial (Scenario Gaps).
- **Tested Scenarios**:
  - `save and get — round-trip`
  - `mutate()`
  - `save — directory movement`
  - `get vs getDraft — drafted storage`
  - `list()`
  - `delete()`
  - `artifact status derivation`
  - `artifact()`
  - `saveArtifact()`
  - `atomic write`
  - `artifactExists`
  - `deltaExists`
  - `specDependsOn round-trip`
  - `event serialization`
  - `expected artifact filenames`
  - `preHashCleanup in status derivation`
  - `auto-invalidation with drifted IDs`
  - `unscaffold`
  - `invalidationPolicy round-trip`
  - `hasDrift round-trip`
  - `load-time drift by policy`
  - `compliance validations`
- **Missing Scenarios (Gaps)**:
  - _Missing path in config throws error_: NOT tested.
  - _Non-existent active changes directory throws error_: NOT tested.
  - _Factory builds repository correctly_: NOT tested.

---

### B. Spec: `core:fs-spec-repository`

- **Spec Reference**: `core:fs-spec-repository`
- **Implementation**: [FsSpecRepository](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/spec-repository.ts#L72)
- **Test Suite**: [spec-repository.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/infrastructure/fs/spec-repository.spec.ts)
- **Factory**: [createFsSpecStorageFactory](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/spec-repository.ts#L83)

#### Requirement Verification

- [x] **Validate options at construction**: The constructor parses configuration via [FsSpecOptionsSchema](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/spec-repository.ts#L54) (validating `path` and `metadataPath`). Context options are kept separate in [SpecRepositoryConfig](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/spec-repository.ts#L42).
- [ ] **Constructor directory verification**: The constructor contains code to verify that `path` and `metadataPath` exist. However, this is disabled in test environments using `process.env.NODE_ENV !== 'test' && process.env.VITEST === undefined`.
- [x] **Storage factory registration**: Exposes `createFsSpecStorageFactory()` yielding a `SpecStorageFactory` instance. The factory forwards parameters without merging.

#### Compliance & Global Conventions

- Uses ES modules and `.js` file extensions.
- Follows the kebab-case file naming convention (`spec-repository.ts`).
- Lives in the infrastructure layer (`infrastructure/fs/`) and does not import from composition.
- Private backing fields are prefixed with an underscore (e.g., `_specsPath`, `_metadataPath`).

#### Test Coverage Status

- **Coverage Rating**: Partial (Scenario Gaps).
- **Tested Scenarios**:
  - `get`
  - `save`
  - `list`
  - `artifact`
  - `saveArtifact`
  - `search`
- **Missing Scenarios (Gaps)**:
  - _Valid constructor options pass validation_: NOT tested.
  - _Missing path in options throws error_: NOT tested.
  - _Non-existent spec directory throws error_: NOT tested.
  - _Factory builds repository correctly_: NOT tested.

---

### C. Spec: `core:fs-archive-repository`

- **Spec Reference**: `core:fs-archive-repository`
- **Implementation**: [FsArchiveRepository](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/archive-repository.ts#L118)
- **Test Suite**: [archive-repository.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/infrastructure/fs/archive-repository.spec.ts)
- **Factory**: [createFsArchiveStorageFactory](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/archive-repository.ts#L84)

#### Requirement Verification

- [x] **Validate options at construction**: The constructor parses configuration via [FsArchiveOptionsSchema](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/archive-repository.ts#L61) (validating `path` and optional `pattern`). Context options are kept separate in [ArchiveRepositoryConfig](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/archive-repository.ts#L48).
- [ ] **Constructor directory verification**: The constructor contains code to verify that `path`, `context.changesPath`, and `context.draftsPath` exist. However, this is disabled in test environments using `process.env.NODE_ENV !== 'test' && process.env.VITEST === undefined`.
- [x] **Storage factory registration**: Exposes `createFsArchiveStorageFactory()` yielding an `ArchiveStorageFactory` instance. The factory forwards parameters without merging.

#### Compliance & Global Conventions

- Uses ES modules and `.js` file extensions.
- Follows the kebab-case file naming convention (`archive-repository.ts`).
- Lives in the infrastructure layer (`infrastructure/fs/`) and does not import from composition.
- Private backing fields are prefixed with an underscore (e.g., `_archivePath`, `_changesPath`, `_draftsPath`).

#### Test Coverage Status

- **Coverage Rating**: Partial (Scenario Gaps).
- **Tested Scenarios**:
  - `archiveChange`
  - `list`
  - `get`
  - `reindex`
- **Missing Scenarios (Gaps)**:
  - _Valid constructor options pass validation_: NOT tested.
  - _Missing path in options throws error_: NOT tested.
  - _Non-existent archive directory throws error_: NOT tested.
  - _Factory builds repository correctly_: NOT tested.

---

### D. Spec: `core:fs-schema-repository`

- **Spec Reference**: `core:fs-schema-repository`
- **Implementation**: [FsSchemaRepository](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/schema-repository.ts#L33)
- **Test Suite**: [schema-repository.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/infrastructure/fs/schema-repository.spec.ts)
- **Factory**: [createFsSchemaStorageFactory](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/schema-repository.ts#L86)

#### Requirement Verification

- [x] **Validate options at construction**: The constructor parses configuration via [FsSchemaOptionsSchema](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/schema-repository.ts#L22) (validating `path`). Context option is kept separate in [RepositoryConfig](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/ports/repository.ts).
- [ ] **Constructor directory verification**: The constructor contains code to verify that `path` exists. However, this is disabled in test environments using `process.env.NODE_ENV !== 'test' && process.env.VITEST === undefined`.
- [x] **Storage factory registration**: Exposes `createFsSchemaStorageFactory()` yielding a `SchemaStorageFactory` instance. The factory forwards parameters without merging.

#### Compliance & Global Conventions

- Uses ES modules and `.js` file extensions.
- Follows the kebab-case file naming convention (`schema-repository.ts`).
- Lives in the infrastructure layer (`infrastructure/fs/`) and does not import from composition.
- Private backing fields are prefixed with an underscore (e.g., `_schemasPath`).

#### Test Coverage Status

- **Coverage Rating**: Partial (Scenario Gaps).
- **Tested Scenarios**:
  - `resolve`
  - `resolveRaw`
- **Missing Scenarios (Gaps)**:
  - _Valid constructor options pass validation_: NOT tested.
  - _Missing path in options throws error_: NOT tested.
  - _Non-existent schema directory throws error_: NOT tested.
  - _Factory builds repository correctly_: NOT tested.

---

## 3. Key Findings & Architectural Gaps

### 1. Test Environment Guard Bypasses Directory Verification

Across all four implementations, the directory existence check is wrapped in a guard:

```typescript
if (process.env.NODE_ENV !== 'test' && process.env.VITEST === undefined) {
  // existsSync check throwing StorageDirectoryNotFoundError
}
```

While this prevents tests from failing during repository setups that don't instantiate full physical directories on disk, it also has two significant negative side effects:

- It makes it impossible to unit test the `StorageDirectoryNotFoundError` scenarios defined in each `verify.md` file.
- It bypasses a critical runtime safety invariant during unit/integration testing of other features.

> [!WARNING]
> To comply with the verification specs without breaking existing tests, the test setup in the test suites should mock the physical directory structures or the fs module, allowing the test environment guard to be removed, so the `StorageDirectoryNotFoundError` scenarios can be verified.

### 2. Built-in Factory Functions Location & Exposure

To satisfy Hexagonal Architecture's import rules, the factory creator functions (`createFs*StorageFactory`) are placed in the `composition/` layer (e.g., `packages/core/src/composition/change-repository.ts`) rather than the `infrastructure/` layer.

- **Reasoning**: The storage factory interfaces (e.g., `ChangeStorageFactory`) belong to the composition layer. If the creators were placed in the infrastructure files, the infrastructure layer would have to import from the composition layer, introducing a circular dependency or layering violation.
- **Nuance**: Although the individual specifications state that the repositories themselves (e.g., `FsChangeRepository`) "SHALL expose a creator function", the global architectural boundaries correctly dictate that they be placed in composition files.
- **Export status**: These factory functions are registered in the built-in composition registry, but they are NOT exported from the public package barrels `index.ts`, `ports.ts`, or `extensions.ts` of `@specd/core`. This aligns with the architecture rule: _"MUST NOT export builtin factory markers or infrastructure wiring."_

---

## 4. Remediation Recommendations

1. **Enable Directory Verification in Tests**: Replace the `process.env.NODE_ENV !== 'test'` checks with standard constructor logic and update the test suite setup helper functions (`setupRepo()`) to create all necessary subdirectories physically or mock the filesystem dynamically.
2. **Add Missing Scenario Tests**: Add dedicated unit test blocks in each repository spec file checking:
   - Zod schema validation errors for malformed options.
   - Throwing of `StorageDirectoryNotFoundError` for missing paths.
   - Correct instantiation of each repository via its `createFs*StorageFactory()` factory creator.
3. **Spec Alignment**: Update the repository-level specifications (`spec.md` files) to clarify that the `createFs*StorageFactory()` creators are exposed from the `composition` layer rather than directly by the infrastructure-level repository classes.
