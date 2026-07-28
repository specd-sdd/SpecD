# Proposal: code-graph-js-extended-symbols

## Motivation

JavaScript and TypeScript codebases employ a wide variety of structural patterns beyond standard top-level `function` and `class` declarations. In production codebases — particularly legacy web applications, libraries using Module Patterns (IIFE closures), browser namespaces (`App.Article = ...`), object literal definitions, class properties with arrow functions, CommonJS/UMD module exports (`module.exports.foo = ...`), and higher-order function wrappers (`const foo = memoize(...)`) — core code structures are defined using dynamic and expression-based AST forms.

Currently, `@specd/code-graph` fails to extract these symbols or misclassifies their structural roles, causing missing symbol nodes in the code graph, incomplete blast-radius analyses, and broken call relations (`RelationType.Calls` and `RelationType.Exports`).

## Current behaviour

Currently, `TypeScriptLanguageAdapter` in `@specd/code-graph` only inspects a rigid subset of Tree-sitter AST node kinds (`function_declaration`, `class_declaration`, `abstract_class_declaration`, `method_definition`, `type_alias_declaration`, `interface_declaration`, `enum_declaration`, `lexical_declaration`, `variable_declaration`, `export_statement`).

As a direct result, six key structural categories in JavaScript/TypeScript are omitted or corrupted:

### 1. Member & Namespace Assignments (`assignment_expression`)

```javascript
App.Article = (function(){ ... })();
Article.prototype.generateAltHeadlines = function(config, data) { ... };
Article.formatTitle = function(title) { ... };
```

- **Current Issue**: Ignored completely because `assignment_expression` targetting `member_expression` is not traversed. Neither `App.Article` nor `Article.prototype.generateAltHeadlines` are indexed.

### 2. Object Literal Properties & Methods (`pair` / `property_definition`)

```javascript
const Article = {
    generateAltHeadlines: function(config, data) { ... },
    calculateScore: (data) => { ... },
    fetchData(id) { ... }
};
```

- **Current Issue**: Functions inside object literals are parsed as `pair` AST nodes. The adapter only searches for `method_definition` inside `class` declarations, omitting all functions defined in `{ ... }`.

### 3. Class Field Methods (`field_definition` / `public_field_definition`)

```javascript
class ArticleHandler {
    generateAltHeadlines = (config, data) => { ... };
}
```

- **Current Issue**: Tree-sitter parses arrow-function properties inside class bodies as `field_definition` or `public_field_definition`, not `method_definition`. The adapter skips them.

### 4. Higher-Order Functions (HOF) & Wrapped Initializers

```javascript
const generateAltHeadlines = memoize(withAuth(function(config, data) { ... }));
```

- **Current Issue**: `processVariableDeclaration` strictly requires `valueNode` to be a bare `function` or `arrow_function`. When wrapped in a `call_expression` (`memoize(...)`), the variable is discarded.

### 5. Destructuring Assignments (`object_pattern` / `array_pattern`)

```javascript
const { generateAltHeadlines, parseArticle } = articleUtils
```

- **Current Issue**: Reading `nameNode.text()` on an `object_pattern` produces a corrupted raw string symbol name `"{ generateAltHeadlines, parseArticle }"`.

### 6. CommonJS & UMD Module Exports

```javascript
module.exports.generateAltHeadlines = function(config, data) { ... };
exports.generateAltHeadlines = function(config, data) { ... };
```

- **Current Issue**: CommonJS assignments are ignored because only ES6 `export_statement` nodes are processed, resulting in zero `RelationType.Exports` relations.

## Proposed solution

Extend `TypeScriptLanguageAdapter` in `@specd/code-graph` to extract symbols and relations across all six structural JavaScript/TypeScript categories. The solution translates every syntactic AST construct into `@specd/code-graph`'s 7 canonical `SymbolKind`s (`function`, `class`, `method`, `variable`, `type`, `interface`, `enum`) and standard `RelationType`s (`defines`, `exports`, `calls`), maintaining total backward compatibility with existing graph storage and query APIs.

### How Each Category Will Be Extracted & Converted

1. **Member & Namespace Assignments**:
   - Traverse `assignment_expression`. Extract member targets (e.g. `App.Article` as `SymbolKind.Variable` and `App.Article.generateAltHeadlines` or `Article.prototype.generateAltHeadlines` as `SymbolKind.Method`).
2. **Object Literal Methods**:
   - Traverse `object` nodes for child `pair` nodes. Where the value is `function`, `arrow_function`, or ES6 concise method, extract key as `SymbolKind.Method` (with parent qualified context `Article.generateAltHeadlines` when assigned). If value is non-callable scalar, extract key as `SymbolKind.Variable`.
3. **Class Arrow Fields**:
   - Traverse `field_definition` / `public_field_definition` inside class bodies. Extract function-initialized fields as `SymbolKind.Method` (e.g. `ArticleHandler.generateAltHeadlines`).
4. **Higher-Order Functions (HOF)**:
   - Traversal of `variable_declarator` inspects `call_expression` initializers. Extract target variable as `SymbolKind.Function`.
5. **Unrolled Destructuring**:
   - Recursively unroll `object_pattern` and `array_pattern` into separate `SymbolKind.Variable` (or `SymbolKind.Function`) symbols for each identifier (e.g., `generateAltHeadlines` and `parseArticle` individually).
6. **CommonJS & UMD Exports**:
   - Recognize `module.exports.foo` and `exports.foo` as `SymbolKind.Function`/`SymbolKind.Variable` symbols and emit `RelationType.Exports` relations.

## Specs affected

### New specs

- None

### Modified specs

- `code-graph:language-adapter`: Update requirements and scenarios for the JavaScript/TypeScript language adapter to specify extraction, qualified naming, and canonical `SymbolKind` mapping for member assignments, object literal methods, CommonJS exports, class fields, destructuring patterns, and HOF initializers.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- **Affected Package**: `@specd/code-graph` (`packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`).
- **Impacted Subsystems**: Indexer (`analyzeFile`), symbol search (`findSymbolsByName`), call graph analysis (`extractCallFactsFromData`, `RelationType.Calls`, `RelationType.Exports`).
- **Performance & Native Safety**: Retains the native Tree-sitter `SgRoot` session keep-alive mechanism to prevent GC finalizer double-free SIGSEGV crashes in `@ast-grep/napi`.

## Technical context

Conversion matrix mapping Tree-sitter AST constructs to canonical `SymbolKind`s with explicit generic code examples:

| Category                          | Code Example                             | AST Node (Tree-sitter)                                 | Canonical `SymbolKind` | Symbol Identity / Qualified Name                           |
| :-------------------------------- | :--------------------------------------- | :----------------------------------------------------- | :--------------------- | :--------------------------------------------------------- |
| **Member Assignment (Method)**    | `Article.prototype.foo = function(){}`   | `assignment_expression` (`member_expression`)          | `SymbolKind.Method`    | `Article.prototype.foo`                                    |
| **Member Assignment (Namespace)** | `App.Article = (function(){...})()`      | `assignment_expression` (`member_expression`)          | `SymbolKind.Variable`  | `App.Article`                                              |
| **Object Literal Method**         | `{ generateAltHeadlines: function(){} }` | `pair` (key: `property_identifier`, value: `function`) | `SymbolKind.Method`    | `generateAltHeadlines` (or `Article.generateAltHeadlines`) |
| **Object Literal Data**           | `{ version: "1.0.0" }`                   | `pair` (key: `property_identifier`, value: `string`)   | `SymbolKind.Variable`  | `version`                                                  |
| **Class Arrow Field**             | `class A { handle = () => {} }`          | `field_definition` (value: `arrow_function`)           | `SymbolKind.Method`    | `A.handle`                                                 |
| **HOF Initializer**               | `const foo = memoize(...)`               | `variable_declarator` (value: `call_expression`)       | `SymbolKind.Function`  | `foo`                                                      |
| **Destructuring**                 | `const { foo, bar } = utils`             | `object_pattern`                                       | `SymbolKind.Variable`  | Individual `foo` and `bar`                                 |
| **CommonJS Export**               | `exports.foo = function(){}`             | `assignment_expression` (`exports.foo`)                | `SymbolKind.Function`  | Symbol `foo` + `RelationType.Exports`                      |

No domain model schema changes are required; all updates are contained within the `TypeScriptLanguageAdapter` AST traversal and mapping layer.

## Open questions

- None — All syntax mapping rules and AST node conversions have been aligned and agreed upon.
