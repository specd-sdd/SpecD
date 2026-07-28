# Design: Extended JavaScript/TypeScript Symbol Extraction in Code Graph

## Context & Scope

- **Primary Goal**: Extend `TypeScriptLanguageAdapter` in `@specd/code-graph` to extract symbols and relations from structural JavaScript/TypeScript patterns (member/namespace assignments, object literal methods, CommonJS exports, class arrow fields, destructuring, and HOF initializers).
- **Target Specs**: `code-graph:language-adapter`
- **Affected Workspace**: `code-graph` (`packages/code-graph`)
- **Primary Source File**: `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`
- **Primary Test File**: `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`

---

## Architectural Approach

All extensions are contained within `TypeScriptLanguageAdapter` in `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`.

The core domain model (`SymbolNode`, `SymbolKind`, `Relation`, `RelationType`) remains unchanged. The adapter translates all syntactic AST variants into the existing 7 canonical `SymbolKind` values (`function`, `class`, `method`, `variable`, `type`, `interface`, `enum`) and standard `RelationType`s (`defines`, `exports`, `calls`).

```
[Tree-sitter AST Node via @ast-grep/napi]
       │
       ▼
[TypeScriptLanguageAdapter.analyzeFile]
       │
       ├─► assignment_expression ──► processAssignmentExpression()
       ├─► pair (object literal)  ──► processPairNode()
       ├─► field_definition      ──► processFieldDefinition()
       ├─► object_pattern        ──► processDestructuringPattern()
       └─► call_expression (HOF) ──► processHOFCall()
       │
       ▼
[Canonical SymbolNode & Relation] (domain entities)
```

---

## Detailed Component & Algorithm Specifications

### 1. Expansion of `targetKinds` in `analyzeFile()`

In `analyzeFile()` ([typescript-language-adapter.ts:L333-L345](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts#L333-L345)), update the `targetKinds` set to include the new AST node kinds:

```typescript
const targetKinds = new Set([
  'function_declaration',
  'class_declaration',
  'abstract_class_declaration',
  'method_definition',
  'type_alias_declaration',
  'interface_declaration',
  'enum_declaration',
  'lexical_declaration',
  'variable_declaration',
  'export_statement',
  'assignment_expression',
  'field_definition',
  'public_field_definition',
  'pair',
  'property_definition',
])
```

### 2. Method `processAssignmentExpression`

#### Method Signature

```typescript
/**
 * Processes assignment expressions (member assignments, prototype methods, CommonJS exports).
 * @param node - The assignment_expression AST node.
 * @param filePath - Workspace-prefixed source file path.
 * @param addSymbol - Callback to register extracted symbols.
 * @param exportedNames - Set of exported symbol names for the file.
 */
private processAssignmentExpression(
  node: SgNode,
  filePath: string,
  addSymbol: (name: string, kind: SymbolKind, node: SgNode, comment: string | undefined) => void,
  exportedNames: Set<string>,
): void
```

#### Step-by-Step Algorithm

1. Extract `left = node.field('left')` and `right = node.field('right')`. If either is missing, return.
2. Get `rawLeftText = left.text().trim()`.
3. **CommonJS & UMD Export Detection**:
   - Check if `rawLeftText === 'module.exports'` or `rawLeftText.startsWith('module.exports.')` or `rawLeftText.startsWith('exports.')`.
   - If true, compute exported member name:
     - For `exports.foo` or `module.exports.foo`: `exportName = rawLeftText.split('.').pop()!`.
     - Add `exportName` to `exportedNames`.
     - Inspect `right.kind()`:
       - If `function` or `arrow_function`: call `addSymbol(exportName, SymbolKind.Function, node, extractComment(node))`.
       - Else: call `addSymbol(exportName, SymbolKind.Variable, node, extractComment(node))`.
4. **Member / Prototype / Static Method Assignment**:
   - Check if `left.kind() === 'member_expression'`.
   - Inspect `right.kind()`:
     - If `function` or `arrow_function`: call `addSymbol(rawLeftText, SymbolKind.Method, node, extractComment(node))`.
     - If `call_expression` (IIFE) or `object`: call `addSymbol(rawLeftText, SymbolKind.Variable, node, extractComment(node))`.

### 3. Method `processPairNode`

#### Method Signature

```typescript
/**
 * Processes key-value pair nodes in object literals.
 * @param node - The pair or property_definition AST node.
 * @param filePath - Workspace-prefixed source file path.
 * @param addSymbol - Callback to register extracted symbols.
 */
private processPairNode(
  node: SgNode,
  filePath: string,
  addSymbol: (name: string, kind: SymbolKind, node: SgNode, comment: string | undefined) => void,
): void
```

#### Step-by-Step Algorithm

1. Extract `keyNode = node.field('key')` and `valueNode = node.field('value')`. If either is missing, return.
2. Get `keyName = keyNode.text().trim()`. Ignore if `keyName` is empty.
3. Inspect `valueNode.kind()`:
   - If `function`, `arrow_function`, or `generator_function`: call `addSymbol(keyName, SymbolKind.Method, keyNode, extractComment(node))`.
   - If `object` or scalar literal: call `addSymbol(keyName, SymbolKind.Variable, keyNode, extractComment(node))`.

### 4. Method `processFieldDefinition`

#### Method Signature

```typescript
/**
 * Processes class field definitions (e.g. class properties assigned to arrow functions).
 * @param node - The field_definition or public_field_definition AST node.
 * @param filePath - Workspace-prefixed source file path.
 * @param addSymbol - Callback to register extracted symbols.
 */
private processFieldDefinition(
  node: SgNode,
  filePath: string,
  addSymbol: (name: string, kind: SymbolKind, node: SgNode, comment: string | undefined) => void,
): void
```

#### Step-by-Step Algorithm

1. Extract `nameNode = node.field('name')` and `valueNode = node.field('value')`. If `nameNode` is missing, return.
2. Get `fieldName = nameNode.text().trim()`.
3. If `valueNode` exists and (`valueNode.kind() === 'arrow_function'` or `valueNode.kind() === 'function'`):
   - Call `addSymbol(fieldName, SymbolKind.Method, node, extractComment(node))`.
4. Else:
   - Call `addSymbol(fieldName, SymbolKind.Variable, node, extractComment(node))`.

### 5. Enhanced `processVariableDeclaration` (HOF & Destructuring)

#### Method Signature

```typescript
/**
 * Processes variable declarator nodes, handling plain identifiers, HOF initializers, and destructuring patterns.
 * @param child - The variable_declarator AST node.
 * @param filePath - Workspace-prefixed source file path.
 * @param addSymbol - Callback to register extracted symbols.
 */
private processVariableDeclarator(
  child: SgNode,
  filePath: string,
  addSymbol: (name: string, kind: SymbolKind, node: SgNode, comment: string | undefined) => void,
): void
```

#### Step-by-Step Algorithm

1. Extract `nameNode = child.field('name')` and `valueNode = child.field('value')`. If `nameNode` is missing, return.
2. **Destructuring Pattern Check**:
   - If `nameNode.kind() === 'object_pattern'` or `nameNode.kind() === 'array_pattern'`:
     - Collect all descendant nodes of kind `shorthand_property_identifier`, `property_identifier`, or `identifier`.
     - For each identifier node, get `idName = identifier.text().trim()`.
     - Call `addSymbol(idName, SymbolKind.Variable, child, extractComment(child))`.
3. **Identifier Check**:
   - If `nameNode.kind() === 'identifier'`:
     - `name = nameNode.text().trim()`.
     - If `valueNode` exists:
       - If `valueNode.kind() === 'arrow_function'` or `valueNode.kind() === 'function'`: `addSymbol(name, SymbolKind.Function, child, extractComment(child))`.
       - If `valueNode.kind() === 'call_expression'` (HOF wrapper e.g. `memoize(...)`): `addSymbol(name, SymbolKind.Function, child, extractComment(child))`.
       - Else: `addSymbol(name, SymbolKind.Variable, child, extractComment(child))`.

---

## Technical Conversion Matrix

| Category                  | Code Pattern                             | AST Node (Tree-sitter)  | Target AST Kind       | Canonical `SymbolKind` | Symbol Identifier       |
| :------------------------ | :--------------------------------------- | :---------------------- | :-------------------- | :--------------------- | :---------------------- |
| **Member Assignment**     | `Article.prototype.foo = function(){}`   | `assignment_expression` | `member_expression`   | `SymbolKind.Method`    | `Article.prototype.foo` |
| **Namespace Assignment**  | `App.Article = (function(){...})()`      | `assignment_expression` | `member_expression`   | `SymbolKind.Variable`  | `App.Article`           |
| **Object Literal Method** | `{ generateAltHeadlines: function(){} }` | `pair`                  | `property_identifier` | `SymbolKind.Method`    | `generateAltHeadlines`  |
| **Object Literal Data**   | `{ version: "1.0.0" }`                   | `pair`                  | `property_identifier` | `SymbolKind.Variable`  | `version`               |
| **Class Arrow Field**     | `class A { handle = () => {} }`          | `field_definition`      | `property_identifier` | `SymbolKind.Method`    | `handle`                |
| **HOF Initializer**       | `const foo = memoize(...)`               | `variable_declarator`   | `call_expression`     | `SymbolKind.Function`  | `foo`                   |
| **Destructuring**         | `const { foo, bar } = utils`             | `variable_declarator`   | `object_pattern`      | `SymbolKind.Variable`  | Individual `foo`, `bar` |
| **CommonJS Export**       | `exports.foo = function(){}`             | `assignment_expression` | `member_expression`   | `SymbolKind.Function`  | `foo` (+ `EXPORTS`)     |

---

## Native Memory Safety Constraint

To prevent native memory corruption in `@ast-grep/napi` Tree-sitter bindings, all AST traversals in `analyzeFile` MUST retain `sgRoot` in the session's `keepAlive` array ([typescript-language-adapter.ts:L304](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts#L304)):

```typescript
let keepAlive = context.session.getAdapterState<unknown[]>('napi-keepalive')
if (!keepAlive) {
  keepAlive = []
  context.session.setAdapterState('napi-keepalive', keepAlive)
}
keepAlive.push(sgRoot)
```

---

## Testing Plan & Unit Tests

Unit tests in `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts` will verify:

1. `Member assignment to IIFE extracts namespace symbol as variable`
2. `Member assignment to function extracts method symbol with qualified name`
3. `Object literal method is extracted as method symbol`
4. `Class arrow field property is extracted as method symbol`
5. `HOF wrapper initializer extracts function symbol`
6. `Destructuring pattern extracts individual variable symbols`
7. `CommonJS export assignment yields symbol and EXPORTS relation`

---

## Documentation & Conventions

All new private helper methods (`processAssignmentExpression`, `processPairNode`, `processFieldDefinition`, `processVariableDeclarator`) MUST include JSDoc annotations documenting `@param` types and extraction behavior per `default:_global/docs`.
