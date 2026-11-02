# Proposal: go-selectors-python-reexports

## Motivation

`code-graph-cross-workspace-imports` added generic package resolution (`PackageImportResolver`, `packageEntryFiles`, `resolvePackageExport`, the `PackageResolutionFacet`) but left two language gaps: Go package-qualified selectors and Python names re-exported through `__init__.py`. Both leave real cross-package edges missing from the graph, which understates impact and hotspot results for Go and Python projects.

## Current behaviour

- **Go:** `models.User{}` after `import "github.com/acme/auth/models"` yields only a file-level dependency on the package files. `GoLanguageAdapter.resolveImports` (`go-language-adapter.ts`) leaves `importMap` empty for package imports (a Go import names a directory, not a symbol). Selector calls (`alias.Name()`) are recorded as `CallForm.Static` facts with the receiver text, but the call resolution step only matches bare calls to package-level callables and looks up `importMap` by `call.name`; it never maps `receiver` to an imported package. No selector facts exist for type use (`USES_TYPE`) or construction (`CONSTRUCTS`). Result: no `CALLS`/`USES_TYPE`/`CONSTRUCTS` edges across Go packages, inside or across workspaces.
- **Python:** `from acme_auth import User` stays unresolved when `acme_auth/__init__.py` only contains `from .models import User`. Python's public surface is module-level declarations; imports remain local aliases and `__all__` is unsupported, so such re-imports are not public routes. `PythonLanguageAdapter.entrySurface` already returns the module or `__init__` file with `surface` = path without extension or `__init__`.

## Proposed solution

- **Go:** have the adapter bind each package import (by alias or by package name) as a namespace, record selector facts (`alias.Name`) in file analysis, and resolve them through the existing `resolvePackageExport` against the package surface (uppercase identifiers already produce public bindings). Resolved selectors produce `CALLS`, `USES_TYPE` and `CONSTRUCTS` edges to the target symbol, with provenance steps.
- **Python:** introduce a conservative re-export route: a `from .x import Y` (relative or package-internal absolute) at module level of an `__init__` file counts as a public route for `Y` on that package surface, so `PackageImportResolver` can follow it to the declaring symbol. Plain `import` statements, wildcard imports and aliases not proven by static metadata stay local. Whether static `__all__` participates is an open question.
- No new resolver logic: both languages feed the existing language-neutral resolver through adapter facets and public bindings.

## Specs affected

### New specs

None.

### Modified specs

- `code-graph:go-language-adapter`: add requirements for package-name/alias namespace binding, selector facts, and resolution of package-qualified selectors to exported symbols (calls, type uses, constructions) with unresolved reasons.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:python-language-adapter`: add requirements for package re-export routes through `__init__` and the conservative rule for what counts as public.
  - Depends on (added): none
  - Depends on (removed): none

- `code-graph:symbol-model`: add an additive, optional qualified reference fact to `FileAnalysisDraft` (decision 1). Existing facts and persisted IDs are unchanged.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:language-adapter`: add the shared contract for resolving qualified reference facts through the package import helpers (`resolvePackageExport`), including shadowing and silent-drop rules. Python needs no change here: the existing `reExportLinking` facet and "Re-export public bindings" requirement already define how a re-export route becomes a public binding, and the Python adapter will implement that facet.
  - Depends on (added): none
  - Depends on (removed): none

Scope note: `symbol-model` and `language-adapter` were added after the user chose the new-fact option (decision 1) and accepted the extra overlap with `code-graph-file-outline`, `code-graph-symbol-contracts` and `code-graph-symbol-semantic-context`.

## Impact

- **Code:** `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts` (`analyzeFile`, `resolveImports`, call/type resolution) and `python-language-adapter.ts` (public bindings, import handling, `entrySurface`). Possibly shared analysis types in the symbol model if selector facts need a new fact kind.
- **Blast radius:** `graph impact` on both adapter files reports CRITICAL (35 direct dependents, 22 affected files), but dependents are the barrel and composition chain (`code-graph` index/public, `sdk` host context and graph orchestration, `cli` graph commands). Behavioural change stays inside the adapters and, at most, additive fact types.
- **Impact checks (symbol and dependency level):**
  - `GoLanguageAdapter` and `PythonLanguageAdapter`: HIGH, 3 direct dependents, 20 affected files, 22 tests. `PackageImportResolver`: MEDIUM, 8 affected files (`index-code-graph.ts`, `code-graph-provider.ts`, `create-code-graph-provider.ts` and barrels).
  - Both specs: LOW (only their adapter file is covered).
  - Dependencies of the adapters (CRITICAL, 30 files) are the shared domain value objects `call-fact`, `binding-fact`, `file-analysis`, `import-declaration`, `language-adapter-facets`, `index-session`, plus `reference-fact-helpers.ts`, `explain-graph-path.ts` (graph why provenance) and `sqlite-graph-database.ts`. A new selector fact kind (open question 1) would touch these domain files and every adapter that builds `FileAnalysis`, including `php-language-adapter.ts` and the TypeScript adapter, so this is a larger change than adapter-only edits. Deriving selectors from existing call/binding facts avoids it.
  - Tests to extend: `test/infrastructure/tree-sitter/go-language-adapter.spec.ts` and `python-language-adapter.spec.ts`, plus resolver and integration tests for cross-package fixtures.
- **Graph output:** new edges appear after reindex for Go/Python projects; graph generation/version bump may be needed so stale graphs reindex.
- **Overlap:** both specs are also targeted by `code-graph-file-outline` and `code-graph-symbol-contracts` (designing); expect delta merge friction at archive.

## Technical context

- `PackageImportResolver` (`application/services/package-import-resolver.ts`) is language-neutral: adapters supply `matchSpecifier` and `entrySurface`; it reads public bindings of the entries, returns `not-exported` / `ambiguous` / `package-unknown` / `no-entry-surface` unresolved reasons, never searches symbols by name.
- Go `entrySurface` returns the non-test files of the package directory with the package surface as `surface`.
- Go receiver text for selectors is already captured on call facts (`CallForm.Static`, `receiver`), but a selector receiver's static type is unknown, so selectors must only resolve when the receiver is an imported package namespace, never by method name.
- Python rule must remain conservative: re-exports are accepted only when statically provable.
- Plan from exploration: start after `code-graph-cross-workspace-imports` is archived (now the case) and re-read specs and code.

## Decisions

1. **Go selector facts:** emit a new additive, optional qualified-reference fact from `analyzeFile` (parser-authoritative). It covers calls, constructions (today `models.User{}` drops the qualifier via `split('.').pop()`) and type positions (`qualified_type` is ignored today), so `CALLS`, `CONSTRUCTS` and `USES_TYPE` all resolve across packages. This touches the shared domain value objects (`file-analysis`, `call-fact` or a sibling fact), so the design must keep the fact optional and additive so PHP, TypeScript and Python adapters are unaffected.
2. **Python `__all__`:** supported when it is a static literal list or tuple of strings. Dynamic or non-literal forms are ignored. The spec must fix the edge cases: `__all__ += [...]` and literal concatenation only when every element is a literal; a name in `__all__` with no import or declaration behind it yields no route; whether an existing `__all__` also filters names not listed in it is to be decided in the spec.
3. **Python import forms:** both relative (`from .models import User`) and absolute (`from acme_auth.models import User`) re-exports in an `__init__` count, provided the target resolves to a file inside the same package. An absolute import that leaves the package is not a re-export. "Inside the same package" means under the top-level package directory that contains the entry file, so a sub-package entry may re-export a sibling module. `from . import name` is not a route. Routes resolve through the `relativeImportResolution` and `packageResolution` facets.
4. **Go package name:** an explicit alias always wins; otherwise the name declared in `package X` of the target package when it is indexed; otherwise the last segment of the import path. This covers `go-auth` style paths and `/v2` module suffixes.

## Open questions

None.
