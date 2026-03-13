# Coding Conventions

## Purpose

Without consistent language-level conventions, a multi-package monorepo drifts into incompatible styles that slow down both humans and agents. This spec defines the TypeScript conventions for the specd monorepo — strict mode, ESM-only, naming, error handling, and more. They apply to all packages unless a package-level spec explicitly overrides a specific rule.

## Requirements

### Requirement: TypeScript strict mode

All packages compile with `strict: true`, `noUncheckedIndexedAccess: true`, and `exactOptionalPropertyTypes: true`. No `@ts-ignore` or `@ts-expect-error` without a co-located comment explaining why.

### Requirement: ESM only

All packages use `"type": "module"` and `NodeNext` module resolution. No CommonJS. No `.cjs` output unless a specific consumer requires it and it is explicitly documented why.

### Requirement: Named exports only

No default exports. All exported values use named exports. This makes refactoring and auto-import more predictable.

### Requirement: File naming

Source files use `kebab-case.ts`. Test files use the `.spec.ts` suffix and match the source file name (`change.ts` → `change.spec.ts`), living in `test/` mirroring the `src/` structure — never co-located with source files. No `index.ts` barrel files except at the package root (`src/index.ts`). Layer-level barrels (`domain/index.ts`, `application/index.ts`, `composition/index.ts`) are permitted in packages with more than 50 internal modules.

### Requirement: No `any`

`any` is forbidden. Use `unknown` at boundaries and narrow with type guards. If a third-party type requires `any`, wrap it in a typed adapter.

### Requirement: Explicit return types on public functions

All exported functions and class methods have explicit return type annotations. Internal/private functions may rely on inference when the type is obvious.

### Requirement: Error types

All domain and application errors extend `SpecdError` (defined in `@specd/core`). Errors include a machine-readable `code` string for programmatic handling by CLI and MCP.

### Requirement: Private backing fields use underscore prefix

Private fields that back a public getter must be named with a leading underscore (e.g. `_name` for a `get name()` getter). This avoids the infinite recursion that would occur if both the field and the getter shared the same name and `this.name` resolved to the getter instead of the field.

### Requirement: Lazy loading — metadata before content

When a collection of resources must be loaded, the initial load returns lightweight metadata objects (references, identifiers, display fields) without reading file content or parsing heavy structures. Full content is fetched explicitly and on demand.

This pattern applies across the codebase:

- **Repositories** — `list()` returns metadata objects (`Spec`, `Change`, `ArchivedChange`) without artifact file content; content is loaded via a separate `artifact()` call.
- **`SchemaRegistry`** — `list()` returns `SchemaEntry` objects (ref, name, source) without parsing `schema.yaml`; the full `Schema` is loaded via `resolve()`.
- **Any future collection port** — `list()` or `search()` returns a reference/metadata type; a `get()` or `load()` call fetches the full resource.

The metadata type must carry enough information to be useful standalone (for display, filtering, selection) and must include the reference or identifier needed to fetch the full resource.

Content is never pre-loaded speculatively. If a use case needs the full resource, it calls the explicit load method.

### Requirement: Immutability preference

Prefer `readonly` arrays and properties on domain value objects and entities where mutation is not required. Use `as const` for literal configuration objects.

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
