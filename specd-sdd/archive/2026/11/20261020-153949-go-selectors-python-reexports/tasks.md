# Tasks: go-selectors-python-reexports

## 1. Shared model

- [x] 1.1 Create the qualified reference fact value object
      `packages/code-graph/src/domain/value-objects/qualified-reference-fact.ts`: new file with `QualifiedReferenceKind`, `QualifiedReferenceFact`, `qualifiedReferenceKey`
      Approach: copy the exact definitions from design.md "New constructs"; key is `[kind, "line:column", "qualifier.name"].join('\u0000')`; full JSDoc on every export
      (Req: Qualified reference facts)
- [x] 1.2 Add the optional fact collection to the file analysis draft
      `packages/code-graph/src/domain/value-objects/file-analysis.ts`: `FileAnalysisDraft` — add `readonly qualifiedReferenceFacts?: readonly QualifiedReferenceFact[]` and import the type
      Approach: optional field, no default; `FileAnalysis` inherits it
      (Req: Qualified reference facts)
- [x] 1.3 Add the optional resolved targets to `ResolvedImports`
      `packages/code-graph/src/domain/value-objects/language-adapter.ts`: `ResolvedImports` — add `readonly qualifiedTargets?: ReadonlyMap<string, string>` with JSDoc
      Approach: optional; key is `qualifiedReferenceKey(fact)`, value is the target symbol id
      (Req: Qualified reference resolution)
- [x] 1.4 Export the new symbols from the barrels
      `packages/code-graph/src/domain/value-objects/index.ts`, `packages/code-graph/src/index.ts`, `packages/code-graph/src/public.ts`: add a block exporting `QualifiedReferenceKind`, `type QualifiedReferenceFact`, `qualifiedReferenceKey` from `./domain/value-objects/qualified-reference-fact.js`
      Approach: place next to the existing `call-fact.js` export blocks
      (Req: Qualified reference facts)

## 2. Go adapter: Pass 1

- [x] 2.1 Record the declared package name in parser state
      `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`: `GoParserState`, `analyzeFile` — add `packageName?: string`, read from the `package_identifier` of the root `package_clause`
      Approach: plain string, undefined when absent; keep it in the existing parser state object returned from `analyzeFile`
      (Req: Package identity, exports, and imports)
- [x] 2.2 Record explicit import aliases in parser state
      `go-language-adapter.ts`: `GoParserState`, `extractGoImportSpec` — add `explicitAliases` with `{ specifier, alias }` for specs whose alias is neither `_` nor `.`
      Approach: collect during the existing import extraction; `ImportDeclaration.localName` cannot tell an explicit alias equal to the last segment from no alias
      (Req: Package identity, exports, and imports)
- [x] 2.3 Emit qualified call facts
      `go-language-adapter.ts`: new private `extractQualifiedReferences` — for `call_expression` with `selector_expression` function and `identifier` operand, emit kind `call`
      Approach: skip when `isGoShadowedByEnclosingScope(node, qualifier, lexicals)`; reuse the call-fact caller containment helper for `sourceSymbolId`; use `locationOf(node, filePath)`
      (Req: Scoped bindings, selectors, construction, and types)
- [x] 2.4 Emit qualified construct facts
      `go-language-adapter.ts`: `extractQualifiedReferences` — for `composite_literal` whose `type` is a `qualified_type` (or `generic_type` wrapping one) emit kind `construct`
      Approach: qualifier from the `package` field, name from the `name` field; mark the qualified type as consumed so it does not also emit kind `type`; leave the existing `CallForm.Constructor` fact untouched
      (Req: Scoped bindings, selectors, construction, and types)
- [x] 2.5 Emit qualified type facts
      `go-language-adapter.ts`: `extractQualifiedReferences` — every other `qualified_type` node emits kind `type`
      Approach: covers parameter, result, field, var, const, type declaration and type-argument positions; `sourceSymbolId` uses the same containment helper widened to struct fields, type declarations, vars and consts
      (Req: Scoped bindings, selectors, construction, and types)
- [x] 2.6 Return the facts in the draft
      `go-language-adapter.ts`: `analyzeFile` — set `qualifiedReferenceFacts` sorted by line then column
      Approach: sort for determinism; keep the plain-data rule (no parser nodes retained)
      (Req: Qualified reference facts)

## 3. Go adapter: Pass 2

- [x] 3.1 Build namespace bindings for resolved package imports
      `go-language-adapter.ts`: new private `goNamespaceBindings(analysis, context)` returning `ReadonlyMap<string, GoNamespaceBinding>`
      Approach: for each non-blank, non-dot, non-side-effect import, call `context.packageEntryFiles`; name = explicit alias, else declared name, else `imp.originalName`; remove a name produced by two imports; set `localBindingId` from the file-scope Namespace local binding or `''`
      (Req: Package identity, exports, and imports)
- [x] 3.2 Implement declared package name lookup
      `go-language-adapter.ts`: new private `declaredPackageName(entries, session)`
      Approach: read `session.getAnalysis(entry.filePath)?.parserState` (kind `go`) `.packageName`; return it only if every entry has one and all are equal; no filesystem read
      (Req: Package identity, exports, and imports)
- [x] 3.3 Resolve qualified reference facts in `resolveImports`
      `go-language-adapter.ts`: `resolveImports` — for each fact whose qualifier is a namespace and whose name matches `/^\p{Lu}/u`, call `context.resolvePackageExport`
      Approach: spaces `['value']` for kind `call`, `['type']` otherwise; on `resolved` store `targetSymbolId` in `qualifiedTargets` and add the helper `step` (deduped) only when `localBindingId !== ''`; on unresolved do nothing
      (Req: Qualified reference resolution)
- [x] 3.4 Return `qualifiedTargets` and steps from `resolveImports`
      `go-language-adapter.ts`: `resolveImports` return value — `{ importMap, fileImports, steps, diagnostics, qualifiedTargets }`
      Approach: the existing return currently has `steps: []`; keep import behavior otherwise identical
      (Req: Qualified reference resolution)
- [x] 3.5 Build relations from resolved qualified references
      `go-language-adapter.ts`: `buildRelations` — after the existing `CALLS` loop, create `CALLS`/`CONSTRUCTS`/`USES_TYPE` from `context.resolvedImports.qualifiedTargets`
      Approach: require `sourceSymbolId`; dedupe with the existing `seen` set using `${source}:${type}:${target}`
      (Req: Qualified reference resolution)

## 4. Python adapter

- [x] 4.1 Extract the shared module candidate builder
      `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`: `packageResolutionFacet.entrySurface` — move the candidate list construction into module-level `pythonModuleCandidates(root, modulePath)`
      Approach: pure refactor, identical outputs; existing tests must pass unchanged
      (Req: Imports and package resolution)
- [x] 4.2 Add re-export info types to parser state
      `python-language-adapter.ts`: `PythonParserState` — add `reExports?` and `allExport?` and the `PythonReExportInfo`/`PythonAllInfo` types
      Approach: definitions exactly as in design.md "New constructs"
      (Req: Public surface and stub behavior)
- [x] 4.3 Collect direct `from ... import` routes in entry files
      `python-language-adapter.ts`: new private `extractReExports` — for `__init__.py`/`.pyi` only, read direct module-root `import_from_statement` children
      Approach: skip wildcard imports and nested statements; store `level` (leading dots), dotted `module`, `importedName`, `boundName` (alias or name)
      (Req: Public surface and stub behavior)
- [x] 4.4 Classify `__all__`
      `python-language-adapter.ts`: `extractReExports` — return `absent`, `static` (with `names`), or `dynamic`
      Approach: scan the whole tree for `__all__`; static only for module-level `=`/`+=` of list/tuple of plain string literals or `+` of such literals; any other use is `dynamic`
      (Req: Public surface and stub behavior)
- [x] 4.5 Store the collected info in parser state
      `python-language-adapter.ts`: `analyzeFile` — include `reExports` and `allExport` in `PythonParserState` for entry files only
      Approach: plain data; omit the fields for other files
      (Req: Public surface and stub behavior)
- [x] 4.6 Resolve a route to exactly one source file
      `python-language-adapter.ts`: new private helper used by `linkReExports` — relative and absolute resolution of the route module
      Approach: relative: directory of the entry file minus `level - 1` levels, then module path candidates; absolute: `pythonModuleCandidates` over `<ws>:` and `<ws>:src/` roots keeping only paths inside `dirname(entry) + '/'`; keep indexed candidates, drop a `.pyi` with a `.py` sibling, require exactly one
      (Req: Public surface and stub behavior)
- [x] 4.7 Implement `linkReExports`
      `python-language-adapter.ts`: new private `linkReExports(session)` returning `ReExportLinkResult`
      Approach: skip files with `dynamic` `__all__`; allowed names per design.md; up to `entryFileCount + 1` passes reading `session.findPublicBindings` for spaces `value` and `type` plus bindings created earlier in the call; require equal targets; emit `createPublicBinding` on surface(entry) and step `{ fromId: binding.id, toId: targetId, kind: 're-export:named' }`; return only new bindings sorted by id
      (Req: Public surface and stub behavior)
- [x] 4.8 Expose the facet
      `python-language-adapter.ts`: add `get reExportLinking(): ReExportLinkingFacet` returning `{ link: (context) => this.linkReExports(context.session) }`
      Approach: mirror `typescript-language-adapter.ts` lines ~886-894
      (Req: Public surface and stub behavior)

## 5. Tests

- [x] 5.1 Test the fact value object
      `packages/code-graph/test/domain/value-objects/qualified-reference-fact.spec.ts`: new spec
      Approach: key stability and kind/position distinction; absent collection equals empty; fact is plain serializable data
      (Req: Qualified reference facts)
- [x] 5.2 Update the barrel test
      `packages/code-graph/test/barrel.spec.ts`: add the three new exports
      Approach: follow the existing export-list assertions
      (Req: Qualified reference facts)
- [x] 5.3 Go: namespace naming scenarios
      `packages/code-graph/test/infrastructure/tree-sitter/go-language-adapter.spec.ts`: alias, declared name (`go-auth`), `/v2`, last-segment fallback, blank and dot imports
      Approach: in-memory session with indexed entry files carrying `GoParserState.packageName`
      (Req: Package identity, exports, and imports)
- [x] 5.4 Go: replace the old unresolved-selector test
      `go-language-adapter.spec.ts`: replace "Qualified selector across packages stays unresolved" with resolved selector, unexported name, shadowed name, unresolved package
      Approach: assert `qualifiedTargets` and the produced relations
      (Req: Package identity, exports, and imports)
- [x] 5.5 Go: relation scenarios
      `go-language-adapter.spec.ts`: qualified call -> `CALLS`, composite literal -> `CONSTRUCTS` with retained qualifier, var/parameter/result/field types -> `USES_TYPE`, value receiver selector -> nothing, unresolved call dropped, cross-workspace target
      Approach: assert fact fields (qualifier, name, kind, source symbol) and relation endpoints
      (Req: Scoped bindings, selectors, construction, and types)
- [x] 5.6 Python: route scenarios
      `packages/code-graph/test/infrastructure/tree-sitter/python-language-adapter.spec.ts`: relative, absolute same-package, absolute outside package, alias, chain, cycle, nested/conditional, wildcard, plain import
      Approach: sessions with `__init__.py` and module files; assert bindings from `linkReExports`
      (Req: Public surface and stub behavior)
- [x] 5.7 Python: `__all__` scenarios
      `python-language-adapter.spec.ts`: static filter, concatenation and `+=`, dynamic publishes nothing, listed name without route, declarations not filtered
      Approach: assert published names per case
      (Req: Public surface and stub behavior)
- [x] 5.8 Python: replace the old re-export tests
      `python-language-adapter.spec.ts`: replace "Re-imported alias is not a public route" and "Module visibility is not inferred from naming convention" with the re-exported import resolution and local-alias scenarios
      Approach: `from acme_auth import User` resolves with an `import:package` step; a non-route import stays unresolved
      (Req: Imports and package resolution)
- [x] 5.9 Contract test for optional fields
      `packages/code-graph/test/infrastructure/tree-sitter/` shared adapter contract spec: adapters without the new fields keep working
      Approach: TypeScript, PHP and Python adapters return `ResolvedImports` without `qualifiedTargets` and drafts without `qualifiedReferenceFacts`
      (Req: Qualified reference resolution)
- [x] 5.10 Integration fixtures
      `packages/code-graph/test/integration/`: two-workspace Go fixture (`github.com/acme/auth` exports `User`, `NewUser`; `app` uses them) and Python fixture (`acme_auth/__init__.py` re-exports `User`)
      Approach: index both, assert persisted `CALLS`, `CONSTRUCTS`, `USES_TYPE` and the resolved Python import
      (Req: all)

## 6. Documentation and verification

- [x] 6.1 Update adapter docs
      `docs/code-graph/language-adapters.md` (and `docs/code-graph/index.md` if it lists unsupported resolution): Go namespace naming and selector positions, Python routes and `__all__` rules, `qualifiedReferenceFacts`, `ResolvedImports.qualifiedTargets`
      Approach: remove statements that Go selectors or Python re-exports are unsupported
      (Req: all)
- [x] 6.2 Check whether a graph generation bump is needed
      `packages/sdk/src/shared/code-graph-version.ts`: decide if adapter output changes need a version increment so existing graphs reindex
      Approach: follow how earlier adapter output changes handled it; increment in the same commit when required
      (Req: all)
- [x] 6.3 Run build, tests, typecheck and lint
      repository root: `pnpm --filter @specd/code-graph build`, `test`, `typecheck`, then `pnpm lint`
      Approach: all must pass before marking implementing complete
      (Req: all)
- [x] 6.4 Manual graph check
      repository root: `node packages/cli/dist/index.js graph index --force --format toon`, then `graph impact --symbol User --direction dependents --format toon` on the Go fixture
      Approach: dependents include the `app` caller
      (Req: Qualified reference resolution)

## 7. Audit follow-ups

- [x] 7.1 Use one containment index for Go qualified facts
      `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`: `extractQualifiedReferences` — compute `sourceSymbolId` for kinds `call`, `construct`, `type` with the widened index (`typeContainment`)
      Approach: reuse `typeContainment`; keep ordinary `CallFact.callerSymbolId` on the callable index
      (Req: Scoped bindings, selectors, construction, and types; audit D3)
- [x] 7.2 Apply shadowing to every Go fact kind
      `go-language-adapter.ts`: `extractQualifiedReferences` — call `isGoShadowedByEnclosingScope` before emitting `construct` and `type` facts too
      Approach: same helper and lexical index as for `call`
      (Req: Package identity, exports, and imports; audit D1)
- [x] 7.3 Emit facts for instantiated generic calls
      `go-language-adapter.ts`: `extractQualifiedReferences` — unwrap the instantiation node around the selector in a call's function operand
      Approach: check the real tree-sitter-go node name with a parse before coding
      (Req: Scoped bindings, selectors, construction, and types; audit D2)
- [x] 7.4 Resolve Python routes through the language facets
      `python-language-adapter.ts`: route source resolution in `linkReExports` — relative via `relativeImportResolution.resolve(F, dots + module)`, absolute via `packageResolution.entrySurface`
      Approach: drop the private candidate construction used only by linking; keep `pythonModuleCandidates` for `entrySurface`
      (Req: Public surface and stub behavior; audit D4)
- [x] 7.5 Define "same package" as the top-level package directory
      `python-language-adapter.ts`: absolute route filter — keep candidates under `<root>/<firstSegment>/` that also contains the entry file
      Approach: sibling imports from a sub-package entry become routes; other top-level packages stay excluded
      (Req: Public surface and stub behavior; audit D5)
- [x] 7.6 Keep `from . import x` and `__all__` reads excluded explicitly
      `python-language-adapter.ts`: `extractReExports`/`classifyPythonAll` — no behavior change; add tests and comments pinning the documented behavior
      Approach: tests only plus JSDoc
      (Req: Public surface and stub behavior; audit D6, D7)
- [x] 7.7 Remove the orphan docblock
      `python-language-adapter.ts`: delete `/** Parser state representation for Python. */` above `PythonReExportInfo`
      Approach: keep the one above `PythonParserState`
      (audit D9)
- [x] 7.8 Rename the contract test to mirror a source file
      `packages/code-graph/test/infrastructure/tree-sitter/qualified-reference-contract.spec.ts`: merge into `language-adapter-conformance.spec.ts` or `test/domain/value-objects/qualified-reference-fact.spec.ts`
      Approach: keep all assertions; delete the old file
      (audit D11)
- [x] 7.9 Go tests from the audit
      `go-language-adapter.spec.ts`: explicit alias does not bind the path-derived name; last-segment fallback with unindexed entries and no filesystem read; shadow variants for call/construct/type; result, const, type-declaration and type-argument positions; `models.Missing()` dropped; package-level initializer source; generic call fact; external import counted as external
      Approach: given/when/then names; assert facts and relations
      (Req: Package identity, exports, and imports; Scoped bindings, selectors, construction, and types)
- [x] 7.10 Language-adapter tests from the audit
      shared resolution tests (new spec or the conformance spec): helper statuses `ambiguous`, `no-entry-surface`, `not-exported` produce no relation and no failure; no name search; namespace without local binding contributes no step; missing `sourceSymbolId` blocks call/construct
      Approach: use a stub `ImportResolutionContext`
      (Req: Qualified reference resolution)
- [x] 7.11 Python tests from the audit
      `python-language-adapter.spec.ts`: sub-package absolute sibling route; `.pyi` entry route; `src/` absolute route; tuple and annotated `__all__`; nested imports (try, `if TYPE_CHECKING`, function) asserted separately; `from . import x` and `"X" in __all__` publish nothing; `.pyi` declarations stay addressable; declaration convention publishing unchanged
      Approach: reuse the `register`/`published` helpers
      (Req: Public surface and stub behavior)
- [x] 7.12 Symbol-model test
      `qualified-reference-fact.spec.ts`: a fact names no target and creates no relation by itself
      Approach: assert plain-data shape and absence of target fields
      (Req: Qualified reference facts)
- [x] 7.13 Update docs for the refined rules
      `docs/code-graph/language-adapters.md`: Python "same package" = top-level package directory, facets used, `from . import x` and `__all__` read rules; Go uniform shadowing, generic calls, package-level initializer sources
      Approach: edit the existing Go and Python sections only
      (Req: all)
- [x] 7.14 Re-run build, tests, typecheck and lint
      repository root: `pnpm --filter @specd/code-graph build`, `test`, `typecheck`, then `pnpm lint`
      Approach: all must pass before marking implementing complete
      (Req: all)

## 8. Second audit follow-ups

- [x] 8.1 Complete Go shadowing with scope-aware rules
      `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`: `isGoShadowedByEnclosingScope` and the lexical index it reads
      Approach: handle named results, grouped `var`/`const`/`type`, local `type` declarations, `range`, `if`/`for`/`switch` initializers, type-switch bindings; bindings visible only after their declaration within the containing block; parameter, result, and receiver names scope to the body so signature types still resolve; run `graph impact --symbol isGoShadowedByEnclosingScope` first
      (Req: Package identity, exports, and imports; audit R2-1)
- [x] 8.2 Anchor the Go resolution step on the import's own binding
      `go-language-adapter.ts`: `goNamespaceBindings`
      Approach: `localBindingId` = file-scope Namespace local binding created for that import (alias or last segment), not the one named like the chosen namespace; keep dedupe of steps
      (Req: Package identity, exports, and imports; audit R2-2)
- [x] 8.3 Python `__all__` forms
      `python-language-adapter.ts`: `classifyPythonAll` and helpers
      Approach: accept an unparenthesized tuple (`expression_list`) of plain strings as static; reject `bytes` literals (non-static); keep annotated assignment static; update JSDoc
      (Req: Public surface and stub behavior; audit R2-5)
- [x] 8.4 Link only the source file when `__init__.pyi` twins `__init__.py`
      `python-language-adapter.ts`: `linkReExports` entry collection
      Approach: skip an `__init__.pyi` whose `__init__.py` sibling is indexed
      (Req: Imports and package resolution; audit R2-8)
- [x] 8.5 Go tests for the new scenarios
      `go-language-adapter.spec.ts`: shadowing by named result, grouped var, range, if-initializer, type switch, local type; use before `:=` still resolves; parameter name does not shadow the signature type; declared-name and `/v2` imports return a step anchored on their own binding; two imports with the same name bind neither; `models.Box[int]{}` construct fact; dot/blank import test gets a positive control
      Approach: given/when/then names; assert facts, steps, and relations
      (Req: Package identity, exports, and imports; Scoped bindings, selectors, construction, and types)
- [x] 8.6 Go/shared resolution tests
      `language-adapter-conformance.spec.ts` or the Go spec: call facts request only the `value` space and construct/type only the `type` space; duplicated qualified calls produce one relation; missing `sourceSymbolId` blocks `type` facts too; last-segment fallback test reaches the fallback with an indexed package whose entries disagree and asserts no filesystem read
      Approach: stub `ImportResolutionContext` and spy on `resolvePackageExport` arguments
      (Req: Qualified reference resolution; audit R2-3, R2-4)
- [x] 8.7 Strengthen fact and integration tests
      `qualified-reference-fact.spec.ts`: serialize an adapter-produced analysis instead of a hand-built fact, and make the absent-collection test exercise registration; `integration/go-selectors-python-reexports.spec.ts`: assert relation target ids
      Approach: replace tautologies with assertions that fail if the behavior is removed
      (Req: Qualified reference facts)
- [x] 8.8 Strengthen Python route tests
      `python-language-adapter.spec.ts`: chain asserts the final `targetId` is the `sub/models` `User`; real two-entry cycle; alias test asserts `User` is absent; `+=` test that proves its own contribution; `.extend`, comprehension, `.append`, non-literal element cases; relative and absolute route tests assert `targetId`; `import acme_auth.models` beside `from acme_auth import models`; import alias without a route stays local; unparenthesized tuple, annotated, and bytes `__all__`; `.pyi` absolute route; `.py`/`.pyi` twin entries; `X.py` plus `X/__init__.py` ambiguity; resolved import without local binding adds no step
      Approach: reuse the `register`/`published` helpers; each test must fail if the behavior is removed
      (Req: Imports and package resolution; Public surface and stub behavior; audit R2-5..R2-8)
- [x] 8.9 Update docs
      `docs/code-graph/language-adapters.md`: Go shadowing rules and step anchoring; Python `__all__` forms and `import:package` step condition
      Approach: edit existing Go and Python sections only
      (Req: all)
- [x] 8.10 Re-run build, tests, typecheck and lint
      repository root: `pnpm --filter @specd/code-graph build`, `test`, `typecheck`, then `pnpm lint`
      Approach: all must pass before marking implementing complete
      (Req: all)
