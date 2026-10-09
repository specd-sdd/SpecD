# Tasks: filter-typescript-array-data-symbols

## 1. Array-record classification

- [x] 1.1 Add callable-boundary node kinds
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `CALLABLE_BOUNDARY_KINDS` — define the immutable Tree-sitter node-kind set that prevents outer array context from leaking into executable bodies.
      Approach: add a module-level `ReadonlySet<string>` containing `arrow_function`, `function`, `function_expression`, `generator_function`, `generator_function_declaration`, and `method_definition`.
      (Req: Object properties in array data records)
- [x] 1.2 Add the array-record ancestry classifier
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `isArrayDataRecordProperty(node: SgNode): boolean` — classify non-callable pair nodes without parsing again or mutating the AST.
      Approach: walk `parent()` with O(1) state; return true at the first `array`, false at the first `variable_declarator` or callable boundary, and false at the root. Add complete JSDoc for parameters, return value, and boundary semantics.
      (Req: Object properties in array data records)
- [x] 1.3 Guard non-callable pair symbol creation
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `TypeScriptLanguageAdapter.processPairNode` — omit scalar/object property symbols classified as anonymous array-record data.
      Approach: preserve the callable-value branch as an unconditional `SymbolKind.Method` path; for `object`, `string`, `number`, and `boolean_literal`, return before `addSymbol` only when `isArrayDataRecordProperty(node)` is true. Keep the method signature, comments, ranges, and all unsupported-value behavior unchanged.
      (Req: Object properties in array data records)

## 2. Preservation and filtering tests

- [x] 2.1 Verify named object properties remain symbols
      `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`: `extractSymbols` tests — protect current named-object scalar behavior.
      Approach: retain the existing object-literal test and assert named scalar properties are `SymbolKind.Variable`.
      (Req: Object properties in array data records; scenario: Named wrapped dictionaries retain scalar properties)
- [x] 2.2 Verify transparent wrappers preserve named dictionaries
      `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`: `extractSymbols` tests — cover parentheses, `<Type>` assertion, `as const`, and `satisfies` declarations.
      Approach: analyze one named declaration per supported wrapper and assert every scalar key remains a variable symbol.
      (Req: Object properties in array data records; scenario: Named wrapped dictionaries retain scalar properties)
- [x] 2.3 Verify direct and nested anonymous record fields are omitted
      `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`: `extractSymbols` tests — cover an array record with scalar fields and nested object fields.
      Approach: analyze `const rows = [{ id: 1, label: 'a', nested: { enabled: true } }]` and assert `id`, `label`, `nested`, and `enabled` are absent.
      (Req: Object properties in array data records; scenario: Direct and nested data-record properties are omitted)
- [x] 2.4 Verify arrays nested in named objects start record paths
      `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`: `extractSymbols` tests — distinguish the named object's own properties from fields beneath its array.
      Approach: analyze a named `config` object with `version` and `rows`; assert `version` remains while the non-callable properties inside `rows` and their nested objects are omitted.
      (Req: Object properties in array data records; scenario: An array boundary inside a named object starts a data-record path)
- [x] 2.5 Verify callable array-record members remain symbols
      `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`: `extractSymbols` tests — cover object-method syntax, arrow functions, function expressions, and generator functions alongside scalar fields.
      Approach: assert each callable member remains `SymbolKind.Method`, scalar fields are absent, and the callable symbols retain their parser-derived construct and selection ranges.
      (Req: Object properties in array data records; scenario: Callable array-record members remain discoverable)
- [x] 2.6 Verify callable bodies stop outer array classification
      `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`: `extractSymbols` tests — prevent record context from suppressing eligible object properties declared inside executable bodies.
      Approach: place a local object literal inside a callable property of an array record and assert the callable and local eligible properties remain while the outer scalar record fields are omitted.
      (Req: Object properties in array data records; scenario: Callable array-record members remain discoverable)
- [x] 2.7 Verify deterministic output and authoritative ranges
      `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`: `extractSymbols` tests — protect output order and range invariants for preserved symbols.
      Approach: analyze the combined fixture twice and compare complete ordered symbol arrays; assert each tested `selectionRange` is contained within the symbol's complete construct range using exact coordinates.
      (Req: Object properties in array data records; scenarios: Direct and nested data-record properties are omitted, Named wrapped dictionaries retain scalar properties, Callable array-record members remain discoverable)
- [x] 2.8 Add a structural high-cardinality regression test
      `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`: `extractSymbols` tests — prove generated array data does not scale symbol count with record-field count.
      Approach: generate source containing at least 1,000 anonymous records plus one named object and callable member; assert record scalar keys contribute zero symbols and result cardinality stays bounded without measuring elapsed time.
      (Req: Object properties in array data records; scenario: Direct and nested data-record properties are omitted)

## 3. Indexing integration and validation

- [x] 3.1 Verify source-content search remains independent of symbol filtering
      `packages/code-graph/test/application/use-cases/index-project-graph-integration.spec.ts`: focused indexing/search test if supported by the existing harness — prove the original file remains content-searchable after record fields are omitted.
      Approach: index a temporary TypeScript file with a unique scalar value in an anonymous record; assert file-content search returns the file and symbol search does not return the filtered field. If the harness has no content-search assertion surface, record that limitation and execute task 3.2 as the required E2E coverage without changing production code.
      (Req: Object properties in array data records; scenario: Direct and nested data-record properties are omitted)
- [x] 3.2 Run manual graph indexing and search verification
      Temporary owned workspace and existing graph CLI — confirm real indexing behavior without adding generated fixtures to the repository.
      Approach: index a file containing a named object, a large anonymous record array, a unique scalar value, and callable members; verify symbol search omits record fields, content search finds the unique value, named/callable symbols remain, and a repeated index produces identical symbol output.
      (Req: Object properties in array data records; all scenarios)
- [x] 3.3 Run focused adapter tests
      `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`: all existing and new extraction tests.
      Approach: run `pnpm --filter @specd/code-graph test -- typescript-language-adapter.spec.ts` and require a zero exit status with no existing regressions.
      (Req: Object properties in array data records; all scenarios)
- [x] 3.4 Run code-graph type checking
      `packages/code-graph`: TypeScript compilation contract.
      Approach: run `pnpm --filter @specd/code-graph typecheck` and require zero errors under strict TypeScript settings.
      (Req: Object properties in array data records)
- [x] 3.5 Run code-graph linting
      `packages/code-graph`: repository conventions and JSDoc contract.
      Approach: run `pnpm --filter @specd/code-graph lint` and require zero violations, including explicit return types, no `any`, and complete JSDoc for the new helper.
      (Req: Object properties in array data records)
- [x] 3.6 Build the code-graph package
      `packages/code-graph`: package build and declaration output.
      Approach: run `pnpm --filter @specd/code-graph build` and require a successful ESM and declaration build without public API changes.
      (Req: Object properties in array data records)
