# Tasks: code-graph-js-extended-symbols

## 1. Adapter Implementation (Symbol & Relation Extraction)

- [x] 1.1 Expand target AST node kinds in TypeScript adapter
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `TypeScriptLanguageAdapter.analyzeFile` — add `assignment_expression`, `field_definition`, `public_field_definition`, `pair`, `property_definition` to `targetKinds` set
      Approach: expand `targetKinds` set so Tree-sitter traversal collects member assignments, class fields, and object literal properties
      (Req: TypeScript adapter)

- [x] 1.2 Implement member & namespace assignment extraction
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `processAssignmentExpression` — extract member target names (`App.Article`, `Article.prototype.foo`, `exports.foo`)
      Approach: check if left side is `member_expression`; assign `SymbolKind.Method` for function/arrow values and `SymbolKind.Variable` for IIFE/object targets; add CommonJS exports to `exportedNames` set
      (Req: TypeScript adapter)

- [x] 1.3 Implement object literal method property extraction
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `processPairNode` — extract function properties in object literals as methods
      Approach: traverse `pair` / `property_definition` AST nodes in object literals; check if value is `function`, `arrow_function`, or ES6 concise method, assigning `SymbolKind.Method`
      (Req: TypeScript adapter)

- [x] 1.4 Implement class arrow field property extraction
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `processFieldDefinition` — extract arrow-function class properties as methods
      Approach: traverse `field_definition` and `public_field_definition` AST nodes in class bodies; if value is `arrow_function` or `function`, assign `SymbolKind.Method`
      (Req: TypeScript adapter)

- [x] 1.5 Implement HOF initializer & destructuring unrolling
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `processVariableDeclaration` — handle call_expression initializers and object_pattern destructuring
      Approach: if value is `call_expression` (`memoize(...)`), register variable as `SymbolKind.Function`; if name is `object_pattern` or `array_pattern`, unroll identifier children into separate symbols
      (Req: TypeScript adapter)

## 2. Verification Tests & Documentation

- [x] 2.1 Add unit tests for extended JavaScript symbol extraction
      `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`: test suite — add unit tests for member assignments, object literal methods, class arrow fields, HOF wrappers, destructuring, and CJS exports
      Approach: construct code snippets matching all scenarios in `verify.md` and assert correct `SymbolNode` names, `SymbolKind` values, and `EXPORTS` relations
      (Req: TypeScript adapter)

- [x] 2.2 Add JSDoc documentation to adapter helper methods
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: helper methods — document `@param`, `@returns`, and behavior
      Approach: add JSDoc comments to all newly added private helper methods per `default:_global/docs` conventions
      (Req: TypeScript adapter)
