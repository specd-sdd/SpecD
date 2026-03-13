# ESLint Rules

## Purpose

Conventions that rely on human discipline get violated under pressure; automated enforcement catches violations before they reach the codebase. ESLint enforces the coding conventions from `specs/_global/conventions/spec.md` plus architectural layer boundaries. Rules are configured in `eslint.config.js` at the monorepo root, apply to all packages, and use type-aware analysis for `.ts` files via each package's `tsconfig.json`.

## Requirements

### Requirement: No `any` type

ESLint must reject explicit `any` type annotations. Use `unknown` at boundaries and narrow with type guards.

### Requirement: Named exports only

ESLint must reject default exports in all source files.

### Requirement: Explicit return types on public API

All exported functions and class methods must have explicit return type annotations. Internal functions may rely on inference when the type is obvious.

### Requirement: Kebab-case filenames

All source files under `src/` must use `kebab-case` naming. This is enforced by the linter to prevent case-sensitivity issues across operating systems.

### Requirement: JSDoc on all functions and classes

All functions, methods, classes, type aliases, and interfaces in source files must have a JSDoc comment. This includes internal helpers — JSDoc aids code navigation, IDE tooling, and understanding for agents and humans alike.

The comment must include:

- A description of what the symbol does or represents
- `@param` tags for all parameters (with description) on functions and methods
- `@returns` tag describing the return value on functions and methods (omit for `void`)
- `@throws` tag for each error type that can be thrown

### Requirement: Layer boundary enforcement

ESLint must enforce the import constraints defined in `specs/_global/architecture/spec.md` via `no-restricted-imports` rules:

- Files under `domain/` must not import from `application/`, `infrastructure/`, or `composition/`
- Files under `application/` must not import from `infrastructure/` or `composition/`
- Files under `infrastructure/` must not import from `composition/`

These rules make layer boundary violations a lint error, not a convention violation.

## Constraints

- Type-aware lint rules are enabled for all `.ts` files
- Lint errors must be resolved before committing (enforced by lint-staged in the pre-commit hook)
- Test files (`test/**/*.spec.ts`) are exempt from JSDoc requirements
- `dist/` and `node_modules/` are excluded from all lint rules

## Spec Dependencies

- [`specs/_global/conventions/spec.md`](../conventions/spec.md) — the rules being enforced
