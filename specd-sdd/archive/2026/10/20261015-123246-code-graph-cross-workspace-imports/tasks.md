# Tasks: code-graph-cross-workspace-imports

All paths are from the repository root. Phase 1 (groups 1-8) must leave the indexed graph unchanged. Phase 2 (groups 9-18) adds package-import resolution. Do not start Phase 2 before group 8 passes.

## 1. Baseline

- [x] 1.1 Capture a baseline of the current graph for the Phase 1 equivalence check
      `.specd/config/graph/code-graph.sqlite`: run `node packages/cli/dist/index.js graph index --force --format toon`, then save the output of `graph stats --format toon` and these queries to the scratchpad: counts of `relations` by `type`, counts of `public_bindings`, counts of `local_bindings` and of those with non-null `target_id` per workspace, counts of `resolution_steps` by `kind`
      Approach: write the numbers to `<scratchpad>/baseline-phase1.txt`; they are compared in task 8.4
      (Req: Unified built-in adapter migration)
- [x] 1.2 Record the list of source and test files that reference the loose adapter methods
      `packages/code-graph`: files referencing `getPackageIdentity`, `resolvePackageFromSpecifier`, `resolveRelativeImportPath`, `buildQualifiedName`, `resolveQualifiedNameToPath`, `parseSymbolReference`, `renderSymbolReference`, `linkReExports`
      Approach: use `specd graph search "<name>" --symbols --format toon` for each name; expected source files are `index-code-graph.ts`, `resolve-symbol-reference.ts`, `language-adapter.ts`, the four adapters; expected test files are `code-graph-provider.spec.ts`, `resolve-symbol-reference.spec.ts` and the four adapter specs
      (Req: LanguageAdapter interface)

## 2. Facet contract types

- [x] 2.1 Create the facet type file
      `packages/code-graph/src/domain/value-objects/language-adapter-facets.ts`: new — define `PackageWorkspace`, `PackagePreparationContext`, `PackageEntryRequest`, `PackageEntry`, `PackageResolutionFacet`, `RelativeImportResolutionFacet`, `QualifiedNameResolutionFacet`, `SymbolReferenceSyntaxFacet`, `ReExportLinkContext`, `ReExportLinkResult`, `ReExportLinkingFacet`, `ImportUnresolvedReason`, `ImportDiagnostic`, `PackageEntryResolution`, `PackageExportRequest`, `PackageExportResolution`
      Approach: copy the exact definitions from design.md "Facet types"; full JSDoc on every exported symbol; named exports only
      (Req: Adapter facet model, Package resolution facet, Relative import resolution facet, Qualified-name resolution facet, Symbol reference syntax facet, Re-export linking facet)
- [x] 2.2 Replace the loose optional methods on `LanguageAdapter` with facet properties
      `packages/code-graph/src/domain/value-objects/language-adapter.ts`: `LanguageAdapter` — remove `getPackageIdentity?`, `resolvePackageFromSpecifier?`, `resolveRelativeImportPath?`, `buildQualifiedName?`, `resolveQualifiedNameToPath?`, `parseSymbolReference?`, `renderSymbolReference?`, `linkReExports?`; add readonly optional `packageResolution`, `relativeImportResolution`, `qualifiedNameResolution`, `symbolReferenceSyntax`, `reExportLinking`
      Approach: keep `capabilities?()` and `declarationPolicy?()` untouched; document each facet property with a JSDoc paragraph saying presence is the declaration
      (Req: LanguageAdapter interface, Adapter facet model)
- [x] 2.3 Extend `ResolvedImports` and `ImportResolutionContext`
      `packages/code-graph/src/domain/value-objects/language-adapter.ts`: `ResolvedImports` add `steps: readonly ResolutionStep[]` and `diagnostics: readonly ImportDiagnostic[]`; `ImportResolutionContext` add `workspaces: readonly PackageWorkspace[]`, `packageEntryFiles(specifier)`, `resolvePackageExport(request)`
      Approach: exact shapes from design.md "Affected areas"; import the new types from `language-adapter-facets.ts`
      (Req: Package import resolution context)
- [x] 2.4 Re-export the new types
      `packages/code-graph/src/domain/value-objects/index.ts` and `packages/code-graph/src/public.ts`: export every type listed in 2.1 next to the existing `LanguageAdapter` export
      Approach: type-only exports; `public.ts` also exports `InvalidLanguageAdapterError` once task 3.1 exists
      (Req: Adapter facet model)

- [x] 2.5 Follow-up: pass the session to `matchSpecifier`
      `packages/code-graph/src/domain/value-objects/language-adapter-facets.ts`: `PackageResolutionFacet.matchSpecifier` — add a third parameter `session: IndexSession`; update `packages/code-graph/src/application/services/package-import-resolver.ts` (`entryFiles`) to pass its session, the four adapters' facet lambdas, and the tests that call `matchSpecifier`
      Approach: TypeScript, Python, and Go ignore the session; PHP reads its prepared PSR-4 state from it
      (Req: Package resolution facet)

## 3. Registration validation

- [x] 3.1 Create `InvalidLanguageAdapterError`
      `packages/code-graph/src/domain/errors/invalid-language-adapter-error.ts`: new class extending `SpecdCodeGraphError`
      Approach: `code = 'INVALID_LANGUAGE_ADAPTER'`, constructor `(languageIds: readonly string[], rule: string, member?: string)`, message `Invalid language adapter [<ids or "unknown">]: <rule>` plus ` (member "<member>")`; JSDoc; export from the errors index
      (Req: Adapter registry)
- [x] 3.2 Add `FACET_MEMBERS` table and `validateAdapter`
      `packages/code-graph/src/infrastructure/tree-sitter/adapter-registry.ts`: `AdapterRegistry` — add the constant `FACET_MEMBERS` and a private `validateAdapter(adapter)` that checks, in order: required core members are functions; `languages()` non-empty; every `extensions()` value is in `languages()`; each present facet is an object whose members are all functions
      Approach: table from design.md "Registration validation"; collect no state; throw `InvalidLanguageAdapterError` with the messages listed in design.md "Error handling"
      (Req: Adapter registry)
- [x] 3.3 Call `validateAdapter` first in `register`
      `packages/code-graph/src/infrastructure/tree-sitter/adapter-registry.ts`: `register(adapter)` — call `validateAdapter(adapter)` before any map is changed
      Approach: failure must leave the registry unchanged; existing behaviour for valid adapters stays identical
      (Req: Adapter registry)
- [x] 3.4 Unit tests for registration validation
      `packages/code-graph/test/infrastructure/tree-sitter/adapter-registry.spec.ts`: add describe block "validation" — missing core member; facet is a string; facet missing a member; extension for undeclared language; a later registration replaces the adapter for a language; replacement is per language (an adapter keeps languages the new one does not declare); a fully shadowed adapter is not listed by `getAdapters()`; the same instance twice is idempotent; core-only adapter registers; registry unchanged after each failure; message names language, rule, and member
      Approach: Given/When/Then wording, small hand-written adapter doubles
      (Req: Adapter registry, Adapter facet model)
- [x] 3.5 Unit test for the error
      `packages/code-graph/test/domain/errors/invalid-language-adapter-error.spec.ts`: new — code, `specd === true`, message format with and without member
      Approach: plain assertions
      (Req: Adapter registry)

- [x] 3.6 Follow-up: replace duplicate rejection with replacement semantics
      `packages/code-graph/src/infrastructure/tree-sitter/adapter-registry.ts`: `validateAdapter` and `register` — remove the "language already registered" and "extension already registered" checks added in 3.2; a later registration for a language replaces the earlier adapter, extension mappings overwrite, an adapter left with no language drops out of `getAdapters()`, and registering the same instance again changes nothing
      Approach: after validation, set `adapters` entries for the new adapter's languages and `extMap` entries for its extensions; compute `getAdapters()` from the unique values of `adapters` (already so). Update `test/infrastructure/tree-sitter/adapter-registry.spec.ts`: restore "later registration wins" and add replacement-per-language, shadowed-adapter, and idempotent cases; keep `test/composition/code-graph-provider.spec.ts` passing without changes
      (Req: Adapter registry)

## 4. Index session additions

- [x] 4.1 Declare the three new session methods
      `packages/code-graph/src/domain/value-objects/index-session.ts`: `IndexSession` — add `findPublicBindings(surface, exportedName, space)`, `getFileCategory(filePath)`, `getPrimaryDeclarationSymbolId(logicalId)`
      Approach: signatures from design.md; JSDoc
      (Req: Package import resolution context)
- [x] 4.2 Implement the public-binding index
      `packages/code-graph/src/application/use-cases/in-memory-index-session.ts`: `InMemoryIndexSession` — add a `Map<string, PublicBinding[]>` keyed by `surface\0exportedName\0space`, maintained wherever `publicBindingsById` is written (`registerAnalysis`, `hydrateReferenceFacts`, `addReferenceFacts`) and rebuilt consistently when bindings are replaced
      Approach: insert into both maps in one private helper `putPublicBinding`; return a frozen copy from `findPublicBindings`
      (Req: Package import resolution context)
- [x] 4.3 Implement `getFileCategory`
      `packages/code-graph/src/application/use-cases/in-memory-index-session.ts`: return the registered file's `category`, default `'source'`, `undefined` when the file is not registered
      Approach: read the stored `FileNode`
      (Req: Package import resolution context)
- [x] 4.4 Implement `getPrimaryDeclarationSymbolId`
      `packages/code-graph/src/application/use-cases/in-memory-index-session.ts`: choose the occurrence with `occurrenceForm === 'definition'` and the lowest `symbolId`; otherwise the lowest `symbolId`; `undefined` when none
      Approach: sort by `symbolId` with `localeCompare`-free plain comparison for determinism
      (Req: Package import resolution context)
- [x] 4.5 Update test doubles of `IndexSession`
      `packages/code-graph/test`: every mock or stub implementing `IndexSession` — add the three methods
      Approach: search the test tree for `IndexSession` doubles with `specd graph search "IndexSession" --symbols`
      (Req: Package import resolution context)
- [x] 4.6 Unit tests for the session additions
      `packages/code-graph/test/application/use-cases/in-memory-index-session.spec.ts`: `findPublicBindings` after registration, hydration, and `addReferenceFacts`; `getFileCategory` for source, test, and unknown files; `getPrimaryDeclarationSymbolId` determinism
      Approach: Given/When/Then
      (Req: Package import resolution context)

## 5. Phase 1: migrate the TypeScript adapter to facets

- [x] 5.1 Expose `relativeImportResolution`
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: add `readonly relativeImportResolution = { resolve: (from, spec) => this.resolveRelativeImportPath(from, spec) }`; make `resolveRelativeImportPath` private
      Approach: internal callers keep calling the private method; no behaviour change
      (Req: Relative import resolution facet)
- [x] 5.2 Expose `qualifiedNameResolution` only if real
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: inspect `resolveQualifiedNameToPath`; if it returns a real path, expose `{ build, resolveToPath }` (provide `build` as the existing qualified-name join); if it is a pass-through with no TypeScript meaning, delete it and its callers
      Approach: decide with the callers found by `specd graph impact --symbol resolveQualifiedNameToPath`
      (Req: Qualified-name resolution facet)
- [x] 5.3 Expose `symbolReferenceSyntax`
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `readonly symbolReferenceSyntax = { parse: (t) => this.parseSymbolReference(t), render: (s, o) => this.renderSymbolReference(s, o) }`; make the two methods private
      Approach: signatures from design.md
      (Req: Symbol reference syntax facet)
- [x] 5.4 Expose `reExportLinking`
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `readonly reExportLinking = { link: (ctx) => this.linkReExports(ctx.session, ctx.packageToWorkspace) }`; make `linkReExports` private
      Approach: keep the algorithm and its "exactly one indexed entry" rule unchanged
      (Req: Re-export linking facet)
- [x] 5.5 Expose `packageResolution` (identity and match only for now)
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `readonly packageResolution` with `identity` delegating to the existing `getPackageIdentity`, `matchSpecifier` to `resolvePackageFromSpecifier`, a `prepare` that currently stores nothing, and an `entrySurface` that returns `[]`
      Approach: Phase 2 task 11.1 and 11.2 fill `prepare` and `entrySurface`; Phase 1 only needs the facet to exist so the indexer can switch to it
      (Req: Package resolution facet)
- [x] 5.6 Update the TypeScript adapter tests
      `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`: replace direct calls to the removed methods with calls through the facets; assert the adapter has no loose methods
      Approach: keep every existing assertion's expected value unchanged
      (Req: LanguageAdapter interface)

## 6. Phase 1: migrate the Python, Go, and PHP adapters to facets

- [x] 6.1 Python facets
      `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`: expose `packageResolution` (identity, matchSpecifier, empty prepare, `entrySurface` returning `[]`), `relativeImportResolution`, `symbolReferenceSyntax`, and `qualifiedNameResolution` only if `resolveQualifiedNameToPath` is real; make the old methods private
      Approach: same delegation pattern as tasks 5.1-5.5
      (Req: Package resolution facet, Relative import resolution facet, Symbol reference syntax facet)
- [x] 6.2 Go facets
      `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`: expose `packageResolution` (identity, matchSpecifier, empty prepare, `entrySurface` returning `[]`) and `symbolReferenceSyntax`; no other facet
      Approach: same delegation pattern
      (Req: Package resolution facet, Symbol reference syntax facet)
- [x] 6.3 PHP facets
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: expose `packageResolution`, `relativeImportResolution`, `qualifiedNameResolution` (`build`, `resolveToPath`), `symbolReferenceSyntax`; leave the existing Composer preparation (~line 2040) where it is for Phase 1
      Approach: same delegation pattern
      (Req: Package resolution facet, Qualified-name resolution facet, Relative import resolution facet, Symbol reference syntax facet)
- [x] 6.4 Update Python, Go, and PHP adapter tests
      `packages/code-graph/test/infrastructure/tree-sitter/{python,go,php}-language-adapter.spec.ts`: switch to the facets as in task 5.6
      Approach: no expected value changes
      (Req: LanguageAdapter interface)

## 7. Phase 1: migrate the indexer and the resolver

- [x] 7.1 Package map through the facet
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: replace `adapter.getPackageIdentity(ws.codeRoot)` (~line 875) with `adapter.packageResolution?.identity(ws.codeRoot, options.projectRoot)`
      Approach: keep the collision error text; first adapter that returns an identity wins
      (Req: Cross-workspace package resolution)
- [x] 7.2 Re-export linking through the facet (still after Pass 2 in Phase 1)
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: replace `adapter.linkReExports?.(session, packageToWorkspace)` (~line 1558) with `adapter.reExportLinking?.link({ session, packageToWorkspace })`
      Approach: do not reorder the phase yet; the move happens in task 12.2
      (Req: Re-export linking facet)
- [x] 7.3 Resolver uses the symbol reference syntax facet
      `packages/code-graph/src/application/use-cases/resolve-symbol-reference.ts`: replace `adapter.parseSymbolReference` and `adapter.renderSymbolReference` with `adapter.symbolReferenceSyntax?.parse` and `.render`; when the facet is absent treat the reference as unresolved and do not consult another adapter
      Approach: no change to resolution precedence
      (Req: Human reference parse and render, Symbol reference syntax facet)
- [x] 7.4 Update resolver and provider tests
      `packages/code-graph/test/application/use-cases/resolve-symbol-reference.spec.ts` and `packages/code-graph/test/composition/code-graph-provider.spec.ts`: move mock adapters to facets; add scenario "adapter without symbolReferenceSyntax leaves a human reference unresolved"
      Approach: assert no other adapter is called
      (Req: Symbol reference syntax facet)
- [x] 7.5 Guard against a hardcoded manifest list
      `packages/code-graph/test/application/use-cases/_shared/compute-graph-fingerprint.spec.ts`: add a test that manifests used by the fingerprint come only from `resolutionManifests()` of the registered adapters
      Approach: register a stub adapter with a new manifest basename and assert it is included
      (Req: Adapter-sourced resolution fingerprint)

## 8. Phase 1 gate

- [x] 8.1 Build and typecheck
      Run `pnpm build` and `pnpm typecheck` at the repository root; fix every error that refers to a removed method or a changed context type
      Approach: no `any`, no default exports; JSDoc on every exported symbol
      (Req: LanguageAdapter interface)
- [x] 8.2 Run the full code-graph test suite
      `pnpm --filter @specd/code-graph test`; expected: all green
      Approach: fix tests that still use the old methods
      (Req: LanguageAdapter interface)
- [x] 8.3 Lint
      `pnpm lint` (type-aware ESLint); expected: no errors
      Approach: fix missing JSDoc and explicit return types
      (Req: LanguageAdapter interface)
- [x] 8.4 Prove Phase 1 changed no graph output
      `.specd/config/graph/code-graph.sqlite`: rebuild with `node packages/cli/dist/index.js graph index --force --format toon` and re-run the queries from task 1.1; compare to `<scratchpad>/baseline-phase1.txt`
      Approach: counts of relations by type, public bindings, local bindings with targets, and resolution steps by kind must be identical; any difference is a Phase 1 defect to fix before continuing
      (Req: Unified built-in adapter migration)

## 9. Package import resolver

- [x] 9.1 Create `PackageImportResolver`
      `packages/code-graph/src/application/services/package-import-resolver.ts`: new class with `constructor(deps: { session; packageToWorkspace })` and `forAdapter(adapter)` returning `{ packageEntryFiles, resolvePackageExport }`
      Approach: implement the numbered algorithms in design.md "PackageImportResolver"; no I/O; never call `findSymbolsByName`
      (Req: Package import resolution context)
- [x] 9.2 Unit tests for the resolver
      `packages/code-graph/test/application/services/package-import-resolver.spec.ts`: resolves named export through an entry; `not-exported` for a unique internal symbol; `not-exported` for a same-name symbol in a test file; `ambiguous`; `package-unknown`; `facet-absent`; `no-entry-surface`; test entries filtered; unindexed entries filtered; duplicate routes with the same target resolve to the lowest binding id; step shape (`fromId`, `toId`, `kind: 'import:package'`); `findSymbolsByName` is never called
      Approach: mock `IndexSession` with the three new methods
      (Req: Package import resolution context, Facet-driven language independence)

## 10. Indexer wiring

- [x] 10.1 Build the resolver and pass the context
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: after the package map is built, create `new PackageImportResolver({ session, packageToWorkspace })`; in the `adapter.resolveImports` call (~line 1170) add `workspaces`, `packageEntryFiles`, `resolvePackageExport` from `resolver.forAdapter(adapter)`
      Approach: `workspaces` is the full configured list mapped to `{ name, codeRoot }`
      (Req: Package import resolution context)
- [x] 10.2 Persist steps and collect diagnostics
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: after each `resolveImports`, call `session.addReferenceFacts({ publicBindings: [], steps: resolved.steps })` and append `resolved.diagnostics` to a run-level list
      Approach: steps are filtered by known reference ids by the existing code (~line 1700); diagnostics are never written to the store
      (Req: Cross-workspace package resolution)
- [x] 10.3 Expose diagnostics in the run output
      `packages/code-graph/src/domain/value-objects/index-result.ts`: check for an existing non-persisted diagnostics channel; if none, add `diagnostics: readonly ImportDiagnostic[]` to `IndexResult` and fill it from task 10.2
      Approach: cli/sdk may ignore the field; do not change CLI output formats
      (Req: Cross-workspace package resolution)
- [x] 10.4 Facet-absence diagnostic
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: for each registered adapter that lacks `packageResolution`, add one non-persisted diagnostic naming its languages and the absent facet
      Approach: emitted once per run, not per file
      (Req: Facet-driven language independence)

## 11. Phase 2: TypeScript package resolution

- [x] 11.1 `prepare` for TypeScript
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `packageResolution.prepare` — for every configured workspace (including hydrated ones) find the nearest bounded `package.json`, parse once, and `session.setAdapterState('ts:packages', map)` keyed by workspace name with `{ name, main?, exports?, codeRoot }`
      Approach: reuse the existing manifest reader; read each file once per run; no reads after `prepare`
      (Req: Package and build-context boundary, Package resolution facet)
- [x] 11.2 `entrySurface` for TypeScript
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `packageResolution.entrySurface` — implement the six steps of "TypeScript entry surface" in design.md
      Approach: reuse `sourceCandidates` and the `publishedTarget` logic of `packageEntryCandidates`; return `{ filePath, surface: filePath }`; make `packageEntryCandidates` and `entrySurface` share one function
      (Req: Package and build-context boundary, Package resolution facet)
- [x] 11.3 Replace the name heuristic in `resolveImports`
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `resolveImports` non-relative branch (~lines 1357-1378) — delete the `findSymbolsByName` block; named imports call `context.resolvePackageExport` with `spaces` `[Type]` for type-only imports and `[Value, Type]` otherwise; namespace/default/side-effect imports call `context.packageEntryFiles`; set `importMap`, `fileImports`, `steps`, `diagnostics` as in design.md "TypeScript resolveImports"
      Approach: keep the `qualifiedNames` shortcut and the qualified-name fallback; take `localBindingId` from `analysis.referenceFacts?.localBindings` (scope `module`, same `localName`); when it is missing, record a diagnostic and add no step
      (Req: Imports, exports, and public bindings)
- [x] 11.4 Return `steps` and `diagnostics` from every `resolveImports` return
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: ensure the return value always includes both arrays (empty when none)
      Approach: type check enforces it
      (Req: LanguageAdapter interface)

## 12. Phase 2: phase order

- [x] 12.1 Prepare step
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: after the package map is built and before the Pass 2 chunks, call `adapter.packageResolution?.prepare({ session, workspaces, repoRoot: options.projectRoot })` once per adapter
      Approach: `workspaces` is the full configured list, including hydrated workspaces; wrap in try/catch per adapter, record an error, and treat that adapter as facet-absent afterwards
      (Req: Cross-workspace package resolution, Two-pass extraction with in-memory index)
- [x] 12.2 Move re-export linking before Pass 2
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: relocate the `reExportLinking.link` loop (from task 7.2) to run right after task 12.1; keep the `reexports` timing metric
      Approach: if any input of `link` turns out to exist only after Pass 2, stop and report instead of keeping a late pass
      (Req: Re-export linking facet, Two-pass extraction with in-memory index)
- [x] 12.3 Ordering test
      `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts`: new — record a call log with stub facets and assert `identity` < `prepare` < `link` < first `resolveImports`
      Approach: Given a run with two workspaces
      (Req: Two-pass extraction with in-memory index, Re-export linking facet)

## 13. Phase 2: closure and fingerprint

- [x] 13.1 Follow `import:package` in the closure
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: `collectAffectedFileClosure` — include steps with kind `import:package` in the reversed traversal; map `from_id` local bindings to their files through `local_bindings.file_path`
      Approach: start from public binding ids owned by changed or removed files; no whole-corpus scan
      (Req: Package import incremental closure)
- [x] 13.2 Closure tests
      `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts`: entry change re-resolves importers; barrel intermediate change reaches importers; unrelated files are not read (spy on the file reader); newly added target workspace resolves a previously unresolved import; result equals a clean rebuild
      Approach: compare normalized semantic state (relations, bindings, steps)
      (Req: Package import incremental closure, Identity-sensitive incremental equivalence)
- [x] 13.3 Fingerprint tests for manifests
      `packages/code-graph/test/application/use-cases/_shared/compute-graph-fingerprint.spec.ts`: a changed `package.json` `exports`, `go.mod` module path, `pyproject.toml` project name, or `composer.json` PSR-4 map changes the fingerprint
      Approach: temp fixture files
      (Req: Canonical module and package resolution identity)

## 14. Phase 2: TypeScript tests

- [x] 14.1 Entry surface unit tests
      `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`: bare specifier via `exports["."]` and via `main`; subpath; unlisted subpath returns none; `dist` maps to `src`; condition object (`import` before `types`); alternatives to different sources are both returned; test file excluded; `prepare` reads each `package.json` once; `entrySurface` performs no filesystem read (spy on `fs`)
      Approach: temp workspace fixtures
      (Req: Package and build-context boundary)
- [x] 14.2 Import resolution unit tests
      `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`: named package import resolves with an `import:package` step; type-only import looks up only the type space; plain import resolves a type-only export; namespace import depends on the entry file; internal-only name unresolved with `not-exported`; same-name test helper never chosen; a name exported in two spaces with different targets is `ambiguous`; linking completes before imports
      Approach: use a real `PackageImportResolver` over an `InMemoryIndexSession`
      (Req: Imports, exports, and public bindings)
- [x] 14.3 Cross-workspace integration test
      `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts`: two workspaces (`graph` package published through a two-level barrel, `app` importing a type) — assert local binding target, `IMPORTS` to the entry file, `USES_TYPE`, the persisted `import:package` step, subpath export, unknown package, internal-only name, same-name test helper, unique-name-not-enough, unresolved imports leave nothing persisted, diagnostics not in the store
      Approach: tmp dirs with cleanup
      (Req: Cross-workspace import resolution, Canonical module and package resolution identity)

## 15. Phase 2: Python package resolution

- [x] 15.1 `prepare` and `entrySurface` for Python
      `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`: `packageResolution.prepare` is a no-op (the name comes from `identity`); `entrySurface` follows "Python entry surface" in design.md (module, stub, package `__init__`, `src/` layout)
      Approach: normalize hyphen and underscore; `entrySurface` performs no filesystem read
      (Req: Imports and package resolution, Resolution manifests)
- [x] 15.2 Replace the heuristic in Python `resolveImports`
      `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`: `resolveImports` (~lines 884-888) — use `packageEntryFiles` and `resolvePackageExport`; on `not-exported` try the submodule via `packageEntryFiles('pkg.mod.X')` and record a file dependency and a namespace binding
      Approach: re-imported aliases stay unresolved
      (Req: Imports and package resolution)
- [x] 15.3 Python tests
      `packages/code-graph/test/infrastructure/tree-sitter/python-language-adapter.spec.ts`: module import; hyphen/underscore; package `__init__`; submodule import; re-imported alias unresolved; unknown project; same-name elsewhere unused; `prepare` reads once
      Approach: fixture workspaces
      (Req: Imports and package resolution, Resolution manifests)

## 16. Phase 2: Go package resolution

- [x] 16.1 `prepare` and `entrySurface` for Go
      `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`: `packageResolution.prepare` only builds the existing `GO_PACKAGE_DIRECTORIES_KEY` directory index of indexed non-test `.go` files; `entrySurface` follows "Go entry surface" in design.md
      Approach: reuse the body of `goPackageFiles` (~line 206) as the index builder; longest module prefix; `_test.go` never an entry; module root addressable; no lazy state mutation in Pass 2
      (Req: Package identity, exports, and imports, Resolution manifests)
- [x] 16.2 Route Go `resolveImports` through the shared helper
      `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`: `resolveImports` (~lines 684-692) — replace the direct `goPackageFiles` call with `context.packageEntryFiles(imp.specifier)` and push every entry `filePath` to `fileImports`; on failure add a diagnostic
      Approach: the file-level result must equal today's; `importMap` stays empty for package imports; no step is produced; remove `goPackageFiles` once nothing calls it
      (Req: Package identity, exports, and imports)
- [x] 16.3 Go tests
      `packages/code-graph/test/infrastructure/tree-sitter/go-language-adapter.spec.ts`: package directory entry; `_test.go` excluded; module root; longest prefix with `/v2`; unknown module; qualified selector across packages stays unresolved while the file dependency remains; `prepare` reads once; the `resolveImports` file result equals the pre-change result for the same fixture
      Approach: fixture workspaces; capture the expected file list from the pre-change behaviour before editing
      (Req: Package identity, exports, and imports)

## 17. Phase 2: PHP package resolution

- [x] 17.1 `prepare` and `entrySurface` for PHP
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: `packageResolution.prepare` absorbs the existing Composer preparation (`identity` reads the same manifest separately) and stores `{ packageName, codeRoot, psr4 }` per workspace under `'php:packages'`; `matchSpecifier(specifier, knownPackages, session)` reads the prepared state from the session and picks the longest PSR-4 prefix across all workspaces; `entrySurface` follows "PHP entry surface" in design.md
      Approach: prefixes sorted by length descending; no per-import filesystem probing
      (Req: Namespaces, use aliases, and Composer resolution, Resolution manifests)
- [x] 17.2 Add the entry surface as fallback in PHP `resolveImports`
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: `resolveImports` (~854) — keep `qualifiedNames.get(imp.specifier)` first and unchanged; when it has no match call `context.resolvePackageExport` (short name, type space) and, on `not-exported`, `packageEntryFiles` to record the PSR-4 class file dependency; keep `resolveQualifiedNameFromSession` and framework loader logic untouched
      Approach: a short class name is never matched across workspaces without its qualified name; groups expand per class
      (Req: Namespaces, use aliases, and Composer resolution)
- [x] 17.3 PHP tests
      `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`: exact qualified name wins; use import resolves through the owning PSR-4 prefix; longest prefix across workspaces; same short name in another namespace not used; no matching prefix unresolved; `prepare` reads once; Pass 2 performs no filesystem read
      Approach: fixture workspaces
      (Req: Namespaces, use aliases, and Composer resolution)

## 18. Phase 2: independence, resolver provenance, and integration

- [x] 18.1 Stub adapter for a made-up language
      `packages/code-graph/test/helpers/stub-language-adapter.ts`: new — language `zig2`, extension `.z2`, manifest `zig2.pkg`, core members plus `packageResolution`; `analyzeFile` parses `export Name` and `import Name from "pkg"` by string splitting
      Approach: test double only; no parser
      (Req: Facet-driven language independence, Adding a language adapter)
- [x] 18.2 New-language and core-only integration tests
      `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts`: stub adapter resolves a cross-workspace import with the unmodified indexer and the test reads the indexer sources to assert none mention `zig2`, `.z2`, or `zig2.pkg`; a core-only adapter indexes normally with a facet-absence diagnostic and no package imports; a facet that throws in `prepare` completes the run with a recorded error
      Approach: static scan of `index-code-graph.ts` and `package-import-resolver.ts` for built-in language ids, extensions, and manifest names must also pass
      (Req: Facet-driven language independence, Adapter facet model)
- [x] 18.3 Per-language integration fixtures
      `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts`: Python and PHP equivalents of test 14.3 plus a Go fixture asserting only file-level `IMPORTS` to every non-test file of the package
      Approach: reuse the fixture helper from task 14.3
      (Req: Cross-workspace import resolution)
- [x] 18.4 Resolver follows `import:package`
      `packages/code-graph/test/application/use-cases/resolve-symbol-reference.spec.ts`: cross-workspace import resolves with provenance (local binding, step, public binding, logical target); unresolved package import does not guess a same-name symbol; steps from all four languages resolve without a language branch
      Approach: build the persisted facts by hand in an in-memory store
      (Req: Package import bindings)

## 19. Documentation

- [x] 19.1 Write the adapter guide
      `docs/code-graph/language-adapters.md`: new — the nine sections listed in design.md "docs/code-graph/language-adapters.md"; self-contained, no reference to specs
      Approach: match the heading style of `docs/code-graph/index.md`; include both worked examples and the unresolved reasons table
      (Req: Adding a language adapter)
- [x] 19.2 Update the index page
      `docs/code-graph/index.md`: "Identity and adapter contract" and the maintainer checklist — replace loose-method wording with the facet model, remove duplicated rules, link to `language-adapters.md`
      Approach: search the three docs files for the removed method names and fix every hit
      (Req: Adding a language adapter)
- [x] 19.3 Fix other docs mentions
      `docs/code-graph/use-cases.md` and `docs/code-graph/services.md`: update any mention of `getPackageIdentity`, `ImportResolutionContext`, or the old method names; document `PackageImportResolver` in `services.md`
      Approach: `grep` the docs folder for each removed name
      (Req: Adding a language adapter)
- [x] 19.4 Docs consistency test
      `packages/code-graph/test/docs/language-adapters-docs.spec.ts`: new — assert every member in `FACET_MEMBERS` and every facet name appears in `docs/code-graph/language-adapters.md`
      Approach: read the file from the repository root with `node:fs`
      (Req: Adding a language adapter)
- [x] 19.5 Write the ADR
      `docs/adr/NNNN-language-adapter-facets.md`: new — MADR with Decision Outcome Confirmation and More Information linking only `code-graph:language-adapter`, `code-graph:workspace-integration`, and `code-graph:indexer`
      Approach: next sequential number in `docs/adr/`; kebab-case name
      (Req: Adding a language adapter)
- [x] 19.6 Release note
      Repository release mechanism: list `.changeset` and root release files; if a changeset directory exists add one for `@specd/code-graph` marking a breaking change; otherwise note the break in the PR description
      Approach: no behaviour change in code
      (Req: LanguageAdapter interface)

## 20. Final verification

- [x] 20.1 Build, typecheck, lint, and test
      Repository root: `pnpm build && pnpm typecheck && pnpm lint && pnpm test`; expected: all green
      Approach: fix findings; no suppressions
      (Req: Cross-language semantic conformance suite)
- [x] 20.2 Rebuild the graph and run the manual checks
      Run `node packages/cli/dist/index.js graph index --force --format toon`, then the five manual steps 3-7 of design.md "Manual / E2E verification" (impact on `SymbolNode`, `USES_TYPE` sdk→code-graph count, `import:package` step count, null targets for `GraphSpecNotFoundError`/`CODE_GRAPH_VERSION`/`SymbolKind`, removing an export and re-indexing incrementally)
      Approach: record the before/after numbers in the PR description; failure indicators are listed in design.md
      (Req: Cross-workspace import resolution)
- [x] 20.3 Measure graph size and incremental cost
      `graph stats` before and after; time an incremental run that touches `packages/code-graph/src/public.ts`
      Approach: report the relation count delta and the run time; if the closure is unexpectedly large, investigate instead of dropping edges
      (Req: Package import incremental closure)

## 21. Follow-ups found during implementation

- [x] 21.1 Resolve import-bound names before any name search in the shared binding environment
      `packages/code-graph/src/domain/services/scoped-binding-environment.ts`: `resolveBindingTarget` and `SymbolLookup` — a name that an import binds to a resolved declaration resolves to that declaration through a new optional `SymbolLookup.findById`, instead of to a same-name symbol of the importing workspace
      Approach: build `importedTargets` from the import binding facts; `IndexSession.findSymbolById` backs `findById` in `index-code-graph.ts`. Without this a type imported from another workspace produced no `USES_TYPE`, and a same-name local symbol produced a wrong one
      (Req: Scoped binding environment resolution, Cross-workspace import resolution)
- [x] 21.2 Count re-exports as file dependencies so the incremental closure reaches barrels
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `resolveImports` — add the source module of every re-export (relative file, or package entry files) to `fileImports`
      Approach: gives `findDirectlyAffectedFiles` an edge from a changed module to the barrel that republishes it, so importers are re-resolved and the result equals a clean rebuild. Adds `IMPORTS` edges from barrels to the modules they re-export
      (Req: Package import incremental closure)
- [x] 21.3 Record the type-only flag of TypeScript imports
      `packages/code-graph/src/domain/value-objects/import-declaration.ts` and `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: add optional `ImportDeclaration.typeOnly` and set it for `import type` and `import { type X }`
      Approach: a type-only import is looked up in the type space only
      (Req: Imports, exports, and public bindings)

## 22. Alignment follow-ups

- [x] 22.1 Align the specs, verify, and design with what was implemented
      `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports`: indexer, language-adapter, workspace-integration, TypeScript, and PHP deltas, their verify deltas, and `design.md` — describe the import-first binding resolution, re-exports as file dependencies, the type-only flag, the PHP file-dependency behaviour, and the diagnostics summary
      Approach: amend the artifacts first, then revalidate in order
      (Req: Scoped binding environment resolution, Imports, exports, and public bindings, Cross-workspace package resolution)
- [x] 22.2 Remove the temporary HEAD worktree used for the Phase 1 comparison
      Repository git worktrees: `git worktree remove` and `git worktree prune`
      Approach: the comparison is recorded in the Phase 1 gate
      (Req: Unified built-in adapter migration)
- [x] 22.3 Pass the project root to `identity`
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: package map loop — call `adapter.packageResolution.identity(ws.codeRoot, options.projectRoot)`
      Approach: a test in `index-code-graph.package-imports.spec.ts` with a manifest above the project root that must not be read
      (Req: Cross-workspace package resolution)
- [x] 22.4 Count external package imports separately
      `packages/code-graph/src/domain/value-objects/index-result.ts` and `packages/code-graph/src/application/use-cases/index-code-graph.ts`: add `externalPackageImports` to `ImportDiagnosticSummary`; `recordImportDiagnostic` counts `package-unknown` there and keeps it out of `total`, `byReason`, and `samples`
      Approach: update the mocks of `IndexResult`, the package-imports tests, `docs/code-graph/language-adapters.md` (reasons table), and `docs/code-graph/index.md`
      (Req: Cross-workspace package resolution)
- [x] 22.5 Tests for the aligned behaviour
      `packages/code-graph/test`: scoped-binding-environment import-first cases, TypeScript re-export dependency, PHP file-dependency fallback, diagnostics summary bounds
      Approach: the files and cases listed in design.md "Tests added for the alignment"
      (Req: Scoped binding environment resolution, Imports, exports, and public bindings, Namespaces, use aliases, and Composer resolution)

## 23. Corrections from the compliance audit

- [x] 23.1 Make facet failures non-fatal and identity first-wins
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: wrap `identity` in try/catch (record error, treat adapter as absent for that workspace); first adapter returning an identity wins; `prepare` for every configured workspace including hydrated ones
      Approach: tests for identity throwing, two adapters answering, hydrated workspaces prepared
      (Req: Package map, Facet-driven language independence)
- [x] 23.2 Report absent facets outside the unresolved totals
      `packages/code-graph/src/domain/value-objects/index-result.ts` and `index-code-graph.ts`: add `adaptersWithoutPackageResolution`; never count `facet-absent` in `total`, `byReason`, `samples`
      Approach: update `IndexResult` mocks, docs reasons table
      (Req: Facet-driven language independence, Import diagnostics)
- [x] 23.3 Scope-aware `importedTargets`
      `packages/code-graph/src/domain/services/scoped-binding-environment.ts`: key imported targets per scope so equal names in different scopes do not collide
      Approach: a test with two scopes importing the same name from different packages
      (Req: Scoped binding environment resolution)
- [x] 23.4 Test files are never package entries
      `packages/code-graph/src/application/services/package-import-resolver.ts`: already unconditional; verify no explicit-specifier exception remains in code, docs, or tests
      Approach: resolver test where the specifier names a test file explicitly
      (Req: Cross-workspace package resolution)
- [x] 23.5 TypeScript `main` and default/namespace imports
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `main` only when `exports` is absent; default import binds the single default declaration and depends on the entry files; namespace import creates a namespace binding
      Approach: scenarios from the TypeScript verify delta
      (Req: Package and build-context boundary, Imports, exports, and public bindings)
- [x] 23.6 Python submodule import is a file dependency only; `prepare` no-op
      `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`: remove the namespace binding for submodule imports; make `prepare` a no-op if it reads manifests; `entrySurface` reads no filesystem
      Approach: tests with `pyproject.toml` deleted after `identity`
      (Req: Imports and package resolution)
- [x] 23.7 Go `prepare` builds only the directory index
      `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`: no manifest read in `prepare`
      Approach: existing Go tests plus manifest-deleted case
      (Req: Package identity, exports, and imports)
- [x] 23.8 PHP `resolveToPath` takes the session and drops the legacy fallback
      `packages/code-graph/src/domain/value-objects/language-adapter-facets.ts` and `php-language-adapter.ts`: `resolveToPath(qualifiedName, codeRoot, session)` reads the prepared PSR-4 map; remove the absolute-path fallback; update callers
      Approach: test deleting `composer.json` after `prepare`; `package-unknown` end to end
      (Req: Namespaces, use aliases, and Composer resolution, Qualified-name resolution facet)
- [x] 23.9 Tests for uncovered scenarios
      `packages/code-graph/test`: per-file facet throw, same-name decoy for the resolver, Pass 2 without filesystem reads, Python name elsewhere, type-only restriction, resolver provenance path, newly resolvable import equals clean rebuild
      Approach: follow design.md "Tests" items 9 to 9e
      (Req: all requirements with uncovered scenarios in the audit report)
- [x] 23.10 Docs and ADR corrections
      `docs/code-graph/language-adapters.md`, `docs/code-graph/index.md`, `docs/adr/0030-language-adapter-facets.md`: ADR headings `## Decision Outcome Confirmation` and top-level `## Consequences`; `resolveToPath(…, session)`, `render` return type, `adaptersWithoutPackageResolution`, unconditional test-entry exclusion, phase order, checklist steps mirroring the spec
      Approach: re-run `test/docs/language-adapters-docs.spec.ts`
      (Req: Language adapter contract documentation)

## 24. Corrections from the second compliance audit

- [x] 24.1 Disable the adapter when `identity` or `link` throws
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: add the adapter to `disabledPackageResolution` in the identity catch
      Approach: tests assert `adaptersWithoutPackageResolution` after identity and link throws
      (Req: Facet-driven language independence, Package map)
- [x] 24.2 PHP: use workspace-prefixed file ids and target only indexed files
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: `resolveQualifiedNameFromSession` and the own-PSR-4 fallback map candidates to `workspace:relative` ids before `session.getFileId`; single candidates are also checked
      Approach: tests register files with real workspace-prefixed ids, never absolute paths
      (Req: Namespaces, use aliases, and Composer resolution)
- [x] 24.3 Python submodule fallback only after `not-exported`
      `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`: restrict the submodule lookup to the `not-exported` reason
      Approach: test an ambiguous name is not turned into a submodule dependency
      (Req: Imports and package resolution)
- [x] 24.4 Tests for audit gaps
      `packages/code-graph/test`: identity collision, hydrated workspaces prepared, `import * as` package, Python name in `__init__.py`, Python manifest deleted before `entrySurface`, link throws, Go has no relative/qualified facets, closure does not re-extract unrelated files, resolver provenance path for real languages
      Approach: follow design.md "Tests" item 9f
      (Req: all requirements with uncovered scenarios in the second audit)
- [x] 24.5 Docs and spec text cleanups
      `docs/code-graph/language-adapters.md`: describe identity/link failure disabling, run-wide workspaces, facet-level test files; fix the example that pushes a step with an empty local binding id
      Approach: re-run `test/docs/language-adapters-docs.spec.ts`
      (Req: Language adapter contract documentation)

## 25. Corrections from the third compliance audit

- [x] 25.1 Exact qualified names never resolve to test-file symbols
      `packages/code-graph/src/application/use-cases/in-memory-index-session.ts`: skip qualified-name registration for files whose category is `test`
      Approach: tests in `index-code-graph.package-imports.languages.spec.ts` (PHP exact name declared only in a test file stays unresolved)
      (Req: Cross-workspace package resolution)
- [x] 25.2 TS re-export linking drops test entries; disabled adapters skip prepare and link
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts` (`resolveReExportSource`) and `index-code-graph.ts`: filter `getFileCategory === 'test'`; skip disabled adapters in the prepare/link loops; list each adapter once
      Approach: tests for a test file as barrel target and for a link-only adapter
      (Req: Re-export public bindings, Facet-driven language independence)
- [x] 25.3 Strengthen weak tests and cover open scenarios
      `packages/code-graph/test`: collision test asserts both workspaces; hydrated-prepare test uses a run that changes no file in the unchanged workspace; closure does not re-extract unrelated files; Go unknown module (capability-vs-facet and link-without-I/O tests moved to code-graph-package-resolution-hardening)
      Approach: follow the third audit report
      (Req: scenarios listed as uncovered in the third audit)
- [x] 25.4 Collision error names both workspaces
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: include the new workspace in the message
      Approach: assert both names in the test
      (Req: Package map)

## 26. Corrections from the fourth compliance audit

- [x] 26.1 TS resolves JavaScript-source packages
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `sourceCandidates` adds `.js`, `.jsx`, `.mjs`, `.cjs`, `index.js`, `index.jsx` after the TypeScript candidates
      Approach: test in `package-resolution.spec.ts`
      (Req: Package and build-context boundary)
- [x] 26.2 Python entry surface prefers source over stub
      `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`: drop a `.pyi` entry whose `.py` is indexed
      Approach: tests for `mod.py` + `mod.pyi` and `__init__` pair
      (Req: Imports and package resolution)
- [x] 26.3 Align `package-unknown` wording
      Python, Go, PHP verify deltas and `language-adapter` verify: the scenarios assert the external count; the helper still reports the reason
      Approach: artifact edit only
      (Req: Cross-workspace package resolution)
