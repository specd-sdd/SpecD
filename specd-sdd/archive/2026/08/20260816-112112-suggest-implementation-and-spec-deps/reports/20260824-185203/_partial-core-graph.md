# Compliance Audit Partial — Core and Code Graph

Audited change: `suggest-implementation-and-spec-deps`

Assigned change specs:

- `code-graph:language-adapter`
- `code-graph:graph-store`
- `core:fs-spec-repository`
- `core:spec-repository-port`

The audit used each change spec's merged `spec-preview` (spec and verification artifacts), graph-first symbol discovery, direct implementation/test inspection, project-wide architecture/testing directives, and depth-1 dependency context. No code or spec files were modified.

## Requirements Summary

| Spec                          | Changed requirement                                               | Required behavior                                                                                                                                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code-graph:language-adapter` | Built-in Adapter Registry Composition Factory & Keyword Discovery | Standalone and re-exported `createBuiltinAdapterRegistry`; built-in TS/Python/Go/PHP registration; optional custom adapters; `SpecdConfig` overload; optional adapter `keywords()`; aggregate `getReservedKeywords()` on port and registry. |
| `code-graph:graph-store`      | Symbol Query Workspace Scope                                      | Optional `SymbolQuery.workspace`; exact case-sensitive `'<workspace>:'` prefix filtering; `%` and `_` literal; parameterized SQLite comparison.                                                                                             |
| `core:fs-spec-repository`     | Artifact byte-size observations                                   | `get()` artifact entries and `artifactMeta()` return byte size from the same stat observation as mtime; no content read unless hash requested.                                                                                              |
| `core:spec-repository-port`   | Portable artifact-size contract                                   | `SpecArtifactEntry.size` optional for adapter families without cheap metadata; `ArtifactMeta.size` required and usable as a cheap pre-hash filter.                                                                                          |

## Implementation Status

### `code-graph:language-adapter` — Implemented

- `packages/code-graph/src/composition/use-cases/create-builtin-adapter-registry.ts` contains the standalone factory and overloads for `extraAdapters?: readonly LanguageAdapter[]` and `config: SpecdConfig`.
- The factory registers `TypeScriptLanguageAdapter`, `PythonLanguageAdapter`, `GoLanguageAdapter`, and `PhpLanguageAdapter`, then additive custom adapters when an array is supplied.
- The factory is re-exported through `src/composition/create-code-graph-provider.ts`, `src/index.ts`, and `src/public.ts`.
- `LanguageAdapter` declares `keywords?(): readonly string[]`.
- `AdapterRegistryPort` and `AdapterRegistry` expose `getReservedKeywords(): Set<string>`; the implementation aggregates unique keywords from unique registered adapter instances.
- All four built-in adapters implement keyword lists, including the merged scenario's representative values (`class`, `def`, `func`, `interface`, `async`).

### `code-graph:graph-store` — Implemented

- `packages/code-graph/src/domain/value-objects/symbol-query.ts` declares `readonly workspace?: string`.
- `SQLiteGraphDatabase.findSymbols()` adds `substr(file_path, 1, length(?)) = ?` with two bound `'<workspace>:'` parameters. This is exact and case-sensitive and avoids SQL `LIKE` wildcard behavior for `%` and `_`.
- The in-memory test store mirrors the contract with `filePath.startsWith(workspace + ':')`.
- The workspace condition composes with the existing name and other query predicates, so `findSymbols({ name: 'create*', workspace: 'core' })` is scoped before results are returned.

### `core:fs-spec-repository` — Implemented

- `FsSpecRepository._buildSpec()` performs one `fs.stat()` per artifact and constructs `{ filename, lastModified: stat.mtime.toISOString(), size: stat.size }` from that observation without reading artifact content.
- `FsSpecRepository.artifactMeta()` performs one stat, returns `{ lastModified, size }` when hashing is not requested, and reads the file only on `includeHash: true`, returning the same observed size alongside the SHA-256 hash.

### `core:spec-repository-port` — Implemented

- `SpecArtifactEntry` declares optional `readonly size?: number`, matching the cross-adapter allowance.
- `ArtifactMeta` declares required `readonly size: number` and optional `hash?: string`.
- The filesystem adapter fulfills the stronger cheap-metadata behavior required by its specific spec.

## Discrepancies

No implementation/spec contradictions were found for the four changed requirements.

No contradiction was found against the project-wide architecture/testing directives or the loaded depth-1 dependency contracts:

- Registry construction stays in the composition layer while adapter discovery contracts stay in domain ports/value objects, consistent with `default:_global/architecture`.
- Workspace filtering operates on canonical workspace-prefixed file paths, consistent with `code-graph:symbol-model`, `core:workspace`, and `core:spec-id-format` identity semantics.
- Artifact size is metadata-only and does not expose sidecars as artifacts or change persistence authority, consistent with `core:storage`, `core:spec-metadata`, and `core:spec-lock`.

Interpretation note: the architecture global says concrete adapters are not exported from public entry points. The new public factory returns the `AdapterRegistry` concrete type, but it does not export the individual concrete language adapters, and the merged change explicitly requires the factory and composition re-export. This is not classified as a conflict; if maintainers intend the global rule to prohibit returning any concrete infrastructure registry type, the global wording should be clarified.

## Test Coverage

Focused execution:

- `@specd/code-graph`: `create-builtin-adapter-registry.spec.ts` plus `sqlite-graph-store.spec.ts` — **130 tests passed**.
- `@specd/core`: `fs/spec-repository.spec.ts` — **87 tests passed**.

Coverage by changed requirement:

| Requirement                                 | Coverage | Evidence                                                                                                       |
| ------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| Built-in registry and extensions            | Covered  | Factory test verifies registry type and `.ts`, `.py`, `.go`, `.php`; custom adapter registration also covered. |
| Reserved keyword aggregation                | Covered  | Tests verify aggregation, deduplication, and representative built-in keywords.                                 |
| Symbol workspace scope                      | Covered  | SQLite integration test verifies exact casing plus literal `_` and `%`, including negative controls.           |
| `SpecArtifactEntry.size`                    | Covered  | Filesystem repository integration test verifies byte length from `get()`.                                      |
| `ArtifactMeta.size` and conditional hashing | Covered  | Tests verify size without hash, size with hash, expected SHA-256, and null for absent artifact.                |

## Missing Tests

These are coverage improvements, not observed implementation failures:

1. `createBuiltinAdapterRegistry(config: SpecdConfig)` has no direct runtime/type-focused test. The overload and implementation exist, but a test should call it with a minimal valid config and verify the built-ins are returned and config is not mistaken for an adapter array.
2. The graph-store merged scenario uses `{ name: 'create*', workspace: 'core' }`; current focused coverage strongly tests workspace prefix semantics independently, while other tests cover name wildcards. A single combined predicate test would exactly mirror the scenario.
3. Filesystem tests verify returned values but do not instrument `fs.stat`/`fs.readFile` call counts. The implementation visibly uses one stat and avoids reads on the no-hash path, but an adapter-level spy or injectable filesystem test would guard the explicit “same single stat” and “no content read” performance contract against regression.
4. `SpecArtifactEntry.size` is an optional port field, but no compile-contract test demonstrates that a non-filesystem adapter may omit it while `ArtifactMeta.size` remains required. Type-level fixtures could make that distinction explicit.

## Dependency Chain

### `code-graph:language-adapter`

- Direct loaded dependency: `code-graph:symbol-model`.
- Global constraints: `default:_global/architecture`, `_global/conventions`, `_global/testing`.
- Conformance: keyword discovery only extends adapter/registry capability; it does not change symbol identity, relation vocabulary, determinism, or parser-state constraints.

### `code-graph:graph-store`

- Direct dependencies declared by the change: `code-graph:symbol-model`, `default:_global/architecture`, `code-graph:staleness-detection`, `code-graph:document-model`.
- Conformance: workspace filtering uses existing canonical file paths and parameterized backend queries; it does not alter store lifecycle, atomicity, freshness, document persistence, or relation semantics.

### `core:fs-spec-repository`

- Direct dependencies declared by the change: `default:_global/architecture`, `core:composition`, `core:storage`, `core:spec-repository-port`, `core:spec-lock`, `core:spec-metadata`, `core:spec-optimization`.
- Conformance: size observation remains an infrastructure concern, is exposed through the port contract, and does not read or reinterpret semantic sidecars.

### `core:spec-repository-port`

- Direct dependencies declared by the change: `core:repository-port`, `default:_global/architecture`, `core:change`, `core:storage`, `core:workspace`, `core:spec-id-format`, `core:spec-metadata`, `core:content-extraction`, `core:search-specs`, `default:_global/logging`, `core:spec-lock`.
- Conformance: the added fields are immutable metadata shapes and preserve workspace scoping, canonical IDs, metadata/lock ownership, search behavior, logging abstraction, and repository layering.

## Summary Counts

- Specs audited: **4**
- Changed requirements audited: **4**
- Fully implemented changed requirements: **4**
- Implementation discrepancies: **0**
- Spec/dependency contradictions: **0**
- Focused test files passed: **3**
- Focused tests passed: **217**
- Missing/insufficient test cases identified: **4**
- Blocking compliance issues: **0**
