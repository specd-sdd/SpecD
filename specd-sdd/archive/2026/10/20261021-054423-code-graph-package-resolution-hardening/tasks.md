# Tasks: code-graph-package-resolution-hardening

All paths are under `packages/code-graph/` unless stated. Test files mirror `src` under `test/`.

## 1. Shared manifest search

- [x] 1.1 Add `PackageManifestMatch` and `findPackageManifest`
      `src/infrastructure/tree-sitter/find-manifest-field.ts`: new exported interface and function
      Approach: canonicalize `codeRoot` and `repoRoot` with `realpathSync` (fallback `path.resolve`, strip trailing separator); if `repoRoot` is absent or the code root is not inside it, boundary = code root; walk up reading `filename`, return the first manifest where `hasIdentity(content)` is true with the `skipped` list; stop at the boundary or the filesystem root
      (Req: Package resolution facet — package-root search)
- [x] 1.2 Re-implement `findManifestField` on top of `findPackageManifest`
      `src/infrastructure/tree-sitter/find-manifest-field.ts`: `findManifestField`
      Approach: keep the exported signature; predicate is `extract(content)` returns a non-empty value; return `extract(match.content)`
      (Req: Package resolution facet)
- [x] 1.3 Export the new function and type from the barrels
      `src/infrastructure/tree-sitter/index.ts`, `src/index.ts`, `src/public.ts` — add `findPackageManifest` and `PackageManifestMatch` next to `findManifestField`
      Approach: same export style as the existing line
- [x] 1.4 Test: manifest above the code root inside the repository is found
      `test/infrastructure/tree-sitter/find-manifest-field.spec.ts`
      Approach: temp tree `<repo>/.git`-less; pass `repoRoot=<repo>`; assert `packageRoot`
      (Scenario: Identity and prepare use the same package root)
- [x] 1.5 Test: search stops at the repository root
      `test/infrastructure/tree-sitter/find-manifest-field.spec.ts`
      Approach: manifest above `repoRoot` must not be returned
      (Scenario: Search stops at the repository root of the code root)
- [x] 1.6 Test: external code root uses its own repository boundary
      `test/infrastructure/tree-sitter/find-manifest-field.spec.ts`
      Approach: code root in a sibling temp directory with `repoRoot` = that directory's repo root; manifest above the code root inside it is found
      (Scenario: External code root uses its own repository boundary)
- [x] 1.7 Test: no `repoRoot` inspects only the code root
      `test/infrastructure/tree-sitter/find-manifest-field.spec.ts`
      Approach: manifest only in the parent directory returns `undefined`; manifest in the code root is found
      (Scenario: No detected repository inspects only the code root)
- [x] 1.8 Test: nameless manifest is skipped and reported
      `test/infrastructure/tree-sitter/find-manifest-field.spec.ts`
      Approach: nearest manifest fails `hasIdentity`; higher one passes; assert `skipped` contains the nearest path
      (Scenario: Manifest without the identity field is skipped with a diagnostic)
- [x] 1.9 Test: symlinked and trailing-separator code roots
      `test/infrastructure/tree-sitter/find-manifest-field.spec.ts`
      Approach: `fs.symlinkSync` (skip on Windows when symlink creation is not permitted) and a path with a trailing separator give the same match as the plain path
      (Scenario: Symlinked and trailing-separator code roots are canonicalized)
- [x] 1.10 Test: code root outside the supplied boundary collapses to the code root and never reaches the filesystem root
      `test/infrastructure/tree-sitter/find-manifest-field.spec.ts`
      Approach: pass an unrelated `repoRoot`; manifest in the parent directory is not found
      (Req: Package resolution facet)

## 2. Domain types

- [x] 2.1 Add `repoRoot` to `PackageWorkspace`
      `src/domain/value-objects/language-adapter-facets.ts`: `PackageWorkspace`
      Approach: `readonly repoRoot?: string` with JSDoc "Root of the repository that contains `codeRoot`; absent when no VCS is detected"
      (Req: Package resolution facet)
- [x] 2.2 Replace `PackagePreparationContext.repoRoot` with `projectRoot`
      `src/domain/value-objects/language-adapter-facets.ts`: `PackagePreparationContext`
      Approach: `readonly projectRoot: string`; delete `repoRoot`; no alias
      (Req: Package resolution facet)
- [x] 2.3 Add the `report` argument to `identity`
      `src/domain/value-objects/language-adapter-facets.ts`: `PackageResolutionFacet.identity`
      Approach: `identity(codeRoot: string, repoRoot?: string, report?: (message: string) => void): string | undefined`; update JSDoc (bounded by `repoRoot`; code root only when absent)
      (Req: Package resolution facet)
- [x] 2.4 Update the meaning of `repoRoot` in adapter contexts
      `src/domain/value-objects/language-adapter.ts`: `AdapterAnalyzeContext`, `ImportResolutionContext`, `RelationBuildContext` — JSDoc only: repository root of the workspace code root being processed
      Approach: no type change
      (Req: Package import resolution context)
- [x] 2.5 Add `configuredWorkspaces` to `IndexOptions` and fix the `projectRoot` JSDoc
      `src/domain/value-objects/index-options.ts`: `IndexOptions`
      Approach: `readonly configuredWorkspaces?: readonly ProjectWorkspace[]` documented as defaulting to `workspaces`
      (Req: Cross-workspace package resolution)
- [x] 2.6 Add `RepositoryRootSource` port
      `src/application/ports/repository-root-source.ts` (new): abstract class with `abstract resolve(directory: string): Promise<string | undefined>`
      Approach: JSDoc states it never rejects; export from `src/application/index.ts` only if other ports are exported there
      (Req: Cross-workspace package resolution)

## 3. Session and file node

- [x] 3.1 Add namespace fields to `FileNode` and `createFileNode`
      `src/domain/value-objects/file-node.ts`: `FileNode`, `createFileNode`
      Approach: optional `namespace`, `namespaceSeparator`; copy only when `namespace` is defined; equality unchanged
      (Req: File node)
- [x] 3.2 Test: namespace is optional, paired, not part of equality
      `test/domain/value-objects/file-node.spec.ts`
      (Scenario: File namespace is optional and paired)
- [x] 3.3 Change `getQualifiedNames` and `findSymbolByQualifiedName` signatures
      `src/domain/value-objects/index-session.ts`: both methods get `options?: { readonly includeTests?: boolean }`
      Approach: default excludes test symbols
      (Req: Shared indexing session)
- [x] 3.4 Split the qualified-name map in two
      `src/application/use-cases/in-memory-index-session.ts`: `qualifiedNameSymbolMap` plus new `testQualifiedNameSymbolMap`, lazily merged map for `includeTests: true`
      Approach: invalidate the merged map on every write; production entry wins on a duplicate name
      (Req: Shared indexing session)
- [x] 3.5 Route `registerAnalysis` to the right map
      `src/application/use-cases/in-memory-index-session.ts`: `registerAnalysis` (~line 320)
      Approach: remove the `category !== 'test'` guard; write to the test map when `fileInfo.category === 'test'`, otherwise to the production map; keep `namespaceSeparator ?? '.'`
      (Req: Shared indexing session)
- [x] 3.6 Fill the maps in `hydratePersistedFile`
      `src/application/use-cases/in-memory-index-session.ts`: `hydratePersistedFile`
      Approach: accept `namespace?` and `namespaceSeparator?` on the `file` argument; for each symbol write `${namespace}${separator ?? '.'}${symbol.name}` → `symbol.id` into the map chosen by `file.category`
      (Req: Shared indexing session)
- [x] 3.7 Test: hydrated file fills the lookup from persisted namespace
      `test/application/use-cases/in-memory-index-session.spec.ts`
      (Scenario: Hydrated files fill the qualified-name lookup)
- [x] 3.8 Test: production importers never see test symbols; test importers do
      `test/application/use-cases/in-memory-index-session.spec.ts`
      Approach: also assert merged-map invalidation after a new registration
      (Scenarios: Production importers never resolve to a test symbol, A test importer resolves to a test helper)

## 4. SQLite store

- [x] 4.1 Add columns and bump the schema version
      `src/infrastructure/sqlite/schema.ts`: `SQLITE_SCHEMA_VERSION = 16`; `files` DDL adds `namespace TEXT` and `namespace_separator TEXT`
      Approach: `REQUIRED_COLUMNS` derives from the DDL; do not add migration code
      (Req: Reference schema upgrade, Persisted node storage)
- [x] 4.2 Persist the columns on file upsert
      `src/infrastructure/sqlite/sqlite-graph-database.ts`: file insert statement and bound row type
      Approach: write `node.namespace ?? null` and `node.namespaceSeparator ?? null`
      (Req: Persisted node storage)
- [x] 4.3 Read the columns in the three `SELECT ... FROM files` statements and map them to `FileNode`
      `src/infrastructure/sqlite/sqlite-graph-database.ts`: statements near lines 460, 505, 711 and their row types
      Approach: `null` → property omitted; set `namespaceSeparator` only when `namespace` is set
      (Req: Persisted node storage)
- [x] 4.4 Carry the fields through the worker row shape
      `src/infrastructure/sqlite/` worker serialization of file rows (search `projectRelativePath` in the worker message types)
      Approach: add both optional fields wherever a file row is serialized
      (Req: Reference schema upgrade)
- [x] 4.5 Pass namespace into file nodes when indexing
      `src/application/use-cases/index-code-graph.ts`: every `createFileNode(...)` call after analysis
      Approach: `namespace: analysis.namespace`, `namespaceSeparator: analysis.namespaceSeparator`
      (Req: Shared indexing session)
- [x] 4.6 Test: namespace round trip
      `test/infrastructure/sqlite/` (the existing sqlite store spec)
      (Scenario: Namespace round-trips through the files table)
- [x] 4.7 Test: version 15 database is rejected and rebuilt as 16
      `test/infrastructure/sqlite/` schema-version spec; update every assertion that hard-codes 15
      (Scenario: Version 15 database is rejected after the bump)

## 5. Repository root source

- [x] 5.1 Implement `VcsRepositoryRootSource`
      `src/infrastructure/vcs/vcs-repository-root-source.ts` (new)
      Approach: constructor takes `createAdapter: (directory: string) => Promise<VcsAdapter>` (type import from `@specd/core`); `resolve` returns `(await createAdapter(directory)).rootDir()` inside `try`, `undefined` on any throw or rejection
      (Req: Cross-workspace package resolution)
- [x] 5.2 Test the source
      `test/infrastructure/vcs/vcs-repository-root-source.spec.ts`
      Approach: stub factory returns an adapter whose `rootDir()` returns a path; another that throws (Null adapter behaviour); a factory that rejects
      (Scenarios: No detected VCS inspects only the code root, VCS detection failure is not fatal)
- [x] 5.3 Wire the source in composition
      `src/composition/create-code-graph-provider.ts`: `new IndexCodeGraph(store, registry, manifestSource, new VcsRepositoryRootSource(createVcsAdapter))`
      Approach: `import { createVcsAdapter } from '@specd/core'`
      (Req: Cross-workspace package resolution)

## 6. Indexer

- [x] 6.1 Add the constructor parameter
      `src/application/use-cases/index-code-graph.ts`: `IndexCodeGraph` constructor — `repositoryRoots: RepositoryRootSource`
      Approach: store as a private readonly field; update every `new IndexCodeGraph(` call in tests
      (Req: Cross-workspace package resolution)
- [x] 6.2 Resolve accessibility and repository roots for every configured workspace
      `src/application/use-cases/index-code-graph.ts`: `execute`, before the identity loop (~line 884)
      Approach: `configured = options.configuredWorkspaces ?? options.workspaces`; skip workspaces whose code root is not an existing directory and push the "skipped for package resolution" entry to `errors`; resolve roots with `Promise.all` and build `packageWorkspaces` and `repoRootByCodeRoot`
      (Req: Cross-workspace package resolution)
- [x] 6.3 Ask every adapter for an identity and handle conflicts
      `src/application/use-cases/index-code-graph.ts`: identity loop (~lines 885-913)
      Approach: remove the `break`; pass `repoRoot` and a `report` callback that pushes to `errors`; keep a `claims: Map<string, Set<string>>`; on a second distinct workspace delete the identity from `packageToWorkspace` and push the collision error naming all claimants
      (Req: Package identity extraction)
- [x] 6.4 Pass the new prepare context
      `src/application/use-cases/index-code-graph.ts`: prepare call (~line 1214)
      Approach: `{ session, workspaces: packageWorkspaces, projectRoot: options.projectRoot }`
      (Req: Cross-workspace package resolution)
- [x] 6.5 Keep linking independent of package resolution failures
      `src/application/use-cases/index-code-graph.ts`: link loop (~line 1230)
      Approach: remove the `disabledPackageResolution.has(adapter)` skip; pass an empty `Map` as `packageToWorkspace` when disabled
      (Req: Adapter facet model)
- [x] 6.6 Use the workspace repository root in adapter contexts
      `src/application/use-cases/index-code-graph.ts`: contexts at ~lines 1056, 1292, 1351
      Approach: `repoRoot` from `repoRootByCodeRoot.get(ws.codeRoot)`, omitted when undefined
      (Req: Package import resolution context)
- [x] 6.7 Use the importing file category for the qualified-name lookup
      `src/application/use-cases/index-code-graph.ts`: import resolution context (~line 1286)
      Approach: `qualifiedNames: session.getQualifiedNames({ includeTests: fileCategories.get(prefixedPath) === 'test' })`
      (Req: Shared indexing session)
- [x] 6.8 List adapters once by first language
      `src/application/use-cases/index-code-graph.ts`: `adaptersWithoutPackageResolution` and `listDisabledAdapters` (~lines 949-957)
      Approach: collect distinct adapter instances, map each to `adapter.languages()[0]`, sort, dedupe
      (Req: Cross-workspace package resolution)
- [x] 6.9 Hydrate file namespace
      `src/application/use-cases/index-code-graph.ts`: both `session.hydratePersistedFile(file, ...)` calls (~lines 875, 1663)
      Approach: pass `file.namespace` and `file.namespaceSeparator`
      (Req: Shared indexing session)
- [x] 6.10 Restrict the addition-only fallback to code files
      `src/application/use-cases/index-code-graph.ts`: `additionCandidates` (~line 808)
      Approach: `newFiles.some((p) => this.registry.getAdapterForFile(relativeIdentityPath(p)) !== undefined)`
      (Req: Package import incremental closure)
- [x] 6.11 Test: every adapter is asked; collision resolves to neither
      `test/application/use-cases/index-code-graph-package-resolution.spec.ts`
      (Scenarios: Every adapter is asked for an identity, Two workspaces claiming one name resolve to neither, One workspace claiming a name through several adapters is not a conflict)
- [x] 6.12 Test: each code root gets its own repository root
      `test/application/use-cases/index-code-graph-package-resolution.spec.ts`
      Approach: stub `RepositoryRootSource` keyed by code root; spy adapter records `identity` arguments; also `undefined` root and a failing resolver
      (Scenarios: Each code root gets the repository root of its own repository, No detected VCS inspects only the code root, VCS detection failure is not fatal)
- [x] 6.13 Test: partial run maps and prepares every configured workspace; inaccessible workspace is skipped
      `test/application/use-cases/index-code-graph-package-resolution.spec.ts`
      (Scenarios: Partial run maps and prepares every configured workspace, Inaccessible workspace is skipped without failing the run, Inaccessible workspace is skipped)
- [x] 6.14 Test: failure isolation keeps relative barrel linking
      `test/application/use-cases/index-code-graph-package-resolution.spec.ts`
      Approach: also `identity` and `prepare` throwing with a healthy second workspace and adapter
      (Scenarios: A throwing identity does not stop the run, Package resolution failure keeps relative barrel linking)
- [x] 6.15 Test: adapter serving several languages is listed once
      `test/application/use-cases/index-code-graph-package-resolution.spec.ts`
      (Scenario: Adapter serving several languages is listed once)
- [x] 6.16 Test: incremental equals clean rebuild for name-addressed imports; non-code additions do not re-extract
      `test/application/use-cases/index-code-graph-incremental.spec.ts`
      Approach: PHP, Python, Go fixtures; compare normalized semantic state after a one-file change; add a `.md` file and assert no addition-fallback re-extraction
      (Scenarios: Name-addressed imports match a clean rebuild, Added files still re-extract files with possibly unresolved imports)
- [x] 6.17 Test: `package-unknown` is counted only; bindings without target ignored; `link` performs no I/O; Pass 2 failure skips the file without disabling the adapter; closure does not re-extract unrelated files
      `test/application/use-cases/index-code-graph-package-resolution.spec.ts`
      Approach: spy on `fs` while `link` runs; adapter whose `matchSpecifier` throws in Pass 2
      (Scenarios: Package-unknown is counted, never a failure, Bindings without a target are ignored by the ambiguity check, Linking performs no I/O)

## 7. TypeScript adapter

- [x] 7.1 Use the shared search for identity
      `src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `getPackageIdentity`
      Approach: `findPackageManifest(codeRoot, 'package.json', hasName, repoRoot)`; forward `skipped` to `report` as `Package manifest skipped (no identity): <path>`; return the parsed `name`
      (Req: Package and build-context boundary)
- [x] 7.2 Prepare compact data from the same manifest
      `src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `prepareWorkspaceManifest` and `PackageEntryManifest`
      Approach: locate with `findPackageManifest` using the workspace `repoRoot`; store only `{ name, main, exports, codeRootOffset }` where `codeRootOffset = posixRelative(packageRoot, codeRoot)`; `null` when absent; update the `prepare` callback to pass the workspace
      (Req: Package and build-context boundary)
- [x] 7.3 Map published paths relative to the package root
      `src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `sourceCandidates` and `entryCandidatePaths`
      Approach: add `codeRootOffset` parameter; after the existing extension and `dist/`→`src/` mapping strip the offset prefix or return `[]` when the path is outside the code root
      (Req: Package and build-context boundary)
- [x] 7.4 Type-only default import binds no value
      `src/infrastructure/tree-sitter/typescript-language-adapter.ts`: default-import branch of `resolveImports`
      Approach: when the declaration is type-only bind only a default export in `SymbolSpace.Type`; otherwise keep the file dependency only
      (Req: Imports, exports, and public bindings)
- [x] 7.5 Tests: code root below `package.json`, candidate outside code root, nameless manifest, compact data
      `test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`
      (Scenarios: Code root below package.json keeps identity and entry surface, Candidate outside the code root is dropped, package.json without a name is skipped, Prepared data is compact)
- [x] 7.6 Tests: `.d.ts` mapping, other build directory, unselected workspace prepared, read once
      `test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`
      Approach: spy on `fs.readFileSync` to count `package.json` reads; assert no read in `entrySurface`
      (Scenarios: Declaration files map to sources, Other build directories are not mapped, Workspace not indexed in this run is still prepared, Prepare reads each manifest once and keeps compact data)
- [x] 7.7 Test: type-only default import
      `test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`
      (Scenario: Type-only default import binds no value)
- [x] 7.8 Tests: side-effect, dynamic and `require` package imports; package re-exports and dependencies; default import with zero or two default exports; fingerprint changes when `exports` is edited
      `test/application/use-cases/package-resolution.spec.ts`
      (Req: Imports, exports, and public bindings)

## 8. Go adapter

- [x] 8.1 Unquote the module path and use the shared search
      `src/infrastructure/tree-sitter/go-language-adapter.ts`: `getPackageIdentity`, new `readGoModulePath`
      Approach: regex `/^module\s+(?:"([^"]+)"|`([^`]+)`|(\S+))/m`, first defined group
      (Req: Package identity, exports, and imports)
- [x] 8.2 Store the module offset in prepare
      `src/infrastructure/tree-sitter/go-language-adapter.ts`: `packageResolutionFacet.prepare`, new `GO_MODULE_OFFSETS_KEY`
      Approach: `Map<workspace, string | undefined>`; offset = posix relative path from the `go.mod` directory to the code root; `undefined` when no `go.mod`
      (Req: Package identity, exports, and imports)
- [x] 8.3 Apply the offset in `entrySurface`
      `src/infrastructure/tree-sitter/go-language-adapter.ts`: `entrySurface`
      Approach: `[]` when offset is `undefined`; strip the offset prefix from the module-relative directory; `[]` when the directory is outside the offset
      (Req: Package identity, exports, and imports)
- [x] 8.4 Tests: `go.mod` above the code root; directory outside; quoted module; module located once; blank and dot imports
      `test/infrastructure/tree-sitter/go-language-adapter.spec.ts`
      (Scenarios: go.mod above the code root, Package directory outside the code root yields no entries, Quoted module path is unquoted, Module directory is located once in prepare)

## 9. Python adapter

- [x] 9.1 Use the shared search for identity
      `src/infrastructure/tree-sitter/python-language-adapter.ts`: `getPackageIdentity`
      Approach: `findPackageManifest(codeRoot, 'pyproject.toml', (c) => readPythonProjectName(c) !== undefined, repoRoot)` with `report` for skipped files
      (Req: Imports and package resolution)
- [x] 9.2 Normalize names per PEP 503 without guessing
      `src/infrastructure/tree-sitter/python-language-adapter.ts`: `resolvePackageFromSpecifier`, new `normalizePythonDistName`
      Approach: `value.toLowerCase().replace(/[-_.]+/g, '-')`; return the package only when exactly one known package matches
      (Req: Imports and package resolution)
- [x] 9.3 Submodule imports without `__init__.py`
      `src/infrastructure/tree-sitter/python-language-adapter.ts`: `resolveImports` from-import branch (~lines 994-1005)
      Approach: try the submodule lookup for `not-exported` and `no-entry-surface`; accept exactly one entry, otherwise diagnostic `ambiguous`
      (Req: Imports and package resolution)
- [x] 9.4 Tests: normalization, ambiguous names, submodule without init, two roots, nameless `pyproject.toml`, unknown project, unimported name, `import pkg.mod`, `importlib`, `.py` + `.pyi`
      `test/infrastructure/tree-sitter/python-language-adapter.spec.ts`
      (Scenarios: Dots and case normalize, Equal normalized names stay unresolved, Submodule import without an init file, Submodule indexed under two roots stays unresolved, pyproject.toml without a project name is skipped)

## 10. PHP adapter

- [x] 10.1 Add the cached `readComposerManifest`
      `src/infrastructure/tree-sitter/php-language-adapter.ts`: new private method and `ComposerManifestData`
      Approach: locate with `findPackageManifest(codeRoot, 'composer.json', () => true, repoRoot)`; parse once; cache in the `'php-resolution-metadata'` session state (`manifestByCodeRoot`); resolve PSR-4 directories against the package root; merge `autoload` then `autoload-dev` per prefix keeping every directory; sort prefixes by length descending, stable; record `devDirectories`
      (Req: Namespaces, use aliases, and Composer resolution)
- [x] 10.2 Use it for identity, prepare and analysis-time metadata
      `src/infrastructure/tree-sitter/php-language-adapter.ts`: `getPackageIdentity`, `preparePackages`, `prepareResolutionMetadata`, `buildPsr4Map`
      Approach: identity returns the cached non-empty `name`; report skipped nameless manifests; remove the second parse
      (Req: Namespaces, use aliases, and Composer resolution)
- [x] 10.3 Return Composer-ordered candidates and depend only on the first indexed one
      `src/infrastructure/tree-sitter/php-language-adapter.ts`: `qualifiedNameEntries` and the `use` import branch
      Approach: keep every in-code-root candidate in map order; the import adds `entries.entries[0]` only
      (Req: Namespaces, use aliases, and Composer resolution)
- [x] 10.4 Own-PSR-4 fallback: no absolute id, no test file for production importers
      `src/infrastructure/tree-sitter/php-language-adapter.ts`: `resolveQualifiedNameFromSession`
      Approach: ids = `[`${workspace}:${relative}`]` only; skip candidates under `devDirectories` or with category `test` unless the importing file is a test
      (Req: Namespaces, use aliases, and Composer resolution)
- [x] 10.5 Tests: single parse, merge, ordering, own fallback (three cases), no I/O after deleting `composer.json`
      `test/infrastructure/tree-sitter/php-language-adapter.spec.ts`
      (Scenarios: Prepare parses composer.json once, autoload and autoload-dev share a prefix, Candidates follow the longest prefix first, Own PSR-4 fallback without a Composer name, Own PSR-4 fallback never returns a test file for production code, Own PSR-4 fallback never uses an absolute path)

## 11. Resolver

- [x] 11.1 Stop deriving qualified names
      `src/application/use-cases/resolve-symbol-reference.ts`: qualified lookup (~line 1037)
      Approach: `const stored = target.qualifiedName`; remove the unused `byId`
      (Req: Structured reference input)
- [x] 11.2 Remove the generic dotted parser fallback
      `src/application/use-cases/resolve-symbol-reference.ts`: `parseAnchoredReference` (~lines 1100-1117)
      Approach: when no adapter is selected return `{ candidates: [] }`; remove the registry/language special case; drop the `parseDottedMemberReference` import if unused (graph search first)
      (Req: Structured reference input)
- [x] 11.3 Tests: anchor without adapter, no derived qualified name, adapter without the facet
      `test/application/use-cases/resolve-symbol-reference.spec.ts`
      (Scenarios: Anchor without an adapter leaves human text unresolved, Qualified name is not derived from owner and member)

## 12. Adapter registry

- [x] 12.1 Validate `languages()`, `extensions()` and `resolutionManifests()` results
      `src/infrastructure/tree-sitter/adapter-registry.ts`: `register`
      Approach: throw `SpecdError` `INVALID_LANGUAGE_ADAPTER` before any state change; manifest values are non-empty basenames without `/`, `\`, `*`, `?`, `[`, `]`, `{`, `}`; name the adapter `<unknown>` when `languages()` is malformed
      (Req: Adapter registry)
- [x] 12.2 Tests for the three malformed cases and registry unchanged
      `test/infrastructure/tree-sitter/adapter-registry.spec.ts`
      (Scenarios: Malformed languages result is rejected, Malformed extensions result is rejected, Invalid resolution manifest value is rejected)
- [x] 12.3 Tests: capability flags and facets are separate; a facet does not satisfy a capability flag
      `test/infrastructure/tree-sitter/adapter-registry.spec.ts`
      (Req: Adapter facet model)

## 13. SDK

- [x] 13.1 Pass all configured workspaces to the indexer
      `packages/sdk/src/orchestration/run-index-project-graph.ts`: `executeIndex`
      Approach: add `configuredWorkspaces: listed` to the `indexProjectGraph.execute({...})` object; no VCS logic
      (Req: Cross-workspace package resolution)
- [x] 13.2 Test the call
      `packages/sdk/test/orchestration/run-index-project-graph.spec.ts`
      Approach: with `input.workspaces = ['a']` assert `workspaces` has only `a` and `configuredWorkspaces` has all listed
      (Scenario: Partial run maps and prepares every configured workspace)

## 14. Cross-cutting tests and test hygiene

- [x] 14.1 Resolver end to end for the four languages
      `test/application/use-cases/package-resolution.spec.ts`
      Approach: follow `import:package` steps with the ordered path; positive anchored-file filter; `graph impact` dependents across workspaces
      (Req: Package import bindings)
- [x] 14.2 Test-to-test-helper dependency visible to impact
      `test/application/use-cases/package-resolution.spec.ts`
      (Scenario: A test importer resolves to a test helper)
- [x] 14.3 Normalize test title casing
      `test/**/package-resolution.spec.ts`, `test/**/*language-adapter.spec.ts`, `test/application/use-cases/index-code-graph*.spec.ts`
      Approach: titles added by the previous change start with a capital letter; fix the title at `package-resolution.spec.ts:425` to match its assertion
      (Req: proposal item 4)

## 15. Documentation

- [x] 15.1 Update `packageResolution` in the language adapter guide
      `docs/code-graph/language-adapters.md`
      Approach: three roots, repository-bounded search, `report` argument, `PackagePreparationContext.projectRoot` and per-workspace `repoRoot`, every adapter asked for an identity, collision handling
      (Req: Package resolution facet)
- [x] 15.2 Update "Resolving a package import"
      `docs/code-graph/language-adapters.md`
      Approach: `package-unknown` is counted and never a failure
      (Req: Package import resolution context)
- [x] 15.3 Inline checklist steps 6 and 7
      `docs/code-graph/language-adapters.md`, "Checklist for a new language"
      Approach: write the content the steps point to (what the adapter spec must cover; which list of built-in adapters to update) so a reader needs no spec access
      (Req: Adding a language adapter)
- [x] 15.4 Document partial runs, inaccessible workspaces and the schema 16 rebuild
      `docs/code-graph/index.md`
      (Req: Cross-workspace package resolution, Reference schema upgrade)
- [x] 15.5 Check other docs for stale statements
      `docs/code-graph/use-cases.md`, `docs/code-graph/services.md`
      Approach: `rg "repoRoot|getQualifiedNames|first adapter"`; update any match

## 16. Final verification

- [x] 16.1 Build, typecheck, lint and test the affected packages
      Run `pnpm -F @specd/code-graph -F @specd/sdk build`, `pnpm -r typecheck`, `pnpm lint`, `pnpm -F @specd/code-graph -F @specd/sdk test`; all must pass
- [x] 16.2 Manual check: code root below its manifest
      Temp repo with `packages/app/package.json` and code root `packages/app/src`; `node packages/cli/dist/index.js graph index --format toon`; expect an identity and resolved cross-workspace imports, no `no-entry-surface`
- [x] 16.3 Manual check: partial run
      `graph index --workspace <one>`; expect `externalPackageImports` equal to a full run for that workspace
- [x] 16.4 Manual check: schema 16 rebuild
      With a version 15 `graph.db`, `graph stats` reports `SCHEMA_INCOMPATIBLE`; `graph index` rebuilds as version 16
- [x] 16.5 Manual check: incremental equivalence
      Edit one PHP file that imports a class from an unchanged file; `graph index` twice and `graph index --force`; dependency relations must be equal

## 17. Compliance review follow-up fixes

- [x] 17.1 Populate `fileCategories` in Pass 1 for newly analyzed and changed files (D1)
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: Pass 1 registration loop (~line 1068) — call `fileCategories.set(prefixedPath, fileInfo.category)`
      Approach: update `fileCategories` whenever a file is registered in Pass 1 so `fileCategories.get(prefixedPath) === 'test'` is true for newly added or modified test files in Pass 2
      (Req: Shared indexing session)
- [x] 17.2 Purge sole package identities when an adapter fails on a later workspace or in `prepare` (D-LA-3)
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: identity and prepare loops (~lines 885-935, ~1214)
      Approach: track `claimsByAdapter: Map<string, Set<LanguageAdapter>>`; when an adapter throws in `identity` or `prepare` and is added to `disabledPackageResolution`, remove any identity from `packageToWorkspace` whose claiming adapters are all in `disabledPackageResolution`
      (Req: Package identity extraction, Cross-workspace package resolution)
- [x] 17.3 Pair `namespaceSeparator` with `namespace` in `createFileNode` (D5)
      `packages/code-graph/src/domain/value-objects/file-node.ts`: `createFileNode` — default `namespaceSeparator` to `'.'` whenever `props.namespace !== undefined`
      Approach: replace `props.namespace !== undefined && props.namespaceSeparator !== undefined` with `props.namespace !== undefined ? { namespaceSeparator: props.namespaceSeparator ?? '.' } : {}` and update `file-node.spec.ts`
      (Req: File node)
- [x] 17.4 Return explicit unresolved when an anchored reference yields no adapter candidates (D6)
      `packages/code-graph/src/application/use-cases/resolve-symbol-reference.ts`: anchored reference branch (~line 637)
      Approach: when `request.file !== undefined || request.publicSurface !== undefined` and `parseAnchoredReference` returns `candidates.length === 0` for non-simple text, return `unresolvedReference(request, 'REFERENCE_UNPROVEN', ...)` immediately instead of falling through to simple-identifier resolution
      (Req: Structured reference input)
- [x] 17.5 Canonicalize PHP paths in `prepare`, search named `composer.json` first, and remove dead methods (D-PHP-1, D-PHP-2, D-PHP-3)
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: `readComposerManifest`, `qualifiedNameEntries`, `resolveQualifiedNameFromSession`
      Approach: search `findPackageManifest(codeRoot, 'composer.json', hasComposerName, repoRoot)` first and fall back to `() => true` only if undefined; store `canonicalCodeRoot = canonical(codeRoot)` and canonicalized PSR-4 directories in `ComposerManifestData` so `qualifiedNameEntries` and `resolveQualifiedNameFromSession` compute `path.relative` lexically with zero `canonical()` / `realpathSync` calls in Pass 2; remove unused `resolvePackageFromSpecifier`, `resolveQualifiedNameWithMap`, and `buildPsr4Map`
      (Req: Namespaces, use aliases, and Composer resolution)
- [x] 17.6 Harden TypeScript `sourceCandidates`, `exports: null`, and `import type` regex (D-TS-1, D-TS-2, D-TS-3)
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `sourceCandidates`, `entryCandidatePaths`, `extractTypeScriptImports`
      Approach: map bare `relative === 'dist'` to `'src'`; check `manifest.exports !== undefined && manifest.exports !== null` before taking the `exports` branch; use `/(?:^|\s)import\s+type(?:\s+(?!from\b)|\s*\{)/` so `import type from './x'` is not marked `typeOnly`
      (Req: Package and build-context boundary, Imports, exports, and public bindings)
- [x] 17.7 Add tests for compliance fixes (G1, G2, D-PHP-1, D-PHP-2, D-LA-3, `IndexProjectGraph` `configuredWorkspaces`)
      `packages/code-graph/test/application/use-cases/index-code-graph-package-resolution.spec.ts`, `packages/code-graph/test/application/use-cases/package-resolution.spec.ts`, `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`, `packages/code-graph/test/application/use-cases/index-project-graph.spec.ts`
      Approach: make partial-run test G1 force re-extraction of workspace A and compare with a full run; add symbol-level test G2 (`CALLS` edge from new test file to test helper symbol, absent from production file); add PHP tests for nameless nearest + named parent `composer.json` and zero `realpathSync` in `entrySurface`; add test for later-disabled adapter purging sole earlier identity; add unit test in `index-project-graph.spec.ts` asserting `configuredWorkspaces` is forwarded
      (Scenarios: Partial run maps and prepares every configured workspace, A test importer resolves to a test helper, Prepare prefers named composer.json over nearest nameless composer.json, entrySurface performs no filesystem access during Pass 2, Adapter disabled on a later workspace drops earlier sole identities, Prepared inputs are forwarded unchanged)
- [x] 17.8 Rebuild, typecheck, lint, test, and re-index project graph
      Run `pnpm -F @specd/code-graph -F @specd/sdk build`, `pnpm -r typecheck`, `pnpm lint`, `pnpm -r test`, and `node packages/cli/dist/index.js graph index --format toon`

## 18. Full compliance audit follow-up

- [x] 18.1 Add the workspace accessibility application port
      `packages/code-graph/src/application/ports/workspace-accessibility-source.ts`: new `WorkspaceAccessibilitySource` — define `isAccessibleDirectory(directory: string): Promise<boolean>` with named export and JSDoc
      Approach: keep the contract filesystem-agnostic and permit rejection so the use case can normalize third-party/fake failures
      (Req: Cross-workspace package resolution; scenario: Workspace accessibility is supplied through an application port)
- [x] 18.2 Add the Node workspace accessibility adapter
      `packages/code-graph/src/infrastructure/fs/node-workspace-accessibility-source.ts`: new `NodeWorkspaceAccessibilitySource` — implement the port with `node:fs/promises.stat`
      Approach: return true only for a directory; catch missing, unreadable, and stat failures and return false; keep all Node filesystem imports in infrastructure
      (Req: Cross-workspace package resolution)
- [x] 18.3 Inject accessibility into `IndexCodeGraph`
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: constructor and configured-workspace preparation — remove direct `node:fs` imports and use `WorkspaceAccessibilitySource`
      Approach: probe every configured code root in parallel, catch a rejected port call as inaccessible, preserve the exact non-fatal diagnostic, and exclude only that workspace from identity and prepare
      (Req: Cross-workspace package resolution; scenarios: Inaccessible workspace is skipped without failing the run, Accessibility probe failure is non-fatal)
- [x] 18.4 Wire the Node accessibility adapter in composition
      `packages/code-graph/src/composition/create-code-graph-provider.ts`: `IndexCodeGraph` construction — inject `new NodeWorkspaceAccessibilitySource()` after `RepositoryRootSource`
      Approach: update every direct constructor call to supply an explicit typed fake so missing production wiring cannot be hidden by a default
      (Req: Cross-workspace package resolution)
- [x] 18.5 Return parsed values and terminal diagnostics from manifest search
      `packages/code-graph/src/infrastructure/tree-sitter/find-manifest-field.ts`: `ManifestInspection<T>`, `PackageManifestMatch<T>`, `PackageManifestSearchResult<T>`, `findPackageManifest<T>` — replace the boolean/undefined result contract
      Approach: read each candidate once, invoke the inspector once, retain the nearest fallback, return `{ match, skipped }` at every terminal branch, and append a displaced fallback to `skipped` when a preferred match is found
      (Req: Package resolution facet; scenario: Terminal skipped manifest still reports its diagnostic)
- [x] 18.6 Adapt TypeScript, Go, and Python manifest consumers
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`, `go-language-adapter.ts`, `python-language-adapter.ts`: identity and preparation searches — consume `result.match?.value` and always forward `result.skipped`
      Approach: inspector returns the already parsed/extracted compact value; never parse `match.content` again; preserve repository bounds and existing compact session state
      (Req: Package identity extraction, Package resolution facet)
- [x] 18.7 Make Composer selection a single read-and-parse search
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: `readComposerManifest`, `getPackageIdentity`, `preparePackages` — remove the named-search-plus-fallback-search double pass
      Approach: one inspector returns `match` for a named parsed manifest, `fallback` for a valid nameless parsed manifest, and `skip` for malformed data; build and cache `ComposerManifestData` from `match.value` without reparsing content
      (Req: Namespaces, use aliases, and Composer resolution; scenarios: Prepare parses composer.json once, Nameless Composer fallback is also read and parsed once)
- [x] 18.8 Enforce stored-only qualified lookup in the session store
      `packages/code-graph/src/application/services/session-reference-store.ts`: `findLogicalSymbolsByQualifiedNames` — remove `deriveQualifiedName`, `byId`, and synthesized qualified-name results
      Approach: filter original logical symbols only by membership of their stored `symbol.qualifiedName`; keep the public signature unchanged and match persisted-store behavior
      (Req: Structured reference input; scenario: Session and persisted lookup reject an unstored qualified spelling equally)
- [x] 18.9 Assert the public SQLite recovery error contract
      `packages/code-graph/test/infrastructure/sqlite/*.spec.ts`: schema-version-15 open and recovery tests — expect `GraphStorageRecoveryRequiredError` with reason `SCHEMA_INCOMPATIBLE`
      Approach: allow `GraphSchemaIncompatibleError` only as internal cause/evidence; retain assertions that `graph index` recreates version 16, rotates `storage.epoch`, and rebuilds indexes
      (Req: Reference schema upgrade; scenario: Version 15 database is rejected after the bump)
- [x] 18.10 Add accessibility and manifest-search unit coverage
      `packages/code-graph/test/infrastructure/fs/node-workspace-accessibility-source.spec.ts`, `test/infrastructure/tree-sitter/find-manifest-field.spec.ts`: new edge-case tests
      Approach: cover directory/file/missing/stat-failure outcomes; cover no-match skipped diagnostics, one inspector call per read file, preferred-over-fallback selection, and parsed-value reuse using `mkdtemp` and `path.join`
      (Req: Cross-workspace package resolution, Package resolution facet)
- [x] 18.11 Add use-case architecture and failure coverage
      `packages/code-graph/test/application/use-cases/index-code-graph-package-resolution.spec.ts`: accessibility-port scenarios and observable package-resolution outcomes
      Approach: use typed fakes for false, true, and rejecting probes; assert diagnostics, external counts, unaffected workspace indexing, stored bindings/relations, and absence of direct `node:fs` imports in the application use case
      (Req: Cross-workspace package resolution, Package import resolution context)
- [x] 18.12 Add session/persisted parity coverage
      `packages/code-graph/test/application/services/session-reference-store.spec.ts`: qualified-name lookup tests — compare a symbol lacking stored `qualifiedName` through session and SQLite-backed lookup
      Approach: assert identical empty candidate sets for the derived spelling and unchanged matching for an explicitly stored spelling
      (Req: Structured reference input)
- [x] 18.13 Replace platform-specific fixtures and partial provider casts
      `packages/code-graph/test/**/*package-resolution*.spec.ts`, `test/application/use-cases/index-project-graph.spec.ts`: path fixtures and provider fake — remove POSIX root assumptions and `as unknown as` partial mocks
      Approach: build paths with `mkdtemp`, `path.join`, and normalized assertions; implement the complete typed provider fake and assert `open`, `close`, `clear`, `recreate`, lock, and process hooks are not called
      (Req: Accepts open provider and prepared inputs; scenario: Prepared provider lifecycle remains untouched)
- [x] 18.14 Strengthen outcome-level assertions
      `packages/code-graph/test/application/use-cases/package-resolution.spec.ts`, `index-code-graph-package-resolution.spec.ts`: audit-added scenarios — supplement collaborator-call assertions with persisted graph outcomes
      Approach: assert exact local binding targets, `import:package` resolution steps, `IMPORTS`/`CALLS` relations, ambiguity results, diagnostic counts, and clean-versus-incremental normalized semantic equality
      (Req: Package import bindings, Identity-sensitive incremental equivalence)
- [x] 18.15 Refresh code-graph documentation for the final contracts
      `docs/code-graph/language-adapters.md`, `docs/code-graph/index.md`, `docs/code-graph/use-cases.md`, `docs/code-graph/services.md`: package search, accessibility, parse-once, and recovery text
      Approach: state that terminal skips are reported, selected manifests are parsed once, accessibility is port-driven, and schema mismatch is exposed through `GraphStorageRecoveryRequiredError`; remove stale direct-filesystem or low-level-error wording
      (Req: Package resolution facet, Cross-workspace package resolution, Reference schema upgrade)
- [x] 18.16 Run automated and manual final verification
      Repository checks and temporary fixtures — verify every follow-up after implementation
      Approach: run `pnpm -F @specd/code-graph -F @specd/sdk build`, `pnpm -r typecheck`, `pnpm lint`, `pnpm -r test`, and `node packages/cli/dist/index.js graph index --format toon`; then execute the below-manifest, partial-workspace, version-15 recovery, and PHP incremental-versus-force checks with the exact CLI commands in `design.md`
      (Req: all affected requirements and verification scenarios)
