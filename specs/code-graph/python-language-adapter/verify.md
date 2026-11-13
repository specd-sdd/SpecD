# Verification: Python Language Adapter

## Requirements

### Requirement: Supported files and deterministic analysis

#### Scenario: Source and stub analysis is reusable

- **WHEN** equivalent `.py` and `.pyi` content is analyzed repeatedly
- **THEN** both map to Python and produce deterministic complete drafts
- **AND** Pass 2 does not execute, import, or reparse either module

#### Scenario: The Python parse result is registered right after parsing

- **GIVEN** a Python file analysed by the adapter in an indexing session whose parser-resource scope is observed
- **WHEN** `analyzeFile` runs
- **THEN** exactly the parse result is registered in `session.parserResources`
- **AND** the registration happens before the adapter traverses the parse result

#### Scenario: A failure during traversal still releases the parse result

- **GIVEN** a Python file whose analysis throws after parsing
- **WHEN** the indexer closes the epoch of that file
- **THEN** the registered parse result is released and no parser object remains reachable from the session

#### Scenario: Nothing outlives the file's analysis

- **GIVEN** the epoch of the analysed Python file has been closed
- **WHEN** the adapter instance, the session adapter state, and the returned draft are inspected
- **THEN** none of them refers to the parsed resource and the draft is plain serializable data

#### Scenario: No run-wide keepalive state exists

- **GIVEN** an indexing run over several Python files
- **WHEN** the run ends
- **THEN** the session holds no adapter-state entry that collects parser objects

### Requirement: Python parser-authoritative structural extraction

#### Scenario: Multiline Python syntax uses node ancestry

- **GIVEN** imports, annotations, class bases, aliases, decorators, and calls use multiline or nested syntax
- **AND** strings and comments contain equivalent textual patterns
- **WHEN** the adapter analyzes the file
- **THEN** structural facts follow Python parser nodes, fields, ranges, and ancestry
- **AND** strings and comments produce no lookalike facts

#### Scenario: Pyproject parsing does not bypass source parsing

- **GIVEN** package metadata is read textually from `pyproject.toml`
- **WHEN** Python source in that package is analyzed
- **THEN** the metadata may affect package resolution
- **AND** declarations, scopes, calls, and dependencies still require Python AST evidence

#### Scenario: Unresolved Python import produces no relation

- **GIVEN** a static or literal dynamic import has syntactic candidates but none resolves
- **WHEN** import relations are emitted
- **THEN** no relation targets the first candidate
- **AND** unresolved evidence does not masquerade as a resolved dependency

#### Scenario: Imported Python base retains provenance

- **GIVEN** a class base resolves through an import
- **WHEN** hierarchy evidence is emitted
- **THEN** the physical hierarchy relation and shared hierarchy reference fact identify the same target
- **AND** the fact retains the base-expression range and resolution provenance

### Requirement: Declaration extraction and ranges

#### Scenario: Nested declarations retain parser ranges

- **GIVEN** a module function, a nested class with decorated methods, and module assignments
- **WHEN** symbols are extracted
- **THEN** supported constructs have the expected broad kinds
- **AND** every selection range is contained by its complete parser range
- **AND** nested functions inside function bodies are not approximated as supported declarations

#### Scenario: Class attributes and dataclass fields extract as Property kind

- **GIVEN** a Python class declaring class attributes, dataclass fields, and Protocol field annotations
- **WHEN** symbols are extracted
- **THEN** each field and class attribute is assigned `SymbolKind.Property`
- **AND** its `parentId` is set to the enclosing class symbol ID

### Requirement: Python logical identity and declaring owners

#### Scenario: Decorated same-name methods preserve owners and forms

- **GIVEN** two classes declare `load`, including instance, class, and static forms
- **WHEN** logical declarations are built
- **THEN** each method uses its class logical owner rather than a syntax parent ID
- **AND** owner and recognized decorator form prevent identity collapse

### Requirement: Imports and package resolution

#### Scenario: Literal and computed imports have different outcomes

- **GIVEN** relative aliases, `import package.module`, a literal dynamic import, and a computed dynamic import
- **WHEN** imports are analyzed and resolved against indexed package layouts
- **THEN** deterministic forms retain their accessible and original names
- **AND** the computed form is dropped without executing Python

#### Scenario: Module import resolves to the module declaration

- **GIVEN** workspace `auth` has project name `acme-auth` and indexes `src/acme_auth/models.py` declaring `User`
- **AND** workspace `app` contains `from acme_auth.models import User`
- **WHEN** imports are resolved
- **THEN** the entry file is `auth:src/acme_auth/models.py`
- **AND** the local binding of `User` targets that declaration
- **AND** an `import:package` step is returned

#### Scenario: Hyphen and underscore normalize

- **GIVEN** project name `acme-auth` and the import `import acme_auth.models`
- **WHEN** the specifier is matched
- **THEN** the package is `acme-auth`

#### Scenario: Package import uses init

- **GIVEN** `from acme_auth import make_client` and `acme_auth/__init__.py` declares `make_client`
- **WHEN** imports are resolved
- **THEN** the entry file is `acme_auth/__init__.py` and the name resolves

#### Scenario: Submodule import is a module dependency

- **GIVEN** `from acme_auth import models` and `__init__.py` does not publish `models` while `models.py` exists
- **WHEN** imports are resolved
- **THEN** the file depends on `models.py`
- **AND** no binding is created for `models`

#### Scenario: Source wins over its stub

- **GIVEN** `acme_auth/models.py` and `acme_auth/models.pyi` are both indexed
- **WHEN** `entrySurface` runs for `acme_auth.models`
- **THEN** only `models.py` is returned

#### Scenario: Unknown project is not guessed

- **GIVEN** `import requests` and no workspace declares `requests`
- **WHEN** imports are resolved
- **THEN** nothing is persisted and the import is counted in `importDiagnostics.externalPackageImports`, not reported as a failure

#### Scenario: Name found elsewhere in the project is not used

- **GIVEN** the imported name exists once in the target project outside the entry file
- **WHEN** imports are resolved
- **THEN** the import stays unresolved

#### Scenario: Dots and case normalize

- **GIVEN** project name `Acme.Auth` and the import `import acme_auth.models`
- **WHEN** the specifier is matched
- **THEN** the package is `Acme.Auth`

#### Scenario: Equal normalized names stay unresolved

- **GIVEN** known packages `acme-auth` and `acme_auth` and the import `import acme_auth.models`
- **WHEN** the specifier is matched
- **THEN** the result is `undefined`
- **AND** the registration order does not choose a package

#### Scenario: Submodule import without an init file

- **GIVEN** `from acme_auth import models` and no `acme_auth/__init__.py` while `acme_auth/models.py` is indexed
- **WHEN** imports are resolved
- **THEN** the file depends on `models.py`
- **AND** no binding is created for `models`

#### Scenario: Submodule indexed under two roots stays unresolved

- **GIVEN** `acme_auth/models.py` indexed under both the code root and its `src/` directory
- **WHEN** `from acme_auth import models` is resolved
- **THEN** the import stays unresolved

#### Scenario: pyproject.toml without a project name is skipped

- **GIVEN** a nearest `pyproject.toml` without `[project].name` and a named one higher inside the repository
- **WHEN** identity is computed
- **THEN** a diagnostic is reported for the skipped file
- **AND** the identity comes from the higher file

#### Scenario: Re-exported name resolves through the entry file

- **GIVEN** `acme_auth/__init__.py` contains `from .models import User` and `models.py` declares `User`
- **AND** another file contains `from acme_auth import User`
- **WHEN** imports are resolved
- **THEN** the local binding of `User` targets the declaration in `models.py`
- **AND** an `import:package` step is returned

#### Scenario: Plain import in an entry file is not a route

- **GIVEN** `__init__.py` contains `import acme_auth.models`
- **WHEN** `from acme_auth import models` style names are resolved
- **THEN** the import stays unresolved or becomes a submodule dependency, never a re-export binding

### Requirement: Resolution manifests

#### Scenario: Python declares only pyproject.toml

- **WHEN** the Python adapter reports `resolutionManifests()`
- **THEN** the result is exactly `['pyproject.toml']`
- **AND** `setup.cfg` and `setup.py` are not included

#### Scenario: Python identity ignores an earlier table name

- **GIVEN** `[tool.poetry]` declares `name = "poetry-name"` before `[project]` declares `name = "project-name"`
- **WHEN** the Python adapter reads package identity from that file
- **THEN** the result is `project-name`

#### Scenario: Entry surface performs no filesystem read

- **GIVEN** a run with several Python workspaces whose `pyproject.toml` files are deleted after `identity` ran
- **WHEN** `entrySurface` is called
- **THEN** it still returns the entry files from the package map and the indexed file set

### Requirement: Scoped bindings, calls, annotations, and construction

#### Scenario: Annotation-proven receiver wins over runtime alias

- **GIVEN** one annotated parameter call and one monkey-patched attribute call
- **WHEN** scoped facts and relations are built
- **THEN** the annotated target can produce type and call evidence
- **AND** the monkey-patched target does not produce a guessed relation

#### Scenario: Decorators and field annotations emit relations

- **GIVEN** a function decorated with a resolvable decorator and a dataclass field annotated with a known type
- **WHEN** relations are built
- **THEN** the decorator emits a `CALLS` relation
- **AND** the field annotation emits a `USES_TYPE` relation to the referenced type symbol

### Requirement: Python caller containment and declaration classification

#### Scenario: Local assignment does not replace the function caller

- **GIVEN** a Python function assigns the result of `Service.run()` to a local name
- **WHEN** the call fact is extracted
- **THEN** the containing function is the caller
- **AND** the assignment target remains a lexical binding

#### Scenario: Class decorator and method call use different containers

- **GIVEN** a class has a resolvable class decorator and a method containing a call
- **WHEN** caller facts are extracted
- **THEN** the class is used only for the class-level decorator call
- **AND** the method is used for the call inside its body

#### Scenario: Unsupported nested function is not flattened into module identity

- **GIVEN** two outer functions each contain an unsupported nested function named `work`
- **WHEN** declarations are analyzed
- **THEN** no ownerless module-level logical target named `work` is fabricated

### Requirement: Python hierarchy and provenance evidence

#### Scenario: Multiple bases preserve owner traversal order

- **GIVEN** a class with two statically resolved bases and an inherited member
- **WHEN** hierarchy facts are built
- **THEN** both owner paths retain declared base order
- **AND** member resolution queries the member under reached owners instead of treating owners as members

#### Scenario: Unsupported MRO choice remains inconclusive

- **GIVEN** selecting one inherited member requires unsupported metaclass or complete C3 behavior
- **WHEN** resolution cannot prove precedence
- **THEN** the result is ambiguous or unresolved rather than arbitrarily selected

### Requirement: Public surface and stub behavior

#### Scenario: Relative re-export is a route

- **GIVEN** `__init__.py` contains `from .models import User` at module level
- **WHEN** re-export linking runs after Pass 1
- **THEN** a public binding for `User` exists on the `__init__` surface with the logical target of `models.User`

#### Scenario: Absolute same-package re-export is a route

- **GIVEN** `__init__.py` contains `from acme_auth.models import User` and that module is an indexed file of the same package
- **WHEN** re-export linking runs
- **THEN** the route publishes `User`

#### Scenario: Absolute import leaving the package is not a route

- **GIVEN** `__init__.py` contains `from other_pkg.models import User` and the module belongs to a different package
- **WHEN** re-export linking runs
- **THEN** no binding is published for `User`

#### Scenario: Alias publishes the alias name

- **GIVEN** `from .models import User as Account`
- **WHEN** re-export linking runs
- **THEN** `Account` is published and `User` is not

#### Scenario: Chained re-exports keep the final target

- **GIVEN** `pkg/__init__.py` re-exports from `pkg/sub/__init__.py`, which re-exports from `pkg/sub/models.py`
- **WHEN** re-export linking runs
- **THEN** the binding on `pkg` carries the logical target declared in `models.py`

#### Scenario: Cycles and nested imports publish nothing

- **GIVEN** two entry files re-export each other, and an import inside `try:` or `if TYPE_CHECKING:` or a function
- **WHEN** re-export linking runs
- **THEN** no binding is published for the cycle or the nested import

#### Scenario: Wildcard import is not a route

- **GIVEN** `from .models import *`
- **WHEN** re-export linking runs
- **THEN** no names are published

#### Scenario: Static all filters routes

- **GIVEN** `__init__.py` re-exports `User` and `Session` and declares `__all__ = ["User"]`
- **WHEN** re-export linking runs
- **THEN** `User` is published and `Session` is not
- **AND** module declarations of the same file are not filtered

#### Scenario: Literal concatenation and augmented assignment are static

- **GIVEN** `__all__ = ["User"] + ["Session"]` or `__all__ = ["User"]` followed by `__all__ += ["Session"]`
- **WHEN** re-export linking runs
- **THEN** both names are treated as listed

#### Scenario: Non-static all publishes no routes

- **GIVEN** `__all__ = [name for name in names]` or `__all__.extend(other)`
- **WHEN** re-export linking runs
- **THEN** no re-export route of that file is published

#### Scenario: Listed name without a route creates no binding

- **GIVEN** `__all__ = ["Ghost"]` and nothing binds `Ghost`
- **WHEN** re-export linking runs
- **THEN** no binding exists for `Ghost`

#### Scenario: Naming convention does not publish

- **GIVEN** an import alias with no re-export route
- **WHEN** public reference facts are built
- **THEN** it stays a local binding
- **AND** `.pyi` declarations remain addressable without runtime merging

#### Scenario: Sub-package entry re-exports a sibling absolute module

- **GIVEN** `acme_auth/sub/__init__.py` contains `from acme_auth.models import User` and `acme_auth/models.py` declares `User`
- **WHEN** re-export linking runs
- **THEN** `User` is published on the `acme_auth/sub` surface

#### Scenario: Bare relative import is not a route

- **GIVEN** `__init__.py` contains `from . import models`
- **WHEN** re-export linking runs
- **THEN** no binding is published for `models`

#### Scenario: Reading all makes it non-static

- **GIVEN** `__init__.py` re-exports `User` and contains `if "User" in __all__: pass`
- **WHEN** re-export linking runs
- **THEN** no re-export route of that file is published

#### Scenario: Stub and src layout routes

- **GIVEN** a `__init__.pyi` entry with a relative route, and an absolute route under a `src/` layout
- **WHEN** re-export linking runs
- **THEN** both routes publish their names

#### Scenario: Declarations keep convention-based publishing

- **GIVEN** a module-level declaration without a leading underscore and an import alias without a route
- **WHEN** public bindings are built
- **THEN** the declaration is published and the alias stays local

#### Scenario: Routes carry the final logical target

- **GIVEN** a relative route, an absolute route, an alias route, and a two-level chain
- **WHEN** re-export linking runs
- **THEN** each published binding's target is the declaration in the module that finally declares the name
- **AND** an alias route does not also publish the original name

#### Scenario: Two entry files re-exporting each other publish nothing

- **GIVEN** two `__init__.py` entries that each contain `from <other> import User` and nothing declares `User`
- **WHEN** re-export linking runs
- **THEN** neither entry publishes `User`

#### Scenario: Plain import beside a from-import

- **GIVEN** `__init__.py` contains `import acme_auth.models` and another file contains `from acme_auth import models`
- **WHEN** imports are resolved
- **THEN** no re-export binding exists for `models`

#### Scenario: Unparenthesized tuple and annotated all are static

- **GIVEN** `__all__ = "User", "Session"` or `__all__: list[str] = ["User"]`
- **WHEN** re-export linking runs
- **THEN** the listed names filter the routes

#### Scenario: Bytes literals are not names

- **GIVEN** `__all__ = [b"User"]`
- **WHEN** re-export linking runs
- **THEN** `__all__` is non-static and no route is published

#### Scenario: Other mutations of all are non-static

- **GIVEN** `__all__.extend(other)`, `__all__.append("X")`, or a list with a non-literal element
- **WHEN** re-export linking runs
- **THEN** no route of that file is published

#### Scenario: Stub twin of an entry file is not an entry

- **GIVEN** both `__init__.py` and `__init__.pyi` are indexed
- **WHEN** re-export linking runs
- **THEN** only the source file's routes are linked

#### Scenario: Module and package with the same name stay ambiguous

- **GIVEN** `pkg/X.py` and `pkg/X/__init__.py` under the same root
- **WHEN** `from pkg import X` is resolved and the entry does not publish `X`
- **THEN** the import stays unresolved

#### Scenario: Resolved import without a local binding adds no step

- **GIVEN** a resolved package import with no retained file-scope local binding
- **WHEN** imports are resolved
- **THEN** its file dependency exists and no `import:package` step is returned

### Requirement: Capability truthfulness and failure behavior

#### Scenario: Supported inheritance backs the capability

- **GIVEN** a resolvable class base and matching ancestor member
- **WHEN** the adapter reports `hierarchy: true`
- **THEN** hierarchy and ordered provenance facts are present
- **AND** incomplete package coverage remains explicit

### Requirement: Bounded Python member and lexical-scope analysis

#### Scenario: Large class indexes direct definitions once

- **GIVEN** one Python class contains hundreds of decorated and undecorated methods with large bodies
- **AND** deterministic instrumentation records class-body scans used for member classification
- **WHEN** the adapter analyzes the class
- **THEN** direct class-body definitions are indexed once
- **AND** resolving each method does not recursively recollect all functions below the class
- **AND** method-body size does not multiply member-classification scans

#### Scenario: Decorators and nested owners remain isolated

- **GIVEN** an outer class contains `__init__`, `__new__`, multiline `staticmethod` and `classmethod` decorators, a property getter and setter, a nested function, and a nested class with repeated method names
- **WHEN** member semantics are built
- **THEN** constructors, dispatch, and accessors retain their established semantics
- **AND** nested functions and nested-class methods are not members of the outer class
- **AND** comments between decorators and definitions do not change classification

#### Scenario: Calls in one scope share one bound-name summary

- **GIVEN** a function contains many bare calls plus parameters, assignments, augmented assignments, loop targets, aliases, and named expressions
- **AND** nested functions and classes bind some of the same names
- **WHEN** bare-call shadowing is evaluated
- **THEN** the enclosing function's bound names are summarized once and reused for all its calls
- **AND** names bound only in nested scopes do not shadow calls in the outer function
- **AND** every call retains the same resolved or unresolved result as before optimization
