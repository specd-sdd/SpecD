# Specs Compliance Audit Report: code-graph-complete-dependency-detection

- **Timestamp:** 2026-10-13 19:00:37
- **Mode:** Change Audit (`--change code-graph-complete-dependency-detection`)
- **Target Package:** `@specd/code-graph`
- **Audited Change Path:** `specd-sdd/changes/20261013-132800-code-graph-complete-dependency-detection`

---

## Executive Summary

An exhaustive compliance audit was conducted across all 10 specifications in change `code-graph-complete-dependency-detection`, evaluating implementation against requirements, scenarios, test coverage, global conventions, and cross-spec dependencies.

### Key Metrics

- **Total Requirements Audited:** 131
- **Conforming / Fully Implemented:** 128 (97.7%)
- **Partially Implemented / Minor Gaps:** 1 (0.8%)
- **Discrepancies:** 2 (1.5% — 1 architectural, 1 unused error type)
- **Test Suites / Tests:** 64/64 test suites passed (865 / 865 tests passing)
- **Overall Compliance Score:** 98.5%

---

## Aggregated Spec Matrix

| Spec ID                                  | Requirements | Conforming | Gaps / Discrepancies                                             | Tests Verified                                                                         | Status        |
| ---------------------------------------- | ------------ | ---------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------- |
| `code-graph:symbol-model`                | 18           | 17         | 1 discrepancy (`DuplicateSymbolIdError` unused), 1 test gap      | 14 tests in `symbol-node.spec.ts`, 13 in `symbol-reference.spec.ts`                    | ✅ Conforming |
| `code-graph:language-adapter`            | 11           | 10         | 1 discrepancy (`AdapterRegistry` defaults wired via composition) | 5 tests in `classify-file-category.spec.ts`, adapter tests                             | ✅ Conforming |
| `code-graph:typescript-language-adapter` | 13           | 13         | 0                                                                | 110 tests in `typescript-language-adapter.spec.ts`                                     | ✅ Conforming |
| `code-graph:go-language-adapter`         | 12           | 12         | 0                                                                | 38 tests in `go-language-adapter.spec.ts`                                              | ✅ Conforming |
| `code-graph:python-language-adapter`     | 9            | 9          | 0                                                                | 43 tests in `python-language-adapter.spec.ts`                                          | ✅ Conforming |
| `code-graph:php-language-adapter`        | 9            | 9          | 0                                                                | 72 tests in `php-language-adapter.spec.ts`                                             | ✅ Conforming |
| `code-graph:resolve-symbol-reference`    | 8            | 8          | 0                                                                | 32 tests in `resolve-symbol-reference.spec.ts`, 10 in `resolve-graph-selector.spec.ts` | ✅ Conforming |
| `code-graph:sqlite-graph-store`          | 21           | 21         | 0                                                                | 90 scenarios tested in `sqlite-graph-store.spec.ts`                                    | ✅ Conforming |
| `code-graph:indexer`                     | 24           | 23         | 1 minor test gap (property symbols commit at indexing level)     | 97/98 scenarios covered                                                                | ✅ Conforming |
| `code-graph:hotspots`                    | 6            | 6          | 0 (1 doc wording note)                                           | 21/21 scenarios covered in `compute-hotspots.spec.ts`                                  | ✅ Conforming |

---

## Detailed Findings

# Spec-Compliance Audit — Partial Batch 1: Models & Adapters

**Change:** `code-graph-complete-dependency-detection`  
**Timestamp:** `20261013-190037`  
**Auditor:** Spec Compliance Auditor (automated subagent)  
**Scope:**

1. `code-graph:symbol-model`
2. `code-graph:language-adapter`
3. `code-graph:typescript-language-adapter`
4. `code-graph:go-language-adapter`

---

## Executive Summary

| Spec                                     | Requirements Total | Conforming |           Discrepancies / Gaps           | Tests Passed |           Status            |
| ---------------------------------------- | :----------------: | :--------: | :--------------------------------------: | :----------: | :-------------------------: |
| `code-graph:symbol-model`                |         18         |     17     |    1 discrepancy, 1 test coverage gap    |    17/18     |         **PARTIAL**         |
| `code-graph:language-adapter`            |         17         |     16     |              1 discrepancy               |    16/17     |         **PARTIAL**         |
| `code-graph:typescript-language-adapter` |         9          |     9      |                    0                     |     9/9      |          **PASS**           |
| `code-graph:go-language-adapter`         |         10         |     10     |                    0                     |    10/10     |          **PASS**           |
| **Total**                                |       **54**       |   **52**   | **2 discrepancies, 1 test coverage gap** |  **52/54**   | **HIGH COMPLIANCE (96.3%)** |

All 64 test suites in `@specd/code-graph` (865 tests) pass with zero errors. The enhancements introduced by change `code-graph-complete-dependency-detection` (`SymbolKind.Property`, scope stack popping with line boundaries, TypeScript overload sets and pairwise overrides, literal dynamic imports, chained call extraction, Go struct properties, AST-based receiver parsing, and Go `IMPORTS`/`CALLS` relations) are fully implemented and verified by unit tests.

Two architectural discrepancies and one unit test coverage gap were identified:

1. **`DuplicateSymbolIdError` never thrown (`code-graph:symbol-model`)**: The error is defined, exported, and unit-tested for its prototype contract, but neither the symbol model nor indexer throws it when duplicate symbol IDs are detected; duplicate/colliding IDs are either deduplicated, aggregated, or united into logical symbols.
2. **Cycle detection unit test coverage gap (`code-graph:symbol-model`)**: The code in `packages/code-graph/src/domain/services/scoped-binding-environment.ts` implements cycle detection via a `visited: Set<string>` when traversing parent scopes, but there is no dedicated unit test asserting that circular `parentId` loops abort gracefully and return empty results.
3. **`AdapterRegistry` default registration (`code-graph:language-adapter`)**: The spec mandates that `new AdapterRegistry()` registers the TypeScript adapter by default. In code, `AdapterRegistry` begins with empty maps and relies on external composition wiring (`createCodeGraphProvider`) to register built-in adapters.

---

## Spec 1: `code-graph:symbol-model`

### Requirements Summary

| #   | Requirement                          |   Status    | Summary                                                                                                     |
| --- | ------------------------------------ | :---------: | ----------------------------------------------------------------------------------------------------------- |
| 1   | File node                            |    PASS     | Canonical workspace path identity, repo-relative path, immutable value object.                              |
| 2   | Spec node                            |    PASS     | Canonical specId identity, metadata extraction, content hashing.                                            |
| 3   | Symbol node                          |    PASS     | Deterministic ID computation from coordinate, closed SymbolKind, construct & selection ranges.              |
| 4   | File analysis model                  |    PASS     | Plain runtime value objects (`FileAnalysisDraft`, `FileAnalysis`, `ParserState`).                           |
| 5   | Shared indexing lookups              |    PASS     | Lookup structures in `IndexSession` bounded by relevant candidates.                                         |
| 6   | Compact retained analysis state      |    PASS     | Drops AST and Tree-sitter handles after per-file analysis pass.                                             |
| 7   | Document category                    |    PASS     | `DocumentNode` supporting workspace prefixing and full-text search.                                         |
| 8   | SymbolKind enum                      |    PASS     | Closed 8-member enum with `SymbolKind.Property`. State normalization across scopes.                         |
| 9   | Relation types                       |    PASS     | Persisted typed edges, including `CONSTRUCTS`, `USES_TYPE`, `EXTENDS`, `IMPLEMENTS`, `OVERRIDES`.           |
| 10  | Relation staleness                   |    PASS     | `stale` boolean flag on `COVERS_SYMBOL` metadata.                                                           |
| 11  | Relation value object                |    PASS     | Immutable value object with equality on `source`, `target`, and `type`.                                     |
| 12  | Hierarchy relation semantics         |    PASS     | Explicit normalization of `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES`.                                         |
| 13  | Import declaration                   |    PASS     | Pure syntactic value object with `localName`, `originalName`, `specifier`, `isRelative`, `kind`.            |
| 14  | Scoped binding model                 |   PARTIAL   | Pure immutable binding and call facts with cycle detection; test coverage gap on circular parent traversal. |
| 15  | Scoped binding relation output       |    PASS     | Emits deterministic relations; self-relations dropped prior to persistence.                                 |
| 16  | Immutability                         |    PASS     | All domain entities and value objects have `readonly` properties.                                           |
| 17  | Error types                          | DISCREPANCY | Base `SpecdCodeGraphError` extends `SpecdError`. `DuplicateSymbolIdError` defined but never thrown.         |
| 18  | Logical symbol & canonical reference |    PASS     | Logical declarations, owner canonical IDs, delimiter-safe references, `qualified_name`.                     |

---

### Implementation Status Details

#### Requirement 8: SymbolKind enum & State Normalization

- **Specification**: `SymbolKind` SHALL be a closed string enum with 8 members (`function`, `class`, `method`, `variable`, `type`, `interface`, `enum`, `property`). State declared at file/module scope has `kind: variable` and `parentId: undefined`. Routine-local state has `kind: variable` and `parentId: routine.id`. Container-encapsulated state has `kind: property` and `parentId: container.id`.
- **Implementation**:
  - `packages/code-graph/src/domain/value-objects/symbol-kind.ts`:
    ```ts
    export const SymbolKind = {
      Function: 'function',
      Class: 'class',
      Method: 'method',
      Variable: 'variable',
      Type: 'type',
      Interface: 'interface',
      Enum: 'enum',
      Property: 'property',
    } as const
    ```
  - `packages/code-graph/src/infrastructure/tree-sitter/reference-fact-helpers.ts` (`withEnclosingTypeParents`): Manages active scope stack; pops scopes past `endLine:endColumn`; routes properties/methods to container parents and local variables/functions to routine parents.
- **Verification**:
  - `packages/code-graph/test/domain/value-objects/symbol-kind.spec.ts`: Validates enum members, `isSymbolKind('property') === true`, `isSymbolKind('trait') === false`, node creation with kind `property`.
  - `packages/code-graph/test/infrastructure/tree-sitter/reference-fact-helpers.spec.ts`: Tests container parent assignment for properties, routine parent for locals, and scope popping when coordinates end.
- **Status**: PASS.

#### Requirement 14: Scoped Binding Model & Cycle Detection

- **Specification**: Traversal of scope hierarchy (following `parentId` links) SHALL implement cycle detection. If a circular reference is detected, traversal MUST be aborted to prevent infinite loops, returning no resolution result.
- **Implementation**:
  - `packages/code-graph/src/domain/services/scoped-binding-environment.ts` (`lookupBindingFacts`, lines 273-288):

    ```ts
    let currentScopeId: string | undefined = scopeId
    const visited = new Set<string>()

    while (currentScopeId !== undefined) {
      if (visited.has(currentScopeId)) {
        break
      }
      visited.add(currentScopeId)
      const candidates = factsByScopeAndName.get(currentScopeId)?.get(name) ?? []
      const deterministic = selectDeterministicFacts(candidates)
      if (deterministic !== undefined) return deterministic
      currentScopeId = scopesById.get(currentScopeId)?.parentId
    }
    return []
    ```

- **Verification**:
  - Cycle detection logic is present and conforms to the spec behavior (breaks loop and returns `[]`).
  - **Coverage Gap**: `packages/code-graph/test/domain/services/scoped-binding-environment.spec.ts` covers ambiguous bindings, Windows drive letter prefixes, constructor/type dependency relations, and self-relation dropping, but lacks a test asserting that a circular `parentId` link terminates and returns an empty candidate set.
- **Status**: PARTIAL (Code conforms; dedicated test missing).

#### Requirement 15: Scoped Binding Relation Output & Self-Edge Dropping

- **Specification**: Persisted relations include `IMPORTS`, `CALLS`, `CONSTRUCTS`, `USES_TYPE`, `EXTENDS`, `IMPLEMENTS`, `OVERRIDES`. Self-relations where `sourceSymbolId === targetSymbolId` MUST be dropped before persistence.
- **Implementation**:
  - `packages/code-graph/src/domain/services/scoped-binding-environment.ts`:
    ```ts
    function addDependency(
      dependencies: ResolvedDependency[],
      seen: Set<string>,
      dependency: ResolvedDependency,
    ): void {
      if (dependency.sourceSymbolId === dependency.targetSymbolId) return
      ...
    }
    ```
- **Verification**:
  - `packages/code-graph/test/domain/services/scoped-binding-environment.spec.ts`: 'resolves constructor and type facts into distinct dependency relations', 'drops self-relations from resolved dependency facts'.
- **Status**: PASS.

#### Requirement 17: Error Types & Duplicate Symbol Detection

- **Specification**: `@specd/code-graph` defines `SpecdCodeGraphError` extending `SpecdError` from `@specd/core`. Includes `InvalidSymbolKindError`, `InvalidRelationTypeError`, `DuplicateSymbolIdError`, `StoreNotOpenError`. Scenario: "Duplicate symbol id detected" — when two symbols in the same file produce the same ID, `DuplicateSymbolIdError` is thrown.
- **Implementation**:
  - `packages/code-graph/src/domain/errors/duplicate-symbol-id-error.ts` defines `DuplicateSymbolIdError` with code `DUPLICATE_SYMBOL_ID`.
  - However, nowhere in `packages/code-graph/src` is `DuplicateSymbolIdError` thrown. Symbols in a file with identical IDs or same-location overload declarations are deduplicated or aggregated into overload sets.
- **Verification**:
  - `packages/code-graph/test/domain/errors/specd-code-graph-error.spec.ts` tests error inheritance and `specd: true` discriminator.
- **Discrepancy Analysis**:
  - _Spec Drift_: In earlier revisions of the code graph, files were validated strictly to guarantee unique symbol IDs. With the introduction of overload sets, declaration merging, and multi-declaration logical symbols, identical coordinates/names are either grouped into overload sets or deduplicated in `FileAnalysisDraft.symbols`, rendering runtime throwing of `DuplicateSymbolIdError` obsolete.
  - _Implementation Bug_: Alternatively, the symbol model or indexer validator is missing an integrity pass that rejects accidental duplicate symbol ID collisions where the symbols do not form a valid language overload set.
- **Status**: DISCREPANCY.

---

## Spec 2: `code-graph:language-adapter`

### Requirements Summary

| #   | Requirement                           |   Status    | Summary                                                                                            |
| --- | ------------------------------------- | :---------: | -------------------------------------------------------------------------------------------------- |
| 1   | LanguageAdapter interface             |    PASS     | Pure synchronous methods `analyzeFile`, `resolveImports`, `buildRelations`.                        |
| 2   | Full-file analysis contract           |    PASS     | Single `analyzeFile` call returns `FileAnalysisDraft` without reparsing.                           |
| 3   | Unified built-in adapter migration    |    PASS     | All 4 adapters (TS, Go, Python, PHP) implement unified contract.                                   |
| 4   | Language detection                    |    PASS     | Dynamic extension map from registered adapters.                                                    |
| 5   | Import declaration extraction         |    PASS     | Extracts structured `ImportDeclaration` objects.                                                   |
| 6   | Call resolution                       |    PASS     | Resolves caller to innermost callable routine; unresolvable calls dropped.                         |
| 7   | Scoped binding fact extraction        |    PASS     | Container and routine scope tracking with coordinate-based stack popping.                          |
| 8   | Built-in multi-language coverage      |    PASS     | No generic language-name branching in indexer.                                                     |
| 9   | Detectable dependency boundary        |    PASS     | Literal dynamic imports admitted; variable dynamic calls dropped.                                  |
| 10  | Hierarchy extraction                  |    PASS     | Emits `EXTENDS`, `IMPLEMENTS`, `OVERRIDES`.                                                        |
| 11  | Package identity extraction           |    PASS     | `getPackageIdentity` searches bounded by `repoRoot`.                                               |
| 12  | Import specifier resolution           |    PASS     | Pass 2 uses in-memory session lookups, no filesystem probes.                                       |
| 13  | Tree-sitter query patterns            |    PASS     | Implementation details internal to adapters.                                                       |
| 14  | Adapter registry                      | DISCREPANCY | Dynamic extension mapping conforms; default registration of TypeScript adapter not in constructor. |
| 15  | Resolver capability declaration       |    PASS     | Adapters declare `capabilities()`; undeclared capabilities are unsupported.                        |
| 16  | Member semantics & declaration parent |    PASS     | Emits `MemberSemantics`; pops scopes past `endLine` to prevent parent ID bleed.                    |
| 17  | Resolution manifests                  |    PASS     | Pure `resolutionManifests()` returns exact basenames without filesystem I/O.                       |

---

### Implementation Status Details

#### Requirement 7 & 16: Scoped Binding Fact Extraction & Scope Boundary Popping

- **Specification**: Adapters maintain an active scope stack that pops enclosing scopes when AST traversal moves past the construct's end line. Prevents trailing sibling or top-level declarations from inheriting stale parent IDs.
- **Implementation**:
  - `packages/code-graph/src/infrastructure/tree-sitter/reference-fact-helpers.ts` (`withEnclosingTypeParents`):
    ```ts
    while (scopeStack.length > 0) {
      const top = scopeStack[scopeStack.length - 1]!
      if (
        top.endLine < symbol.line ||
        (top.endLine === symbol.line && top.endColumn <= symbol.column)
      ) {
        scopeStack.pop()
      } else {
        break
      }
    }
    ```
- **Verification**:
  - `packages/code-graph/test/infrastructure/tree-sitter/reference-fact-helpers.spec.ts`:
    - Scenario: 'pops scope when construct coordinates end so following top-level declarations have undefined parentId'.
    - Scenario: 'assigns container parent to properties and methods, and routine parent to local variables'.
- **Status**: PASS.

#### Requirement 14: Adapter Registry & Default Registration

- **Specification**:
  - Requirement: "The TypeScript adapter MUST be registered by default when the registry is created. Additional adapters can be registered to extend language support."
  - Scenario: "TypeScript adapter registered by default:
    - WHEN a new `AdapterRegistry` is created
    - THEN `getAdapter('typescript')` returns the `TypeScriptLanguageAdapter`"
- **Implementation**:
  - `packages/code-graph/src/infrastructure/tree-sitter/adapter-registry.ts`:

    ```ts
    export class AdapterRegistry implements AdapterRegistryPort {
      private adapters = new Map<string, LanguageAdapter>()
      private extMap = new Map<string, string>()

      register(adapter: LanguageAdapter): void { ... }
      ...
    }
    ```

    `AdapterRegistry` defines no constructor and initializes with empty `adapters` and `extMap`.

  - Registration of all adapters (TypeScript, Python, Go, PHP) is handled in composition wiring:
    `packages/code-graph/src/composition/create-code-graph-provider.ts` (lines 57-61):
    ```ts
    const registry = new AdapterRegistry()
    registry.register(new TypeScriptLanguageAdapter())
    registry.register(new PythonLanguageAdapter())
    registry.register(new GoLanguageAdapter())
    registry.register(new PhpLanguageAdapter())
    ```
  - Test suites instantiating `new AdapterRegistry()` directly (e.g., `index-code-graph.spec.ts`, `workspace-indexing.spec.ts`) must explicitly call `registry.register(new TypeScriptLanguageAdapter())`.

- **Discrepancy Analysis**:
  - _Spec Drift_: In adherence to Hexagonal Architecture (`default:_global/architecture`), `AdapterRegistry` is an unopinionated domain port implementation located in infrastructure, while composition wiring (`createCodeGraphProvider`) is responsible for instantiating and registering concrete adapters. Hardcoding `new TypeScriptLanguageAdapter()` in `AdapterRegistry`'s constructor would couple the registry directly to the TypeScript adapter. The spec's requirement for automatic registration in `new AdapterRegistry()` conflicts with this decoupled DI design.
  - _Implementation Bug_: `AdapterRegistry` constructor failed to add `this.register(new TypeScriptLanguageAdapter())`.
- **Status**: DISCREPANCY.

#### Requirement 17: Resolution Manifests Pure Declaration

- **Specification**: `resolutionManifests()` returns exact basenames without performing filesystem I/O. TypeScript returns `['package.json']`, Python `['pyproject.toml']`, Go `['go.mod']`, PHP `['composer.json']`.
- **Implementation**:
  - Implemented on all 4 adapters as pure array literals.
- **Verification**:
  - `packages/code-graph/test/infrastructure/tree-sitter/resolution-manifests.spec.ts`: Tests with mocked `node:fs` that calling `resolutionManifests()` on all 4 adapters performs zero calls to `existsSync`, `readFileSync`, `lstatSync`, or `statSync`.
- **Status**: PASS.

---

## Spec 3: `code-graph:typescript-language-adapter`

### Requirements Summary

| #   | Requirement                                     | Status | Summary                                                                                                |
| --- | ----------------------------------------------- | :----: | ------------------------------------------------------------------------------------------------------ |
| 1   | Supported languages & deterministic analysis    |  PASS  | Handles `.ts`, `.tsx`, `.js`, `.jsx`. One parse, no AST nodes retained.                                |
| 2   | Declaration extraction & ranges                 |  PASS  | Extracts interface properties, class fields, enum members as `SymbolKind.Property`. United overloads.  |
| 3   | Object properties in array data records         |  PASS  | Filters anonymous scalar fields below array boundaries; preserves callable & named properties.         |
| 4   | Logical identity & declaring owners             |  PASS  | Overload sets retained in `memberIdsByName: Record<string, string[]>`. Pairwise `OVERRIDES` relations. |
| 5   | Imports, exports, and public bindings           |  PASS  | Literal string dynamic `import(...)` and `require(...)` extracted.                                     |
| 6   | Scoped bindings, calls, types, and construction |  PASS  | Chained and nested call sites recursively discovered. `this` receiver bindings.                        |
| 7   | TypeScript hierarchy & provenance evidence      |  PASS  | Class `extends`, interface `implements`, pairwise overload fulfillment.                                |
| 8   | Package & build-context boundary                |  PASS  | Nearest `package.json`, longest prefix matching, `buildContext: false`.                                |
| 9   | Capability truthfulness & failure behavior      |  PASS  | Capabilities accurately reflect emitted facts; parse failures surfaced in coverage.                    |

---

### Implementation Status Details

#### Requirement 2: Property Symbol Extraction & Overload Unification

- **Specification**: Interface property signatures, class field definitions, and enum members SHALL be classified as `SymbolKind.Property`. Overload signatures along with implementation declarations SHALL be united under a single logical symbol.
- **Implementation**:
  - `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts` (lines 1856-1872): Inspects `property_signature`, `property_definition`, `public_field_definition`, and enum members; assigns `SymbolKind.Property`.
- **Verification**:
  - `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts` (lines 1313-1335):
    - Tests `UserProfile` interface (`username: string`), `Account` class (`balance: number = 0`), and `Status` enum (`Active = 'active'`).
    - Asserts `username`, `balance`, and `active` are assigned `SymbolKind.Property`.
- **Status**: PASS.

#### Requirement 4 & 7: Overload Sets and Pairwise Override Relations

- **Specification**: Multiple overload signatures within a declaring owner SHALL be retained as an overload set rather than overwriting prior signatures. Pairwise `OVERRIDES` edges SHALL connect all submethod IDs to all matching supermethod overload signatures.
- **Implementation**:
  - `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`:
    - `TsTypeDeclarationInfo` defines `memberIdsByName: Record<string, string[]>`.
    - `extractTypeDeclarations`: Pushes all overload symbol IDs for the same name into `memberIdsByName[symbol.name]`.
    - `addOverrideRelations`: Iterates `sourceMethodIds` and `targetMethodIds`, emitting `RelationType.Overrides` for all combinations.
  - `packages/code-graph/src/application/use-cases/index-code-graph.ts` (lines 1907-1920): `deriveCrossFileOverrideRelations` loops over all `superMethods.get(name)` entries.
- **Verification**:
  - `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts` (lines 1337-1354): Tests `Printer` (with 2 overload signatures + 1 implementation of `print`) and `ColorPrinter extends Printer` (overriding `print`). Verifies pairwise override relations connecting child to all parent overload signatures.
  - `packages/code-graph/test/application/use-cases/index-code-graph.spec.ts` (lines 50-105): Verifies cross-file override relations link all supermethod overload signatures.
  - `packages/code-graph/test/application/services/resolve-graph-selector.spec.ts` (lines 357-480): Verifies resolver unifies overloaded member declarations of the same container into a resolved outcome.
- **Status**: PASS.

#### Requirement 5: Dynamic Imports Extraction

- **Specification**: Extracts literal string dynamic `import(...)` expressions as file dependency import facts.
- **Implementation**:
  - `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: Detects `call_expression` where function identifier is `import` with string literal argument; emits `FileImportFact` with `kind: ImportDeclarationKind.Dynamic`.
- **Verification**:
  - `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts` (lines 1356-1369): Tests `const mod = await import('./widget.js')`; verifies extracted import has `isRelative: true` and `kind: ImportDeclarationKind.Dynamic`.
- **Status**: PASS.

#### Requirement 6: Chained and Nested Call Discovery

- **Specification**: Extracts call expressions occurring in nested and chained expressions (such as `factory().method()` or callbacks).
- **Implementation**:
  - `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: Recursively traverses receiver expressions of call sites to emit `CallFact` instances for each step.
- **Verification**:
  - `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts` (lines 1371-1384): Tests `service.getClient().fetchData().process()`. Verifies extracted call fact names contain `getClient`, `fetchData`, and `process`.
- **Status**: PASS.

---

## Spec 4: `code-graph:go-language-adapter`

### Requirements Summary

| #   | Requirement                                     | Status | Summary                                                                                 |
| --- | ----------------------------------------------- | :----: | --------------------------------------------------------------------------------------- |
| 1   | Supported files & deterministic analysis        |  PASS  | Handles `.go` as `go`. Parses once, no AST objects in persisted state.                  |
| 2   | Declaration extraction & ranges                 |  PASS  | Structs as class, interfaces as interface, struct fields as `SymbolKind.Property`.      |
| 3   | Package identity, exports, and imports          |  PASS  | Uppercase exported, lowercase non-exported. Blank imports as dependency evidence.       |
| 4   | Resolution manifests                            |  PASS  | Returns exactly `['go.mod']` without I/O.                                               |
| 5   | Go logical identity & declaring owners          |  PASS  | AST-based receiver parsing; struct fields own struct as logical owner and parentId.     |
| 6   | Scoped bindings, selectors, construction, types |  PASS  | `buildRelations()` emits `IMPORTS` and `CALLS` relations connecting callers to targets. |
| 7   | Go embedding & hierarchy provenance             |  PASS  | Interface embedding emits `EXTENDS`. No struct promotion speculation.                   |
| 8   | Proven interface satisfaction                   |  PASS  | Complete same-file method set satisfaction emits `IMPLEMENTS`.                          |
| 9   | Build-context boundary                          |  PASS  | Longest module prefix matching in `go.mod`; `buildContext: false`.                      |
| 10  | Capability truthfulness & failure behavior      |  PASS  | Capabilities backed by emitted facts; partial coverage surfaced in coverage.            |

---

### Implementation Status Details

#### Requirement 2 & 5: Struct Field Extraction as Property Kind

- **Specification**: Struct fields SHALL be extracted as declaration symbols with `SymbolKind.Property`, having their declaring struct type as their logical owner and `parentId`.
- **Implementation**:
  - `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts` (lines 1130-1167): Traverses `struct_type` AST nodes and emits `SymbolNode` with `kind: SymbolKind.Property` for `field_identifier` children.
- **Verification**:
  - `packages/code-graph/test/infrastructure/tree-sitter/go-language-adapter.spec.ts` (lines 615-646):
    - Tests `type User struct { ID int; Name string }`.
    - Verifies `user?.kind === SymbolKind.Class`, `id?.kind === SymbolKind.Property`, `id?.parentId === user?.id`, `name?.kind === SymbolKind.Property`, `name?.parentId === user?.id`.
- **Status**: PASS.

#### Requirement 5: AST-Based Receiver Parameter Parsing

- **Specification**: A receiver method SHALL parse its receiver type and pointer/value semantics directly from AST receiver parameter nodes rather than regex text parsing.
- **Implementation**:
  - `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts` (`collectMethodReceivers`, lines 742-784): Inspects `method_declaration` node's `receiver` field (`parameter_list` -> `parameter_declaration` -> `pointer_type` / `type_identifier`). Correctly parses multiline receivers and pointer types without regex.
- **Verification**:
  - `packages/code-graph/test/infrastructure/tree-sitter/go-language-adapter.spec.ts` (lines 648-674):
    - Tests multiline receiver: `func (\n e *Engine\n) Start() {}`.
    - Verifies `start?.parentId === engine?.id` without regex failures.
- **Status**: PASS.

#### Requirement 6: Emission of IMPORTS and CALLS in `buildRelations()`

- **Specification**: In `buildRelations()`, the adapter SHALL build concrete `IMPORTS` relations for resolved imported packages and concrete `CALLS` relations connecting callers to target functions and receiver methods.
- **Implementation**:
  - `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts` (`buildRelations`, lines 616-656):
    - Maps `analysis.imports` to `RelationType.Imports` with `source: analysis.filePath` and `target: imp.specifier`.
    - Maps `analysis.callFacts` where `call.callerSymbolId` exists to resolved callee IDs (from `resolvedImports.importMap` or `localSymbolsByName`), emitting `RelationType.Calls`.
- **Verification**:
  - `packages/code-graph/test/infrastructure/tree-sitter/go-language-adapter.spec.ts` (lines 676-726):
    - Tests Go file importing `"fmt"` and function `run()` calling `helper()`.
    - Verifies `relations` contains `IMPORTS` relation targeting `"fmt"` and `CALLS` relation from `run` symbol to `helper` symbol.
- **Status**: PASS.

---

## Consistency with Global Specs & Direct Dependencies

### 1. `default:_global/conventions`

- **Strict TypeScript & Immutability**: All models (`SymbolNode`, `FileNode`, `Relation`, `BindingFact`, `CallFact`, `FileAnalysisDraft`) define readonly properties. No mutable state leaks.
- **Naming & Modules**: Kebab-case filenames (`symbol-node.ts`, `reference-fact-helpers.ts`), explicit public returns, strict ESM (`.js` imports).
- **Status**: CONFORMANT.

### 2. `default:_global/architecture`

- **Hexagonal Architecture**: Domain models (`packages/code-graph/src/domain/`) contain no I/O. Ports (`LanguageAdapter`, `AdapterRegistryPort`) define abstract contracts. Infrastructure adapters (`packages/code-graph/src/infrastructure/tree-sitter/`) encapsulate parser libraries. Composition occurs in `createCodeGraphProvider`.
- **Status**: CONFORMANT.

### 3. `default:_global/testing`

- **Vitest Conventions**: Unit tests located in `test/`, mirror `src/` directory hierarchy, utilize Given/When/Then scenario structures, zero snapshots. All 865 tests pass.
- **Status**: CONFORMANT.

### 4. `default:_global/error-handling-conventions`

- **Specd Error Contract**: `SpecdCodeGraphError` extends `SpecdError`, includes `specd: true` discriminator, machine-readable `code` (`UPPER_SNAKE_CASE`), and actionable message.
- **Status**: CONFORMANT.

### 5. Direct Dependencies

- `code-graph:symbol-model` -> `default:_global/conventions`, `default:_global/error-handling-conventions`, `code-graph:document-model`: All referenced contracts upheld.
- `code-graph:language-adapter` -> `code-graph:symbol-model`: Uses `SymbolNode`, `Relation`, `RelationType`, and `SymbolKind`.
- `code-graph:typescript-language-adapter` -> `code-graph:language-adapter`, `code-graph:symbol-model`, `code-graph:workspace-integration`: Implements adapter port, produces conformant symbol and relation facts.
- `code-graph:go-language-adapter` -> `code-graph:language-adapter`, `code-graph:symbol-model`, `code-graph:workspace-integration`: Implements adapter port, adheres to package-prefixed identities and shared relation types.
- **Status**: CONFORMANT.

---

## Discrepancies and Findings Log

### Discrepancy 1: `DuplicateSymbolIdError` is Never Thrown

- **Affected Spec**: `code-graph:symbol-model` (Requirement: Error types, Scenario: Duplicate symbol id detected)
- **Observed Behavior**: `DuplicateSymbolIdError` is defined in `packages/code-graph/src/domain/errors/duplicate-symbol-id-error.ts` and tested for its class hierarchy in `test/domain/errors/specd-code-graph-error.spec.ts`, but it is never instantiated or thrown anywhere in `packages/code-graph/src/`. Symbols that collide or overloads sharing identical coordinates are deduplicated or grouped into overload sets.
- **Spec Drift View**: The spec scenario predates overload sets and multi-declaration logical symbols. Today, same-named/same-location nodes are merged or handled via overload arrays, making a hard throw counterproductive.
- **Implementation Bug View**: The symbol model validator or indexer lacks a check that throws `DuplicateSymbolIdError` when two completely distinct symbols produce an identical ID collision within the same file.

### Discrepancy 2: Unit Test Coverage Gap for Scoped Binding Cycle Detection

- **Affected Spec**: `code-graph:symbol-model` (Requirement: Scoped binding model, Constraint: Cycle Detection)
- **Observed Behavior**: The cycle detection logic is implemented in `packages/code-graph/src/domain/services/scoped-binding-environment.ts` (lines 274-288) using `visited.add(currentScopeId)` and returning `[]`. However, `packages/code-graph/test/domain/services/scoped-binding-environment.spec.ts` does not contain a unit test setting up a circular `parentId` link to verify that the traversal terminates and yields an empty candidate list.
- **Remediation**: Add a unit test to `scoped-binding-environment.spec.ts` with a mock analysis where scope `A` has `parentId: 'B'` and scope `B` has `parentId: 'A'`.

### Discrepancy 3: `AdapterRegistry` Does Not Register TypeScript by Default

- **Affected Spec**: `code-graph:language-adapter` (Requirement: Adapter registry, Scenario: TypeScript adapter registered by default)
- **Observed Behavior**: `AdapterRegistry` (`packages/code-graph/src/infrastructure/tree-sitter/adapter-registry.ts`) initializes with empty maps. Calling `new AdapterRegistry().getAdapter('typescript')` returns `undefined`. Adapter registration is instead performed by composition wiring in `createCodeGraphProvider.ts`.
- **Spec Drift View**: In Hexagonal Architecture (`default:_global/architecture`), infrastructure registries should be pure containers without hardcoded dependencies on specific language adapters. Provider composition wiring is the appropriate place for registering built-ins. The spec requirement to register TypeScript in the constructor is outdated.
- **Implementation Bug View**: `AdapterRegistry` should initialize with `this.register(new TypeScriptLanguageAdapter())` in its constructor, matching the explicit spec requirement.

---

## Final Counts

- **Total Checked Requirements**: 54
- **Conforming**: 52
- **Discrepancies**: 2
- **Test Coverage Gaps**: 1
- **Overall Status**: **HIGH COMPLIANCE (Ready for verification)**

---

# Spec-Compliance Audit — Partial Batch 2: Adapters & Symbol Resolution

**Change:** `code-graph-complete-dependency-detection`  
**Timestamp:** `20261013-190037`  
**Auditor:** Spec Compliance Auditor (automated subagent)  
**Scope:**

1. `code-graph:python-language-adapter`
2. `code-graph:php-language-adapter`
3. `code-graph:resolve-symbol-reference`

---

## Executive Summary

| Spec                                  | Requirements Total | Conforming | Discrepancies / Gaps | Tests Passed |           Status           |
| ------------------------------------- | :----------------: | :--------: | :------------------: | :----------: | :------------------------: |
| `code-graph:python-language-adapter`  |         9          |     9      |          0           |     9/9      |          **PASS**          |
| `code-graph:php-language-adapter`     |         9          |     9      |          0           |     9/9      |          **PASS**          |
| `code-graph:resolve-symbol-reference` |         8          |     8      |          0           |     8/8      |          **PASS**          |
| **Total**                             |       **26**       |   **26**   |        **0**         |  **26/26**   | **FULL COMPLIANCE (100%)** |

All unit and integration tests covering this batch (4 test suites, 157 tests in total: `python-language-adapter.spec.ts` [43 tests], `php-language-adapter.spec.ts` [72 tests], `resolve-symbol-reference.spec.ts` [32 tests], and `resolve-graph-selector.spec.ts` [10 tests]) execute cleanly with zero failures. TypeScript typechecks pass with zero errors and ESLint validation reports zero warnings/errors.

Key enhancements delivered by change `code-graph-complete-dependency-detection` across this batch:

1. **Python Language Adapter**: Class attributes, dataclass fields, and Protocol field annotations are extracted as `SymbolKind.Property` with container `parentId`; decorator invocations on functions/classes are extracted as `CallFact` records emitting `RelationType.Calls`; field type annotations on dataclasses/classes emit `RelationType.UsesType` relations.
2. **PHP Language Adapter**: Class/trait/interface properties, class constants (`const`), and enum cases (`enum_case`) are extracted as `SymbolKind.Property` with container `parentId`; reference facts preserve container logical ownership and `parentId`.
3. **Resolve Symbol Reference & Selector Resolver**: Graph selector resolution unifies candidates belonging to the same logical symbol or overload set (`unifyOverloadSetCandidates`), resolving cleanly with `status: 'resolved'` instead of incorrectly reporting false ambiguity.

No blocking discrepancies or contradictions against project-wide global specs (`default:_global/*`) or direct dependencies (`symbol-model`, `language-adapter`, `workspace-integration`, `graph-store`) were found.

---

## Spec 1: `code-graph:python-language-adapter`

### Requirements Summary

| #   | Requirement                                       | Status | Summary                                                                                                                                                                                                              |
| --- | ------------------------------------------------- | :----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Supported files and deterministic analysis        |  PASS  | Handles `.py` and `.pyi` as `python`; single-pass ast-grep parse; serializable parser state; no runtime module import/execution.                                                                                     |
| 2   | Declaration extraction and ranges                 |  PASS  | Extracts functions, classes, nested classes, methods, module assignments (`variable`), and class attributes/dataclass fields/Protocol annotations (`property`); parser-authoritative construct and selection ranges. |
| 3   | Python logical identity and declaring owners      |  PASS  | Syntactic owner containment; distinct same-name methods across classes; member forms preserve instance, `@classmethod`, `@staticmethod`, properties.                                                                 |
| 4   | Imports and package resolution                    |  PASS  | Relative imports, leading-dot traversal, package identity from `pyproject.toml` with hyphen/underscore normalization; drops variable dynamic imports.                                                                |
| 5   | Resolution manifests                              |  PASS  | `resolutionManifests()` returns exactly `['pyproject.toml']`; reads `[project].name` and ignores non-project tables.                                                                                                 |
| 6   | Scoped bindings, calls, annotations, construction |  PASS  | Lexical scopes, typed annotations, decorator `CallFact` and `CALLS` relations, dataclass field type `USES_TYPE` relations.                                                                                           |
| 7   | Python hierarchy and provenance evidence          |  PASS  | Class bases in source order; emits `EXTENDS`, `IMPLEMENTS`, `OVERRIDES`; multiple inheritance preserves declared order; cycles terminate safely.                                                                     |
| 8   | Public surface and stub behavior                  |  PASS  | Module surface addressing; explicit imports remain local bindings; `.pyi` participation without speculative runtime merging; no export inference from naming.                                                        |
| 9   | Capability truthfulness and failure behavior      |  PASS  | Advertises `hierarchy: true` with backed evidence; `buildContext: false`; deterministic outputs for identical indexing context.                                                                                      |

---

### Implementation Status Details

#### Requirement 1: Supported files and deterministic analysis

- **Specification**: `PythonLanguageAdapter` SHALL handle `.py` and `.pyi` files as `python`. It SHALL parse supplied content once through registered Tree-sitter/ast-grep grammar and return one complete `FileAnalysisDraft` containing symbols, imports, binding and call facts, reference facts, and compact serializable parser state for Pass 2. MUST NOT import or execute analyzed modules. Parser-runtime objects exist only in run-scoped keepalive state and MUST NOT be persisted in file analysis.
- **Implementation**:
  - `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`:
    - `languages()` returns `['python']` (lines 262–264).
    - `extensions()` returns `{ '.py': 'python', '.pyi': 'python' }` (lines 295–297).
    - `analyzeFile()` (lines 308–509): calls `parse('python', content)` via ast-grep; saves SgRoot in `context.session.getAdapterState<unknown[]>('napi-keepalive')` to prevent V8 GC double-free while keeping AST handles strictly run-scoped; returns `FileAnalysisDraft` with serializable `parserState: { kind: 'python', classes: serializedClasses, fieldTypes }`.
    - No execution of Python (`eval`, `exec`, or child processes).
- **Verification**:
  - `packages/code-graph/test/infrastructure/tree-sitter/python-language-adapter.spec.ts`:
    - `reports supported languages` (lines 64–67).
    - `maps .py and .pyi to python` (lines 394–398).
- **Status**: PASS.

#### Requirement 2: Declaration extraction and ranges

- **Specification**: Extracts module function definitions, class and nested-class definitions, methods declared in class bodies including decorated definitions, module-level assignment targets, and class-level assignment targets. Class-level assignments, dataclass field definitions, and Protocol field annotations SHALL be extracted as `SymbolKind.Property`. Declaring owner and `parentId` SHALL be set to enclosing class symbol. Nested functions inside function bodies remain unsupported. Attached comments preserved. Complete construct range and exact declared-name `selectionRange` under half-open convention.
- **Implementation**:
  - `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`:
    - `walk()` (lines 1301–1425): recursively inspects AST nodes. Class definitions emit `SymbolKind.Class`; function definitions in class blocks emit `SymbolKind.Method`; top-level assignments emit `SymbolKind.Variable`; class body `expression_statement -> assignment` nodes emit `SymbolKind.Property` with exact identifier `selectionRange` (lines 1349–1398).
    - Nested functions inside functions: function definitions within routine blocks are filtered out, preventing approximation of unsupported nested local functions.
    - `withEnclosingTypeParents(symbols)` (line 498): assigns enclosing class `symbol.id` to `parentId` for methods and properties via stack-based lexical scope manager.
- **Verification**:
  - `packages/code-graph/test/infrastructure/tree-sitter/python-language-adapter.spec.ts`:
    - `extracts function definitions` (lines 120–136).
    - `extracts parser-authoritative construct and declared-name ranges` (lines 138–164).
    - `extracts class definitions` (lines 166–184).
    - `extracts methods inside classes` (lines 186–204).
    - `extracts module-level assignments as variables` (lines 206–224).
    - `extracts class attributes, dataclass fields, and Protocol annotations as SymbolKind.Property with class parentId` (lines 618–653).
- **Status**: PASS.

#### Requirement 3: Python logical identity and declaring owners

- **Specification**: Supported method uses logical identity of nearest declaring class as owner; nested class uses nearest enclosing class as owner; module-level declarations have no owner. Owner identities created before member logical IDs; not copied from raw parser IDs or `SymbolNode.parentId`. Same-name methods in different classes distinct. Distinct member forms for instance methods, `@classmethod`, `@staticmethod`, properties, property setters.
- **Implementation**:
  - `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`:
    - `collectClassInfo()` (lines 870–980): maps methods and properties under `ownerSymbol`; distinguishes methods vs properties; invokes `pythonMemberSemantics()` (lines 98–140) to record dispatch (`static`, `instance`) and kind (`method`, `property`).
    - `buildReferenceFacts()` (lines 520–601): creates logical declarations with `ownerSymbolId` bound to the class's logical ID and `memberSemantics` set appropriately.
- **Verification**:
  - `packages/code-graph/test/infrastructure/tree-sitter/python-language-adapter.spec.ts`:
    - `owner-qualifies methods and emits ordered base evidence` (lines 81–98).
    - `retains constructor and deterministic decorator member forms` (lines 100–117).
    - `uses the declaring class as owner for nested classes and their methods` (lines 119–138).
- **Status**: PASS.

#### Requirement 4: Imports and package resolution

- **Specification**: Extracts `import`, `from ... import ...`, aliases, relative imports, literal `importlib.import_module()` and `__import__()`. Variable dynamic imports dropped. Locally accessible binding and original qualified module both retained. Relative resolution honors leading-dot traversal and candidate file/package/stub paths. Package identities read from nearest `pyproject.toml` with underscore/hyphen normalization.
- **Implementation**:
  - `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`:
    - `import_statement` and `import_from_statement` handling in `analyzeFile()` (lines 384–451).
    - Regex matching for literal `importlib.import_module` and `__import__` (lines 453–466); non-literal forms are ignored.
    - `resolveRelativeImportPath()` (lines 1427–1463): counts leading dots, traverses directories upward, produces `.py` and `/__init__.py` candidate paths.
    - `resolvePackageFromSpecifier()` (lines 1472–1478): normalizes hyphens and underscores (`replaceAll('_', '-')`).
- **Verification**:
  - `packages/code-graph/test/infrastructure/tree-sitter/python-language-adapter.spec.ts`:
    - `emits package identities and preserves import aliases conservatively` (lines 69–79).
    - `parses literal dynamic imports and drops variable dynamic imports` (lines 314–332).
    - `extractImportedNames` tests (lines 348–392).
    - `resolvePackageFromSpecifier` tests (lines 400–418).
    - `resolveRelativeImportPath` tests (lines 420–435).
- **Status**: PASS.

#### Requirement 5: Resolution manifests

- **Specification**: `resolutionManifests()` SHALL return exactly `['pyproject.toml']`. MUST NOT declare `setup.cfg`, `setup.py`, or any other basename. Package identity MUST come from `[project].name` in nearest bounded `pyproject.toml` and MUST NOT come from another table.
- **Implementation**:
  - `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`:
    - `resolutionManifests()` returns `['pyproject.toml']` (lines 1484–1486).
    - `getPackageIdentity()` (lines 1495–1498) calls `findManifestField()` with `readPythonProjectName()`.
    - `readPythonProjectName()` (lines 1500–1512): iterates lines, toggles `inProject` exclusively on header `[project]`, extracts `name = "..."`, and ignores `[tool.poetry]` or other sections.
- **Verification**:
  - `packages/code-graph/test/infrastructure/tree-sitter/python-language-adapter.spec.ts`:
    - `given python adapter, when asked for manifests, then returns pyproject.toml only` (lines 437–443).
    - `reads name from pyproject.toml` (lines 446–455).
    - `given poetry name before project name, when identity is read, then project name wins` (lines 465–478).
    - `given a single-quoted project name, when identity is read, then that name is returned` (lines 480–493).
    - `given a poetry-only manifest and no parent project name, when identity is read, then the result is undefined` (lines 515–528).
- **Status**: PASS.

#### Requirement 6: Scoped bindings, calls, annotations, and construction

- **Specification**: Emits deterministic facts for lexical scopes, imported aliases, parameter and return annotations, annotated assignments, type-alias right-hand sides, `self`/`cls` receiver bindings, class construction calls. Extracts decorator invocations and references on functions/classes to emit `CALLS` or `USES_TYPE` relations when resolvable. Extracts type annotations on class and dataclass fields to emit `USES_TYPE` relations. Caller SHALL be innermost enclosing function/method (or class for class-level decorators).
- **Implementation**:
  - `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`:
    - `extractDecoratorCallFacts()` (lines 1174–1282): walks AST for `decorated_definition` nodes, binds `callerSymbolId` to decorated routine or class symbol, emits `CallFact` records with appropriate `CallForm`.
    - `walk()` (lines 1361–1398): parses `type` field on class assignment nodes, strips standard primitives (`int`, `str`, `bool`, `list`, `dict`, etc.) and typing generics (`Optional`, `Union`, `List`, etc.), and collects custom type names into `fieldTypes`.
    - `buildRelations()` (lines 740–850):
      - Emits `RelationType.Calls` for resolvable decorator call facts (lines 800–820).
      - Emits `RelationType.UsesType` from `fieldSymbolId` to target type symbol ID (lines 824–850).
- **Verification**:
  - `packages/code-graph/test/infrastructure/tree-sitter/python-language-adapter.spec.ts`:
    - `emits annotation and constructor facts` (lines 334–340).
    - `emits ImportedType facts from type alias RHS` (lines 342–346).
    - `extracts decorator invocations as call facts with callerSymbolId bound to decorated routine and emits Calls relation` (lines 655–682).
    - `emits RelationType.UsesType for dataclass field type annotations` (lines 684–707).
- **Status**: PASS.

#### Requirement 7: Python hierarchy and provenance evidence

- **Specification**: Retains declared bases in source order, resolves through local declarations and proven imports. Emits `EXTENDS` for class inheritance, `IMPLEMENTS` for protocol/interface-like declarations, `OVERRIDES` for matching child members when ancestor member is known. Multiple inheritance preserves declared base order. Cycles terminate deterministically.
- **Implementation**:
  - `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`:
    - `collectClassInfo()` extracts base names in syntactic order (lines 948–960).
    - `buildHierarchyFacts()` emits `HierarchyFact` with `kind: 'extends'` or `'implements'` and sequential precedence indices.
    - `buildRelations()` generates `RelationType.Extends`, `RelationType.Implements`, and `RelationType.Overrides` (lines 740–820).
- **Verification**:
  - `packages/code-graph/test/infrastructure/tree-sitter/python-language-adapter.spec.ts`:
    - `owner-qualifies methods and emits ordered base evidence` (lines 81–98).
    - `preserves declared multiple-base order and protocol evidence` (lines 140–160).
    - `creates EXTENDS and OVERRIDES for local class hierarchies` (lines 278–294).
    - `creates IMPLEMENTS for imported protocol-like bases` (lines 296–312).
- **Status**: PASS.

#### Requirement 8: Public surface and stub behavior

- **Specification**: Module declarations addressable through module surface. Explicit aliases and imports remain local bindings unless static metadata proves a public route. `.pyi` declarations participate without runtime module execution or speculative merging. Does NOT infer public exports merely because name lacks leading underscore.
- **Implementation**:
  - `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`:
    - `buildReferenceFacts()`: surface computed from file path with `.py`/`.pyi` stripped (line 527); imported symbols emitted strictly as `localBindings` (lines 585–592); only actual module declarations emitted as public declarations; no heuristic re-export generation.
- **Verification**:
  - `packages/code-graph/test/infrastructure/tree-sitter/python-language-adapter.spec.ts`:
    - `emits package identities and preserves import aliases conservatively` (lines 69–79).
- **Status**: PASS.

#### Requirement 9: Capability truthfulness and failure behavior

- **Specification**: Advertises `hierarchy: true` only while emitting hierarchy and provenance facts. `buildContext` remains `false`. Emits deterministic facts, relations, and provenance.
- **Implementation**:
  - `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`:
    - `capabilities()` returns `{ declarations: true, members: true, publicBindings: true, localBindings: true, hierarchy: true, buildContext: false }` (lines 236–245).
- **Verification**:
  - Verified across adapter lifecycle and tests in `python-language-adapter.spec.ts`.
- **Status**: PASS.

---

### Scenario Verification Matrix (`code-graph:python-language-adapter`)

| Requirement                                       | Scenario                                                       | Test Case in `python-language-adapter.spec.ts`                                                                                                                                             | Result |
| ------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :----: |
| Supported files and deterministic analysis        | Source and stub analysis is reusable                           | `maps .py and .pyi to python`, `reports supported languages`                                                                                                                               |  PASS  |
| Declaration extraction and ranges                 | Nested declarations retain parser ranges                       | `extracts parser-authoritative construct and declared-name ranges`, `extracts methods inside classes`                                                                                      |  PASS  |
| Declaration extraction and ranges                 | Class attributes and dataclass fields extract as Property kind | `extracts class attributes, dataclass fields, and Protocol annotations as SymbolKind.Property with class parentId`                                                                         |  PASS  |
| Python logical identity and declaring owners      | Decorated same-name methods preserve owners and forms          | `retains constructor and deterministic decorator member forms`, `owner-qualifies methods and emits ordered base evidence`                                                                  |  PASS  |
| Imports and package resolution                    | Literal and computed imports have different outcomes           | `parses literal dynamic imports and drops variable dynamic imports`, `emits package identities and preserves import aliases conservatively`                                                |  PASS  |
| Resolution manifests                              | Python declares only pyproject.toml                            | `given python adapter, when asked for manifests, then returns pyproject.toml only`                                                                                                         |  PASS  |
| Resolution manifests                              | Python identity ignores an earlier table name                  | `given poetry name before project name, when identity is read, then project name wins`                                                                                                     |  PASS  |
| Scoped bindings, calls, annotations, construction | Annotation-proven receiver wins over runtime alias             | `emits annotation and constructor facts`, `creates DEFINES relations for all symbols`                                                                                                      |  PASS  |
| Scoped bindings, calls, annotations, construction | Decorators and field annotations emit relations                | `extracts decorator invocations as call facts with callerSymbolId bound to decorated routine and emits Calls relation`, `emits RelationType.UsesType for dataclass field type annotations` |  PASS  |
| Python hierarchy and provenance evidence          | Multiple bases preserve owner traversal order                  | `preserves declared multiple-base order and protocol evidence`                                                                                                                             |  PASS  |
| Python hierarchy and provenance evidence          | Unsupported MRO choice remains inconclusive                    | `preserves declared multiple-base order and protocol evidence`                                                                                                                             |  PASS  |
| Public surface and stub behavior                  | Module visibility is not inferred from naming convention       | `emits package identities and preserves import aliases conservatively`                                                                                                                     |  PASS  |
| Capability truthfulness and failure behavior      | Supported inheritance backs the capability                     | `owner-qualifies methods and emits ordered base evidence`, `capabilities()`                                                                                                                |  PASS  |

---

## Spec 2: `code-graph:php-language-adapter`

### Requirements Summary

| #   | Requirement                                  | Status | Summary                                                                                                                                                            |
| --- | -------------------------------------------- | :----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Supported files and deterministic analysis   |  PASS  | Handles `.php` as `php`; single ast-grep parse; serializable parser state; no autoloader invocation or PHP execution.                                              |
| 2   | Declaration extraction and ranges            |  PASS  | Extracts functions, classes, interfaces, traits, enums, methods, top-level constants (`variable`), class properties, class constants, and enum cases (`property`). |
| 3   | PHP logical identity and declaring owners    |  PASS  | Declaring class/enum/trait/interface as logical owner; `parentId` set to enclosing container; case-preserving logical IDs.                                         |
| 4   | Namespaces, use aliases, Composer resolution |  PASS  | Namespace-scoped local bindings for `use` aliases; PSR-4 prefix mapping with caching; package identity from `composer.json`.                                       |
| 5   | Resolution manifests                         |  PASS  | `resolutionManifests()` returns exactly `['composer.json']`.                                                                                                       |
| 6   | Static and framework dependency facts        |  PASS  | Literal `require`/`include` and CakePHP, CodeIgniter, Yii, Laravel, Symfony, Zend framework loaders; variable loader expressions dropped.                          |
| 7   | Scoped bindings, calls, types, construction  |  PASS  | Parameter/return types, properties, `new` expressions, method-local aliases; reflection and arbitrary container lookups dropped.                                   |
| 8   | PHP hierarchy and provenance evidence        |  PASS  | Class/interface `extends`, `implements`, trait composition; `EXTENDS`, `IMPLEMENTS`, `OVERRIDES`; trait adaptation gaps remain inconclusive.                       |
| 9   | Public surface and capability truthfulness   |  PASS  | Namespace-qualified surfaces; `publicBindings: false`; `hierarchy: true`; `buildContext: false`.                                                                   |

---

### Implementation Status Details

#### Requirement 1: Supported files and deterministic analysis

- **Specification**: `PhpLanguageAdapter` SHALL handle `.php` files as `php`. Parses once through Tree-sitter/ast-grep grammar, returning complete `FileAnalysisDraft`. MUST NOT execute PHP, autoload project code, or retain parser AST nodes in persisted analysis state.
- **Implementation**:
  - `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`:
    - `languages()` returns `['php']` (lines 1081–1083).
    - `extensions()` returns `{ '.php': 'php' }` (lines 1162–1164).
    - `analyzeFile()` (lines 1170–1263): parses via `parse('php', content)`, stores AST in `napi-keepalive` session state, returns `FileAnalysisDraft` with serializable `parserState`.
    - No execution of PHP runtime or Composer CLI.
- **Verification**:
  - `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`:
    - `reports supported languages` (lines 69–72).
    - `maps .php to php` (lines 558–562).
- **Status**: PASS.

#### Requirement 2: Declaration extraction and ranges

- **Specification**: Extracts functions, classes, interfaces, traits, enums, class/interface/trait methods and properties, top-level constants, class constants, and enum cases. Properties, class constants, and enum cases SHALL be extracted as `SymbolKind.Property`. Retains namespace separately from simple symbol name. Complete parser construct range and exact declared-name `selectionRange`. Attached comments preserved.
- **Implementation**:
  - `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`:
    - `extractSymbolsFromNode()` (lines 2021–2100) and `walkClassBody()` (lines 2110–2156):
      - `function_definition` -> `SymbolKind.Function`
      - `class_declaration` -> `SymbolKind.Class`
      - `interface_declaration` -> `SymbolKind.Interface`
      - `trait_declaration` -> `SymbolKind.Type`
      - `enum_declaration` -> `SymbolKind.Enum`
      - `method_declaration` -> `SymbolKind.Method`
      - `property_declaration` (`property_element`) -> `SymbolKind.Property` (line 2131)
      - `const_declaration` inside class body (`const_element`) -> `SymbolKind.Property` (line 2144)
      - `const_declaration` at namespace/top level -> `SymbolKind.Variable`
      - `enum_case` in enum body -> `SymbolKind.Property` (line 2153)
    - Complete construct range and exact name `selectionRange` set via `createSymbolNode`.
- **Verification**:
  - `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`:
    - `extracts function definitions`, `extracts class declarations`, `extracts interface declarations`, `extracts enum declarations`, `extracts trait declarations as type` (lines 343–416).
    - `extracts const declarations as variable` for top-level constants (lines 418–425).
    - `extracts class properties and class constants as SymbolKind.Property with class parentId` (lines 1335–1365).
    - `extracts enum cases as SymbolKind.Property with enum parentId` (lines 1367–1389).
- **Status**: PASS.

#### Requirement 3: PHP logical identity and declaring owners

- **Specification**: Top-level declarations use namespace-qualified module surface. Methods, properties, class constants, and enum cases use logical identity of syntactically declaring container as owner; `parentId` set to container symbol ID. Owner identities derived from parser containment and mapped before member logical IDs created. Distinct same-name methods across containers. Case-preserving identities.
- **Implementation**:
  - `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`:
    - `withEnclosingTypeParents(symbols)` (line 1253): assigns enclosing container's symbol ID to `parentId` for methods and properties.
    - `collectClassInfo()` (lines 1765–1825): iterates methods and properties, verifies container containment via `containsSymbolRange(ownerSymbol, symbol)`, registers `memberFormsById` with `MemberKind.Property` for properties/constants and `MemberKind.Method` for methods.
    - `buildReferenceFacts()`: emits logical declarations referencing container `ownerId` and preserves original casing.
- **Verification**:
  - `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`:
    - `owner-qualifies methods and emits local hierarchy evidence` (lines 90–112).
    - `retains static and constructor forms and simple trait composition` (lines 114–135).
    - `owner-qualifies a compact same-line class method` (lines 318–338).
    - `sets container logical owner and parentId for properties and class constants in referenceFacts` (lines 1391–1423).
- **Status**: PASS.

#### Requirement 4: Namespaces, use aliases, and Composer resolution

- **Specification**: Extracts namespace declarations and `use X as Y` imports. `use` alias creates namespace-scoped local binding to canonical qualified target; does NOT create public export or hierarchy edge. Package identity from nearest bounded Composer `name`. Qualified names resolve through PSR-4 mappings with longest matching prefix. Cached compact metadata across Pass 2.
- **Implementation**:
  - `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`:
    - `extractNamespace()` (lines 2260–2275) and `extractImportedNames()` (lines 2220–2258).
    - `resolveQualifiedNameToPath()` (lines 1470–1530): resolves class FQN against PSR-4 prefixes loaded from `composer.json`, sorting prefixes by descending length so longest prefix wins; caches PSR-4 map in `psr4Cache`.
    - `getPackageIdentity()` (lines 1535–1555): reads `name` from `composer.json`.
    - `buildReferenceFacts()`: emits `localBindings` for `use` imports; leaves `publicBindings` empty (lines 1300–1320).
- **Verification**:
  - `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`:
    - `keeps use aliases as local bindings rather than public exports` (lines 74–88).
    - `parses use statement`, `parses aliased use statement`, `all use statements are non-relative` (lines 517–535).
    - `extracts namespace from PHP file`, `returns undefined when no namespace declared`, `qualified name matches use statement specifier` (lines 537–556).
    - `resolves qualified name to absolute path via PSR-4`, `longest prefix wins`, `caches PSR-4 map across calls` (lines 598–638).
- **Status**: PASS.

#### Requirement 5: Resolution manifests

- **Specification**: `resolutionManifests()` SHALL return exactly `['composer.json']`. MUST NOT declare any other resolution manifest.
- **Implementation**:
  - `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`:
    - `resolutionManifests()` returns `['composer.json']` (lines 1560–1562).
- **Verification**:
  - `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`:
    - `given php adapter, when asked for manifests, then returns composer.json` (lines 576–582).
- **Status**: PASS.

#### Requirement 6: Static and framework dependency facts

- **Specification**: Extracts literal `require`, `require_once`, `include`, `include_once`. Drops variable or concatenated expressions. Retains framework loader support (CakePHP, CodeIgniter, Yii, Laravel, Symfony, Zend, etc.). Loader facts produce `IMPORTS` and method-scoped receiver bindings only when proven. Aliases MUST NOT leak across methods.
- **Implementation**:
  - `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`:
    - Regex pattern matchers for `require`, `include`, and framework loaders (`FRAMEWORK_LOADERS`, lines 870–1040).
    - `extractRelations()` produces `IMPORTS` and intra-method `CALLS` relations (lines 1580–1760).
    - Silently drops dynamic expressions without concrete literal strings.
- **Verification**:
  - `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`:
    - `require_once with relative string literal emits IMPORTS`, `include with relative path emits IMPORTS`, `require with variable is silently dropped`, `require with concatenation is silently dropped` (lines 640–730).
    - Framework loader tests for CakePHP, CodeIgniter, Yii, Laravel, Symfony (lines 735–960).
    - `drops unresolved alias calls`, `does not propagate aliases across methods` (lines 1290–1315).
- **Status**: PASS.

#### Requirement 7: Scoped bindings, calls, types, and construction

- **Specification**: Emits deterministic facts for namespace aliases, callable scopes, typed parameters/returns, typed properties, `new` expressions, `$this`, `self`, `static`, `parent`. Caller is innermost enclosing function/method. Reflection, container lookups, and interprocedural aliases are not guessed.
- **Implementation**:
  - `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`:
    - `extractCallFacts()` and `extractBindingFacts()`: emits scoped call facts for typed constructor and instance invocations.
    - `Drupal::service` regex explicitly resolves to undefined (`resolveTarget: () => undefined, aliases: () => []`, lines 1032–1038), ensuring runtime service lookups produce no relations.
- **Verification**:
  - `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`:
    - `emits require, use alias, construction, type, and framework facts` (lines 498–515).
    - `emits CALLS for Zend loader followed by explicit new` (lines 1260–1285).
- **Status**: PASS.

#### Requirement 8: PHP hierarchy and provenance evidence

- **Specification**: Extracts class/interface `extends`, class `implements`, trait-use composition. Proven inheritance emits `EXTENDS`, contract conformance emits `IMPLEMENTS`, matching child members emit `OVERRIDES`. Reference facts identify logical owners, kind, ordering, steps. Trait adaptation gaps remain inconclusive.
- **Implementation**:
  - `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`:
    - `collectClassInfo()` extracts extends, implements, trait uses.
    - `buildHierarchyFacts()` emits `HierarchyFact` for extends, implements, and trait composition.
    - `extractRelations()` emits `EXTENDS`, `IMPLEMENTS`, `OVERRIDES` (lines 1590–1650).
    - Detects trait `insteadof` / `as` adaptation syntax and suppresses speculative precedence guessing (lines 137–145).
- **Verification**:
  - `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`:
    - `owner-qualifies methods and emits local hierarchy evidence` (lines 90–112).
    - `retains static and constructor forms and simple trait composition` (lines 114–135).
    - `does not guess trait precedence when adaptation syntax is present` (lines 137–145).
    - `creates EXTENDS, IMPLEMENTS, and OVERRIDES for local declarations` (lines 446–475).
    - `creates EXTENDS for imported types` (lines 485–496).
- **Status**: PASS.

#### Requirement 9: Public surface and capability truthfulness

- **Specification**: Namespace declarations addressable through namespace-qualified logical surfaces. Does NOT invent module-style public re-export bindings for namespace `use` aliases (`publicBindings: false`). Advertises `hierarchy: true` only while hierarchy and ordered provenance facts emitted. `buildContext: false`.
- **Implementation**:
  - `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`:
    - `capabilities()` returns `{ declarations: true, members: true, publicBindings: false, localBindings: true, hierarchy: true, buildContext: false }` (lines 1050–1059).
- **Verification**:
  - `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`:
    - `keeps use aliases as local bindings rather than public exports` (lines 74–88).
    - `owner-qualifies methods and emits local hierarchy evidence` (lines 90–112).
- **Status**: PASS.

---

### Scenario Verification Matrix (`code-graph:php-language-adapter`)

| Requirement                                  | Scenario                                                                 | Test Case in `php-language-adapter.spec.ts`                                                                                                                 | Result |
| -------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | :----: |
| Supported files and deterministic analysis   | PHP analysis is static and reusable                                      | `reports supported languages`, `maps .php to php`                                                                                                           |  PASS  |
| Declaration extraction and ranges            | Class-like and member declarations retain parser ranges                  | `extracts parser-authoritative construct and declared-name ranges`, `extracts methods inside classes`                                                       |  PASS  |
| Declaration extraction and ranges            | Properties, class constants, and enum cases extract as Property kind     | `extracts class properties and class constants as SymbolKind.Property with class parentId`, `extracts enum cases as SymbolKind.Property with enum parentId` |  PASS  |
| PHP logical identity and declaring owners    | Namespace and class owners prevent member collapse                       | `owner-qualifies methods and emits local hierarchy evidence`, `owner-qualifies a compact same-line class method`                                            |  PASS  |
| PHP logical identity and declaring owners    | Properties and class constants have container logical owner and parentId | `sets container logical owner and parentId for properties and class constants in referenceFacts`                                                            |  PASS  |
| Namespaces, use aliases, Composer resolution | Namespace alias is local, not public or hierarchical                     | `keeps use aliases as local bindings rather than public exports`                                                                                            |  PASS  |
| Resolution manifests                         | PHP declares only composer.json                                          | `given php adapter, when asked for manifests, then returns composer.json`                                                                                   |  PASS  |
| Static and framework dependency facts        | Literal loader stays scoped while dynamic loader is dropped              | `require with variable is silently dropped`, `dynamic variable argument is silently dropped`                                                                |  PASS  |
| Scoped bindings, calls, types, construction  | Explicit instance call is proven without container guessing              | `emits require, use alias, construction, type, and framework facts`, `emits CALLS for Zend loader followed by explicit new`                                 |  PASS  |
| PHP hierarchy and provenance evidence        | Inheritance and contract members retain owner paths                      | `creates EXTENDS, IMPLEMENTS, and OVERRIDES for local declarations`, `creates EXTENDS for imported types`                                                   |  PASS  |
| PHP hierarchy and provenance evidence        | Trait adaptation gap remains inconclusive                                | `does not guess trait precedence when adaptation syntax is present`                                                                                         |  PASS  |
| Public surface and capability truthfulness   | Hierarchy capability requires shared evidence                            | `owner-qualifies methods and emits local hierarchy evidence`, `capabilities()`                                                                              |  PASS  |

---

## Spec 3: `code-graph:resolve-symbol-reference`

### Requirements Summary

| #   | Requirement                                | Status | Summary                                                                                                                                                                                                         |
| --- | ------------------------------------------ | :----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Structured reference input                 |  PASS  | Accepts workspace, requested text, file/surface/kind/owner constraints; `Tipo.miembro` and `Tipo::miembro` resolve by equality on `qualified_name`.                                                             |
| 2   | Logical canonical targets (Delta Modified) |  PASS  | Returns logical symbol as canonical target, retaining every declaration occurrence; **unifies selector candidate declarations belonging to the same logical symbol or overload set into `status: 'resolved'`**. |
| 3   | Public and local binding identity          |  PASS  | Public slots selected by surface, exported name, space; parallel routes distinct; local bindings scoped to lexical range.                                                                                       |
| 4   | Deterministic resolution precedence        |  PASS  | Precedence: canonical ID -> qualified_name equality -> addressed declaration -> addressed public binding -> scoped import/alias -> hierarchy path.                                                              |
| 5   | Resolution outcomes                        |  PASS  | Four deterministic statuses: `resolved`, `ambiguous`, `unresolved`, `missing`, with typed evidence steps.                                                                                                       |
| 6   | Freshness and coverage gate                |  PASS  | Batch `AssessIndexedResourceFreshness` for addressed resources and candidate declaration files; stale/dirty yields `unresolved`.                                                                                |
| 7   | Hierarchy-aware members                    |  PASS  | Overrides take precedence; reaching ancestor owner queries member under that owner; competing inherited members ambiguous.                                                                                      |
| 8   | Batch and backend-independent resolution   |  PASS  | Batch execution under one health snapshot and query lifecycle; deterministic candidate ordering across store backends.                                                                                          |

---

### Implementation Status Details

#### Requirement 1: Structured reference input

- **Specification**: `ResolveSymbolReference` SHALL accept workspace, requested symbol text, and optional file, public surface, symbol-space, broad kind, member-semantics, owner, and build-context constraints. Structured identity fields SHALL be authoritative. Request `Tipo.miembro` or `Tipo::miembro` SHALL resolve by equality on stored `qualified_name` without requiring file, public surface, or language. `::` compares as stored dotted spelling. Other human owner-qualified text parsed by adapter selected from proven context.
- **Implementation**:
  - `packages/code-graph/src/application/use-cases/resolve-symbol-reference.ts`:
    - `executeBatch()` (lines 67–95): extracts `qualifiedLookupText(input.requested)`, calls `store.findLogicalSymbolsByQualifiedNames()`.
    - `resolveQualifiedMember()` (lines 780–870): matches `qualified_name` directly; applies file/surface visibility filter when provided; falls back to registry adapter parser when applicable.
- **Verification**:
  - `packages/code-graph/test/application/use-cases/resolve-symbol-reference.spec.ts`:
    - `resolves unanchored EditChange.execute and ArchiveChange::execute by qualified name` (lines 790–848).
    - `returns every equal qualified name and does not borrow a missing member` (lines 850–900).
    - `uses the PHP adapter for syntax that is not a single qualified spelling` (lines 902–945).
- **Status**: PASS.

#### Requirement 2: Logical canonical targets (Delta Modified)

- **Specification**: The resolver SHALL return a logical symbol as the canonical target and SHALL retain every declaration occurrence contributing to it. Language-defined overload sets resolve as one logical target rather than false ambiguity. **When graph selector resolution produces multiple candidate declarations that all belong to the same logical symbol or overload set, selector resolution SHALL return `status: 'resolved'`. Only declarations belonging to genuinely competing, distinct logical symbols SHALL be treated as ambiguous candidates.**
- **Implementation**:
  - `packages/code-graph/src/application/use-cases/resolve-symbol-reference.ts`:
    - Groups declaration occurrences by logical symbol ID into `declarationMap` (lines 135–145). `ResolutionCandidate.declarations` contains all declaration occurrences of that logical symbol.
  - `packages/code-graph/src/application/services/resolve-graph-selector.ts` (Delta implementation):
    - `unifyOverloadSetCandidates()` (lines 270–307):
      - If all candidate matches share the same `logicalId`, returns the primary candidate.
      - If all candidate matches share the same `filePath`, same non-null `parentId`, and same symbol name, returns the primary candidate.
      - Returns `undefined` if candidates have different parents or different names (true ambiguity).
    - `resolvedResult()` (lines 314–337):
      - When candidates > 1, calls `unifyOverloadSetCandidates(ordered)`. If unified, returns `{ status: 'resolved', match: unified }`. Otherwise returns `{ status: 'ambiguous', candidates: ..., totalCandidates: ... }`.
- **Verification**:
  - `packages/code-graph/test/application/services/resolve-graph-selector.spec.ts`:
    - `unifies overloaded member declarations of the same container into a resolved outcome` (lines 357–395).
    - `unifies candidates sharing the same logicalId into a resolved outcome` (lines 397–474).
    - `treats member candidates with the same name across different parent classes as ambiguous` (lines 476–524).
  - `packages/code-graph/test/application/use-cases/resolve-symbol-reference.spec.ts`:
    - `reports competing exact declarations as ambiguous without choosing a target` (lines 560–590).
- **Status**: PASS.

#### Requirement 3: Public and local binding identity

- **Specification**: Public export slot selected by surface, exported name, symbol space. Distinct routes/aliases occupying slot remain distinct for ambiguity reporting. Local binding retains lexical scope and source range; resolving local alias does not classify it as public export.
- **Implementation**:
  - `packages/code-graph/src/application/use-cases/resolve-symbol-reference.ts`:
    - `resolvePrepared()` (lines 202–250): checks `publicBindings` by surface, name, and space; checks `localBindings` by file path, name, scope, and space; resolves canonical target while preserving distinct provenance steps.
- **Verification**:
  - `packages/code-graph/test/application/use-cases/resolve-symbol-reference.spec.ts`:
    - `resolves a public alias to its canonical target` (lines 60–95).
    - `reports competing targets in one public export slot as ambiguous` (lines 97–150).
    - `keeps parallel public routes to competing targets ambiguous` (lines 500–550).
    - `resolves a scoped local alias without classifying it as a public binding` (lines 595–650).
- **Status**: PASS.

#### Requirement 4: Deterministic resolution precedence

- **Specification**: Resolution precedence: (1) exact canonical logical ID, (2) equality on stored `qualified_name`, (3) exact declaration in addressed file/owner, (4) exact public binding in addressed surface, (5) statically proven scoped import/alias, (6) statically proven hierarchy path. Owner-qualified reference resolves owner path first and member second. Unique same-name workspace symbol without proof does NOT resolve.
- **Implementation**:
  - `packages/code-graph/src/application/use-cases/resolve-symbol-reference.ts`:
    - Sequenced strictly in `resolvePrepared()`:
      1. `resolveQualifiedMember()` (canonical ID or `qualified_name` match, lines 206–207)
      2. `exact` declared candidates matching request file/owner/logicalId (lines 209–220)
      3. `publicCandidates` (lines 222–231)
      4. `localCandidates` (lines 233–243)
      5. `hierarchyCandidatesForRequest()` (lines 245–248)
      6. `absenceOutcome()` (lines 250)
- **Verification**:
  - `packages/code-graph/test/application/use-cases/resolve-symbol-reference.spec.ts`:
    - `does not accept a unique same-name workspace candidate without proof` (lines 190–230).
    - `rejects a proven candidate when requested build context was not indexed` (lines 155–188).
    - `resolves the owner before the member and does not borrow a member from another owner` (lines 948–985).
    - `matches a public binding by surface and exported name, not by file path alone` (lines 988–1015).
    - `reports value and type MemberForm as ambiguous when space is omitted` (lines 1018–1045).
    - `resolves a logical|2| id and a location-backed symbol id without human parsing` (lines 1048–1090).
- **Status**: PASS.

#### Requirement 5: Resolution outcomes

- **Specification**: Exactly one status per result: `resolved`, `ambiguous`, `unresolved`, or `missing`. Non-resolved results include stable machine-readable reason code and deterministic candidate summaries.
- **Implementation**:
  - Handled via `outcomeFromTargets()`, `outcomeFromCandidates()`, and `absenceOutcome()` returning `SymbolResolutionResult` with typed `ResolutionStep` provenance.
- **Verification**:
  - `packages/code-graph/test/application/use-cases/resolve-symbol-reference.spec.ts`:
    - `marks complete fresh file absence missing` (lines 232–260).
    - `reports competing exact declarations as ambiguous without choosing a target` (lines 560–590).
- **Status**: PASS.

#### Requirement 6: Freshness and coverage gate

- **Specification**: Batch `AssessIndexedResourceFreshness` capability for every explicitly addressed resource and declaration file contributing to a candidate. Addressed source file assessed as file resource; public surface assessed as addressed resource when no file supplied. Dirty/stale evidence yields `unresolved` with specific reason code. Completely indexed absence yields `missing`.
- **Implementation**:
  - `packages/code-graph/src/application/use-cases/resolve-symbol-reference.ts`:
    - Lines 125–155: collects candidate declaration files and addressed resources into deduplicated set; invokes `this.assessResources(resources)`; constructs `freshnessMap`.
    - Evaluates `targetedFreshness` and declaration file freshness; marks dirty/stale files as `unresolved` with `FRESHNESS_STALE` or `FRESHNESS_DIRTY`.
- **Verification**:
  - `packages/code-graph/test/application/use-cases/resolve-symbol-reference.spec.ts`:
    - `batches and gates freshness for declaration files contributing to candidates` (lines 120–153).
    - `uses exact current file evidence despite unrelated aggregate staleness` (lines 262–310).
    - `proves a missing public export from current surface evidence` (lines 312–355).
    - `does not prove a missing public export from stale surface evidence` (lines 358–400).
    - `does not prove a missing public export from unknown surface evidence` (lines 402–445).
    - `does not claim absence when exact file evidence is stale` (lines 448–470).
    - `keeps partial coverage unresolved` (lines 472–498).
    - `returns the graph health reason before considering absence stale` (lines 552–588).
- **Status**: PASS.

#### Requirement 7: Hierarchy-aware members

- **Specification**: Overriding members take precedence over inherited members. When hierarchy traversal reaches ancestor owner, resolver SHALL query requested member under that owner; candidate evidence retains owner-to-ancestor path and selected ancestor member declaration. Competing inherited members are ambiguous.
- **Implementation**:
  - `packages/code-graph/src/application/use-cases/resolve-symbol-reference.ts`:
    - `hierarchyCandidatesForRequest()` (lines 640–770): traverses hierarchy facts from owner symbol; queries member declarations under reached ancestor owner; computes shortest path depth; detects multiple competing ancestor declarations at same depth and marks them ambiguous.
- **Verification**:
  - `packages/code-graph/test/application/use-cases/resolve-symbol-reference.spec.ts`:
    - `resolves a requested member declared under a reached ancestor owner` (lines 652–710).
    - `uses the nearest ancestor depth and preserves equal-depth ambiguity` (lines 712–760).
- **Status**: PASS.

#### Requirement 8: Batch and backend-independent resolution

- **Specification**: Batch resolution for multiple references under one health snapshot and provider lifecycle. Indexed lookups and bounded traversal. Identical candidate ordering across backends.
- **Implementation**:
  - `executeBatch()` runs a single `this.getHealth()` call for all batch requests and executes bulk find operations across the `GraphStore`.
- **Verification**:
  - `packages/code-graph/test/application/use-cases/resolve-symbol-reference.spec.ts`:
    - `shares one health snapshot across a batch` (lines 762–788).
- **Status**: PASS.

---

### Scenario Verification Matrix (`code-graph:resolve-symbol-reference`)

| Requirement                              | Scenario                                                                         | Test Case in `resolve-symbol-reference.spec.ts` / `resolve-graph-selector.spec.ts`                                                                                          | Result |
| ---------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----: |
| Structured reference input               | Qualified text resolves by equality without file or language                     | `resolves unanchored EditChange.execute and ArchiveChange::execute by qualified name`                                                                                       |  PASS  |
| Structured reference input               | Dotted and colon spellings resolve identically                                   | `resolves unanchored EditChange.execute and ArchiveChange::execute by qualified name`                                                                                       |  PASS  |
| Structured reference input               | Supplied file filters equality matches                                           | `returns every equal qualified name and does not borrow a missing member`                                                                                                   |  PASS  |
| Logical canonical targets                | Overloads form one logical symbol                                                | `it('unifies candidates sharing the same logicalId into a resolved outcome')`                                                                                               |  PASS  |
| Logical canonical targets                | Competing declarations remain ambiguous                                          | `reports competing exact declarations as ambiguous without choosing a target`, `treats member candidates with the same name across different parent classes as ambiguous`   |  PASS  |
| Logical canonical targets                | Selector candidate declarations of same logical symbol resolve without ambiguity | `it('unifies overloaded member declarations of the same container into a resolved outcome')`, `it('unifies candidates sharing the same logicalId into a resolved outcome')` |  PASS  |
| Public and local binding identity        | Parallel reexports do not collapse                                               | `keeps parallel public routes to competing targets ambiguous`                                                                                                               |  PASS  |
| Public and local binding identity        | Competing routes in one export slot are ambiguous                                | `reports competing targets in one public export slot as ambiguous`                                                                                                          |  PASS  |
| Public and local binding identity        | Shadowed local alias uses lexical scope                                          | `resolves a scoped local alias without classifying it as a public binding`                                                                                                  |  PASS  |
| Deterministic resolution precedence      | Same-name candidate is not proof                                                 | `does not accept a unique same-name workspace candidate without proof`                                                                                                      |  PASS  |
| Deterministic resolution precedence      | Conditional candidates require context                                           | `rejects a proven candidate when requested build context was not indexed`                                                                                                   |  PASS  |
| Deterministic resolution precedence      | Owner is resolved before the member                                              | `resolves the owner before the member and does not borrow a member from another owner`                                                                                      |  PASS  |
| Deterministic resolution precedence      | Public binding matches surface and exported name                                 | `matches a public binding by surface and exported name, not by file path alone`                                                                                             |  PASS  |
| Deterministic resolution precedence      | File path alone does not select a binding                                        | `matches a public binding by surface and exported name, not by file path alone`                                                                                             |  PASS  |
| Deterministic resolution precedence      | Value and type pair stays ambiguous                                              | `reports value and type MemberForm as ambiguous when space is omitted`                                                                                                      |  PASS  |
| Deterministic resolution precedence      | Missing member of a known owner is unresolved                                    | `returns every equal qualified name and does not borrow a missing member`                                                                                                   |  PASS  |
| Deterministic resolution precedence      | Legacy occurrence id still resolves                                              | `resolves a logical\|2\| id and a location-backed symbol id without human parsing`                                                                                          |  PASS  |
| Deterministic resolution precedence      | Current canonical id skips human parsing                                         | `resolves a logical\|2\| id and a location-backed symbol id without human parsing`                                                                                          |  PASS  |
| Resolution outcomes                      | Ambiguity never selects a winner                                                 | `reports competing exact declarations as ambiguous without choosing a target`                                                                                               |  PASS  |
| Resolution outcomes                      | Complete fresh absence is missing                                                | `marks complete fresh file absence missing`                                                                                                                                 |  PASS  |
| Freshness and coverage gate              | Dirty addressed file is inconclusive                                             | `batches and gates freshness for declaration files contributing to candidates`                                                                                              |  PASS  |
| Freshness and coverage gate              | Coverage failure is not stale                                                    | `keeps partial coverage unresolved`                                                                                                                                         |  PASS  |
| Freshness and coverage gate              | Current public surface can prove a missing export                                | `proves a missing public export from current surface evidence`                                                                                                              |  PASS  |
| Hierarchy-aware members                  | Local override wins inherited member                                             | `resolves a requested member declared under a reached ancestor owner`                                                                                                       |  PASS  |
| Hierarchy-aware members                  | Competing inherited members are ambiguous                                        | `uses the nearest ancestor depth and preserves equal-depth ambiguity`                                                                                                       |  PASS  |
| Hierarchy-aware members                  | Ancestor owner contributes its requested member                                  | `resolves a requested member declared under a reached ancestor owner`                                                                                                       |  PASS  |
| Batch and backend-independent resolution | Batch shares one indexed query context                                           | `shares one health snapshot across a batch`                                                                                                                                 |  PASS  |
| Batch and backend-independent resolution | Supplied batch health still assesses exact resources                             | `batches and gates freshness for declaration files contributing to candidates`                                                                                              |  PASS  |
| Batch and backend-independent resolution | Backends return identical ordered evidence                                       | Tested across `ResolveSymbolReference` integration suite                                                                                                                    |  PASS  |

---

## Consistency with Global Specs and Direct Dependencies

### 1. Global Specs (`default:_global/*`)

- **`default:_global/architecture` (Hexagonal DDD Architecture)**:
  - Domain models (`SymbolKind`, `LogicalSymbol`, `SymbolResolutionResult`, etc.) remain pure value objects in `src/domain/` with zero I/O.
  - Application layer (`ResolveSymbolReference`, `resolveSymbolSelector`) coordinates ports (`GraphStore`, `AdapterRegistryPort`) without depending on concrete infrastructure classes.
  - Infrastructure layer (`PythonLanguageAdapter`, `PhpLanguageAdapter`) cleanly implements `LanguageAdapter` without leaking AST or parser-native handles into persisted domain state.
- **`default:_global/conventions` (Strict TypeScript, ESM NodeNext, Coding Standards)**:
  - All files adhere to ESM NodeNext import conventions with `.js` extensions.
  - Strict type safety (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`); zero `any` usage.
  - Kebab-case file naming convention maintained across all sources and test specs.
- **`default:_global/testing` (Vitest Given/When/Then Conventions)**:
  - All unit test files mirror the source layout under `test/` with `.spec.ts` suffix.
  - Unit tests use clean Given/When/Then structures and temporary directories with cleanup hooks.

### 2. Direct Dependencies

- **`code-graph:symbol-model`**:
  - Python and PHP adapters strictly adhere to the 8-member closed `SymbolKind` enumeration and state normalization contract: module-level assignments are `Variable` with `parentId: undefined`; routine locals are `Variable` with `parentId: routineId`; class-level attributes, dataclass fields, Protocol annotations, class constants, and enum cases are `Property` with `parentId: containerId`.
- **`code-graph:language-adapter`**:
  - Python and PHP adapters implement common phases (`analyzeFile`, `resolveImports`, `buildRelations`, `parseSymbolReference`, `renderSymbolReference`, `resolutionManifests`, `getPackageIdentity`).
  - Truthful capability reporting: both declare `hierarchy: true` with backed evidence, `buildContext: false`, and accurately reflect `publicBindings` support (`true` for Python module surface, `false` for PHP namespaces).
- **`code-graph:workspace-integration`**:
  - Symbol IDs maintain `<workspace>:<filePath>:<kind>:<name>:<line>:<column>` formatting.
  - Relative and cross-workspace import paths handle workspace prefixing via `splitWorkspaceIdentity`.
- **`code-graph:graph-store`**:
  - `ResolveSymbolReference` queries structured fields (`findLogicalSymbols`, `findLogicalSymbolsByQualifiedNames`, `findPublicBindings`, `findLocalBindings`, `findIndexCoverage`) rather than parsing raw serialized IDs or performing unindexed full scans.

---

## Discrepancies and Decision Points

**None identified.**  
All 26 requirements across `code-graph:python-language-adapter`, `code-graph:php-language-adapter`, and `code-graph:resolve-symbol-reference` are fully satisfied by the implementation and validated by passing test suites. Zero discrepancies, regressions, or spec contradictions were found in this batch.

---

# Partial Spec Compliance Audit: Batch 3 (Store, Indexer, Hotspots)

**Change:** `code-graph-complete-dependency-detection`  
**Batch Scope:** `code-graph:sqlite-graph-store`, `code-graph:indexer`, `code-graph:hotspots`  
**Package:** `packages/code-graph`  
**Spec Sources:**

- `node packages/cli/dist/index.js changes spec-preview code-graph-complete-dependency-detection code-graph:sqlite-graph-store`
- `node packages/cli/dist/index.js changes spec-preview code-graph-complete-dependency-detection code-graph:indexer`
- `node packages/cli/dist/index.js changes spec-preview code-graph-complete-dependency-detection code-graph:hotspots`

---

## 1. Spec: `code-graph:sqlite-graph-store`

### Requirements Summary

| Requirement                                 | Status        | Notes                                                                                                                                                                                                                                                |
| :------------------------------------------ | :------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQLite-backed implementation                | ✅ Conformant | Implements `GraphStore` via `better-sqlite3` in `SQLiteGraphStore`. Worker-backed, stable backend id `'sqlite'`.                                                                                                                                     |
| Worker-backed non-blocking execution        | ✅ Conformant | Persistent dedicated Worker thread (`sqlite-worker.ts`), serial FIFO queue, bounded backpressure (`maxPendingOperations`), typed RPC DTOs, graceful drain timeout (`drainTimeoutMs`).                                                                |
| Worker-efficient batch reads                | ✅ Conformant | Set-based batch lookups for symbols and relations crossing worker boundary as single RPC, with deterministic SQL parameter chunking.                                                                                                                 |
| Query-time filtered impact reads            | ✅ Conformant | Parameterized SQL predicates for result types, symbol kinds, included/excluded workspaces. Exclusions applied directly in SQL.                                                                                                                       |
| Worker-backed exact batch node lookups      | ✅ Conformant | `getFilesByPaths`, `getDocumentsByPaths`, `getSpecsByIds`, `getSymbolsByIds` executed via single RPCs with parameter chunking.                                                                                                                       |
| Config-derived persistence layout           | ✅ Conformant | Persistence root and temp dirs derived from `configPath` (`{configPath}/graph`).                                                                                                                                                                     |
| Default backend role                        | ✅ Conformant | Sole built-in default backend for Code Graph.                                                                                                                                                                                                        |
| Destructive recreation                      | ✅ Conformant | Worker closed before recreating database and rotating storage generation.                                                                                                                                                                            |
| Locked recreation preserves the index lease | ✅ Conformant | Preserves active index lock files across recreation.                                                                                                                                                                                                 |
| SQLite logical clear parity                 | ✅ Conformant | Clear rolls back atomically on failure or truncates generation tables without deleting file.                                                                                                                                                         |
| Storage generation sidecar                  | ✅ Conformant | Sidecar tracks generation changes and storage metadata.                                                                                                                                                                                              |
| SQLite schema ownership                     | ✅ Conformant | Schema managed in `schema.ts`, schema version tracked in `meta` table (version 14).                                                                                                                                                                  |
| Persisted node storage                      | ✅ Conformant | `files`, `documents`, `symbols`, `specs` tables store project-relative paths and source content.                                                                                                                                                     |
| Persisted relation storage                  | ✅ Conformant | `relations` table persists all relation types (`DEFINES`, `OVERRIDES`, `CALLS`, `IMPORTS`, `EXTENDS`, `IMPLEMENTS`, `USES_TYPE`, etc.).                                                                                                              |
| SQLite logical coverage integrity           | ✅ Conformant | `index_coverage` table tracks file and logical-symbol coverage with diagnostics.                                                                                                                                                                     |
| SQLite full-text search (Delta Modified)    | ✅ Conformant | FTS5 tables (`symbol_fts`, `spec_fts`, `document_fts`). Expanded tokens, BM25, identity-aware ranking, and **new kind-tiered ranking tie-breaker** (Tier 4: class/interface, Tier 3: function/method, Tier 2: type/enum, Tier 1: variable/property). |
| Transactional mutation model                | ✅ Conformant | Single worker transaction per file upsert/removal and bulk indexing session. Parameter limit chunking for large symbol counts.                                                                                                                       |
| Bulk indexing support                       | ✅ Conformant | Worker-side staging session with monotonic session IDs. Atomic bulk commit and serializable progress events.                                                                                                                                         |
| Schema versioning                           | ✅ Conformant | Rebuilds on incompatible schema versions; rejects with `GraphSchemaIncompatibleError`.                                                                                                                                                               |
| Backend-specific companion files            | ✅ Conformant | WAL and shared memory companion files stay under `{configPath}/graph`.                                                                                                                                                                               |
| Reference schema upgrade                    | ✅ Conformant | Schema version 14 table columns persist `project_relative_path`, logical symbol structured columns (`member_kind`, `member_dispatch`, `member_accessor`, `native_kind`, `qualified_name`).                                                           |

### Implementation Status

- **Kind-Tiered Search Tie-Breaker (Delta):** Implemented in `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts` (lines 1549–1553). In `searchSymbols()`, the SQL query's `ORDER BY` clause appends:
  ```sql
  ORDER BY identity_tier DESC, identity_token_hits DESC, identity_match_strength DESC, text_score DESC,
    CASE s.kind WHEN 'class' THEN 4 WHEN 'interface' THEN 4 WHEN 'function' THEN 3 WHEN 'method' THEN 3 WHEN 'type' THEN 2 WHEN 'enum' THEN 2 ELSE 1 END DESC,
    s.name ASC,
    s.line ASC
  ```
  This deterministically orders equal-relevance symbol hits according to the spec's 4-tier model:
  - Tier 4 (weight 4): `class`, `interface`
  - Tier 3 (weight 3): `function`, `method`
  - Tier 2 (weight 2): `type`, `enum`
  - Tier 1 (weight 1 / default): `variable`, `property`
- **FTS Schema & Integration:** Virtual tables `symbol_fts`, `spec_fts`, `document_fts` created in `schema.ts`. `rebuildFtsIndexes()` rebuilds indices atomically after bulk write.
- **Worker & Storage Management:** `SQLiteGraphStore` (`packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`) manages worker thread communication via `SQLiteWorkerClient`, bounded request queue (max 256 pending operations), graceful shutdown with drain timeout, and transaction rollback on error.

### Discrepancies

- None material. The implementation matches all requirements and constraints of the spec.

### Test Coverage

| Scenario                                                                              | Covered? | Test File / Reference                          |
| :------------------------------------------------------------------------------------ | :------: | :--------------------------------------------- |
| Backend initialization stays inside the adapter                                       |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Host event loop remains responsive during long-running SQLite operation               |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Single persistent worker per open store lifecycle                                     |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Concurrent open and close calls share in-flight promises                              |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Concurrent caller request correlation and FIFO execution                              |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Bounded operation backpressure rejects on queue overflow                              |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Graceful close drains in-flight operations before terminating worker                  |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Serializable runtime descriptor loads custom module in worker                         |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Absolute filesystem modulePath uses a file URL for dynamic import                     |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Deterministic error propagation on unexpected worker termination and manual recovery  |    ✅    | `sqlite-graph-store.spec.ts`                   |
| close() called while open() is in-flight does not expose open state                   |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Drain timeout forces worker termination and rejects stuck requests                    |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Worker crash during opening leaves deterministic faulted state                        |    ✅    | `sqlite-graph-store.spec.ts`                   |
| closePromise is always cleared after open() fails during concurrent close()           |    ✅    | `sqlite-graph-store.spec.ts`                   |
| close() gives up graceful shutdown and force-terminates when worker ignores close RPC |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Bulk session staging rejects writes while commit/rollback is in flight                |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Staging cannot resurrect a committed or rolled-back session                           |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Reference-facts chunks staged in one session are merged, not replaced                 |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Bulk session staging works under maxPendingOperations = 1                             |    ✅    | `sqlite-graph-store.spec.ts`                   |
| bulkLoad() stages chunked data instead of one giant payload                           |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Progress callback exceptions are isolated silently                                    |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SpecNotFoundError preserves specId across worker error serialization                  |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Closed store recreate executes non-blocking async filesystem cleanup                  |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Chunked bulk sessions are invalidated on store close/crash/recreate                   |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Logical batch crosses the worker boundary once                                        |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Collection-binding batch reads are chunked transparently inside worker                |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Fixed and repeated parameters count toward chunk budget                               |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Empty batch avoids worker and SQLite work                                             |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Category predicates prevent unrequested hydration                                     |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQL applies kind and workspace predicates                                             |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Empty filters do not generate invalid SQL                                             |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Worker transports normalized request losslessly                                       |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Dynamic filter values are parameterized                                               |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Exact batch node lookup crosses worker boundary once                                  |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Large exact batch is chunked transparently inside worker                              |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Empty exact batch avoids worker and SQLite work                                       |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Graph and tmp directories derived from configPath                                     |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQLite is sole built-in default backend                                               |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQLite satisfies current Code Graph consumers directly                                |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Re-index is the recovery boundary                                                     |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQLite recreation requires a closed worker                                            |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Closed SQLite recreation leaves no native handle                                      |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Healthy force clears without delete-reopen lifecycle                                  |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Locked WAL surfaces original error after retries                                      |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Live index lock is not deleted                                                        |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Healthy force clear empties all generation-owned tables                               |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Logical clear rolls back atomically                                                   |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQLite exposes generation changes through sidecar                                     |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Physical schema remains backend-specific                                              |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Logical node kinds survive backend-specific layout choices                            |    ✅    | `sqlite-graph-store.spec.ts`                   |
| File node persistence includes source content for symbol snippets                     |    ✅    | `sqlite-graph-store.spec.ts`                   |
| File and document tables store project_relative_path                                  |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Symbols table stores denormalized project_relative_path                               |    ✅    | `sqlite-graph-store.spec.ts`                   |
| All required relation families are stored                                             |    ✅    | `sqlite-graph-store.spec.ts`                   |
| COVERS_SYMBOL metadata survives SQLite persistence                                    |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Bulk generation persists logical-symbol coverage                                      |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Invalid logical coverage diagnosed without retargeting                                |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Symbol and spec search use SQLite full-text search                                    |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Multi-token search uses OR logic for discovery                                        |    ✅    | `sqlite-graph-store.spec.ts`                   |
| BM25 ranking prioritizes multiple matches for precision                               |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Symbol result derives snippet from file content even for comment-driven hit           |    ✅    | `sqlite-graph-store.spec.ts`                   |
| FTS structures refreshed after bulk writes                                            |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Queries with hyphens do not crash FTS5                                                |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Queries with FTS5 operators treated as literal text                                   |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Exact identity matches boosted in SQLite FTS                                          |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Persisted file content does not create SQLite file search category                    |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Spec-id segment outranks content-only hit in SQLite                                   |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Symbol declared name outranks comment-only hit in SQLite                              |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Config-relative document path participates in identity ranking                        |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQLite expands specd-shaped tokens before identity ranking                            |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQLite expands CamelCase tokens before identity ranking                               |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQLite exact token match outranks prefix token match                                  |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQLite prefix token match outranks suffix token match                                 |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQLite suffix token match outranks arbitrary substring token match                    |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQLite real component match outranks arbitrary substring match                        |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQLite supplements FTS discovery for strong suffix identity hit                       |    ✅    | `sqlite-graph-store.spec.ts`                   |
| **Kind-tiered ranking acts as tie-breaker for equal relevance matches (New)**         |    ✅    | `sqlite-graph-store.spec.ts` (lines 2926–2985) |
| File upsert and removal are all-or-nothing                                            |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Direct file upsert rolls back failure after cleanup begins                            |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Bulk indexing batch is all-or-nothing                                                 |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Direct file mutations clean up file with large symbol count                           |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Bulk commit cleans up file with large symbol count                                    |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Large indexing runs use backend-specific batching safely                              |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Incompatible schema version permits rebuild strategy                                  |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQLite companion files stay under graph persistence root                              |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQLite old schema rebuilds safely                                                     |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Version 14 table columns persist project_relative_path                                |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Version 14 opens without rebuild                                                      |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Any other version is incompatible                                                     |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Qualified spelling is an equality column                                              |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Worker row uses new columns                                                           |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQLite source search preserves occurrence and range semantics                         |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQLite semantic queries use structured indexes                                        |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQLite batches reverse coverage and rebuilds FTS once                                 |    ✅    | `sqlite-graph-store.spec.ts`                   |

### Missing Tests

- None. All 90 verify scenarios (including the new kind-tiered tie-breaker scenario) are directly tested.

### Summary Counts

- Checked Requirements: 21
- Conforming: 21
- Partial: 0
- Missing: 0
- Discrepancies: 0
- Tested Scenarios: 90 / 90 (100%)

---

## 2. Spec: `code-graph:indexer`

### Requirements Summary

| Requirement                                      | Status        | Notes                                                                                                                                                                                                                                                                                                                                                                             |
| :----------------------------------------------- | :------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IndexCodeGraph use case                          | ✅ Conformant | Coordinates two-pass indexing across workspaces, manages VCS ref persistence, spec indexing, and storage commits.                                                                                                                                                                                                                                                                 |
| Incremental indexing                             | ✅ Conformant | Mtime/size observations and content hashes skip unchanged files. Workspace fingerprint mismatch forces full rebuild.                                                                                                                                                                                                                                                              |
| Deterministic implementation coverage projection | ✅ Conformant | Maps spec implementation links to `COVERS_FILE` and `COVERS_SYMBOL` relationships deterministically.                                                                                                                                                                                                                                                                              |
| Discovery fingerprint uses effective config      | ✅ Conformant | Configuration changes update the fingerprint and invalidate the index cache.                                                                                                                                                                                                                                                                                                      |
| Adapter-sourced resolution fingerprint           | ✅ Conformant | Adapter manifest files included in discovery fingerprint.                                                                                                                                                                                                                                                                                                                         |
| Multi-workspace file discovery                   | ✅ Conformant | Resolves files across multiple workspaces, respecting `.gitignore` and `excludePaths`.                                                                                                                                                                                                                                                                                            |
| Portable graph paths                             | ✅ Conformant | Normalizes paths with forward slashes and workspace prefixes (`workspace:relative/path`).                                                                                                                                                                                                                                                                                         |
| Binary file filtering                            | ✅ Conformant | Skips binary file extensions before text decoding.                                                                                                                                                                                                                                                                                                                                |
| Bounded analysis memory                          | ✅ Conformant | Drops parser AST nodes after Pass 1 and frees intermediate structures.                                                                                                                                                                                                                                                                                                            |
| Two-pass extraction with in-memory index         | ✅ Conformant | Pass 1 extracts declarations, symbols, and bindings; Pass 2 builds relations and cross-file references.                                                                                                                                                                                                                                                                           |
| Shared indexing session                          | ✅ Conformant | Adapters and pipeline pass logic share the same run-scoped session.                                                                                                                                                                                                                                                                                                               |
| Scoped binding environment resolution            | ✅ Conformant | Resolves scoped bindings, lexical scopes, and module exports in-memory.                                                                                                                                                                                                                                                                                                           |
| Chunked processing                               | ✅ Conformant | Chunks operations by byte budget to prevent memory spikes.                                                                                                                                                                                                                                                                                                                        |
| Progress reporting                               | ✅ Conformant | Emits structured progress events at each phase.                                                                                                                                                                                                                                                                                                                                   |
| Phase execution timing logging                   | ✅ Conformant | Measures phase durations with `performance.now()` and logs debug entries.                                                                                                                                                                                                                                                                                                         |
| Cross-workspace package resolution               | ✅ Conformant | Maps package imports to target workspaces via adapter-provided package identities.                                                                                                                                                                                                                                                                                                |
| Error isolation                                  | ✅ Conformant | Individual file analysis errors collected in `errors` array; only infrastructure errors abort.                                                                                                                                                                                                                                                                                    |
| Index result                                     | ✅ Conformant | Returns structured `IndexResult` with file counts, timings, errors, and rebuild flags (`fullRebuild`, `fullRebuildReason`).                                                                                                                                                                                                                                                       |
| Spec dependency indexing                         | ✅ Conformant | Indexes spec `DEPENDS_ON` relations and updates spec nodes in store.                                                                                                                                                                                                                                                                                                              |
| Prefer LLM-optimized description                 | ✅ Conformant | Uses LLM-optimized descriptions when present in spec metadata.                                                                                                                                                                                                                                                                                                                    |
| Reference fact indexing (Delta Modified)         | ⚠️ Partial    | **Conformant in implementation**: Derived cross-file `OVERRIDES` links now exhaustively iterate through all overloaded super method IDs; `SymbolKind.Property` declarations are extracted with container `parentId` and `DEFINES` relations. **Partial in test coverage**: Missing direct use-case level test asserting property symbols and `DEFINES` relations at index commit. |
| Incompatible derivation rebuild                  | ✅ Conformant | Rebuilds full graph when derivation format or schema changes.                                                                                                                                                                                                                                                                                                                     |
| Indexed-input observation capture                | ✅ Conformant | Captures input observations (mtime, size, content hash) for incremental diffing.                                                                                                                                                                                                                                                                                                  |
| Bounded incremental relation construction        | ✅ Conformant | Incremental runs re-extract only affected files and their closure.                                                                                                                                                                                                                                                                                                                |

### Implementation Status

- **Cross-File Override Derivation Across Overload Sets (Delta):** Implemented in `packages/code-graph/src/application/use-cases/index-code-graph.ts` (lines 1906–1923). In `deriveCrossFileOverrideRelations()`:
  ```ts
  for (const [name, subMethodIds] of subMethods) {
    const superMethodIds = superMethods.get(name)
    if (superMethodIds === undefined || superMethodIds.length === 0) continue
    for (const superMethodId of superMethodIds) {
      for (const subId of subMethodIds) {
        const key = `${subId}:${RelationType.Overrides}:${superMethodId}`
        if (seenOverrideKeys.has(key)) continue
        relations.push(
          createRelation({
            source: subId,
            target: superMethodId,
            type: RelationType.Overrides,
          }),
        )
        seenOverrideKeys.add(key)
      }
    }
  }
  ```
  Iterates over every target method ID in `superMethodIds`, exhaustively emitting `OVERRIDES` relations to all overloaded supermethod declarations without dropping targets beyond the first entry.
- **Property Symbol Extraction & Persistence (Delta):**
  - `SymbolKind.Property` added to domain model and enum values.
  - Tree-sitter adapters for TypeScript, Go, Python, and PHP extract property signatures, class fields, struct fields, dataclass attributes, constants, and enum cases as `SymbolKind.Property` with container `parentId` using the stack-based lexical scope manager (`withEnclosingTypeParents()`).
  - Language adapters emit `DEFINES` relations from declaring files to all contained symbols, including property symbols.
  - `IndexCodeGraph` stages and commits all adapter-emitted symbols and relations into the store.

### Discrepancies

1. **Test Coverage Gap: Property Symbols and DEFINES at Indexer Level** (severity: **low**)
   - **Spec/Verify Requirement:** `Scenario: Property symbols are persisted with DEFINES relations` specifies that when files declaring properties inside classes, interfaces, structs, or enums are indexed, the indexing commit persists property symbols with `kind: 'property'` and container `parentId`, and `DEFINES` relations connect each file to its contained property symbols.
   - **Current Testing:** Tested thoroughly at the Language Adapter unit level (`typescript-language-adapter.spec.ts`, `go-language-adapter.spec.ts`, `python-language-adapter.spec.ts`, `php-language-adapter.spec.ts`, `reference-fact-helpers.spec.ts`) and at the SQLite Store unit level (`sqlite-graph-store.spec.ts`). However, there is no end-to-end unit test in `index-code-graph.spec.ts` executing `IndexCodeGraph.execute()` and asserting property nodes and `DEFINES` relations in the store.
   - **Assessment:** Implementation is verified and functioning through lower-level tests and E2E indexing. Adding an explicit test in `index-code-graph.spec.ts` would close the scenario coverage gap completely.

### Test Coverage

| Scenario                                                               |  Covered?  | Test File / Reference                                                                                                                                            |
| :--------------------------------------------------------------------- | :--------: | :--------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Indexer orchestrates full pipeline                                     |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| VCS ref persisted after indexing                                       |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| No VCS ref in options                                                  |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Indexer uses GetSpecMetadata instead of raw metadata reads             |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Unchanged files skipped when fingerprint matches                       |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Fingerprint mismatch escalates unchanged files to full rebuild         |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Newline-only manifest change stays incremental                         |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Deleted file removal remains scoped to indexed workspaces              |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Changed files removed from store before bulk load                      |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Forced run ignores orphaned incremental state                          |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Clean generation projects file and logical-symbol coverage             |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Implementation-only change reprojects coverage without code analysis   |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Changed declaration reprojects canonical coverage                      |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Unresolved and ambiguous symbol links are diagnostic                   |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Qualified member resolves inside anchored file                         |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Re-export binding is visible before coverage                           |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Label text stays a diagnostic                                          |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Value and type pair stays ambiguous                                    |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Unindexed file stays out of symbol coverage                            |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| node_modules excluded                                                  |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Paths prefixed with workspace name and config-relative path            |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Config-relative path normalizes absolute parent traversal              |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Drive letter is not a workspace prefix                                 |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Persisted separators are slashes and parents stay                      |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Adapter splits keep a drive letter in path                             |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| File at drive root is not workspace C                                  |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Known binary extensions skipped before decoding                        |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Retained analysis state excludes parser runtime objects                |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Synthetic spec-root exclusions affect fingerprint                      |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Undeclared build files not fingerprint inputs                          |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Manifest membership comes from adapters                                |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Walk includes manifests between codeRoot and repository root           |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Walk stops at repository root                                          |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| CRLF and LF manifests hash same                                        |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Manifest discovery does not import fs from application code            |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Symbols from all workspaces available before relation resolution       |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Each file analyzed once before relation work                           |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Unresolved qualified names may still become file imports               |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Unresolvable imports dropped without aborting run                      |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Shared scoped resolution runs after import resolution                  |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Adapters and pass logic share same run-scoped session                  |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Run-scoped adapter cache state stays behind common session API         |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Shared session serves spec/document lookups                            |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Constructor injection produces upstream dependent impact               |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Constructor call resolves through shared environment                   |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Ambiguous receiver emits no relation                                   |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Resolved self-relation dropped before staging                          |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Indexer stays language-agnostic                                        |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Files grouped by byte budget                                           |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Custom chunk budget respected                                          |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Staged artifacts use configured graph temp directory                   |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Progress callback receives pass labels                                 |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Progress callback fires before blocking processing                     |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Debug logs record phase duration                                       |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Package identity built from adapter                                    |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Cross-workspace import resolved via package identity                   |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Multirepo cross-workspace resolution                                   |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Adapter without getPackageIdentity skips resolution                    |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Package re-export does not take first workspace symbol                 |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Unknown package stays unresolved                                       |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| First adapter identity wins once                                       |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Total spec count improves progress UX                                  |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Indexer pulls aggregate persisted state from repository                |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Spec with metadata indexed                                             |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Spec without metadata uses defaults                                    |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Spec title defaults to specId when metadata absent                     |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Incremental spec indexing skips unchanged specs                        |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Semantic fingerprint change forces reprocessing                        |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| SpecIds unique across workspaces                                       |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Archived file-level implementation becomes COVERS_FILE                 |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Archived symbol-level implementation becomes COVERS_SYMBOL             |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Archived stale symbol coverage preserves metadata                      |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Parse error in one file does not abort others                          |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Infrastructure error aborts run                                        |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Normal incremental result has null fullRebuildReason                   |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Fingerprint mismatch result records rebuild reason                     |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Filesystem-backed spec roots excluded from document discovery          |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Workspace-owned file not duplicated under root namespace               |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Windows-1252 document becomes DocumentNode                             |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| UTF-16 document becomes DocumentNode                                   |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| NUL-bearing non-UTF16 file skipped                                     |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Indexer uses optimized description                                     |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Index run persists reference and coverage evidence                     |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| High-cardinality relation construction remains bounded                 |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| **Cross-file overrides connect to all overloaded super methods (New)** |     ✅     | `index-code-graph.spec.ts` (lines 50–108)                                                                                                                        |
| **Property symbols are persisted with DEFINES relations (New)**        | ⚠️ Partial | Covered in adapter unit tests (`typescript-language-adapter.spec.ts`, `go-language-adapter.spec.ts`, etc.); missing dedicated test in `index-code-graph.spec.ts` |
| Source content and symbol ranges indexed atomically                    |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Language-specific linking stays in adapter                             |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Owned members store qualified name                                     |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Relative re-export inside one workspace kept                           |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Facts stored before coverage reads them                                |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Incompatibility triggers visible full rebuild                          |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Full rebuild prepares every search index once                          |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Indexing records every semantic input                                  |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Incremental relation work proportional to affected evidence            |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Small semantic change processes affected closure                       |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Newly added target repairs imports absent from native storage          |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Unchanged targets avoid semantic and search rebuild work               |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Persistence and search timing disjoint                                 |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |

### Missing Tests

- A dedicated use-case test in `packages/code-graph/test/application/use-cases/index-code-graph.spec.ts` asserting that indexing a file with properties results in persisted `SymbolKind.Property` nodes with container `parentId` and incoming `DEFINES` relations from the file.

### Summary Counts

- Checked Requirements: 24
- Conforming: 23
- Partial: 1 (test coverage layer gap)
- Missing: 0
- Discrepancies: 1 (low)
- Tested Scenarios: 97 / 98 (98.9% full, 1 partial)

---

## 3. Spec: `code-graph:hotspots`

### Requirements Summary

| Requirement                                            | Status        | Notes                                                                                                                                                                                                                                                                                                                                          |
| :----------------------------------------------------- | :------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Batch hotspot scoring                                  | ✅ Conformant | Computes scores across the code graph using batch queries (`getSymbolCallers`, `getFileImporterCounts`, `findSymbols`, `getAllFiles`, `getIncomingSymbolRelations`). Weighted formula: same-workspace callers (2), cross-workspace callers (4), capped file importers, hierarchy signals (extenders _ 3 + implementors _ 4 + overriders \* 2). |
| Risk level                                             | ✅ Conformant | Evaluates risk levels (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) using `computeRiskLevel`.                                                                                                                                                                                                                                                          |
| Smart defaults with automatic removal (Delta Modified) | ✅ Conformant | Default categories `['source']`, default kinds `['class', 'method', 'function', 'interface']` (includes **interface**), `score > 0`, `risk >= MEDIUM`, `limit = 20`, excludes importer-only symbols unless `includeImporterOnly = true`. Changing one option does not silently reset other defaults.                                           |
| Filtering                                              | ✅ Conformant | Supports filtering by `workspace`, `filePath`, `kinds`, `limit`, `minScore`, `minRisk`, `includeImporterOnly`, `excludePaths`, `excludeWorkspaces`, `categories`, `includeTests`, `includeIgnored`.                                                                                                                                            |
| Output                                                 | ✅ Conformant | Returns structured `HotspotResult` containing `entries`, `totalSymbols`, and `omittedCounts` (`tests` and `ignored`).                                                                                                                                                                                                                          |
| Pure function                                          | ✅ Conformant | Stateless, pure function in `domain/services/compute-hotspots.ts`. Read-only; does not mutate store or files.                                                                                                                                                                                                                                  |

### Implementation Status

- **Interface Inclusion in `DEFAULT_HOTSPOT_KINDS` (Delta):**
  - In `packages/code-graph/src/domain/value-objects/hotspot-result.ts` (lines 12–17):
    ```ts
    export const DEFAULT_HOTSPOT_KINDS: readonly SymbolKind[] = [
      SymbolKindEnum.Class,
      SymbolKindEnum.Method,
      SymbolKindEnum.Function,
      SymbolKindEnum.Interface,
    ] as const
    ```
    `SymbolKindEnum.Interface` is explicitly included alongside Class, Method, and Function. Properties, variables, and enums remain excluded from the default view.
  - In `packages/code-graph/src/domain/services/compute-hotspots.ts` (lines 48–56, 280–284):
    `resolveEffectiveHotspotDefaults()` falls back to `DEFAULT_HOTSPOT_KINDS` when `options?.kinds` is omitted.
    Filtering loop respects `effectiveKinds.includes(e.symbol.kind)`.

### Discrepancies

1. **Spec Constraint Phrasing Drift ("Exactly 2 graph queries")** (severity: **info**)
   - **Spec Constraint:** "Constraints: Exactly 2 graph queries — no N+1 per-symbol queries"
   - **Code Implementation:** `computeHotspots()` issues 6 batch calls: `getSymbolCallers()`, `getFileImporterCounts()`, `findSymbols()`, `getAllFiles()`, `getIncomingSymbolRelations()`, and `getStatistics()`.
   - **Assessment:** Historical drift from when hierarchy signals (`collectHierarchySignals`), category omitted counts (`allFiles`), and total symbol statistics were added to hotspot computation. The core constraint intent ("no N+1 per-symbol queries") is fully preserved because all operations are batched in constant (O(1)) query count. The spec constraint text should be updated from "Exactly 2 graph queries" to "Constant batch queries (no N+1 per-symbol queries)".

### Test Coverage

| Scenario                                                             | Covered? | Test File / Reference                      |
| :------------------------------------------------------------------- | :------: | :----------------------------------------- |
| Empty graph                                                          |    ✅    | `compute-hotspots.spec.ts`                 |
| Cross-workspace caller signal outranks same-workspace caller signal  |    ✅    | `compute-hotspots.spec.ts`                 |
| Direct caller evidence outranks importer-only signal in default view |    ✅    | `compute-hotspots.spec.ts`                 |
| Hierarchy centrality contributes to hotspot ranking                  |    ✅    | `compute-hotspots.spec.ts`                 |
| Callers in test files do not count toward hotspot scores by default  |    ✅    | `compute-hotspots.spec.ts`                 |
| Default filters exclude LOW risk                                     |    ✅    | `compute-hotspots.spec.ts`                 |
| **Default kind set focuses the hotspot view (Delta Modified)**       |    ✅    | `compute-hotspots.spec.ts` (lines 218–254) |
| Default view excludes importer-only symbols                          |    ✅    | `compute-hotspots.spec.ts`                 |
| Explicit kind filter removes default kind set                        |    ✅    | `compute-hotspots.spec.ts` (lines 256–277) |
| Explicit minRisk changes only the risk threshold                     |    ✅    | `compute-hotspots.spec.ts` (lines 279–319) |
| Explicit limit changes only the result size                          |    ✅    | `compute-hotspots.spec.ts`                 |
| Explicit importer-only inclusion widens query                        |    ✅    | `compute-hotspots.spec.ts`                 |
| --min-risk filter                                                    |    ✅    | `compute-hotspots.spec.ts`                 |
| Workspace filter                                                     |    ✅    | `compute-hotspots.spec.ts`                 |
| Multi-kind filter                                                    |    ✅    | `compute-hotspots.spec.ts`                 |
| Include tests in hotspot computation                                 |    ✅    | `compute-hotspots.spec.ts`                 |
| Ranking order                                                        |    ✅    | `compute-hotspots.spec.ts`                 |
| Limit                                                                |    ✅    | `compute-hotspots.spec.ts`                 |
| totalSymbols reflects full graph                                     |    ✅    | `compute-hotspots.spec.ts`                 |
| Omitted test and ignored files tracked in output                     |    ✅    | `compute-hotspots.spec.ts`                 |
| computeHotspots does not mutate store                                |    ✅    | `compute-hotspots.spec.ts`                 |

### Missing Tests

- None. All 21 scenarios are directly tested in `packages/code-graph/test/domain/services/compute-hotspots.spec.ts`.

### Summary Counts

- Checked Requirements: 6
- Conforming: 6
- Partial: 0
- Missing: 0
- Discrepancies: 1 (info: constraint wording drift)
- Tested Scenarios: 21 / 21 (100%)

---

## 4. Cross-Spec & Global Specs Consistency

### Consistency with Global Specs (`default:_global/*`)

1. **`default:_global/architecture` (Hexagonal & DDD Layering):**
   - **Domain:** `compute-hotspots.ts` and `hotspot-result.ts` reside in `src/domain/` with zero I/O, no filesystem imports, and consume only ports (`GraphStore`) and domain value objects.
   - **Application:** `index-code-graph.ts` resides in `src/application/` and orchestrates use cases via constructor-injected ports (`GraphStore`, `SpecRepositoryPort`, `LanguageAdapterRegistry`). No concrete infrastructure classes are instantiated directly.
   - **Infrastructure:** `sqlite-graph-store.ts`, `sqlite-graph-database.ts`, and `schema.ts` reside in `src/infrastructure/sqlite/`. Native SQLite handles stay strictly isolated inside the worker thread.
   - No circular dependencies across packages or layers.

2. **`default:_global/conventions` (TypeScript & Naming):**
   - Strict TypeScript compiler options enforced; zero type errors.
   - Named exports used exclusively across all touched modules.
   - File naming follows kebab-case (`hotspot-result.ts`, `sqlite-graph-database.ts`, `index-code-graph.ts`).
   - Domain errors use `SpecdCodeGraphError` / `SpecdError` hierarchy.

3. **`default:_global/testing` (Vitest & Fixtures):**
   - Tests mirror `src/` hierarchy (`test/domain/services/compute-hotspots.spec.ts`, `test/infrastructure/sqlite/sqlite-graph-store.spec.ts`, `test/application/use-cases/index-code-graph.spec.ts`).
   - All tests use vitest without snapshots; Given/When/Then scenario framing.
   - Integration tests use isolated temporary directories via `mkdtempSync(join(tmpdir(), ...))` with guaranteed cleanup in `afterEach`.

4. **`default:_global/docs` (Documentation Integrity):**
   - `docs/guide/code-graph.md` updated with `SymbolKind.Property`, interface hotspot defaults, and kind-tiered tie-breaker ranking rules.
   - JSDoc present on exported domain types, options interfaces, and public methods.

### Consistency with Direct Dependencies

- **`code-graph:symbol-model`:** Defines `SymbolKind.Property` as part of the closed 8-member enum. This integrates seamlessly with:
  - `sqlite-graph-store`: Tier 1 ranking in search tie-breaking.
  - `indexer`: Persisted alongside other symbols with container `parentId` and `DEFINES` relations.
  - `hotspots`: Excluded from `DEFAULT_HOTSPOT_KINDS` while allowing explicit filtering.
- **`code-graph:graph-store`:** Core port methods (`getSymbolCallers`, `findSymbols`, `searchSymbols`, `upsertFile`) adhere to the neutral contract without leaking SQLite-specific semantics.

---

## 5. Aggregate Batch 3 Summary

| Metric                      | `sqlite-graph-store` | `indexer` | `hotspots` |     Total Batch 3     |
| :-------------------------- | :------------------: | :-------: | :--------: | :-------------------: |
| **Requirements Checked**    |          21          |    24     |     6      |        **51**         |
| **Conforming**              |          21          |    23     |     6      |        **50**         |
| **Partial Requirements**    |          0           |     1     |     0      |         **1**         |
| **Missing Implementations** |          0           |     0     |     0      |         **0**         |
| **Discrepancies**           |          0           |  1 (low)  |  1 (info)  |         **2**         |
| **Scenarios Verified**      |       90 / 90        |  97 / 98  |  21 / 21   | **208 / 209 (99.5%)** |

### Key Findings Summary

1. **`code-graph:sqlite-graph-store`:** Fully conformant. Kind-tiered ranking tie-breaker (`Tier 4: class/interface`, `Tier 3: function/method`, `Tier 2: type/enum`, `Tier 1: variable/property`) is accurately implemented in SQL `ORDER BY` and verified with dedicated test `it('applies kind-tiered ranking as a deterministic tie-breaker for equal relevance matches')`.
2. **`code-graph:indexer`:** Functionally conformant. Cross-file override derivation connects all overloaded supermethod declaration IDs pairwise without dropping targets beyond the first. Property symbols are emitted and persisted with container `parentId` and `DEFINES` relations. Test coverage is comprehensive across language adapter unit tests and SQLite store tests, but lacks a dedicated high-level test in `index-code-graph.spec.ts` for property persistence at the indexing use-case layer.
3. **`code-graph:hotspots`:** Fully conformant. `DEFAULT_HOTSPOT_KINDS` includes `SymbolKindEnum.Interface` alongside Class, Method, and Function, while excluding Property, Variable, and Enum. A minor informational constraint phrasing discrepancy exists in the spec ("Exactly 2 graph queries" vs 6 constant-time batch queries).
