# ESLint Rules

## Overview

ESLint enforces the coding conventions defined in `specs/_global/conventions/spec.md`. Rules are configured in `eslint.config.js` at the monorepo root and apply to all packages. Type-aware rules are enabled for `.ts` files using each package's `tsconfig.json`.

## Requirements

### Requirement: No `any` type

ESLint must reject explicit `any` type annotations. Use `unknown` at boundaries and narrow with type guards.

#### Scenario: Explicit any in source

- **WHEN** a `.ts` file contains `: any` or `as any`
- **THEN** the linter must report an error

### Requirement: Named exports only

ESLint must reject default exports in all source files.

#### Scenario: Default export added

- **WHEN** a source file contains `export default`
- **THEN** the linter must report an error

### Requirement: Explicit return types on public API

All exported functions and class methods must have explicit return type annotations. Internal functions may rely on inference when the type is obvious.

#### Scenario: Exported function without return type

- **WHEN** an exported function has no explicit return type annotation
- **THEN** the linter must report an error

#### Scenario: Internal function without return type

- **WHEN** a non-exported function has no return type annotation but the type is inferable
- **THEN** the linter must not report an error

### Requirement: Kebab-case filenames

All source files under `src/` must use `kebab-case` naming. This is enforced by the linter to prevent case-sensitivity issues across operating systems.

#### Scenario: camelCase source filename

- **WHEN** a file is named `changeRepository.ts`
- **THEN** the linter must report an error — the file must be renamed to `change-repository.ts`

#### Scenario: PascalCase source filename

- **WHEN** a file is named `ChangeRepository.ts`
- **THEN** the linter must report an error

### Requirement: JSDoc on all functions and classes

All functions, methods, classes, type aliases, and interfaces in source files must have a JSDoc comment. This includes internal helpers — JSDoc aids code navigation, IDE tooling, and understanding for agents and humans alike.

The comment must include:

- A description of what the symbol does or represents
- `@param` tags for all parameters (with description) on functions and methods
- `@returns` tag describing the return value on functions and methods (omit for `void`)
- `@throws` tag for each error type that can be thrown

#### Scenario: Internal function without JSDoc

- **WHEN** a non-exported helper function has no JSDoc comment
- **THEN** the linter must report an error

#### Scenario: Method without JSDoc

- **WHEN** a class method (public or private) has no JSDoc block comment
- **THEN** the linter must report an error

#### Scenario: JSDoc missing @param

- **WHEN** a function or method has JSDoc but is missing a `@param` tag for one of its parameters
- **THEN** the linter must report an error

## Constraints

- Type-aware lint rules are enabled for all `.ts` files
- Lint errors must be resolved before committing (enforced by lint-staged in the pre-commit hook)
- Test files (`test/**/*.spec.ts`) are exempt from JSDoc requirements
- `dist/` and `node_modules/` are excluded from all lint rules

## Spec Dependencies

- [`specs/_global/conventions/spec.md`](../conventions/spec.md) — the rules being enforced
