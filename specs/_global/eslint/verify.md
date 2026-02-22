# Verification: ESLint Rules

## Requirements

### Requirement: No `any` type

#### Scenario: Explicit any in source

- **WHEN** a `.ts` file contains `: any` or `as any`
- **THEN** the linter must report an error

### Requirement: Named exports only

#### Scenario: Default export added

- **WHEN** a source file contains `export default`
- **THEN** the linter must report an error

### Requirement: Explicit return types on public API

#### Scenario: Exported function without return type

- **WHEN** an exported function has no explicit return type annotation
- **THEN** the linter must report an error

#### Scenario: Internal function without return type

- **WHEN** a non-exported function has no return type annotation but the type is inferable
- **THEN** the linter must not report an error

### Requirement: Kebab-case filenames

#### Scenario: camelCase source filename

- **WHEN** a file is named `changeRepository.ts`
- **THEN** the linter must report an error — the file must be renamed to `change-repository.ts`

#### Scenario: PascalCase source filename

- **WHEN** a file is named `ChangeRepository.ts`
- **THEN** the linter must report an error

### Requirement: JSDoc on all functions and classes

#### Scenario: Internal function without JSDoc

- **WHEN** a non-exported helper function has no JSDoc comment
- **THEN** the linter must report an error

#### Scenario: Method without JSDoc

- **WHEN** a class method (public or private) has no JSDoc block comment
- **THEN** the linter must report an error

#### Scenario: JSDoc missing @param

- **WHEN** a function or method has JSDoc but is missing a `@param` tag for one of its parameters
- **THEN** the linter must report an error
