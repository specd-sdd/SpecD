# Proposal: code-graph-complete-dependency-detection

## Motivation

The `@specd/code-graph` indexing engine and language adapters currently omit fundamental syntactic and semantic constructs across all supported languages (TypeScript, Go, Python, and PHP). Abstract method signatures, interface properties, struct fields, enum members, and class attributes are completely dropped from SQLite indexing, leaving critical architectural ports like `SpecRepository` (16 out of 18 methods missing) and interfaces like `ArtifactMeta` invisible to the code graph.

Furthermore, multiple signatures for a single symbol (overload sets) overwrite each other in parser state, split into disjoint logical symbols, and trigger false `status: 'ambiguous'` errors during selector resolution; Go files emit zero `IMPORTS` or `CALLS` relations; parent-child ownership linking fails to assign `parentId` to properties while suffering from scope bleeding across class boundaries; default hotspot filtering arbitrarily excludes `Interface` despite having scoring weights specifically engineered for interface implementers; and symbol search lacks kind-based ranking, allowing secondary properties to crowd out architectural types.

This change provides a comprehensive, technically rigorous overhaul of language adapter AST extraction, enclosing scope assignment, overload set unification, and dependency detection, while introducing `SymbolKind.Property` with a unified cross-language normalization contract, kind-tiered search ranking, blast radius tracing, and hotspot scoring that incorporates `Interface` into default hotspot ranking.

## Current behaviour

### 1. AST Node Omissions across Language Adapters

#### A. TypeScript (`typescript-language-adapter.ts`)

- **Abstract Methods:** In [`typescript-language-adapter.ts:487–527`](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts#L487-L527), `targetKinds` omits `abstract_method_signature`. In abstract classes such as `SpecRepository` (which declares 18 abstract methods), only `constructor` and `specsPath` were indexed in SQLite because only they contained concrete bodies `{ ... }`. The remaining 16 methods (`resolveFromPath`, `get`, `list`, `save`, `publish`, etc.) were completely discarded.
- **Interface & Abstract Properties:** `property_signature` and `abstract_property_signature` are omitted from `targetKinds`. Properties declared on interfaces (e.g. `ArtifactMeta.filename`, `ArtifactMeta.status`) or abstract classes never enter the `symbols` table.
- **Top-Level & Ambient Function Signatures:** `function_signature` (used for standalone overload declarations and in `.d.ts` definitions) is omitted.
- **Enum Members:** `enum_declaration` extracts only the enum name itself (`Status`). Inner members (`enum_assignment`, `property_identifier`) within the enum body are ignored.
- **Field Classification:** `field_definition` and `public_field_definition` without function initializers are forced into `SymbolKind.Variable` with `requiresOwner: false` in declaration descriptors ([lines 700–709](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts#L700-L709)), detaching them from their declaring class.

#### B. Go (`go-language-adapter.ts`)

- **Struct Fields:** Struct fields (`field_declaration` within `struct_type`) are completely ignored in `collectSymbols`. Fields of Go structs never enter the code graph.
- **Fragile Regex for Method Receivers:** In [`go-language-adapter.ts:697–718`](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts#L697-L718), `collectMethodReceivers` extracts method receivers using a regular expression:
  ```go
  /^func\s*\(\s*(?:[A-Za-z_][A-Za-z0-9_]*\s+)?(\*?)([A-Za-z_][A-Za-z0-9_]*)\s*\)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm
  ```
  This regex scans raw file content and breaks on multiline method signatures or Go generic type parameters (e.g. `func (r *Repo[T]) Save(...)`). It bypasses Tree-sitter's AST rather than inspecting the `receiver` field node.
- **Missing Dependency Relations (GitHub Issue #52 debt):** In [`go-language-adapter.ts:544–600`](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts#L544-L600), `buildRelations` only emits `DEFINES`, `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES`. It never extracts or emits `IMPORTS` (from `import_declaration`) or `CALLS` (from `call_expression`), leaving Go files with zero incoming or outgoing dependency relations in the graph.

#### C. Python (`python-language-adapter.ts`)

- **Class Attributes & Fields:** In `walk()`, variable assignments are only captured when `parent.kind === 'module'`. Class-level assignments, dataclass fields, and Protocol attributes (`expression_statement` / `annotated_assignment` in class `block`) are discarded.
- **Missing Dependencies (GitHub Issue #52 debt):** Calls inside class and method decorators (`@decorator(...)`), dataclass field type references, and dynamic call sites miss relation generation.

#### D. PHP (`php-language-adapter.ts`)

- **Class Body Omissions:** In `walkClassBody`, `const_declaration` and `enum_case` nodes are ignored.
- **Class Properties:** Class properties (`property_declaration`) are mapped to `SymbolKind.Variable` and lack consistent enclosing ownership facts.

---

### 2. Defective `parentId` Assignment and Scope Bleeding

In [`reference-fact-helpers.ts:291–307`](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/infrastructure/tree-sitter/reference-fact-helpers.ts#L291-L307), `withEnclosingTypeParents` contains three critical defects:

1. **Kind Restriction:** It strictly checks `symbol.kind === SymbolKind.Method`. Properties (`SymbolKind.Variable` or `Property`), struct fields, and traits (`Type`) are completely ignored, leaving `parent_id = NULL` in SQLite.
2. **Missing Function-Level Hierarchy:** It only recognizes `Class` and `Interface` as enclosing scopes. If a nested symbol (e.g. an inner function, closure, or local variable) is declared inside a `Function` or `Method`, its `parentId` is never linked to the enclosing routine (`parent_id = NULL`).
3. **Missing Range Boundary Verification:** The loop maintains a scalar `currentOwnerId` without checking whether `symbol.line <= owner.endLine`:
   ```typescript
   for (const symbol of sorted) {
     if (symbol.kind === SymbolKind.Class || symbol.kind === SymbolKind.Interface) {
       currentOwnerId = symbol.id
       continue
     }
     if (symbol.kind === SymbolKind.Method && currentOwnerId !== undefined) {
       parentById.set(symbol.id, currentOwnerId)
     }
   }
   ```
   If a class ends at line 40 and a subsequent top-level function or method appears at line 50, `currentOwnerId` is never cleared and bleeds past the end of the class, falsely assigning the class as parent of unrelated subsequent symbols.

---

### 3. Multiple Signatures & Overload Set Fragmentation

1. **Parser State Overwrite:** In `typescript-language-adapter.ts`, `TsTypeDeclarationInfo.methodsByName` is defined as `Record<string, string>`. When a method declares overloads (e.g. 2 signatures and 1 implementation), each subsequent declaration overwrites earlier entries, retaining only the last ID.
2. **Logical Symbol Splitting:** Signatures (`MemberKind.Signature`) and method bodies (`MemberKind.Method`) split into disjoint `LogicalSymbol`s instead of uniting under one logical symbol with multiple declaration occurrences.
3. **False `ambiguous` in `resolveSymbolSelector`:** In [`resolve-graph-selector.ts:248–265`](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/application/services/resolve-graph-selector.ts#L248-L265), `resolvedResult` flags ambiguity whenever `ordered.length > 1`:
   ```typescript
   if (ordered.length === 1) return { status: 'resolved', match: ordered[0]! }
   return { status: 'ambiguous', candidates: ordered.slice(0, MAX_AMBIGUITY_CANDIDATES), ... }
   ```
   When querying `ClassName.execute` on an overloaded method whose reference resolved uniquely to a single logical symbol target, `resolveReference` maps that target's declarations back to the file. Because there are 3 declarations for the overload set, `ordered.length === 3`, and `resolvedResult` falsely returns `status: 'ambiguous'`.
4. **Single-Element Override Linking:** In [`index-code-graph.ts:1906–1918`](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/application/use-cases/index-code-graph.ts#L1906-L1918):
   ```typescript
   for (const [name, subMethodIds] of subMethods) {
     const superMethodId = superMethods.get(name)?.[0] // <--- Drops all overloads past index 0
     if (superMethodId === undefined) continue
     for (const subId of subMethodIds) {
       relations.push(
         createRelation({ source: subId, target: superMethodId, type: RelationType.Overrides }),
       )
     }
   }
   ```
   If the base class/interface has multiple overload signatures, only the first one (`?.[0]`) receives an `OVERRIDES` edge.

---

### 4. Semantic Limitations of `SymbolKind`, Search Inequity, and Hotspots Inconsistency

1. **`SymbolKind` Vocabulary:** `SymbolKind` is currently a closed enum with 7 values: `function`, `class`, `method`, `variable`, `type`, `interface`, `enum`. Class properties, interface properties, and struct fields are forced to `SymbolKind.Variable`. This causes inability to filter exclusively for properties (`--kind property`) vs module-level global variables (`--kind variable`).
2. **Search Kind Inequity:** In [`sqlite-graph-database.ts:1548`](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts#L1548), symbol search ranks exclusively by:
   ```sql
   ORDER BY identity_tier DESC, identity_token_hits DESC, identity_match_strength DESC, text_score DESC
   ```
   Symbol kind (`s.kind`) is completely unweighted. If a query matches both a class and multiple properties with the same name (e.g. `"Config"` or `"Change"`), all receive `identity_tier = 5`. The tie-breaker is purely BM25 text score. Secondary properties with descriptive comments can easily outrank core classes or interfaces, pushing them below the result limit.
3. **Exclusion of `Interface` from `DEFAULT_HOTSPOT_KINDS`:** In [`hotspot-result.ts:8–12`](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/value-objects/hotspot-result.ts#L8-L12), default hotspot kinds are defined strictly as:
   ```typescript
   export const DEFAULT_HOTSPOT_KINDS: readonly SymbolKind[] = [
     SymbolKindEnum.Class,
     SymbolKindEnum.Method,
     SymbolKindEnum.Function,
   ]
   ```
   Meanwhile, [`compute-hotspots.ts:237`](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/services/compute-hotspots.ts#L237) explicitly scores hierarchy centrality using:
   $$\text{hierarchyWeight} = 3 \cdot \text{extenders} + 4 \cdot \text{implementors} + 2 \cdot \text{overriders}$$
   Because `implementors` connects classes to **interfaces** via `IMPLEMENTS` relations, interfaces are the primary targets of this 4-point multiplier. Yet because `Interface` was missing from `DEFAULT_HOTSPOT_KINDS`, all interfaces (e.g. `GraphStore`, `SpecRepository`, `LanguageAdapter`) were silently discarded from default hotspot results, even if they had dozens of implementors.

---

## Proposed solution

### 1. Cross-Language Normalization Contract for `SymbolKind`

The `SymbolKind` enum represents the closed, language-neutral vocabulary of the code graph. To preserve cross-language compatibility, `SymbolKind` MUST NOT reflect language-specific jargon or idiosyncratic constructs. Every language adapter MUST normalize its syntactic constructs according to the following universal taxonomy:

```
┌─────────────────┬────────────────────────────────────────────────────────────────────────────────────────┐
│ SymbolKind      │ Language-Neutral Architectural Definition                                              │
├─────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
│ function        │ Standalone routine declared at file/module/package scope (or nested routine).          │
│ class           │ Concrete or abstract reference type, struct, or class that can encapsulate state.      │
│ method          │ Routine declared within or bound to a type/class/receiver (callable member).          │
│ variable        │ Standalone or local state/value/constant (at file/module scope or local to a routine). │
│ property        │ State-bearing member, field, attribute, or enum case declared within an enclosing type. │
│ interface       │ Contract or structural protocol defining signatures without concrete implementation.   │
│ enum            │ Distinct set of named constants/variants.                                              │
│ type            │ Type alias, typedef, or auxiliary type definition.                                     │
└─────────────────┴────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Universal Normalization Matrix across Supported Languages

| Language            | `function`                                 | `class`                               | `method`                                                         | `variable`                                  | `property` (NEW)                                    | `interface`                  | `enum`                        | `type`                               |
| :------------------ | :----------------------------------------- | :------------------------------------ | :--------------------------------------------------------------- | :------------------------------------------ | :-------------------------------------------------- | :--------------------------- | :---------------------------- | :----------------------------------- |
| **TypeScript / JS** | `function_declaration`, top-level arrow fn | `class_declaration`, `abstract_class` | `method_definition`, `method_signature`, `abstract_method_sig`   | `const`, `let`, `var` (module or local)     | `property_signature`, class fields, enum members    | `interface_declaration`      | `enum_declaration`            | `type_alias_declaration`             |
| **Go**              | `function_declaration`                     | `struct_type` (in `type_declaration`) | `method_declaration` (with receiver), `method_elem` in interface | `var`, `const` (package or local)           | `field_declaration` in struct                       | `interface_type`             | `const` blocks with `iota`    | `type_declaration` (typedef / alias) |
| **Python**          | Module `def`                               | `class_definition`                    | Class `def`, `@abstractmethod`                                   | Assignments (`NAME = val`, module or local) | Class attributes, dataclass fields, Protocol fields | `typing.Protocol`, `abc.ABC` | `enum.Enum` subclasses        | `TypeAlias`, `NewType`               |
| **PHP**             | Global `function`                          | `class_declaration`                   | `method_declaration`                                             | Variables, constants (global or local)      | `property_declaration`, class `const`, `enum_case`  | `interface_declaration`      | `enum_declaration` (PHP 8.1+) | Class aliases                        |

#### The Variable vs Property Contract & Enclosing Scope Hierarchy:

1. **`Property` (Type/Container Member):**
   - Represents state that belongs to an enclosing **Type** (Class, Interface, Struct, Enum).
   - Its `parentId` is ALWAYS the enclosing type (`parentId = class.id`).
   - Example: `User.name`, `SpecNode.content`, `Status.Active`.
2. **`Variable` (Standalone or Local State):**
   - Represents a variable or constant that is NOT a type member.
   - **At Module/File Scope:** `parentId = undefined` (top-level constant, global configuration).
   - **Inside a Function/Method:** If extracted as a symbol or lexical binding, its `parentId` is the enclosing routine (`parentId = function.id`). It is completely known which function it lives in!
   - **Lexical Scoping (`BindingScope` & `BindingFact`):** In the scoped binding model, every local variable points to its `BindingScope` (`kind: 'function'`), whose `ownerSymbolId` is the enclosing function or method.

---

### 2. Domain Model: First-Class `SymbolKind.Property`

Expand the closed `SymbolKind` enum in [`symbol-kind.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/value-objects/symbol-kind.ts) and [`symbol-model.spec.md`](file:///Users/monki/Documents/Proyectos/specd/specs/code-graph/symbol-model/spec.md):

```typescript
export const SymbolKind = {
  Function: 'function',
  Class: 'class',
  Method: 'method',
  Variable: 'variable',
  Type: 'type',
  Interface: 'interface',
  Enum: 'enum',
  Property: 'property', // <--- Additive 8th kind
} as const
```

- Update `isSymbolKind()`, `InvalidSymbolKindError`, and SQLite schema assertions.
- Re-export from `@specd/sdk`.
- Automatically validate `property` in CLI filter parsers (`parse-graph-kinds.ts`).

---

### 3. AST Grammar Extractions per Language Adapter

#### A. TypeScript / TSX Adapter (`typescript-language-adapter.ts`)

- Expand `targetKinds` to include:
  - `abstract_method_signature`
  - `property_signature`
  - `abstract_property_signature`
  - `function_signature`
  - `enum_assignment`, `property_identifier` (inside `enum_declaration`)
- Extraction switch cases:
  - `abstract_method_signature`: Emit `SymbolKind.Method` with `MemberKind.Signature` (or `MemberKind.Method`).
  - `property_signature` & `abstract_property_signature`: Emit `SymbolKind.Property` with `MemberKind.Property`.
  - `field_definition` / `public_field_definition`: If initialized with a function/arrow expression, emit `SymbolKind.Method`; otherwise emit `SymbolKind.Property` with `MemberKind.Property` and `requiresOwner: true`.
  - `function_signature`: Emit `SymbolKind.Function`.
  - Enum body members: Emit `SymbolKind.Property` with `parentId = enum.id`.
- Update `TsTypeDeclarationInfo`:
  - Replace `methodsByName: Record<string, string>` with `memberIdsByName: Map<string, string[]>`.

#### B. Go Adapter (`go-language-adapter.ts`)

- Struct Fields: In `type_spec` -> `struct_type`, traverse `field_declaration` and emit each `field_identifier` as `SymbolKind.Property` with `parentId = struct.id`.
- AST-based Method Receivers: Replace lines 697–718 regex parsing with AST inspection:
  - Locate `method_declaration` node.
  - Traverse `node.field('receiver')` -> `parameter_list` -> `parameter_declaration`.
  - Resolve the receiver type from `type_identifier`, `pointer_type` wrapping `type_identifier`, or `generic_type` with type parameters (e.g. `Repo[T]`).
- Issue #52 Relations in `buildRelations`:
  - Extract `import_declaration` -> `import_spec` -> resolve target file path -> emit `RelationType.Imports`.
  - Extract `call_expression` -> resolve callee symbol -> emit `RelationType.Calls`.
  - Extract typed parameter and return annotations -> emit `RelationType.UsesType`.

#### C. Python Adapter (`python-language-adapter.ts`)

- Class Attributes: In class `block`, extract top-level `expression_statement` containing `assignment` or `annotated_assignment` where the target is an `identifier`. Emit as `SymbolKind.Property` with `parentId = class.id`.
- Dataclasses & Protocols: Treat dataclass field annotations and `typing.Protocol` member annotations as `SymbolKind.Property`.
- Issue #52 Relations:
  - Extract decorator calls (`@decorator(...)`) -> emit `RelationType.Calls` and `RelationType.UsesType`.
  - Extract field type annotations in dataclasses -> emit `RelationType.UsesType`.

#### D. PHP Adapter (`php-language-adapter.ts`)

- In `walkClassBody`:
  - Extract `property_declaration` -> `property_element` as `SymbolKind.Property` with `parentId = class.id`.
  - Extract `const_declaration` -> `const_element` as `SymbolKind.Property` with `parentId = class.id`.
  - Extract `enum_case` as `SymbolKind.Property` with `parentId = enum.id`.

---

### 4. Boundary-Aware Scope Hierarchy in `withEnclosingTypeParents`

Refactor `withEnclosingTypeParents` in [`reference-fact-helpers.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/infrastructure/tree-sitter/reference-fact-helpers.ts):

- Maintain a stack of active enclosing scopes:
  `{ id: string, kind: SymbolKind, startLine: number, endLine: number }[]`
- Push owners when encountering:
  - Type scopes: `SymbolKind.Class`, `SymbolKind.Interface`, `SymbolKind.Type` (Go structs/interfaces), `SymbolKind.Enum`.
  - Routine scopes: `SymbolKind.Function`, `SymbolKind.Method`.
- For each child symbol in source order:
  - Pop any scopes from the stack whose `endLine < symbol.line`.
  - If the active scope is a Type and child is `Method` or `Property`:
    `parentById.set(symbol.id, activeScope.id)`
  - If the active scope is a Routine and child is a nested `Function`, closure, or local `Variable`:
    `parentById.set(symbol.id, activeScope.id)`
- This completely eliminates scope bleeding, binds type members (`Method`, `Property`) to their enclosing types, and binds nested routines/local symbols (`Function`, `Variable`) to their enclosing function.

---

### 5. Overload Set Unification & Selector Resolution

1. **Logical Symbol Overload Representation:**
   - Multiple declaration occurrences sharing the same canonical reference (`workspace`, `surface`, `space`, `owner`, `name`, `memberSemantics`) unite into a single `LogicalSymbol` where:
     ```typescript
     logicalSymbol.declarations = [declOccurrence1, declOccurrence2, declOccurrence3]
     ```
2. **Selector Resolution (`resolve-graph-selector.ts`):**
   - Update `resolvedResult`: When `matches` produces multiple candidate declarations, check if all candidates belong to the **same logical symbol** (or share the exact same `filePath`, owner, and name).
   - If they represent an overload set of a single logical entity, resolve as `status: 'resolved'`, selecting the primary implementation (or bounded candidate) and exposing all declarations, rather than returning `status: 'ambiguous'`.
3. **Exhaustive Override Linking (`index-code-graph.ts`):**
   - Update `deriveCrossFileOverrideRelations`:
     ```typescript
     for (const [name, subMethodIds] of subMethods) {
       const superMethodIds = superMethods.get(name) ?? []
       for (const superMethodId of superMethodIds) {
         for (const subId of subMethodIds) {
           const key = `${subId}:${RelationType.Overrides}:${superMethodId}`
           if (seenOverrideKeys.has(key)) continue
           relations.push(
             createRelation({ source: subId, target: superMethodId, type: RelationType.Overrides }),
           )
           seenOverrideKeys.add(key)
         }
       }
     }
     ```
     This connects all implementing overloads to all overridden superclass signatures.

---

### 6. Search Ranking Tie-Breaker by Kind Tier

To prevent thousands of newly indexed state properties from overwhelming architectural types in search results, introduce a kind-tier ranking tie-breaker in `SQLiteGraphStore.searchSymbols` ([`sqlite-graph-database.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts#L1548)):

```sql
ORDER BY
  identity_tier DESC,
  CASE s.kind
    WHEN 'class'     THEN 4
    WHEN 'interface' THEN 4
    WHEN 'function'  THEN 3
    WHEN 'method'    THEN 3
    WHEN 'type'      THEN 2
    WHEN 'enum'      THEN 2
    ELSE 1 -- 'variable', 'property'
  END DESC,
  identity_token_hits DESC,
  identity_match_strength DESC,
  text_score DESC
```

**Benefits:**

- On equal identity match tier (`identity_tier`), architectural types (`Class`, `Interface`) and behavioral units (`Function`, `Method`) are prioritized ahead of state members (`Property`, `Variable`).
- A query for `"Config"` reliably surfaces `interface Config` or `class Config` before `property config: Config`.
- Users seeking properties specifically can still filter using `--kind property`.

---

### 7. Kind Filtering Architecture: Search, Impact, and Hotspots Calibration

The three graph inspection workflows interact with symbol kinds according to distinct, principled filtering models:

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Command               │ Kind Filtering Behavior                                                       │
├───────────────────────┼───────────────────────────────────────────────────────────────────────────────┤
│ specd graph search    │ NO filter by default (searches across all kinds).                             │
│                       │ Explicit `--kind <k>` filters SQL result set to exactly those kinds.          │
│                       │ Prioritizes Class/Interface > Function/Method > Type/Enum > Variable/Property.│
├───────────────────────┼───────────────────────────────────────────────────────────────────────────────┤
│ specd graph impact    │ NO filter by default (traverses full blast radius across all kinds).          │
│                       │ Explicit `--kind <k>` restricts the frontier endpoints in SQL traversal.     │
├───────────────────────┼───────────────────────────────────────────────────────────────────────────────┤
│ specd graph hotspots  │ STRICT filter by default: DEFAULT_HOTSPOT_KINDS.                              │
│                       │ Explicit `--kind <k>` fully replaces DEFAULT_HOTSPOT_KINDS.                   │
└───────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Calibration of `DEFAULT_HOTSPOT_KINDS`: Including `Interface`

In [`hotspot-result.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/value-objects/hotspot-result.ts), update `DEFAULT_HOTSPOT_KINDS` from `[Class, Method, Function]` to:

```typescript
export const DEFAULT_HOTSPOT_KINDS: readonly SymbolKind[] = [
  SymbolKindEnum.Class,
  SymbolKindEnum.Method,
  SymbolKindEnum.Function,
  SymbolKindEnum.Interface, // <--- Corrected!
]
```

**Architectural Rationale:**

1. **Consistency with Scoring Weights:** In [`compute-hotspots.ts:237`](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/services/compute-hotspots.ts#L237), the formula explicitly assigns $+4$ points per implementor:
   $$\text{hierarchyWeight} = 3 \cdot \text{extenders} + 4 \cdot \text{implementors} + 2 \cdot \text{overriders}$$
   `implementors` specifically counts incoming `IMPLEMENTS` edges targeting an `Interface`. Excluding `Interface` from default hotspots computed these scores only to discard the contracts at filter time. Adding `Interface` aligns the filter with the scoring formula.
2. **Hexagonal Architecture Alignment:** In hexagonal architecture, core ports are defined as `Interface`s (e.g. `GraphStore`, `SpecRepository`, `LanguageAdapter`). They are structural nexus points that must naturally appear in hotspot analysis.
3. **Property & Variable Isolation:** `Property`, `Variable`, and `Enum` remain **excluded from default hotspots**, ensuring data fields and constants do not clutter architectural analysis.

---

## Specs affected

### New specs

_None._

### Modified specs

- `code-graph:symbol-model`:
  - Add `property` to the closed `SymbolKind` enum string values.
  - Define language-neutral normalization rules for `SymbolKind`: module state $\rightarrow$ `variable`, enclosed member state $\rightarrow$ `property`.
  - Specify `parentId` applicability to methods, properties/fields, and nested routines/variables.
  - Formalize overload sets in `LogicalSymbol`: multiple syntactic declarations sharing canonical reference belong to a single logical symbol with multiple `declarations` occurrences.
  - Depends on (added): none
  - Depends on (removed): none

- `code-graph:language-adapter`:
  - Define language adapter contracts to extract properties, fields, abstract methods, and enum members with accurate `parentId`.
  - Define mandatory normalization across TypeScript, Go, Python, and PHP to the closed `SymbolKind` vocabulary.
  - Specify boundary-aware enclosing scope tracking (`symbol.line <= owner.endLine`) across source order for both types and routines.
  - Specify multi-declaration overload emission rules.
  - Depends on (added): none
  - Depends on (removed): none

- `code-graph:typescript-language-adapter`:
  - Specify extraction of `abstract_method_signature`, `property_signature`, `abstract_property_signature`, `function_signature`, and enum members.
  - Specify normalization of interface properties and class fields to `SymbolKind.Property`.
  - Specify non-overwriting overload collection in `TsTypeDeclarationInfo` (`memberIdsByName: Map<string, string[]>`).
  - Specify field classification: callable arrow fields as `Method`, value fields as `Property`.
  - Depends on (added): none
  - Depends on (removed): none

- `code-graph:go-language-adapter`:
  - Specify struct `field_declaration` extraction normalized to `SymbolKind.Property` with `parentId = struct.id`.
  - Specify AST-based receiver parsing via `node.field('receiver')`, handling pointers and generics (`Repo[T]`), replacing regex.
  - Specify relation emission for `IMPORTS` (from `import_spec`) and `CALLS` (from `call_expression`) to close Issue #52.
  - Depends on (added): none
  - Depends on (removed): none

- `code-graph:python-language-adapter`:
  - Specify class attribute, dataclass field, and Protocol attribute extraction normalized to `SymbolKind.Property` with `parentId = class.id`.
  - Specify relation generation for decorator calls and field types to close Issue #52.
  - Depends on (added): none
  - Depends on (removed): none

- `code-graph:php-language-adapter`:
  - Specify extraction of `const_declaration`, `enum_case`, and `property_declaration` normalized to `SymbolKind.Property` with `parentId` in `walkClassBody`.
  - Depends on (added): none
  - Depends on (removed): none

- `code-graph:resolve-symbol-reference`:
  - Specify overload set resolution in `resolveSymbolSelector` and `resolvedResult`: multiple declaration occurrences of the same logical symbol MUST NOT trigger false `status: 'ambiguous'`.
  - Depends on (added): none
  - Depends on (removed): none

- `code-graph:indexer`:
  - Specify boundary-checked `parentId` assignment in `withEnclosingTypeParents` supporting both type and routine nesting.
  - Specify exhaustive `OVERRIDES` relation linking across all overloads in `deriveCrossFileOverrideRelations`.
  - Depends on (added): none
  - Depends on (removed): none

- `code-graph:hotspots`:
  - Specify updated `DEFAULT_HOTSPOT_KINDS = ['class', 'method', 'function', 'interface']`, ensuring contract-bearing interfaces participate in default hotspot rankings.
  - Specify hierarchy scoring calibration for abstract methods via incoming `OVERRIDES` edges and interfaces via incoming `IMPLEMENTS` edges.
  - Specify explicit exclusion of `property`, `variable`, and `enum` from default hotspot kinds.
  - Depends on (added): none
  - Depends on (removed): none

- `code-graph:sqlite-graph-store`:
  - Specify kind-tiered ranking tie-breaker in `searchSymbols` (`Class`/`Interface` > `Function`/`Method` > `Type`/`Enum` > `Variable`/`Property`), ensuring high-level architectural constructs and callable routines are prioritized over state fields in tie-breaking.
  - Depends on (added): none
  - Depends on (removed): none

---

## Impact

### Affected Code Areas & File Anchors

| Package      | File                                                            | Component / Area                         | Description of Change                                                                                           |
| :----------- | :-------------------------------------------------------------- | :--------------------------------------- | :-------------------------------------------------------------------------------------------------------------- |
| `code-graph` | `src/domain/value-objects/symbol-kind.ts`                       | `SymbolKind` enum                        | Add `Property: 'property'`, update `isSymbolKind`                                                               |
| `code-graph` | `src/domain/value-objects/hotspot-result.ts`                    | `DEFAULT_HOTSPOT_KINDS`                  | Add `SymbolKind.Interface` to default kinds                                                                     |
| `code-graph` | `src/domain/value-objects/logical-symbol.ts`                    | `LogicalSymbol`                          | Formalize multi-declaration overload occurrences                                                                |
| `code-graph` | `src/infrastructure/tree-sitter/reference-fact-helpers.ts`      | `withEnclosingTypeParents`               | Add scope stack, `endLine` check, support `Method`, `Property`, and nested routines                             |
| `code-graph` | `src/infrastructure/tree-sitter/typescript-language-adapter.ts` | AST extraction & `TsTypeDeclarationInfo` | Add `abstract_method_signature`, `property_signature`, enums; fix `memberIdsByName`                             |
| `code-graph` | `src/infrastructure/tree-sitter/go-language-adapter.ts`         | AST receiver & `buildRelations`          | Add struct fields, AST receiver parsing, emit `IMPORTS` and `CALLS` (Issue #52)                                 |
| `code-graph` | `src/infrastructure/tree-sitter/python-language-adapter.ts`     | Class attributes & relations             | Extract class/dataclass properties, decorator calls, field types (Issue #52)                                    |
| `code-graph` | `src/infrastructure/tree-sitter/php-language-adapter.ts`        | `walkClassBody`                          | Extract class constants, enum cases, and properties with `parentId`                                             |
| `code-graph` | `src/application/services/resolve-graph-selector.ts`            | `resolvedResult`                         | Handle multi-declaration overload sets without returning false `ambiguous`                                      |
| `code-graph` | `src/application/use-cases/index-code-graph.ts`                 | `deriveCrossFileOverrideRelations`       | Iterate over all `superMethodIds` instead of dropping past index `0`                                            |
| `code-graph` | `src/domain/services/compute-hotspots.ts`                       | Hotspot scoring                          | Verify interface and abstract method hierarchy score integration; exclude `Property`                            |
| `code-graph` | `src/infrastructure/sqlite/sqlite-graph-database.ts`            | `searchSymbols` SQL                      | Incorporate kind-tier ranking tie-breaker (`class,interface > function,method > type,enum > variable,property`) |
| `sdk`        | `src/index.ts`                                                  | SDK exports                              | Re-export updated `SymbolKind`                                                                                  |
| `cli`        | `src/commands/graph/hotspots.ts`                                | CLI default hotspot kinds                | Include `SymbolKind.Interface` in default kinds                                                                 |
| `cli`        | `src/commands/graph/parse-graph-kinds.ts`                       | CLI kind validation                      | Automatically validate `--kind property`                                                                        |

### Hotspots & Blast Radius Analysis

- **Interfaces in Hotspots:** Architectural contracts like `GraphStore`, `SpecRepository`, and `LanguageAdapter` with multiple implementations across the repository will now legitimately rank as high-impact hotspots by default, rather than disappearing silently.
- **Search Relevance Protection:** Searching for terms like `"config"`, `"status"`, or `"change"` will always place classes and interfaces ahead of data properties and variables on equal name matches.
- **Blast Radius Traversal:** `specd graph impact --symbol "SpecRepository.resolveFromPath"` will now trace all 6 implementing repositories as dependents.
- **Complete Dependency Trees:** Go files, previously disconnected from `IMPORTS` and `CALLS` trees, will now participate in dependency tracing without missing links.

---

## Technical context

1. **Strict Hexagonal Boundaries:** All language parsing stays in infrastructure adapters (`infrastructure/tree-sitter/`). Shared facts are normalized through domain value objects (`SymbolNode`, `LogicalSymbol`, `Relation`). Application services (`ResolveSymbolReference`, `IndexCodeGraph`) consume port interfaces only.
2. **Deterministic SQLite Invariants:**
   - In `symbols` table: `id` remains deterministic `filePath:kind:name:line:col`.
   - In `logical_symbols` table: `id` is the canonical reference.
   - In `logical_declarations` table: each declaration occurrence in an overload set maps its `symbol_id` to the shared `logical_symbol_id`.
3. **AST vs Regex in Go:** Go receiver parsing via Tree-sitter AST nodes `receiver` -> `parameter_declaration` -> `type_identifier` is deterministic, robust against formatting and whitespace variations, and natively supports generic receiver syntax (`Repo[T]`).
4. **Universal Normalization vs Language Leaks:** `SymbolKind` remains clean, portable, and closed. Language-specific constructs (such as Go struct fields, Python dataclass attributes, PHP enum cases, and TS interface properties) all collapse deterministically into `SymbolKind.Property`.
5. **Enclosing Routine Scope:** Variables and nested functions inside routine bodies preserve their enclosing routine identity through `parentId` on `SymbolNode` and `ownerSymbolId` on `BindingScope`.
6. **Harmonized Hotspots Policy:** `DEFAULT_HOTSPOT_KINDS` includes `Interface` alongside `Class`, `Method`, `Function`.
7. **Kind-Tiered Search Ordering:** Incorporates kind-based prioritization in search SQL to prevent property inflation.
8. **Issue #52 Closure:** Resolving missing relations in Go (`IMPORTS`/`CALLS`), Python (decorators/types), and TS (dynamic imports) fulfills all commitments outlined in GitHub Issue #52.
9. **Completely Independent Change:** This change operates strictly within its own boundary and ignores `code-graph-symbol-semantic-context`.

---

## Open questions

_None._ All technical designs, AST node mappings, cross-language normalization rules, routine scope hierarchies, hotspot default kinds, search kind-tiering, overload handling semantics, and scoring formulas have been thoroughly verified and agreed upon.
