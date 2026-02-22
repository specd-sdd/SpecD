# Verification: Coding Conventions

## Requirements

### Requirement: TypeScript strict mode

#### Scenario: Package missing strict mode

- **WHEN** a package's `tsconfig.json` does not extend `tsconfig.base.json` or overrides `strict: false`
- **THEN** the build must fail

### Requirement: ESM only

#### Scenario: CommonJS require used

- **WHEN** a source file uses `require()` or `module.exports`
- **THEN** the TypeScript compiler must reject it under `NodeNext` resolution

### Requirement: Named exports only

#### Scenario: Default export added

- **WHEN** a source file contains `export default`
- **THEN** the linter must reject it

### Requirement: File naming

#### Scenario: Source file with camelCase name

- **WHEN** a file is named `changeRepository.ts`
- **THEN** it must be renamed to `change-repository.ts`

#### Scenario: Test file co-located with source

- **WHEN** a test file lives at `src/domain/entities/change.spec.ts`
- **THEN** it must be moved to `test/domain/entities/change.spec.ts`

### Requirement: No `any`

#### Scenario: any in function parameter

- **WHEN** a function signature contains `: any`
- **THEN** the TypeScript compiler must reject it under strict mode

### Requirement: Explicit return types on public functions

#### Scenario: Exported function without return type

- **WHEN** an exported function has no explicit return type annotation
- **THEN** the linter must reject it

### Requirement: Error types

#### Scenario: Raw Error thrown in domain code

- **WHEN** domain or application code throws `new Error('something')`
- **THEN** it must be replaced with a typed `SpecdError` subclass

### Requirement: Private backing fields use underscore prefix

#### Scenario: Private backing field without underscore

- **WHEN** a private field backs a public getter and both share the same name
- **THEN** it must be renamed with a leading underscore to prevent recursive getter calls

### Requirement: Lazy loading — metadata before content

#### Scenario: Repository list does not load content

- **WHEN** `SpecRepository.list()` is called
- **THEN** it returns `Spec` objects with filenames but no artifact content; no file reads beyond directory listing occur

#### Scenario: SchemaRegistry list does not parse schemas

- **WHEN** `SchemaRegistry.list()` is called
- **THEN** it returns `SchemaEntry` objects without reading or validating any `schema.yaml` file

#### Scenario: Full resource loaded on demand

- **WHEN** a caller needs the content of a specific artifact
- **THEN** it calls `SpecRepository.artifact(spec, filename)` explicitly, not `list()`

### Requirement: Immutability preference

#### Scenario: Mutable array on value object

- **WHEN** a value object exposes a public `string[]` property
- **THEN** it should be typed as `readonly string[]`
