# Compliance Audit — Code Graph batch

Change: `suggest-implementation-and-spec-deps`  
Specs audited: `code-graph:language-adapter`, `code-graph:graph-store`  
Mode: full, merged spec/verification previews reviewed  
Result: **COMPLIANT**

## Requirements Summary

| Spec                          | Change requirement                                                | Expected behavior                                                                                                                                                                                                                                                               | Status      |
| ----------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `code-graph:language-adapter` | Built-in Adapter Registry Composition Factory & Keyword Discovery | Composition factory registers TypeScript, Python, Go and PHP adapters; accepts custom adapters and `SpecdConfig`; all overloads return `AdapterRegistryPort`; composition and curated package entrypoints export it; adapters may expose keywords and registry aggregates them. | Implemented |
| `code-graph:graph-store`      | Symbol Query Workspace Scope                                      | `SymbolQuery.workspace` is optional and `findSymbols` restricts results to an exact, case-sensitive `<workspace>:` file-path prefix while treating `%` and `_` literally.                                                                                                       | Implemented |

Requirements reviewed: **2**. Merged verification scenarios reviewed: **3**.

## Implementation Status

### `code-graph:language-adapter`

- `packages/code-graph/src/composition/use-cases/create-builtin-adapter-registry.ts` provides both required public overloads and the implementation signature as `AdapterRegistryPort`.
- The factory registers `TypeScriptLanguageAdapter`, `PythonLanguageAdapter`, `GoLanguageAdapter`, and `PhpLanguageAdapter`, then registers each supplied custom adapter.
- `packages/code-graph/src/composition/index.ts` exports the factory. The curated `src/public.ts` and package `src/index.ts` surfaces also export it through the composition provider surface.
- `LanguageAdapter.keywords?(): readonly string[]` exists in the domain contract.
- `AdapterRegistryPort.getReservedKeywords(): Set<string>` exists in the port; the concrete registry aggregates unique keyword values from every registered adapter.
- Built-in extension and keyword behavior is exercised through the composition factory test, including `.ts`, `.py`, `.go`, `.php`, `class`, `def`, `func`, `interface`, and `async`.

### `code-graph:graph-store`

- `packages/code-graph/src/domain/value-objects/symbol-query.ts` declares `readonly workspace?: string`.
- `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts` adds a parameterized `substr(file_path, 1, length(?)) = ?` predicate with the exact `${workspace}:` prefix supplied as parameters.
- This implementation is case-sensitive and avoids SQL `LIKE`, so `%` and `_` retain literal meaning as required.
- The test-only in-memory GraphStore applies the equivalent JavaScript `startsWith(workspace + ':')` behavior, keeping the shared GraphStore contract backend-neutral.

## Discrepancies

No actionable discrepancies found.

| Severity | Evidence                                                                                                                   | Spec interpretation                                                                            | Code interpretation                                                                                | Assessment |
| -------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------- |
| None     | Factory overload declarations and implementation all return `AdapterRegistryPort`; composition/public exports are present. | Consumers depend on the registry port, not the concrete implementation.                        | The concrete instance remains internal to construction; the public static return type is the port. | Aligned.   |
| None     | SQLite uses `substr(...)=?`; contract and SQLite tests cover workspace separation, case, `_`, and `%`.                     | Workspace means an exact case-sensitive canonical prefix with SQL wildcards treated literally. | Equality on a parameterized substring supplies exactly those semantics.                            | Aligned.   |

The factory unit test checks `toBeInstanceOf(AdapterRegistry)` internally. This does not violate the public contract: the factory's declared type is still `AdapterRegistryPort`, and the assertion is confined to the package's internal test suite.

## Test Coverage

### Merged scenarios

1. **Built-in adapter registry factory creation and extension/keyword lookup — PASS**
   - `create-builtin-adapter-registry.spec.ts` statically assigns the factory result to `AdapterRegistryPort`.
   - It verifies built-in extensions, required representative keywords, custom adapter registration, and keyword deduplication.

2. **Factory is available from composition — PASS**
   - The test imports `createBuiltinAdapterRegistry` from `src/composition/index.ts`.
   - Static typing and the implementation imports confirm callers need no concrete registry import to use the returned value.

3. **Querying symbols scoped by workspace — PASS**
   - The reusable GraphStore contract inserts `core` and another workspace and verifies `findSymbols({ name: 'create*', workspace: 'core' })` returns only `core:` symbols.
   - SQLite-specific tests additionally verify exact case and literal underscore/percent behavior.

### Executed verification

Command:

`pnpm --filter @specd/code-graph test -- create-builtin-adapter-registry.spec.ts sqlite-graph-store.spec.ts graph-store.contract.ts`

The package test script executed the complete Code Graph suite: **55 test files passed, 682 tests passed**.

## Missing Tests

No scenario-level tests are missing.

Two low-priority strengthening opportunities exist, neither constituting a compliance defect:

- Add a direct factory unit test invoking the `SpecdConfig` overload. Existing composition/provider coverage and TypeScript checking exercise compatibility, but a named test would make this overload explicit.
- Add a package-boundary import test for the curated package entrypoint in addition to the existing composition-entrypoint import test. The export is present and compile-checked today.

## Dependency Consistency

### `code-graph:language-adapter`

- The new API respects the general adapter contract: language-specific data remains adapter-owned, while aggregation and construction occur at the registry/composition boundary.
- Returning `AdapterRegistryPort` is consistent with the global hexagonal architecture and with `code-graph:composition`: infrastructure instantiation occurs in composition, while consumers receive a domain port.
- No language-specific branch was added to generic resolution. Built-in adapter registration is a composition responsibility and does not weaken the adapter determinism or capability contracts.

### `code-graph:graph-store`

- Workspace filtering operates on the canonical workspace-prefixed `SymbolNode.filePath`, consistent with `code-graph:symbol-model` identity semantics.
- The change extends the storage-neutral `SymbolQuery` contract and implements matching semantics in both the SQLite backend and the in-memory contract fixture.
- It does not conflict with `default:_global/architecture`: the query type remains in domain/value objects and SQL remains in infrastructure.
- It does not alter staleness/generation semantics from `code-graph:staleness-detection` or node-family behavior from `code-graph:document-model`.
- One pre-existing prose detail in the base Graph Store query-method description lists other `SymbolQuery` fields but does not enumerate `workspace`; the merged change adds an explicit authoritative workspace-scope requirement, so there is no behavioral contradiction.

## Summary Counts

| Category                                      | Count |
| --------------------------------------------- | ----: |
| Requirements audited                          |     2 |
| Scenarios audited                             |     3 |
| Requirements implemented                      |     2 |
| Scenarios passing                             |     3 |
| Actionable discrepancies                      |     0 |
| Critical                                      |     0 |
| High                                          |     0 |
| Medium                                        |     0 |
| Low                                           |     0 |
| Missing scenario tests                        |     0 |
| Non-blocking test-strengthening opportunities |     2 |

**Batch conclusion:** both Code Graph change specs are implemented, tested, and consistent with their global and depth-1 dependency contracts.
