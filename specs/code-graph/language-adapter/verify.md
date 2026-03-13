# Verification: Language Adapter

## Requirements

### Requirement: LanguageAdapter interface

#### Scenario: Extraction is pure

- **GIVEN** a `LanguageAdapter` instance
- **WHEN** `extractSymbols()` is called twice with the same `filePath` and `content`
- **THEN** both calls return identical results

### Requirement: Language detection

#### Scenario: Unrecognized extension skipped

- **GIVEN** a file `README.md` with no registered adapter for `.md`
- **WHEN** `getAdapterForFile('README.md')` is called
- **THEN** `undefined` is returned and no error is thrown

#### Scenario: TypeScript extension mapped

- **WHEN** `getAdapterForFile('src/index.ts')` is called
- **THEN** the `TypeScriptLanguageAdapter` is returned

#### Scenario: JSX extension mapped

- **WHEN** `getAdapterForFile('src/App.jsx')` is called
- **THEN** the `TypeScriptLanguageAdapter` is returned (it handles jsx)

### Requirement: TypeScript adapter

#### Scenario: Function declaration extracted

- **GIVEN** content containing `function createUser(name: string) { ... }`
- **WHEN** `extractSymbols()` is called
- **THEN** a `SymbolNode` with `name: 'createUser'`, `kind: 'function'` is returned

#### Scenario: Arrow function assigned to const extracted

- **GIVEN** content containing `export const validate = (input: string) => { ... }`
- **WHEN** `extractSymbols()` is called
- **THEN** a `SymbolNode` with `name: 'validate'`, `kind: 'function'` is returned

#### Scenario: Class and method extracted separately

- **GIVEN** content containing `class AuthService { login() { ... } }`
- **WHEN** `extractSymbols()` is called
- **THEN** two symbols are returned: one `class` named `AuthService` and one `method` named `login`

#### Scenario: Interface extracted

- **GIVEN** content containing `export interface UserRepository { ... }`
- **WHEN** `extractSymbols()` is called
- **THEN** a `SymbolNode` with `name: 'UserRepository'`, `kind: 'interface'` is returned

#### Scenario: EXPORTS relation created for exported symbol

- **GIVEN** content containing `export function createUser() { ... }`
- **WHEN** `extractRelations()` is called
- **THEN** an `EXPORTS` relation from the file to the `createUser` symbol is returned

#### Scenario: IMPORTS relation created for import statement

- **GIVEN** content containing `import { createUser } from './user.ts'`
- **WHEN** `extractRelations()` is called with the appropriate import map
- **THEN** an `IMPORTS` relation from the current file to the resolved target file is returned

### Requirement: Call resolution

#### Scenario: Call resolved via import map

- **GIVEN** a function `processOrder` that calls `validateUser()`
- **AND** `validateUser` was imported from `./auth.ts`
- **WHEN** `extractRelations()` is called with the import map containing `validateUser → auth.ts:validateUser`
- **THEN** a `CALLS` relation from `processOrder` to `validateUser` is returned

#### Scenario: Unresolvable call silently dropped

- **GIVEN** a function that calls `console.log()` (a global built-in)
- **WHEN** `extractRelations()` is called
- **THEN** no `CALLS` relation is created for that call and no error is thrown

#### Scenario: Top-level call has file as context

- **GIVEN** a call expression `init()` at module top level (not inside any function or class)
- **WHEN** `extractRelations()` is called
- **THEN** the caller is represented as the file (via `DEFINES` context), not a symbol

### Requirement: Adapter registry

#### Scenario: TypeScript adapter registered by default

- **WHEN** a new `AdapterRegistry` is created
- **THEN** `getAdapter('typescript')` returns the `TypeScriptLanguageAdapter`

#### Scenario: Custom adapter extends registry

- **GIVEN** a custom adapter declaring `languages(): ['python']`
- **WHEN** `register(adapter)` is called
- **THEN** `getAdapter('python')` returns that adapter
- **AND** `getAdapter('typescript')` still returns the TypeScript adapter

#### Scenario: Later registration overrides earlier

- **GIVEN** two adapters both declaring `languages(): ['typescript']`
- **WHEN** both are registered in sequence
- **THEN** `getAdapter('typescript')` returns the second adapter
