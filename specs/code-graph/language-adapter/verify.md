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

#### Scenario: JSDoc comment extracted with symbol

- **GIVEN** content containing:
  ```typescript
  /** Creates a user in the system. */
  export function createUser(name: string) {}
  ```
- **WHEN** `extractSymbols()` is called
- **THEN** the `createUser` symbol has `comment: '/** Creates a user in the system. */'`

#### Scenario: Multi-line JSDoc extracted

- **GIVEN** content with a multi-line JSDoc block before a class declaration
- **WHEN** `extractSymbols()` is called
- **THEN** `comment` contains the full JSDoc text including newlines

#### Scenario: No comment yields undefined

- **GIVEN** content containing a function with no preceding comment
- **WHEN** `extractSymbols()` is called
- **THEN** the symbol's `comment` is `undefined`

#### Scenario: EXPORTS relation created for exported symbol

- **GIVEN** content containing `export function createUser() { ... }`
- **WHEN** `extractRelations()` is called
- **THEN** an `EXPORTS` relation from the file to the `createUser` symbol is returned

#### Scenario: IMPORTS relation created for import statement

- **GIVEN** content containing `import { createUser } from './user.ts'`
- **WHEN** `extractRelations()` is called with the appropriate import map
- **THEN** an `IMPORTS` relation from the current file to the resolved target file is returned

### Requirement: Import declaration extraction

#### Scenario: TypeScript named imports parsed

- **GIVEN** content containing `import { createUser, type Config } from '@specd/core'`
- **WHEN** `extractImportedNames()` is called
- **THEN** two declarations are returned: `createUser` and `Config`, both with specifier `'@specd/core'` and `isRelative: false`

#### Scenario: Relative import detected

- **GIVEN** content containing `import { helper } from './utils.js'`
- **WHEN** `extractImportedNames()` is called
- **THEN** one declaration is returned with `isRelative: true` and specifier `'./utils.js'`

#### Scenario: Aliased import preserves both names

- **GIVEN** content containing `import { foo as bar } from './mod.js'`
- **WHEN** `extractImportedNames()` is called
- **THEN** the declaration has `originalName: 'foo'` and `localName: 'bar'`

#### Scenario: Python relative import

- **GIVEN** content containing `from .utils import helper`
- **WHEN** `extractImportedNames()` is called on a Python adapter
- **THEN** one declaration is returned with `isRelative: true`

#### Scenario: Go imports are never relative

- **GIVEN** content containing `import "fmt"`
- **WHEN** `extractImportedNames()` is called on a Go adapter
- **THEN** the declaration has `isRelative: false`

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

#### Scenario: Top-level call silently dropped

- **GIVEN** a call expression `init()` at module top level (not inside any function or class)
- **WHEN** `extractRelations()` is called
- **THEN** no `CALLS` relation is created for that call

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
