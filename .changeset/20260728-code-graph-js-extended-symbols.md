---
'@specd/code-graph': minor
---

20260728 - code-graph-js-extended-symbols: This change extends the TypeScript adapter (TypeScriptLanguageAdapter) in @specd/code-graph to extract symbols and relations from structural patterns in JavaScript/TypeScript (such as member assignments, object literal methods, CommonJS exports, class arrow fields, destructuring, and HOF initializers). By translating these dynamic, expression-based AST forms into standard SymbolKind kinds and RelationType relations, it ensures accurate code graph construction and blast-radius analyses for mixed/legacy projects without model schema changes or native memory regressions.

Specs affected:

- `code-graph:language-adapter`
