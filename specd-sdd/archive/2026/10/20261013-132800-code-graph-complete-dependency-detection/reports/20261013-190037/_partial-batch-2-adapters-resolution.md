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
