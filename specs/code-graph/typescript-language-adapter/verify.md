# Verification: TypeScript Language Adapter

## Requirements

### Requirement: Supported languages and deterministic analysis

#### Scenario: One parse produces complete reusable analysis

- **GIVEN** equivalent `.ts`, `.tsx`, `.js`, and `.jsx` inputs
- **WHEN** each file is analyzed twice with equivalent session context
- **THEN** language selection and every persisted fact are deterministic
- **AND** Pass 2 completes without reparsing source or retaining AST nodes in the file draft

### Requirement: Declaration extraction and ranges

#### Scenario: Extended declarations retain authoritative ranges

- **GIVEN** a multiline class with an arrow field, object method, destructuring, and CommonJS assignment
- **WHEN** symbols are extracted
- **THEN** every supported declaration has its expected broad kind
- **AND** each name selection is contained by its parser-derived complete construct range

#### Scenario: Interface properties and class fields extract as Property kind

- **GIVEN** a TypeScript interface with property signatures and a class with field definitions
- **WHEN** symbols are extracted
- **THEN** both the interface property signatures and class fields are assigned `SymbolKind.Property`
- **AND** their `parentId` is set to the enclosing interface or class symbol ID

#### Scenario: Overload signatures unite under one logical symbol

- **GIVEN** a function or method with multiple overload signatures and one implementation declaration
- **WHEN** symbols and logical declarations are extracted
- **THEN** all occurrences unite under a single logical symbol with multiple declaration occurrences

### Requirement: Object properties in array data records

#### Scenario: Direct and nested data-record properties are omitted

- **GIVEN** an array containing an anonymous object with scalar fields and a nested anonymous object with scalar fields
- **WHEN** symbols are extracted twice from equivalent content
- **THEN** neither the direct nor nested scalar fields appear as symbols
- **AND** both analyses produce identical ordered output
- **AND** the complete source text remains available to file-content indexing

#### Scenario: Named wrapped dictionaries retain scalar properties

- **GIVEN** named object declarations wrapped by parentheses, a type assertion, `as const`, and `satisfies`
- **WHEN** symbols are extracted
- **THEN** scalar properties belonging to each named declaration remain symbols
- **AND** each preserved symbol has its declared-name selection range inside its complete construct range

#### Scenario: An array boundary inside a named object starts a data-record path

- **GIVEN** a named object whose property contains an array of anonymous objects with nested scalar fields
- **WHEN** symbols are extracted
- **THEN** the named object's own scalar properties remain symbols
- **AND** non-callable properties below the array boundary are omitted

#### Scenario: Callable array-record members remain discoverable

- **GIVEN** an anonymous array record containing an object method, an arrow-function property, a function-expression property, and scalar data fields
- **WHEN** symbols are extracted
- **THEN** every callable member remains a symbol
- **AND** the scalar data fields are omitted
- **AND** each preserved callable symbol retains its parser-derived construct and selection ranges

### Requirement: Logical identity and declaring owners

#### Scenario: Same-name methods remain owner-qualified

- **GIVEN** two classes each declare an instance method named `save` and one declares a static `save`
- **WHEN** reference facts are built
- **THEN** each member points to its class logical owner rather than a syntax parent ID
- **AND** owner and member form keep all three logical identities distinct

#### Scenario: Overload members do not overwrite each other in owner

- **GIVEN** a class declaring multiple method overloads for `find`
- **WHEN** member facts are built
- **THEN** all overload signatures share the declaring class owner
- **AND** earlier signatures are retained in the member's overload set rather than overwritten

#### Scenario: Unsupported method-like declarations remain location-backed

- **GIVEN** an object-literal method and a prototype assignment without a supported logical owner
- **WHEN** reference facts are built
- **THEN** both declarations remain available as location-backed symbols
- **AND** neither produces an ownerless logical member fact or package-level public binding

### Requirement: TypeScript overload and declaration-group identity

#### Scenario: Adding overload signatures does not change method identity

- **GIVEN** a class method has one implementation and no overload signatures
- **WHEN** overload signatures are added above the unchanged implementation
- **THEN** the canonical logical method ID is unchanged
- **AND** every signature and the implementation appear in its declaration set
- **AND** the logical member kind remains `method`

#### Scenario: Same-name functions in different lexical owners do not group

- **GIVEN** two nested functions with the same name are declared under different enclosing functions
- **WHEN** logical groups are built
- **THEN** they produce distinct logical targets
- **AND** neither is treated as an overload of the other

#### Scenario: Equal names without an overload key remain separate

- **GIVEN** two TypeScript declarations have equal owner, name, and broad kind but no proven overload or merge-group evidence
- **WHEN** logical declaration facts are built
- **THEN** an absent group key does not merge them
- **AND** each declaration remains a competing target

### Requirement: Imports, exports, and public bindings

#### Scenario: Competing barrel routes remain competing bindings

- **GIVEN** one barrel re-exports the same name and space from two modules
- **WHEN** Pass 2 links the routes
- **THEN** both independently identified bindings survive
- **AND** a variable dynamic import produces no binding or dependency

#### Scenario: Named package import resolves through the entry surface

- **GIVEN** `sdk` imports `{ SymbolNode }` from `@specd/code-graph`
- **AND** the package publishes `.` as a condition object with `import: ./dist/public.js` and `types: ./dist/public.d.ts`
- **WHEN** imports are resolved
- **THEN** the entry file is the indexed `code-graph:src/public.ts`
- **AND** the local binding of `SymbolNode` targets the logical id that entry publishes through its barrel chain
- **AND** an `import:package` step links the local binding to the public binding

#### Scenario: Type-only package import looks up only the type space

- **GIVEN** `import type { SymbolNode } from '@specd/code-graph'`
- **WHEN** imports are resolved
- **THEN** the name is looked up only in the type space of the entry surface
- **AND** a value-space export of the same name is not considered

#### Scenario: Namespace package import depends on the entry file

- **GIVEN** `import * as graph from '@specd/code-graph'`
- **WHEN** imports are resolved
- **THEN** the file imports the entry file `code-graph:src/public.ts`
- **AND** member accesses on `graph` resolve only through names that entry publishes

#### Scenario: Name published only by an internal file stays unresolved

- **GIVEN** `import { InternalThing } from '@specd/code-graph'` and `InternalThing` is declared only in a file that `src/public.ts` does not export
- **WHEN** imports are resolved
- **THEN** no binding target, step, or relation exists
- **AND** the diagnostic reason is `not-exported`

#### Scenario: Same-name symbol in a test file is never chosen

- **GIVEN** `code-graph:test/helpers/make-node.ts` declares `SymbolNode` and the entry surface publishes a different `SymbolNode`
- **WHEN** imports are resolved
- **THEN** the import targets the symbol the entry surface publishes
- **AND** the test helper is not a candidate

#### Scenario: Re-export is a file dependency

- **GIVEN** `src/public.ts` contains `export { SymbolNode } from './domain/index.js'`
- **WHEN** imports are resolved for `src/public.ts`
- **THEN** the file imports `src/domain/index.ts`

#### Scenario: Changing a re-exported module re-links the barrel

- **GIVEN** a barrel chain `public.ts` → `domain/index.ts` → `symbol-node.ts` and an importer in another workspace
- **WHEN** `domain/index.ts` stops publishing the name and an incremental run follows
- **THEN** the barrel and the importer are re-resolved
- **AND** the result equals a clean rebuild

#### Scenario: Type-only syntax is marked on the import

- **GIVEN** `import type { A }`, `import { type B, C }`, and `import { D }`
- **WHEN** imports are extracted
- **THEN** `A` and `B` are type-only and `C` and `D` are not

#### Scenario: Linking completes before package imports resolve

- **GIVEN** `public.ts` re-exports `SymbolNode` through `index.ts` and `domain/index.ts`
- **WHEN** a package import of `SymbolNode` is resolved in Pass 2
- **THEN** it sees the final public binding of `public.ts`

### Requirement: Scoped bindings, calls, types, and construction

#### Scenario: Only proven receiver calls become relations

- **GIVEN** one typed constructor alias and one computed runtime receiver call
- **WHEN** relations are built
- **THEN** the typed construction and member call produce deterministic facts and relations
- **AND** the computed receiver call is dropped

#### Scenario: Dynamic imports and nested calls extract deterministic dependencies

- **GIVEN** code containing literal string `import('./module.js')` and chained call `builder().build()`
- **WHEN** `analyzeFile()` and `buildRelations()` execute
- **AND** deterministic call facts are extracted for the nested and chained call sites
- **THEN** the literal dynamic import of `./module.js` is returned as a resolvable import so the indexer can derive its `IMPORTS` relation

### Requirement: TypeScript caller and local-binding semantics

#### Scenario: Call initializer remains a variable inside its function

- **GIVEN** `function process() { const result = Service.run() }`
- **WHEN** the adapter extracts declarations and the `Service.run()` call fact
- **THEN** `process` is the caller
- **AND** `result` is a lexical variable binding rather than a callable function target

#### Scenario: Block-local callable names do not collide

- **GIVEN** alternate branches each declare a callable local named `result`
- **WHEN** declaration and binding identities are created
- **THEN** their physical declarations and lexical bindings are distinct
- **AND** they do not collapse into one ownerless logical target

#### Scenario: Anonymous argument key is not a declaration or caller

- **GIVEN** an anonymous test callback contains `await expect(uc.execute({ name: 'my-change' })).rejects.toThrow()`
- **WHEN** TypeScript declarations and call facts are extracted
- **THEN** the anonymous object key `name` produces no `SymbolNode`, `LocalBinding`, or logical target
- **AND** the real `uc.execute()` call targets `ArchiveChange.execute`
- **AND** its caller is the range-containing physical callback when that callback is represented, otherwise caller-unresolved
- **AND** no `CALLS` relation uses `variable:name` as its source

#### Scenario: Named object property remains eligible physical evidence

- **GIVEN** a supported named object declaration contains a scalar property named `name`
- **WHEN** declarations are classified
- **THEN** the property may remain physical declaration evidence under the named owner
- **AND** this policy does not apply to the key of an anonymous argument object

### Requirement: TypeScript hierarchy and provenance evidence

#### Scenario: Inherited member resolution has owner traversal evidence

- **GIVEN** a class extends an imported base and implements a local interface
- **AND** the base declares the requested member
- **WHEN** reference facts and relations are built
- **THEN** `EXTENDS`, `IMPLEMENTS`, and applicable `OVERRIDES` agree with hierarchy facts
- **AND** provenance reaches the base owner before selecting the member under that owner

### Requirement: Package and build-context boundary

#### Scenario: Unsupported project selection is not guessed

- **GIVEN** resolution depends on `tsconfig` paths, `imports`, or a condition other than `import`, `default`, and `types`
- **WHEN** no consumed build context selects a route
- **THEN** `buildContext` is false
- **AND** the result remains unsupported, unresolved, or ambiguous

#### Scenario: Bare specifier uses exports root or main

- **GIVEN** a package with `exports["."]`, and another with only `main`
- **WHEN** `entrySurface` runs for each bare specifier
- **THEN** the first uses `exports["."]` and the second uses `main`

#### Scenario: main is ignored when exports is defined

- **GIVEN** a package with `main` and an `exports` object without `"."`
- **WHEN** `entrySurface` runs for the bare specifier
- **THEN** it returns no candidates

#### Scenario: Default package import binds the single default declaration

- **GIVEN** `import Client from '@acme/auth'` and the entry file has one default export declaration
- **WHEN** imports are resolved
- **THEN** the file depends on the entry files
- **AND** `Client` binds to that declaration

#### Scenario: Namespace package import

- **GIVEN** `import * as auth from '@acme/auth'`
- **WHEN** imports are resolved
- **THEN** the file depends on the entry files
- **AND** no declaration is bound to `auth`

#### Scenario: Type-only import looks up only the type space

- **GIVEN** `import type { User } from '@acme/auth'` and the entry publishes `User` only as a value
- **WHEN** imports are resolved
- **THEN** the import stays unresolved

#### Scenario: JavaScript-source package resolves

- **GIVEN** a workspace that publishes `./src/index.js` and indexes that JavaScript file
- **WHEN** `entrySurface` runs for the bare specifier
- **THEN** it returns `<workspace>:src/index.js`

#### Scenario: Subpath uses its own export entry

- **GIVEN** `exports["./internal"]` is `./dist/index.js`
- **WHEN** `entrySurface` runs for `@specd/code-graph/internal`
- **THEN** it returns the indexed source of `dist/index.js`

#### Scenario: Unlisted subpath yields no entry

- **GIVEN** a package that defines `exports` without `./secret`
- **WHEN** `entrySurface` runs for `pkg/secret`
- **THEN** it returns no candidates

#### Scenario: dist maps to the indexed source

- **GIVEN** the target is `./dist/public.js` and the workspace indexes `src/public.ts`
- **WHEN** `entrySurface` runs
- **THEN** it returns `code-graph:src/public.ts`
- **AND** it does not return a same-named file in another workspace

#### Scenario: Different runtime alternatives are ambiguous

- **GIVEN** `import` and `default` conditions lead to different indexed sources that both export a name differently
- **WHEN** the shared resolver reads both
- **THEN** the name is ambiguous and unresolved

#### Scenario: Prepare reads package.json once per workspace

- **GIVEN** a run with several workspaces, some hydrated from the store
- **WHEN** `prepare` runs
- **THEN** each configured workspace `package.json` is read once
- **AND** `entrySurface` performs no filesystem read afterwards

#### Scenario: Manifest is declared

- **WHEN** the adapter reports `resolutionManifests()`
- **THEN** the result is exactly `['package.json']`

### Requirement: Capability truthfulness and failure behavior

#### Scenario: Hierarchy capability requires emitted facts

- **GIVEN** supported resolvable `extends` syntax
- **WHEN** the adapter reports `hierarchy: true`
- **THEN** non-empty ordered hierarchy and provenance evidence is emitted
- **AND** parse failure is reported as coverage rather than a same-name guess

### Requirement: TypeScript parser-authoritative structural extraction

#### Scenario: Calls use TypeScript syntax nodes

- **GIVEN** a file contains optional, computed, generic, chained, nested, multiline, and constructor call forms plus equivalent text in comments and templates
- **WHEN** call and construction facts are extracted
- **THEN** each supported parser call or construction node yields at most its corresponding fact with exact range and ancestry
- **AND** comment and template contents yield none

#### Scenario: Imports, types, and heritage use bounded nodes

- **GIVEN** static imports, literal dynamic imports, literal `require`, parameters, returns, properties, aliases, and heritage clauses span multiple lines
- **WHEN** reference and import facts are extracted
- **THEN** each fact is bounded by its parser-proven construct or type node
- **AND** text outside those nodes cannot add an import, type, owner, or hierarchy edge

#### Scenario: Unresolved TypeScript import produces no relation

- **GIVEN** an import specifier has candidate paths but no resolvable target
- **WHEN** import relations are emitted
- **THEN** no relation targets the first candidate
- **AND** the unresolved import remains diagnostic evidence only

#### Scenario: Imported TypeScript heritage retains provenance

- **GIVEN** a class extends or implements an imported target
- **WHEN** hierarchy evidence is emitted
- **THEN** the physical hierarchy relation and shared hierarchy reference fact identify the same target
- **AND** the fact retains the heritage-clause expression range and import-resolution provenance
