# Spec Compliance Audit: code-graph:language-adapter

## Requirements Summary

- **LanguageAdapter interface**: Conforms. Defined as a stateless TypeScript interface with synchronous/deterministic methods.
- **Unified built-in adapter migration**: Conforms. All four language adapters (TypeScript, Python, Go, PHP) implement the unified `analyzeFile` / `resolveImports` / `buildRelations` contract. The legacy parallel extraction path is removed.
- **Import declaration extraction**: Conforms. Handled during Pass 1's `analyzeFile` and stored in `ImportDeclaration` value objects.
- **Call resolution**: Conforms. Converted into persisted `CALLS` relations during `buildRelations` using session-wide lookups, dropping dynamic or unresolved targets.
- **Scoped binding fact extraction**: Conforms. Exposes typed parameters, constructor injection, receiver identities, local aliases, and imported/referenced types.
- **PHP dynamic loader / CakePHP / CodeIgniter aliases and loader extensibility**: Conforms. Loader detection and property alias mapping is registry-based and extensible.

## Implementation Status

- Fully implemented. Discrepancies regarding JSDoc parameters in language adapters have been fixed and validated via ESLint.

## Discrepancies

- Resolved: Eslint JSDoc errors on `_context` parameter names across all four adapters have been corrected to `context`.

## Test Coverage

- `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`
- `packages/code-graph/test/infrastructure/tree-sitter/go-language-adapter.spec.ts`
- `packages/code-graph/test/infrastructure/tree-sitter/python-language-adapter.spec.ts`
- `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`
- Individual tests cover file analysis, import resolution, relation building, and php dynamic loadModel features.

## Missing Tests

- None.

## Spec Dependency Chain

- Depends on `code-graph:symbol-model`.

## Summary Counts

- Total Checked Requirements: 6
- Conforming: 6
- Non-Conforming / Discrepancies: 0 (after fixes)
- Tested Requirements: 6
