# Tasks: code-graph-complete-dependency-detection

## 1. Domain Model: Symbol Kind Property

- [x] 1.1 Add `SymbolKind.Property` literal and update type definitions
      `packages/code-graph/src/domain/value-objects/symbol-kind.ts`: `SymbolKind`, `isSymbolKind`, `SYMBOL_KIND_VALUES` — add property kind to enum and runtime validator
      Approach: Add `Property: 'property'` to the `SymbolKind` object literal; update `SymbolKind` union type and add `'property'` to the `SYMBOL_KIND_VALUES` set.
      (Req: Property Symbol Kind Addition, Cross-Language Property Normalization)
- [x] 1.2 Add unit tests for `SymbolKind.Property`
      `packages/code-graph/test/domain/value-objects/symbol-kind.spec.ts`: describe block for Property kind validation
      Approach: Assert `SymbolKind.Property === 'property'`, `isSymbolKind('property') === true`, and `createSymbolNode({ kind: 'property', ... })` creates a valid node.
      (Req: Property Symbol Kind Addition)

## 2. Infrastructure: Lexical Scope Stack and Scope Popping

- [x] 2.1 Implement stack-based lexical scope manager in reference-fact helpers
      `packages/code-graph/src/infrastructure/tree-sitter/reference-fact-helpers.ts`: `LexicalScopeFrame`, `withEnclosingTypeParents()` — replace flat owner tracker with coordinate-popped scope stack
      Approach: Maintain `scopeStack: LexicalScopeFrame[]` sorted by start position; pop frames when incoming symbol coordinate exceeds `frame.endLine:frame.endColumn`; assign container parentId to methods and properties, and routine parentId to variables and local functions.
      (Req: Stack-Based Scope Management, Lexical Scope Containment)
- [x] 2.2 Add unit tests for scope stack popping and boundary containment
      `packages/code-graph/test/infrastructure/tree-sitter/reference-fact-helpers.spec.ts`: describe block for `withEnclosingTypeParents`
      Approach: Assert that subsequent top-level functions following a class do not inherit the class's `parentId`, nested routines assign local variable parents correctly, and properties receive container parent IDs.
      (Req: Stack-Based Scope Management, Lexical Scope Containment)

## 3. Infrastructure: TypeScript Language Adapter

- [x] 3.1 Extract interface and class properties as `SymbolKind.Property`
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `extractSymbols()` — parse property signatures, field definitions, and enum members
      Approach: Inspect `property_signature`, `property_definition`, `public_field_definition`, and enum members in the AST, assigning `SymbolKind.Property` with container `parentId`.
      (Req: Property Symbol Extraction)
- [x] 3.2 Update `TsTypeDeclarationInfo` to retain overload sets in `memberIdsByName`
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `TsTypeDeclarationInfo`, `extractTypeDeclarations()` — store array of symbol IDs per member name
      Approach: Replace `methodsByName: Record<string, string>` with `memberIdsByName: Record<string, string[]>`, pushing each overload occurrence into the array rather than overwriting.
      (Req: Overload Set Preservation)
- [x] 3.3 Emit pairwise override relations for all overload signatures
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `addOverrideRelations()` — link all submethods to all matching supermethod overload signatures
      Approach: Iterate over `source.memberIdsByName` and pairwise connect every source method ID to every target method ID in `target.memberIdsByName` with `RelationType.Overrides`.
      (Req: Pairwise Override Relations)
- [x] 3.4 Parse dynamic `import(...)` expressions with string literals
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `extractImports()` — extract dynamic import call expressions
      Approach: Traverse `call_expression` nodes where function identifier is `import` and argument is a literal string, emitting `FileImportFact` with relative flag set appropriately.
      (Req: Dynamic Import Extraction)
- [x] 3.5 Recursively traverse nested call expressions and chained member accesses
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `extractCallSites()` — traverse chained and nested call expressions
      Approach: Recurse into receiver expressions of `call_expression` nodes to ensure nested calls like `a().b().c()` each emit a distinct `CallFact`.
      (Req: Nested Call Discovery)
- [x] 3.6 Add unit tests for TypeScript adapter overload, property, import, and call enhancements
      `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`: describe blocks for overloads, properties, dynamic imports, and nested calls
      Approach: Test classes with overloaded methods, interface properties, `import('./module')` dynamic calls, and chained invocations asserting expected symbols and relations.
      (Req: Overload Set Preservation, Pairwise Override Relations, Property Symbol Extraction, Dynamic Import Extraction, Nested Call Discovery)

## 4. Infrastructure: Go Language Adapter

- [x] 4.1 Extract struct field declarations as `SymbolKind.Property`
      `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`: `extractSymbols()` — parse struct field declarations
      Approach: Traverse `struct_type` field declaration nodes in AST and emit `SymbolNode` instances with `kind: SymbolKind.Property` and struct `parentId`.
      (Req: Struct Field Property Normalization)
- [x] 4.2 Replace regex method receiver parser with AST traversal
      `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`: `collectMethodReceivers()` — parse AST receiver parameter list
      Approach: Inspect `method_declaration` node's receiver `parameter_list` in Tree-sitter AST, extracting receiver type identifier and pointer status directly without regex.
      (Req: AST-Based Receiver Resolution)
- [x] 4.3 Emit import and call relations in Go `buildRelations()`
      `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`: `buildRelations()` — generate `RelationType.Imports` and `RelationType.Calls`
      Approach: Map relative and package imports in `analysis.imports` to `RelationType.Imports`; map `analysis.callFacts` to target symbols to emit `RelationType.Calls`.
      (Req: Import and Call Relation Generation)
- [x] 4.4 Add unit tests for Go adapter struct properties, AST receivers, and relations
      `packages/code-graph/test/infrastructure/tree-sitter/go-language-adapter.spec.ts`: describe blocks for struct fields, AST receivers, and relations
      Approach: Test Go code containing multiline method receivers, struct field definitions, package imports, and function calls, verifying emitted symbols and relations.
      (Req: AST-Based Receiver Resolution, Struct Field Property Normalization, Import and Call Relation Generation)

## 5. Infrastructure: Python Language Adapter

- [x] 5.1 Extract class attributes, dataclass fields, and Protocol annotations as `SymbolKind.Property`
      `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`: `extractSymbols()` — parse class-level assignments and annotations
      Approach: Inspect class body assignment nodes, dataclass fields, and Protocol annotations, tagging discovered symbols as `SymbolKind.Property` with class `parentId`.
      (Req: Property Symbol Normalization)
- [x] 5.2 Extract decorator invocations as call facts
      `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`: `extractCallSites()` — process decorator AST nodes
      Approach: Inspect `decorator` nodes and extract callee expressions as `CallFact` instances with `callerSymbolId` bound to the decorated function or class.
      (Req: Decorator Call Fact Extraction)
- [x] 5.3 Emit `RelationType.UsesType` for dataclass field type annotations
      `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`: `buildRelations()` — map dataclass field type annotations
      Approach: Resolve type annotation identifiers on class fields and emit `RelationType.UsesType` from field symbol to referenced type symbol.
      (Req: Type Annotation Relation Generation)
- [x] 5.4 Add unit tests for Python adapter properties, decorators, and type relations
      `packages/code-graph/test/infrastructure/tree-sitter/python-language-adapter.spec.ts`: describe blocks for properties, decorators, and type annotations
      Approach: Test Python dataclasses, decorated routines (`@app.route(...)`), and Protocol classes, asserting proper symbol kinds and emitted relations.
      (Req: Property Symbol Normalization, Decorator Call Fact Extraction, Type Annotation Relation Generation)

## 6. Infrastructure: PHP Language Adapter

- [x] 6.1 Extract class properties, constants, and enum cases as `SymbolKind.Property`
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: `extractSymbols()` — update property and member extraction
      Approach: Map `property_declaration` to `SymbolKind.Property` (replacing `SymbolKind.Variable`); extract class `const` declarations and `enum_case` nodes as `SymbolKind.Property` with container `parentId`.
      (Req: Property Symbol Normalization, Class Constant and Enum Case Extraction)
- [x] 6.2 Add unit tests for PHP adapter properties, constants, and enum cases
      `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`: describe blocks for properties, constants, and enum cases
      Approach: Parse PHP classes with typed properties, class constants, and enums with cases, asserting symbols have kind `property` and valid container `parentId`.
      (Req: Property Symbol Normalization, Class Constant and Enum Case Extraction)

## 7. Application: Selector Resolver Overload Set Unification

- [x] 7.1 Implement overload set candidate unification in selector resolver
      `packages/code-graph/src/application/services/resolve-graph-selector.ts`: `unifyOverloadSetCandidates()`, `resolvedResult()` — unify same-symbol overload candidates
      Approach: When `resolvedResult()` receives multiple matches, test if all matches represent overloads of the same member/container; if so, return `status: 'resolved'` targeting the primary declaration. True multi-symbol conflicts remain `status: 'ambiguous'`.
      (Req: Overload Set Selector Unification, Deterministic Ambiguity Reporting)
- [x] 7.2 Add unit tests for selector overload resolution and ambiguity reporting
      `packages/code-graph/test/application/services/resolve-graph-selector.spec.ts`: describe blocks for overload unification and distinct ambiguity
      Approach: Query an overloaded member selector and assert `status: 'resolved'`; query a truly ambiguous name shared by distinct classes and assert `status: 'ambiguous'` with candidate details.
      (Req: Overload Set Selector Unification, Deterministic Ambiguity Reporting)

## 8. Application: Cross-File Override Derivation in Indexer

- [x] 8.1 Exhaustively link all overload signatures in `deriveCrossFileOverrideRelations`
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: `deriveCrossFileOverrideRelations()` — iterate all entries of `superMethods.get(name)`
      Approach: Replace single index `[0]` lookup with iteration over all supermethod overload IDs, emitting `RelationType.Overrides` for each supermethod signature.
      (Req: Exhaustive Overload Override Linking)
- [x] 8.2 Add unit tests for cross-file override relations with overloaded supermethods
      `packages/code-graph/test/application/use-cases/index-code-graph.spec.ts`: describe block for cross-file override relations
      Approach: Index two files where a child class overrides an overloaded base class method, asserting override relations exist for every base signature.
      (Req: Exhaustive Overload Override Linking)

## 9. Domain & Storage: Hotspots and Search Tie-Breaker Ranking

- [x] 9.1 Include `SymbolKind.Interface` in `DEFAULT_HOTSPOT_KINDS`
      `packages/code-graph/src/domain/value-objects/hotspot-result.ts`: `DEFAULT_HOTSPOT_KINDS` — add Interface to default hotspot kinds
      Approach: Append `SymbolKindEnum.Interface` to `DEFAULT_HOTSPOT_KINDS`, while keeping `Property`, `Variable`, and `Enum` excluded by default.
      (Req: Interface Inclusion in Default Hotspot Kinds, Default Kind Filtering Behavior)
- [x] 9.2 Add unit tests for hotspot default kind filtering
      `packages/code-graph/test/domain/services/compute-hotspots.spec.ts`: describe block for default kind filtering
      Approach: Compute hotspots across a graph containing classes, interfaces, methods, functions, properties, and variables, asserting interfaces are included and properties are excluded by default.
      (Req: Interface Inclusion in Default Hotspot Kinds, Default Kind Filtering Behavior)
- [x] 9.3 Add kind prominence tie-breaker expression to SQLite search query
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`: `searchSymbols()` — append kind weight CASE expression to ORDER BY
      Approach: Append `CASE s.kind WHEN 'class' THEN 4 WHEN 'interface' THEN 4 WHEN 'function' THEN 3 WHEN 'method' THEN 3 WHEN 'type' THEN 2 WHEN 'enum' THEN 2 ELSE 1 END DESC, s.name ASC, s.line ASC` to the search query `ORDER BY` clause.
      (Req: Kind-Tiered Search Tie-Breaker Ranking)
- [x] 9.4 Add unit tests for SQLite symbol search kind-tiered tie-breaking
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`: describe block for search ranking tie-breaker
      Approach: Search for a term that identically matches a class and a variable with the same textual score; assert that the class candidate is ranked ahead of the variable candidate.
      (Req: Kind-Tiered Search Tie-Breaker Ranking)

## 10. Documentation Updates

- [x] 10.1 Update code graph guide with `SymbolKind.Property` and search ranking documentation
      `docs/guide/code-graph.md`: Symbol model, language extraction, and search ranking sections
      Approach: Document `SymbolKind.Property`, cross-language normalization rules, interface hotspot inclusion, and kind-tiered search ranking.
      (Req: Property Symbol Kind Addition, Kind-Tiered Search Tie-Breaker Ranking)
- [x] 10.2 Verify JSDoc documentation across all touched functions and interfaces
      `packages/code-graph/src/`: All touched files
      Approach: Ensure complete, standard JSDoc comments per `default:_global/docs` for all new and modified functions, methods, and interfaces.
      (Req: default:\_global/docs)

## 11. End-to-End Verification

- [x] 11.1 Run full project test suite and type check
      `packages/code-graph/`: Run `pnpm --filter @specd/code-graph test` and `pnpm --filter @specd/code-graph typecheck`
      Approach: Ensure all unit tests pass and TypeScript compiler reports zero errors.
      (Req: Verification Suite)
- [x] 11.2 Re-index codebase and verify CLI search, hotspots, and impact commands
      CLI E2E: Run `node packages/cli/dist/index.js graph index --format toon`, `specd graph search`, `specd graph hotspots`, and `specd graph impact`
      Approach: Verify index rebuild completes cleanly with zero errors, properties appear in search, interfaces appear in hotspots, and overloaded symbols resolve cleanly without ambiguity.
      (Req: Verification Suite)

## 12. Audit Coverage Remediation

- [x] 12.1 Add unit test for circular parentId traversal in scoped binding resolution
      `packages/code-graph/test/domain/services/scoped-binding-environment.spec.ts`: Test cycle detection in scope hierarchy traversal
      Approach: Construct scopes with circular parentId references (`scope-1` -> `scope-2` -> `scope-1`) and assert that candidate resolution detects the cycle, terminates gracefully, and returns undefined without crashing or infinite recursion.
      (Req: Scoped binding model - Cycle Detection)
- [x] 12.2 Add use-case test in `index-code-graph.spec.ts` asserting property symbol persistence and DEFINES relations
      `packages/code-graph/test/application/use-cases/index-code-graph.spec.ts`: Add test for property symbol persistence at indexing commit
      Approach: Run indexing on a test file declaring class properties, interface properties, and enum members; assert that the persisted symbols in graph store include `kind: 'property'`, valid container `parentId`, and `DEFINES` relations from the declaring file.
      (Req: Reference fact indexing - Property symbols persistence)
