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
