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

- **GIVEN** resolution depends on `tsconfig` paths or a conditional package export
- **WHEN** no consumed build context selects a route
- **THEN** `buildContext` is false
- **AND** the result remains unsupported, unresolved, or ambiguous

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
