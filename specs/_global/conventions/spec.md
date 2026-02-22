# Coding Conventions

## Overview

TypeScript conventions for the specd monorepo. These apply to all packages unless a package-level spec overrides a specific rule.

## Requirements

### Requirement: TypeScript strict mode

All packages compile with `strict: true`, `noUncheckedIndexedAccess: true`, and `exactOptionalPropertyTypes: true`. No `@ts-ignore` or `@ts-expect-error` without a co-located comment explaining why.

#### Scenario: Package missing strict mode

- **WHEN** a package's `tsconfig.json` does not extend `tsconfig.base.json` or overrides `strict: false`
- **THEN** the build must fail

### Requirement: ESM only

All packages use `"type": "module"` and `NodeNext` module resolution. No CommonJS. No `.cjs` output unless a specific consumer requires it and it is explicitly documented why.

#### Scenario: CommonJS require used

- **WHEN** a source file uses `require()` or `module.exports`
- **THEN** the TypeScript compiler must reject it under `NodeNext` resolution

### Requirement: Named exports only

No default exports. All exported values use named exports. This makes refactoring and auto-import more predictable.

#### Scenario: Default export added

- **WHEN** a source file contains `export default`
- **THEN** the linter must reject it

### Requirement: File naming

Source files use `kebab-case.ts`. Test files use the `.spec.ts` suffix and match the source file name (`change.ts` → `change.spec.ts`), living in `test/` mirroring the `src/` structure — never co-located with source files. No `index.ts` barrel files except at the package root (`src/index.ts`).

#### Scenario: Source file with camelCase name

- **WHEN** a file is named `changeRepository.ts`
- **THEN** it must be renamed to `change-repository.ts`

#### Scenario: Test file co-located with source

- **WHEN** a test file lives at `src/domain/entities/change.spec.ts`
- **THEN** it must be moved to `test/domain/entities/change.spec.ts`

### Requirement: No `any`

`any` is forbidden. Use `unknown` at boundaries and narrow with type guards. If a third-party type requires `any`, wrap it in a typed adapter.

#### Scenario: any in function parameter

- **WHEN** a function signature contains `: any`
- **THEN** the TypeScript compiler must reject it under strict mode

### Requirement: Explicit return types on public functions

All exported functions and class methods have explicit return type annotations. Internal/private functions may rely on inference when the type is obvious.

#### Scenario: Exported function without return type

- **WHEN** an exported function has no explicit return type annotation
- **THEN** the linter must reject it

### Requirement: Error types

All domain and application errors extend `SpecdError` (defined in `@specd/core`). Errors include a machine-readable `code` string for programmatic handling by CLI and MCP.

#### Scenario: Raw Error thrown in domain code

- **WHEN** domain or application code throws `new Error('something')`
- **THEN** it must be replaced with a typed `SpecdError` subclass

### Requirement: Private backing fields use underscore prefix

Private fields that back a public getter must be named with a leading underscore (e.g. `_name` for a `get name()` getter). This avoids the infinite recursion that would occur if both the field and the getter shared the same name and `this.name` resolved to the getter instead of the field.

#### Scenario: Private backing field without underscore

- **WHEN** a private field backs a public getter and both share the same name
- **THEN** it must be renamed with a leading underscore to prevent recursive getter calls

### Requirement: Lazy loading — metadata before content

When a collection of resources must be loaded, the initial load returns lightweight metadata objects (references, identifiers, display fields) without reading file content or parsing heavy structures. Full content is fetched explicitly and on demand.

This pattern applies across the codebase:

- **Repositories** — `list()` returns metadata objects (`Spec`, `Change`, `ArchivedChange`) without artifact file content; content is loaded via a separate `artifact()` call.
- **`SchemaRegistry`** — `list()` returns `SchemaEntry` objects (ref, name, source) without parsing `schema.yaml`; the full `Schema` is loaded via `resolve()`.
- **Any future collection port** — `list()` or `search()` returns a reference/metadata type; a `get()` or `load()` call fetches the full resource.

The metadata type must carry enough information to be useful standalone (for display, filtering, selection) and must include the reference or identifier needed to fetch the full resource.

Content is never pre-loaded speculatively. If a use case needs the full resource, it calls the explicit load method.

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

Prefer `readonly` arrays and properties on domain value objects and entities where mutation is not required. Use `as const` for literal configuration objects.

#### Scenario: Mutable array on value object

- **WHEN** a value object exposes a public `string[]` property
- **THEN** it should be typed as `readonly string[]`

## Constraints

- `strict: true` must be set in every package's `tsconfig.json` via `tsconfig.base.json`
- Default exports are forbidden
- `any` type is forbidden — use `unknown` and narrow
- All source files must be `kebab-case.ts`
- Errors thrown by domain or application code must extend `SpecdError`
- Public API functions must have explicit return type annotations
- Collection methods (`list`, `search`) return metadata/reference types only — no content pre-loading; content is fetched via explicit `get`/`artifact`/`resolve` calls

## Spec Dependencies

_none — this is a global constraint spec_

## ADRs

- [ADR-0002: pnpm Workspaces + Turborepo](../../../docs/adr/0002-pnpm-monorepo-turborepo.md)
- [ADR-0003: ESM Only](../../../docs/adr/0003-esm-only.md)
