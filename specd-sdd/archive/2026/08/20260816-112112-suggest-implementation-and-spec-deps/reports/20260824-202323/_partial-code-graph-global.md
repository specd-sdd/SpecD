# Compliance Audit — Code Graph and Global Constraints

Scope: `code-graph:language-adapter`, `code-graph:graph-store`, relevant project-wide architecture/conventions/testing constraints, and direct dependencies at depth 1 (`code-graph:symbol-model`, `code-graph:staleness-detection`, `code-graph:document-model`, `default:_global/architecture`). The change's merged `spec.md` and `verify.md` previews were used. Navigation began with the fresh code graph (`state: current`, `stale: false`, full coverage), followed by symbol search and impact analysis. This was a read-only audit; only this report was written.

## Requirements Summary

### `code-graph:language-adapter`

The change adds one composite requirement:

1. Provide a standalone `createBuiltinAdapterRegistry` composition factory in `@specd/code-graph`.
2. Populate it with TypeScript/JavaScript, Python, Go, and PHP adapters.
3. Register optional custom adapters.
4. Support overloads for `extraAdapters?: readonly LanguageAdapter[]` and `config: SpecdConfig`.
5. Add optional `LanguageAdapter.keywords?(): readonly string[]`.
6. Add `AdapterRegistryPort.getReservedKeywords(): Set<string>` and the concrete aggregation behavior.
7. Re-export the factory through composition entrypoints.

The merged verification scenario additionally requires `.ts`, `.py`, `.go`, and `.php` discovery and the aggregated keywords `class`, `def`, `func`, `interface`, and `async`.

### `code-graph:graph-store`

The change adds one requirement:

1. `SymbolQuery` has optional `workspace?: string`.
2. `GraphStore.findSymbols()` scopes results to the exact, case-sensitive `'<workspace>:'` file-path prefix.
3. `%` and `_` in workspace names are literals rather than SQL wildcard characters.
4. The prefix comparison is parameterized.

The merged scenario combines the workspace filter with `name: 'create*'` and requires all returned symbols to belong only to `core`.

### Relevant global and dependency constraints

- Hexagonal architecture requires composition factories to expose application/domain contracts rather than concrete infrastructure types; public `"."` barrels must not export concrete adapters.
- Composition is the permitted layer for concrete construction and manual dependency injection.
- TypeScript is strict, ESM-only, named-export-only, with explicit public return types and kebab-case source/test names.
- Application/domain behavior needs unit coverage; infrastructure behavior needs integration coverage against real resources where relevant; mocks must implement full ports.
- `code-graph:symbol-model` makes `SymbolNode.filePath` a canonical workspace-prefixed identity, which is consistent with filtering by `'<workspace>:'`.
- The reviewed graph-store change is orthogonal to staleness and document persistence. No contradiction was found with `code-graph:staleness-detection` or `code-graph:document-model`.

## Implementation Status

### `code-graph:language-adapter` — PARTIAL / behavior implemented

- `packages/code-graph/src/composition/use-cases/create-builtin-adapter-registry.ts:16-52` defines both required overloads, constructs `AdapterRegistry`, registers all four built-ins, and adds array-supplied custom adapters.
- `packages/code-graph/src/domain/value-objects/language-adapter.ts:70` defines `keywords?(): readonly string[]`.
- TypeScript, Python, Go, and PHP adapters each implement `keywords()`.
- `packages/code-graph/src/domain/ports/adapter-registry-port.ts:20` exposes `getReservedKeywords(): Set<string>`.
- `packages/code-graph/src/infrastructure/tree-sitter/adapter-registry.ts:90-101` deduplicates keyword values across unique adapters into a `Set`.
- `packages/code-graph/src/public.ts:2-5` and `src/index.ts:2-5` expose the factory indirectly via `create-code-graph-provider.ts`, which re-exports it.
- `packages/code-graph/src/composition/index.ts` does not re-export the factory.

### `code-graph:graph-store` — IMPLEMENTED

- `packages/code-graph/src/domain/value-objects/symbol-query.ts:9` declares `readonly workspace?: string`.
- `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts:1178-1183` uses a parameterized `substr(file_path, 1, length(?)) = ?` comparison. This is exact, case-sensitive in SQLite for the reviewed values, and treats `%`/`_` literally.
- The worker/store façade forwards the complete `SymbolQuery` without dropping the workspace property.
- `packages/code-graph/test/helpers/in-memory-graph-store.ts:732-735` mirrors the contract with `startsWith(workspace + ':')`.

## Discrepancies

### HIGH — Changed factory contract conflicts with the global architecture contract

**Spec evidence:** The merged language-adapter delta explicitly requires `createBuiltinAdapterRegistry` to return an `AdapterRegistry`. The global architecture spec requires standalone composition factories to return application-layer contracts and says composition factories must expose application/domain contracts, not concrete infrastructure types.

**Implementation evidence:** `packages/code-graph/src/composition/use-cases/create-builtin-adapter-registry.ts:16-38` explicitly annotates every overload and implementation with the concrete infrastructure class `AdapterRegistry`; the file imports that class from `../../infrastructure/tree-sitter/adapter-registry.js`. Because `createBuiltinAdapterRegistry` is exported from the public root, its generated public declaration exposes the concrete return type even though the concrete class itself is intentionally absent as a named export from `src/public.ts`.

**Assessment:** The implementation follows the changed package spec literally, while that changed spec is not conformant to the binding global architecture spec. Either (a) the language-adapter delta should require/return `AdapterRegistryPort`, preserving the concrete registry internally, or (b) the global architecture rule needs an explicit, justified exception. As written, both cannot be simultaneously satisfied.

### MEDIUM — Factory is absent from the dedicated composition barrel

**Spec evidence:** The merged language-adapter requirement says the factory is “re-exported in composition entrypoints.”

**Implementation evidence:** `packages/code-graph/src/composition/index.ts:1-8` exports `createCodeGraphProvider`, `createSqliteGraphStoreFactory`, and graph-store types, but not `createBuiltinAdapterRegistry`. The factory reaches the package root only because `src/composition/create-code-graph-provider.ts:109` re-exports it and the roots re-export from that file.

**Assessment:** Runtime/public-root access works, but the dedicated composition entrypoint is incomplete relative to the plural “composition entrypoints” requirement. This is most likely an implementation omission; alternatively, the spec should name only the supported public package entrypoints if `src/composition/index.ts` is intentionally not part of the contract.

## Test Coverage

### Covered

- `packages/code-graph/test/composition/create-builtin-adapter-registry.spec.ts` verifies construction, the four required built-in extensions, custom-adapter registration, keyword aggregation/deduplication, and all five keywords named by the merged scenario.
- `packages/code-graph/test/domain/ports/graph-store.contract.ts:926` exercises the exact merged graph-store scenario: `{ name: 'create*', workspace: 'core' }` and exclusion of non-core symbols.
- `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts:855-942` verifies SQLite case sensitivity and literal `_`/`%` behavior.
- The in-memory test store implements equivalent workspace-prefix filtering, so contract tests exercise both the abstract behavior and SQLite adapter.
- Executed `pnpm --filter @specd/code-graph test -- create-builtin-adapter-registry.spec.ts sqlite-graph-store.spec.ts`; the package runner executed the full suite: **55 files, 682 tests, all passed**.

### Coverage quality

Behavioral coverage for the two merged verification scenarios is strong. The graph-store test goes beyond the scenario by testing case variants and SQL wildcard characters. The factory test covers both required lookup families and extension through a custom adapter.

## Missing Tests

1. **MEDIUM:** No package-boundary/composition-barrel test imports `createBuiltinAdapterRegistry` through `src/composition/index.ts` (or the built equivalent). Such a test would have caught the missing re-export.
2. **MEDIUM:** No architectural type test asserts that the public factory returns `AdapterRegistryPort` and does not leak a concrete infrastructure type. This gap mirrors the spec/global contradiction and cannot be resolved cleanly until the intended contract is chosen.
3. **LOW:** The `SpecdConfig` overload is not explicitly invoked in `create-builtin-adapter-registry.spec.ts`. The implementation accepts the value and deterministically builds the defaults, but only the zero-argument and custom-adapter-array paths have direct behavioral assertions.

## Dependency Chain

```text
default:_global/architecture
  ├─ constrains composition factories and public package boundaries
  └─ conflicts with the changed concrete AdapterRegistry return contract

code-graph:symbol-model
  └─ defines SymbolNode.filePath as workspace-prefixed canonical identity
       └─ code-graph:graph-store SymbolQuery.workspace filters that identity

code-graph:staleness-detection
  └─ depends on graph-store metadata/freshness APIs; unaffected by workspace symbol filtering

code-graph:document-model
  └─ depends on graph-store persistence/search; document workspace semantics remain separate

code-graph:language-adapter
  ├─ LanguageAdapter.keywords?()
  ├─ AdapterRegistryPort.getReservedKeywords()
  └─ composition factory -> concrete AdapterRegistry -> four built-in adapters
```

Graph impact confirms the registry factory is HIGH risk with five affected files and direct use from code-graph provider construction and SDK suggestion orchestration. The SQLite database file is CRITICAL blast-radius infrastructure; its workspace-filter implementation is nevertheless narrowly parameterized and covered by both contract and integration tests.

## Summary Counts

| Category                             |                Count |
| ------------------------------------ | -------------------: |
| Change specs audited                 |                    2 |
| Added composite requirements audited |                    2 |
| Requirement clauses checked          |                   11 |
| Fully implemented clauses            |                   10 |
| Partially implemented clauses        |                    1 |
| High discrepancies                   |                    1 |
| Medium discrepancies                 |                    1 |
| Low discrepancies                    |                    0 |
| Missing/insufficient test items      |                    3 |
| Relevant tests executed              | 682 passed, 0 failed |

Overall result: **not fully compliant**. Graph-store workspace scoping is compliant and well tested. Language-adapter keyword behavior is implemented and tested, but the factory surface has one missing composition export and, more importantly, the changed concrete return contract contradicts the project-wide architecture contract.
