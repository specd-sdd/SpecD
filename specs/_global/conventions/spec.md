# Coding Conventions

## Overview

TypeScript conventions for the specd monorepo. These apply to all packages unless a package-level spec overrides a specific rule.

## Requirements

### Requirement: TypeScript strict mode

All packages compile with `strict: true`, `noUncheckedIndexedAccess: true`, and `exactOptionalPropertyTypes: true`. No `@ts-ignore` or `@ts-expect-error` without a co-located comment explaining why.

### Requirement: ESM only

All packages use `"type": "module"` and `NodeNext` module resolution. No CommonJS. No `.cjs` output unless a specific consumer requires it and it is explicitly documented why.

### Requirement: Named exports only

No default exports. All exported values use named exports. This makes refactoring and auto-import more predictable.

### Requirement: File naming

Source files use `kebab-case.ts`. Test files use the `.spec.ts` suffix and match the source file name (`change.ts` → `change.spec.ts`), living in `test/` mirroring the `src/` structure — never co-located with source files. No `index.ts` barrel files except at the package root (`src/index.ts`).

### Requirement: No `any`

`any` is forbidden. Use `unknown` at boundaries and narrow with type guards. If a third-party type requires `any`, wrap it in a typed adapter.

### Requirement: Explicit return types on public functions

All exported functions and class methods have explicit return type annotations. Internal/private functions may rely on inference when the type is obvious.

### Requirement: Error types

All domain and application errors extend `SpecdError` (defined in `@specd/core`). Errors include a machine-readable `code` string for programmatic handling by CLI and MCP.

### Requirement: Immutability preference

Prefer `readonly` arrays and properties on domain value objects and entities where mutation is not required. Use `as const` for literal configuration objects.

## Constraints

- `strict: true` must be set in every package's `tsconfig.json` via `tsconfig.base.json`
- Default exports are forbidden
- `any` type is forbidden — use `unknown` and narrow
- All source files must be `kebab-case.ts`
- Errors thrown by domain or application code must extend `SpecdError`
- Public API functions must have explicit return type annotations

## Spec Dependencies

_none — this is a global constraint spec_

## ADRs

- [ADR-0002: pnpm Workspaces + Turborepo](../../../docs/adr/0002-pnpm-monorepo-turborepo.md)
- [ADR-0003: ESM Only](../../../docs/adr/0003-esm-only.md)
