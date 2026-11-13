# Design: code-graph-package-resolution-hardening

## Summary

Package resolution must be correct for code roots that sit below their manifest, for workspaces that live in other repositories than the project, for partial (`--workspace`) runs, and for incremental runs of name-addressed languages. The change adds one shared manifest search, resolves a repository root per workspace, maps and prepares every configured workspace, asks every adapter for an identity, persists the file namespace so unchanged files can fill the qualified-name lookup, removes two resolver fallbacks, and closes test gaps. All code lives in `@specd/code-graph` (workspace `code-graph`) plus one small change in `@specd/sdk`.

Terminology (used in every section below):

- **Project root**: directory of `specd.yaml` (`IndexOptions.projectRoot`). Anchors configuration, graph storage, project-relative paths. Never a boundary for package resolution.
- **Code root**: `ProjectWorkspace.codeRoot`. May be inside the project root or in another repository.
- **Repository root** of a workspace: root of the VCS repository that contains the workspace code root, or `undefined` when no VCS is detected.
- **Package root**: directory of the manifest that gives a workspace its package identity (`package.json`, `go.mod`, `pyproject.toml`, `composer.json`).

## Affected areas

All paths are relative to `packages/`. Risk values come from `specd graph impact`.

### `code-graph/src/infrastructure/tree-sitter/find-manifest-field.ts` — risk HIGH (5 direct dependents: the four adapters and the provider composition; re-exported from `index.ts` and `public.ts`)

Today `findManifestField(startDir, filename, extract, boundary?)` compares `dir === boundary` by string equality. When `startDir` is outside `boundary` (external workspace, symlink, trailing separator) the equality never matches and the walk reaches the filesystem root. A nearest manifest whose `extract` returns `undefined` is skipped silently, and skipped paths are lost entirely when the bounded search finishes without a usable manifest.

Change: add generic `findPackageManifest<T>` and re-implement `findManifestField` on top of it (same exported name and signature, so `public.ts` and `index.ts` exports do not change; add `findPackageManifest`, `ManifestInspection`, `PackageManifestMatch`, and `PackageManifestSearchResult` to both barrels). The search returns its skipped paths even when no manifest matches, and carries the inspector's parsed value so a selected manifest is never parsed again by its adapter.

### `code-graph/src/domain/value-objects/language-adapter-facets.ts`

```ts
export interface PackageWorkspace {
  readonly name: string
  readonly codeRoot: string
  /** Root of the repository that contains `codeRoot`; absent when no VCS is detected. */
  readonly repoRoot?: string
}

export interface PackagePreparationContext {
  readonly session: IndexSession
  /** Every accessible configured workspace, including workspaces not selected for the run. */
  readonly workspaces: readonly PackageWorkspace[]
  /** Directory of the project configuration. Never a manifest search boundary. */
  readonly projectRoot: string
}
```

`PackagePreparationContext.repoRoot` is removed (alpha: no compatibility alias). `PackageResolutionFacet.identity` becomes:

```ts
identity(
  codeRoot: string,
  repoRoot?: string,
  report?: (message: string) => void,
): string | undefined
```

`report` receives one message per skipped manifest (see "Manifest search"). The JSDoc of `identity` states: "searches at and above `codeRoot`, bounded by `repoRoot`; when `repoRoot` is absent only `codeRoot` is inspected".

### `code-graph/src/domain/value-objects/language-adapter.ts`

`AdapterAnalyzeContext.repoRoot`, `ImportResolutionContext.repoRoot`, and `RelationBuildContext.repoRoot` keep their names. Their meaning changes from "project root" to "repository root of the workspace code root being processed". Their JSDoc is updated. `ImportResolutionContext.qualifiedNames` is now the lookup for the importing file (see "Qualified-name lookup").

### `code-graph/src/domain/value-objects/index-options.ts`

Add to `IndexOptions`:

```ts
/**
 * Every configured workspace, including workspaces not selected for this run. Used to map
 * package identities and prepare manifests so a partial run resolves the same as a full run.
 * Defaults to `workspaces` when omitted.
 */
readonly configuredWorkspaces?: readonly ProjectWorkspace[]
```

The JSDoc of `projectRoot` is corrected (it is no longer "the boundary for monorepo package resolution").

### `code-graph/src/domain/value-objects/index-session.ts`, `application/use-cases/in-memory-index-session.ts` — session

- `getQualifiedNames(options?: { readonly includeTests?: boolean }): ReadonlyMap<string, string>` replaces `getQualifiedNames()`. Default (`includeTests` absent or `false`) returns only symbols of non-test files. `includeTests: true` returns production and test symbols (production wins on a duplicate name).
- `findSymbolByQualifiedName(qualifiedName, options?)` gets the same optional argument.
- `InMemoryIndexSession` keeps two maps: `qualifiedNameSymbolMap` (non-test files) and `testQualifiedNameSymbolMap` (test files). The merged map for `includeTests: true` is built lazily and invalidated whenever either map changes.
- `registerAnalysis` fills the map matching `fileInfo.category` (`'test'` goes to the test map; `source` and `ignored` go to the production map as today) using `analysis.namespace` and `analysis.namespaceSeparator ?? '.'`.
- `hydratePersistedFile(file, symbols)`: `file` gains `readonly namespace?: string` and `readonly namespaceSeparator?: string`. After `registerFile`, when `file.namespace` is defined, for each symbol put `${file.namespace}${file.namespaceSeparator ?? '.'}${symbol.name}` → `symbol.id` into the map selected by `file.category` (same rule as `registerAnalysis`).

### `code-graph/src/domain/value-objects/file-node.ts`

`FileNode` gains `readonly namespace?: string | undefined` and `readonly namespaceSeparator?: string | undefined`; `createFileNode` accepts both and, whenever `namespace` is defined (`props.namespace !== undefined`), sets `namespaceSeparator: props.namespaceSeparator ?? '.'` so `namespace` and `namespaceSeparator` are always paired (both omitted when `namespace` is `undefined`). Equality semantics are unchanged (by `path`).

### `code-graph/src/application/use-cases/index-project-graph.ts`

`IndexProjectGraphInput` gains `readonly configuredWorkspaces?: readonly ProjectWorkspace[]` (matching `IndexOptions.configuredWorkspaces`), and `IndexProjectGraph.execute` forwards `configuredWorkspaces: input.configuredWorkspaces` into `input.provider.index(...)` when defined.

### `code-graph/src/application/use-cases/index-code-graph.ts` — risk CRITICAL for downstream (24 dependent files via `resolve-symbol-reference`; the indexer itself is called by the provider, the SDK and the worker)

Constructor:

```ts
constructor(
  store: GraphStore,
  registry: AdapterRegistry,
  manifestSource: ResolutionManifestSource,
  repositoryRoots: RepositoryRootSource,
  workspaceAccessibility: WorkspaceAccessibilitySource,
)
```

Changes inside `execute`:

1. **Workspace sets.** `const configured = options.configuredWorkspaces ?? options.workspaces`. `options.workspaces` still drives discovery, deletion and indexing.
2. **Accessibility and repository roots (new block before the identity loop, ~line 884).** For every workspace in `configured`, call `await this.workspaceAccessibility.isAccessibleDirectory(codeRoot)`. Catch a rejected probe and treat it as `false`. When false, push `{ filePath: `${ws.name}:<manifest>`, message: `Workspace "${ws.name}" skipped for package resolution: code root "${ws.codeRoot}" is not accessible` }` to `errors` and exclude it from `accessible`. The application use case imports no `node:fs` API. For each accessible workspace call `repoRoot = await this.repositoryRoots.resolve(ws.codeRoot)` (the port never throws; it returns `undefined` on any failure). Resolve with `Promise.all`; cache by canonical code root string. Build `const packageWorkspaces: readonly PackageWorkspace[]` from `accessible` including `repoRoot` when defined, and `const repoRootByCodeRoot = new Map<string, string>()` for the later contexts.
3. **Identity loop (lines ~885-913).** Iterate `accessible` workspaces × all adapters providing `packageResolution`; no `break` after the first identity. Call `adapter.packageResolution.identity(ws.codeRoot, repoRoot, (message) => errors.push({ filePath: `${ws.name}:<manifest>`, message }))`. Track `claimsByAdapter: Map<string, Set<LanguageAdapter>>` alongside `claims: Map<string, Set<string>>`. When an adapter throws in `identity`, record the error, add the adapter to `disabledPackageResolution`, and purge any identity from `packageToWorkspace` whose claiming adapters in `claimsByAdapter` are all in `disabledPackageResolution`. Conflict handling:
   - `claims: Map<string, Set<string>>` records which workspaces claimed each identity.
   - Same workspace again (any adapter): record the adapter in `claimsByAdapter`, nothing else happens.
   - A different workspace claims an identity already in `claims`: add it to the claim set, `packageToWorkspace.delete(identity)`, and push `{ filePath: `${ws.name}:<manifest>`, message: `Package identity collision: "${identity}" is claimed by workspaces ${sorted names joined with ", "}` }`. From then on that identity is never re-added.
   - Otherwise `packageToWorkspace.set(identity, ws.name)` and record the adapter in `claimsByAdapter`.
4. **Prepare (line ~1214).** `adapter.packageResolution.prepare({ session, workspaces: packageWorkspaces, projectRoot: options.projectRoot })`. If `prepare` throws, record the error, add the adapter to `disabledPackageResolution`, and purge any identity from `packageToWorkspace` whose claiming adapters in `claimsByAdapter` are all in `disabledPackageResolution`.
5. **Link loop (line ~1230).** Remove `if (disabledPackageResolution.has(adapter)) continue`. Call `link({ session, packageToWorkspace: disabledPackageResolution.has(adapter) ? new Map() : packageToWorkspace })`. A throw keeps the existing handling (record the error; add the adapter to `disabledPackageResolution` when it provides `packageResolution`).
6. **Adapter contexts (lines ~1056, 1292, 1351).** Replace `repoRoot: options.projectRoot` with `repoRoot: ws === undefined ? undefined : repoRootByCodeRoot.get(ws.codeRoot)` (omit the property when `undefined`, `exactOptionalPropertyTypes`).
7. **Qualified names and `fileCategories` (lines ~1068, ~1286).** Update `fileCategories.set(prefixedPath, category)` in Pass 1 whenever a new or changed file is registered, so `fileCategories.get(prefixedPath) === 'test'` is accurate for both hydrated unchanged files and newly analyzed/changed files in Pass 2 (`qualifiedNames: session.getQualifiedNames({ includeTests: fileCategories.get(prefixedPath) === 'test' })`).
8. **`adaptersWithoutPackageResolution` (lines ~949-957).** Compute the set of distinct adapter instances without the facet or in `disabledPackageResolution`, name each by `adapter.languages()[0]` (skip adapters whose `languages()` is empty; the registry already rejects them), and return the sorted unique list.
9. **File nodes and hydration (lines ~875, ~1663 and the place that builds `FileNode` after analysis).** Pass `namespace` and `namespaceSeparator` from `analysis` into `createFileNode`, and pass them from the stored `FileNode` into `session.hydratePersistedFile`.
10. **Addition-only fallback (line ~808).** `const addsCode = newFiles.some((p) => this.registry.getAdapterForFile(relativeIdentityPath(p)) !== undefined)` and `additionCandidates = addsCode ? existingFiles.map((e) => e.path) : []`.

### `code-graph/src/application/ports/repository-root-source.ts`, `infrastructure/vcs/vcs-repository-root-source.ts`, `application/ports/workspace-accessibility-source.ts` (new), and `infrastructure/fs/node-workspace-accessibility-source.ts` (new)

See "New constructs".

### `code-graph/src/composition/create-code-graph-provider.ts` — wiring

`new IndexCodeGraph(store, registry, manifestSource, new VcsRepositoryRootSource(createVcsAdapter), new NodeWorkspaceAccessibilitySource())` with `import { createVcsAdapter } from '@specd/core'` (composition may import infrastructure; this mirrors `composition/use-cases/get-graph-health.ts`). Update every test construction site to inject an explicit fake; do not rely on a default that would hide missing composition wiring.

### `code-graph/src/application/services/package-import-resolver.ts`

No signature change. `packageToWorkspace` now omits conflicted identities (see step 3) and `disabledPackageResolution` is still honored; verify and keep the `facet-absent` reason for disabled adapters.

### `code-graph/src/application/use-cases/resolve-symbol-reference.ts` — risk CRITICAL (24 dependents)

1. Line ~1037: replace `const stored = target.qualifiedName ?? deriveQualifiedName(target, byId)` with `const stored = target.qualifiedName`; a target without a stored `qualifiedName` never matches. Remove `byId` if it becomes unused. Keep the exported `deriveQualifiedName` in `domain/value-objects/symbol-reference.ts` (still used when logical symbols are enriched at write time, see `symbol-reference.ts:424`).
2. Line ~1117 (`parseAnchoredReference`): remove the final `return parseDottedMemberReference(request.requested)` and the `registry !== undefined && request.language !== undefined` special case. New tail: when `adapter === undefined` return `{ candidates: [] }` regardless of registry or language. Moreover, in the caller of `parseAnchoredReference`, when an anchor (`request.file !== undefined || request.publicSurface !== undefined`) or explicit `request.language` is supplied for non-simple text and `parsed.candidates.length === 0`, return `unresolvedReference(request, 'REFERENCE_UNPROVEN', ...)` immediately instead of falling through to simple-identifier resolution. Delete `parseDottedMemberReference` from this file's imports if unused elsewhere.

### `code-graph/src/application/services/session-reference-store.ts`

`SessionReferenceStore.findLogicalSymbolsByQualifiedNames` MUST compare the request only with `symbol.qualifiedName`. Remove the `deriveQualifiedName` import, the temporary `byId` map, the owner-chain fallback, and the synthesized `{ ...symbol, qualifiedName: spelling }` result. The method keeps its signature and returns the original stored symbols whose stored value is in the requested set. This makes the in-session backend observationally equal to SQLite for symbols with no persisted `qualified_name`.

### Language adapters (`code-graph/src/infrastructure/tree-sitter/`)

#### `typescript-language-adapter.ts` (risk part of HIGH set; 112 KB file)

- `getPackageIdentity(codeRoot, repoRoot, report)`: use `findPackageManifest` with an inspector that parses JSON once and returns `{ kind: 'match', value: { name } }` only for a non-empty string `name`, otherwise `skip`; forward every `result.skipped` entry to `report` even when `result.match` is absent; return `result.match?.value.name`.
- `prepareWorkspaceManifest(session, workspace)` (lines ~579-596): replace the `<codeRoot>/package.json` read. Locate the manifest with `findPackageManifest` using an inspector that returns the compact value below directly; do not parse `match.content` again. Store the value keyed by `codeRoot`:

```ts
interface PackageEntryManifest {
  // replaces the whole-manifest type
  readonly name: string
  readonly main?: string
  readonly exports?: unknown
  /** `codeRoot` relative to the manifest directory, forward slashes, '' when equal. */
  readonly codeRootOffset: string
}
```

When no manifest is found store `null` as today. Do not keep any other field.

- `sourceCandidates(workspace, published)` (lines ~3213-3232) becomes `sourceCandidates(workspace, published, codeRootOffset)`:
  1. `relative = published.replace(/^\.\//, '')`; strip `.d.ts|.d.mts|.d.cts`, then `.js|.jsx|.mjs|.cjs`; if `relative === 'dist'` set `relative = 'src'`, else if `relative.startsWith('dist/')` replace the leading `dist/` with `src/`; strip a trailing `.ts|.tsx`. (Now applied to the package-root-relative path.)
  2. If `codeRootOffset !== ''`: if `relative === codeRootOffset` set `relative = ''`; else if `relative.startsWith(codeRootOffset + '/')` strip that prefix; else return `[]` (outside the code root).
  3. Return the same ordered candidate list as today (TS before JS, `index` variants), built from the code-root-relative `relative`; when `relative === ''` use only the `index.*` candidates.
- `entryCandidatePaths` passes `manifest.codeRootOffset` and checks `manifest.exports !== undefined && manifest.exports !== null` before taking the `exports` branch so `"exports": null` falls back to `main`/default index.
- Type-only default import: in the default-import branch of `resolveImports`, when the import declaration is type-only, bind the local name only if the resolved default export is in `SymbolSpace.Type`; otherwise leave the file dependency only (no value binding). In `extractTypeScriptImports`, refine the `typeOnly` check (`/(?:^|\s)import\s+type(?:\s+(?!from\b)|\s*\{)/`) so `import type from './x'` (default import of an identifier named `type`) is not misclassified as `typeOnly`.

#### `go-language-adapter.ts`

- `getPackageIdentity`: call `findPackageManifest<string>` with an inspector that maps `readGoModulePath(content)` to `match` or `skip`; report every skipped path; return `result.match?.value` without reparsing.
- New `readGoModulePath(content)`: match `/^module\s+(?:"([^"]+)"|`([^`]+)`|(\S+))/m`, return the first defined group (unquoted).
- `prepare` (lines ~272-276): besides `goPackageFiles(context.session, '', '')`, for each workspace find the `go.mod`, compute `offset = posixRelative(moduleDir, workspace.codeRoot)` (`''` when equal, `undefined` when no `go.mod`) and store a `Map<workspaceName, string | undefined>` under a new session key `GO_MODULE_OFFSETS_KEY`.
- `entrySurface` (lines ~277-285): compute `moduleRelativeDir` as today (`''` for the module path itself). Read `offset` for `request.workspace`; if `offset === undefined` or the map is missing return `[]`. If `offset === ''` use `moduleRelativeDir`. Otherwise: if `moduleRelativeDir === offset` use `''`; else if `moduleRelativeDir.startsWith(offset + '/')` use the remainder; else return `[]`. Then call `goPackageFiles(session, workspace, codeRootRelativeDir)`.

#### `python-language-adapter.ts`

- `getPackageIdentity`: call `findPackageManifest<string>` with an inspector that parses TOML once and maps `readPythonProjectName(content)` to `match` or `skip`; report every skipped path; return `result.match?.value` without reparsing.
- `resolvePackageFromSpecifier` (lines ~1985-1996): normalize with `normalizePythonDistName(value) = value.toLowerCase().replace(/[-_.]+/g, '-')`. Collect the distinct known packages whose normalized name equals the normalized first segment; return the package when exactly one, `undefined` when none or more than one. (Do not use `find`.)
- Submodule imports (lines ~994-1005): attempt the submodule lookup when `result.reason === 'not-exported' || result.reason === 'no-entry-surface'`. Accept the result only when `submodule.status === 'resolved' && submodule.entries.length === 1`; with more than one entry push the diagnostic with reason `'ambiguous'`.

#### `php-language-adapter.ts`

- New private `readComposerManifest(codeRoot, repoRoot, session)` returning `{ packageRoot, canonicalCodeRoot, name?: string, psr4: Array<[prefix, canonicalAbsoluteDir]>, devDirectories: ReadonlySet<string> } | undefined`, cached in session state under the existing key `'php-resolution-metadata'` (field `manifestByCodeRoot: Map<string, ComposerManifestData | null>`), so the first caller (analysis-time `prepareResolutionMetadata` or `preparePackages`) reads and parses the selected `composer.json` exactly once and every later caller reuses it.
  - Make one `findPackageManifest<ParsedComposerManifest>` call. Its inspector parses each read file once; a manifest with a non-empty `name` is `match`, a valid nameless manifest is `fallback`, and malformed input is `skip`. Thus a nameless manifest at `codeRoot` does not shadow a named manifest higher up within the repository bound, while the nearest nameless manifest is selected if no named manifest exists. Build `ComposerManifestData` from `result.match.value`; never parse `result.match.content` and never run a second search.
  - Canonicalize `codeRoot` (`canonicalCodeRoot = canonical(codeRoot)`) and PSR-4 directories (`canonical(path.resolve(packageRoot, relDir))`) once during `readComposerManifest`, so `qualifiedNameEntries` and `resolveQualifiedNameFromSession` in Pass 2 compute `path.relative(manifest.canonicalCodeRoot, dir)` purely lexically with zero `canonical()` / `realpathSync` calls.
  - Merge by prefix: `Map<string, string[]>`; add `autoload.psr-4` entries first, then `autoload-dev.psr-4` entries, appending directories (a prefix mapped to an array contributes every element); skip duplicates. Flatten to `[prefix, dir]` pairs sorted by prefix length descending, stable (directories of one prefix keep `autoload` before `autoload-dev`).
- `getPackageIdentity` uses the same single-search inspector and forwards every skipped path even when no match exists. It returns only a selected value with `name`; a nameless fallback yields `undefined` identity while remaining reusable by preparation.
- `preparePackages` uses `readComposerManifest` (no second parse). Remove unused private methods `resolvePackageFromSpecifier`, `resolveQualifiedNameWithMap`, and `buildPsr4Map`.
- `qualifiedNameEntries` (lines ~2196-2212): iterate candidates in map order (longest prefix first, then directories in order) and return every candidate whose relative path is inside `canonicalCodeRoot` without calling `canonical()`; the indexer's `packageEntryFiles` returns only indexed entries and the adapter records only the first resolved entry as the file dependency (see the PHP `use` branch: take `entries.entries[0]`).
- `resolveQualifiedNameFromSession` (lines ~2281-2300): remove the `absolute` fallback id (`ids` becomes `[`${workspace}:${relative}`]`, or skip when `workspace` is `undefined`) and use `manifest.canonicalCodeRoot` without calling `canonical()`. Own-PSR-4 fallback rules: use the importing workspace's own prepared map; skip a candidate whose indexed file has category `'test'` or lies in an `autoload-dev` directory unless the importing file's category is `'test'`. Keep `autoload-dev` directory membership as a `Set<string>` of canonical absolute directories in the prepared data.

#### `adapter-registry.ts`

`AdapterRegistry.register` (before any state change) additionally throws `SpecdError` code `INVALID_LANGUAGE_ADAPTER` when: `languages()` does not return an array of non-empty strings with at least one element; `extensions()` does not return a plain object whose values are all strings; `resolutionManifests()` does not return an array of non-empty strings none of which contains `/`, `\\`, `*`, `?`, `[`, `]`, `{`, or `}`. Messages follow the existing format (adapter language, failed rule, member). When `languages()` itself is malformed, name the adapter as `<unknown>`.

### SDK (`sdk/src/orchestration/run-index-project-graph.ts`)

Pass the full list: `configuredWorkspaces: listed` in the `indexProjectGraph.execute({...})` call (line ~87). No VCS logic is added; `vcsRoot` and `vcsRef` stay as they are.

### SQLite store (`code-graph/src/infrastructure/sqlite/`)

- `schema.ts`: `SQLITE_SCHEMA_VERSION = 16`; add `namespace TEXT` and `namespace_separator TEXT` to the `files` table DDL (`REQUIRED_COLUMNS` is derived from the DDL automatically).
- `sqlite-graph-database.ts`: add both columns to the file `INSERT`/upsert statement and its bound row type, to the three `SELECT ... FROM files` statements (lines ~460, ~505, ~711) and to their row types, and map them in the row→`FileNode` conversion (`null` → property omitted; `namespaceSeparator` set only when `namespace` is set).
- The worker row shape (`isolated-index-worker`, worker-backed batch reads) carries the two fields wherever a file row is serialized.
- No migration code: worker/database validation may raise low-level `GraphSchemaIncompatibleError`, but public `SQLiteGraphStore.open()` wraps it as `GraphStorageRecoveryRequiredError` with reason `SCHEMA_INCOMPATIBLE`. `graph index` recognizes that public recovery error and rebuilds through the existing recreate path. Tests assert the wrapper and reason, not the low-level class as the public error.

### Docs

- `docs/code-graph/language-adapters.md`: update the `packageResolution` section (three roots, repository-bounded search, `report` argument, `PackagePreparationContext.projectRoot`, per-workspace `repoRoot`, every adapter asked for an identity, ambiguity handling), the "Resolving a package import" section (`package-unknown` is only counted), and inline the content of checklist steps 6 and 7 (what the adapter spec and the built-in adapter list must contain) so readers without spec access need no other document.
- `docs/code-graph/index.md`: indexer section (partial runs map and prepare every configured workspace; inaccessible workspaces are skipped with a diagnostic; schema version 16 rebuild note).
- `docs/code-graph/use-cases.md`/`services.md`: only if they mention `repoRoot`, `getQualifiedNames`, or the first-adapter-wins rule (check with `rg`).
- No ADR is required: the decisions below are refinements of the accepted package-resolution design.

## New constructs

### `findPackageManifest<T>` (in `find-manifest-field.ts`)

```ts
export type ManifestInspection<T> =
  | { readonly kind: 'match'; readonly value: T }
  | { readonly kind: 'fallback'; readonly value: T }
  | { readonly kind: 'skip' }

export interface PackageManifestMatch<T> {
  /** Directory that holds the matched manifest (the package root). */
  readonly packageRoot: string
  /** Absolute path of the matched manifest. */
  readonly manifestPath: string
  /** UTF-8 content of the matched manifest. */
  readonly content: string
  /** The inspector result produced by the only parse of this manifest. */
  readonly value: T
}

export interface PackageManifestSearchResult<T> {
  /** Selected preferred match, or the nearest fallback when no preferred match exists. */
  readonly match?: PackageManifestMatch<T>
  /** Manifests skipped because they were unreadable, malformed, lacked identity, or lost to a preferred match. */
  readonly skipped: readonly string[]
}

export function findPackageManifest<T>(
  codeRoot: string,
  filename: string,
  inspect: (content: string, manifestPath: string) => ManifestInspection<T>,
  repoRoot?: string,
): PackageManifestSearchResult<T>
```

Algorithm:

1. `start = canonical(codeRoot)` where `canonical(p)` = `realpathSync(path.resolve(p))` with the trailing separator removed; if `realpathSync` throws, use `path.resolve(p)` without the trailing separator.
2. `boundary = repoRoot === undefined ? start : canonical(repoRoot)`. If `start` is not equal to `boundary` and `path.relative(boundary, start)` starts with `..` or is absolute (the code root is not inside the supplied boundary), set `boundary = start`.
3. `dir = start`, `fallback = undefined`, `skipped = []`. For each directory, read `candidate = path.join(dir, filename)` at most once. A read or inspector error pushes `candidate` to `skipped`. For a successful inspection: `match` returns immediately with its `value`; the first `fallback` is retained without reparsing and later fallback candidates are appended to `skipped`; `skip` appends the path to `skipped`.
4. At `boundary` or filesystem-root protection, return `{ match: fallback, skipped }`. If a preferred match is found after a fallback, append the fallback path to `skipped` before returning the preferred match. Consequently diagnostics survive a no-match result, and a selected manifest's structured value comes from exactly one inspector call.

Invariants: never inspects a directory above `boundary`; never reaches the filesystem root unless `boundary` is the filesystem root; with no `repoRoot` inspects exactly one directory.

`findManifestField(startDir, filename, extract, boundary?)` calls `extract` exactly once per read manifest and maps a non-empty extracted string to `{ kind: 'match', value }`, otherwise `{ kind: 'skip' }`; it returns `result.match?.value`.

### `RepositoryRootSource` port (`application/ports/repository-root-source.ts`)

```ts
/**
 * Resolves the root of the version-control repository that contains a directory.
 */
export abstract class RepositoryRootSource {
  /**
   * @param directory - Absolute directory, typically a workspace code root.
   * @returns The absolute repository root, or `undefined` when no repository is detected or detection fails. Never rejects.
   */
  abstract resolve(directory: string): Promise<string | undefined>
}
```

### `VcsRepositoryRootSource` (`infrastructure/vcs/vcs-repository-root-source.ts`)

```ts
export class VcsRepositoryRootSource extends RepositoryRootSource {
  constructor(private readonly createAdapter: (directory: string) => Promise<VcsAdapter>) {
    super()
  }
  async resolve(directory: string): Promise<string | undefined> {
    try {
      const adapter = await this.createAdapter(directory)
      return adapter.rootDir()
    } catch {
      return undefined // NullVcsAdapter.rootDir() throws 'no VCS detected'
    }
  }
}
```

`VcsAdapter` is imported as a type from `@specd/core`. Export neither class from the public barrels (internal wiring); export the port type only if the provider constructor needs it publicly (it does not: `IndexCodeGraph` is constructed inside `create-code-graph-provider.ts`).

### `WorkspaceAccessibilitySource` and `NodeWorkspaceAccessibilitySource`

```ts
// application/ports/workspace-accessibility-source.ts
/** Application port for checking whether package discovery may inspect a code root. */
export abstract class WorkspaceAccessibilitySource {
  /** Returns true only when directory exists and is a readable directory. Implementations may reject. */
  abstract isAccessibleDirectory(directory: string): Promise<boolean>
}

// infrastructure/fs/node-workspace-accessibility-source.ts
export class NodeWorkspaceAccessibilitySource extends WorkspaceAccessibilitySource {
  async isAccessibleDirectory(directory: string): Promise<boolean> {
    try {
      return (await stat(directory)).isDirectory()
    } catch {
      return false
    }
  }
}
```

Only the infrastructure adapter imports `node:fs/promises`. `IndexCodeGraph` catches a third-party/fake port rejection and applies the same inaccessible-workspace behavior as a `false` result. The port and adapter have named exports, JSDoc, ESM imports, and no `any`.

### `normalizePythonDistName` and `readGoModulePath`

Private module-level functions in their adapters, with full JSDoc (see Affected areas for the exact behaviour).

## Data models and contracts

- `IndexOptions.configuredWorkspaces?: readonly ProjectWorkspace[]` (above).
- `IndexResult.errors` entries are the only channel for package diagnostics. New message formats (all use `filePath: '<workspace>:<manifest>'`):
  - skipped manifest: `Package manifest skipped (no identity): <absolute manifest path>`
  - collision: `Package identity collision: "<identity>" is claimed by workspaces <a>, <b>[, <c>]`
  - inaccessible workspace: `Workspace "<name>" skipped for package resolution: code root "<path>" is not accessible`
  - adapter identity failure: unchanged (`Package identity failed for adapter "<languages>": <error>`).
    These entries do not fail the run; `errors` is the existing non-fatal list.
- `importDiagnostics.adaptersWithoutPackageResolution`: sorted list of first language identifiers, one per distinct adapter.
- Persisted: `files.namespace TEXT NULL`, `files.namespace_separator TEXT NULL`, schema version 16. Both null or both set. `namespace_separator` is never set without `namespace`.
- Prepared TS data: `PackageEntryManifest` (above). Prepared Go data: `Map<workspace, string | undefined>` (module offset). Prepared PHP data: `ComposerManifestData { packageRoot: string; canonicalCodeRoot: string; name?: string; psr4: Array<[string, string]>; devDirectories: ReadonlySet<string> }`.
- Application I/O contract: workspace accessibility is obtained only through `WorkspaceAccessibilitySource`; domain and application modules import no Node filesystem APIs.
- Manifest search contract: `PackageManifestSearchResult<T>` always contains `skipped`, including terminal no-match results; a selected `match.value` is the structured value produced by its only parse.

## Approach and execution flow

1. SDK lists all workspaces, filters the selected ones, calls the indexer with `workspaces` (selected) and `configuredWorkspaces` (all).
2. Indexer discovers, diffs and hydrates as today. Hydration now also fills the qualified-name lookups from the persisted `namespace`/`namespaceSeparator` of every retained file.
3. Indexer resolves accessibility through `WorkspaceAccessibilitySource` and repository roots through `RepositoryRootSource` for all configured workspaces (parallel), records diagnostics, and builds `packageWorkspaces`. A false or rejected accessibility probe has identical non-fatal behavior.
4. Indexer asks every adapter for the identity of every accessible workspace (`findPackageManifest` bounded by that workspace's repository root; no repository means code root only). It builds `packageToWorkspace`, deleting ambiguous identities.
5. Pass 1 analyses selected files; contexts carry the workspace repository root.
6. Between passes, each adapter's `prepare` runs once over all accessible workspaces (manifest located by the same search, parsed once, compact data stored); then every `reExportLinking.link` runs (adapters with disabled package resolution link with an empty package map).
7. Pass 2 resolves imports. Name-addressed imports use `session.getQualifiedNames({ includeTests })` for the importing file; package imports use the shared helpers.
8. Persist: file nodes carry `namespace`/`namespaceSeparator`; resolved imports persist `import:package` steps as before.

## Error handling and edge cases

- `realpathSync` failure (missing path): fall back to the resolved path; the walk then finds nothing and returns `undefined`.
- Malformed or unreadable manifest: added to `skipped`; the walk continues. After the walk, adapters report every skipped path even when `match` is absent.
- `repoRoot` outside which the code root lies, or a symlinked code root whose canonical path leaves `repoRoot`: boundary collapses to the code root.
- VCS detection throws or the directory is not in a repository: `repoRoot` undefined, code root only.
- Inaccessible configured workspace, or an accessibility-port rejection: skipped everywhere (identity, prepare), diagnostic recorded, its package names are absent from `packageToWorkspace`, so imports of them count as `package-unknown` (external).
- Two workspaces claiming one identity: identity removed from the map, error recorded, imports of it count as `package-unknown`.
- Adapter whose `identity` or `prepare` throws: recorded, adapter added to `disabledPackageResolution`; its `link` still runs with an empty package map; if `link` throws it is recorded and the adapter stays disabled.
- Logical symbol with no stored `qualifiedName`: neither `SessionReferenceStore` nor the persisted graph store derives one; both return the same candidate set.
- Schema mismatch: public open rejects with `GraphStorageRecoveryRequiredError` / `SCHEMA_INCOMPATIBLE`; `GraphSchemaIncompatibleError` remains internal evidence only.
- `package.json` `exports` pointing outside the code root: no candidates.
- Go `go.mod` above the code root with a package directory outside the code root: no entries.
- PHP candidate files outside the code root are dropped; unindexed candidates are discarded by the indexer.
- Python submodule found under two roots: diagnostic `ambiguous`, no dependency.

## Key decisions

1. **One manifest search shared by identity and prepare.** Rationale: eliminates the identity-without-entry-surface state. Rejected: bounding `identity` to the code root (breaks monorepos whose manifest is above the code).
2. **Boundary is the repository of the code root, resolved by VCS detection; no repository means code root only.** Rationale: correct for multirepo and never reads unrelated parent manifests. Rejected: project root as boundary (wrong for external workspaces); marker file lists (duplicate VCS knowledge).
3. **Repository roots are resolved by `@specd/code-graph` through an injected port, not by the SDK.** Rationale: same injection pattern as `GetGraphHealth`; every host gets the behaviour; the SDK stays a thin adapter. Rejected: SDK computing a `repositoryRoots` map (duplicates logic per host).
4. **Every configured workspace is mapped and prepared.** Rationale: results do not depend on the requested subset. Rejected: documenting the limit.
5. **All adapters are asked for an identity.** Rationale: multi-language workspaces. A name claimed by two workspaces resolves to neither and is an error, never first-wins.
6. **Persist the file namespace (schema 16).** Rationale: incremental equals clean rebuild without re-analysing unchanged files; the derivation fingerprint already includes the code-graph version, and the schema bump triggers the existing rebuild path. Rejected: re-analysing unchanged files each run (cost); accepting the divergence.
7. **No compatibility alias for `PackagePreparationContext.repoRoot`.** Rationale: alpha, no external adapters.
8. **Resolver fallbacks removed.** Rationale: unresolved text must stay unresolved; guessed edges are worse than missing ones.
9. **PHP candidates follow Composer's autoload order** (longest prefix first, first existing file wins) and only the first indexed one becomes a dependency.
10. **Production importers never resolve to test symbols; test importers do.** Implemented with two session maps.
11. **Filesystem accessibility is an application port.** Rationale: preserves hexagonal dependency direction and lets use-case tests supply deterministic fake state. Rejected: direct `existsSync`/`statSync` in `IndexCodeGraph` (application-to-infrastructure coupling).
12. **Manifest inspection returns its parsed value and terminal diagnostics.** Rationale: selected manifests are read and parsed once, and a failed bounded search cannot erase diagnostics. Rejected: boolean predicates followed by a second parse, or `undefined` as the entire no-match result.
13. **Public SQLite recovery wrapping is preserved.** Rationale: callers already depend on one backend-neutral recovery signal. Rejected: exposing `GraphSchemaIncompatibleError` from the public store.

## Trade-offs

- A full graph rebuild is required once after upgrading (schema 16). Mitigation: existing public recovery wrapper and recreate path; documented.
- Starting `createVcsAdapter` per workspace may spawn VCS processes (one per workspace, in parallel). Mitigation: bounded by workspace count; failures are swallowed; result cached per run.
- Persisting two nullable columns grows each file row slightly. Negligible.
- Ambiguous normalized Python names leave imports unresolved instead of guessing. Accepted.
- Overlap with `code-graph-file-outline`, `code-graph-symbol-contracts`, `go-selectors-python-reexports`, `fs-decouple-03c-graph-spec-indexing-via-repository` on nine specs (including `symbol-model` and `sqlite-graph-store`, which are schema-affecting). Whichever change archives second must rebase its deltas; `symbol-contracts` may also bump the SQLite schema version, in which case the final version number must be recomputed at archive time.

## Spec impact

Direct: the ten specs in this change. Transitive: every spec that depends on `code-graph:language-adapter`, `code-graph:indexer`, or `code-graph:symbol-model` (run a fresh spec impact analysis at archive time). No existing requirement is weakened: the `language-adapter` identity rule is made explicit; the indexer rule "first adapter wins" is replaced; the resolver spec is only clarified; the SQLite public recovery contract is preserved. `core:*` specs are untouched.

## Dependency map

```mermaid
flowchart LR
  SDK[sdk run-index-project-graph] -->|configuredWorkspaces| IDX[IndexCodeGraph]
  PROV[create-code-graph-provider] -->|VcsRepositoryRootSource| IDX
  IDX -->|resolve codeRoot| RRS[RepositoryRootSource]
  IDX -->|probe codeRoot| WAS[WorkspaceAccessibilitySource]
  RRS --> CORE[@specd/core createVcsAdapter]
  WAS --> NFS[NodeWorkspaceAccessibilitySource]
  IDX -->|identity/prepare/link| ADP[TS/Go/Python/PHP adapters]
  ADP --> FPM[findPackageManifest]
  IDX --> SES[InMemoryIndexSession]
  IDX --> STORE[SQLiteGraphStore files.namespace]
  RSR[ResolveSymbolReference] -.removed fallbacks.- IDX
```

```
sdk ──configuredWorkspaces──> IndexCodeGraph ──> adapters ──> findPackageManifest
provider ──VcsRepositoryRootSource(createVcsAdapter)──┤            │
provider ──NodeWorkspaceAccessibilitySource───────────┘            │
IndexCodeGraph ──> InMemoryIndexSession (qualified names, tests)   │
IndexCodeGraph ──> SQLite files(namespace, namespace_separator, v16)
```

## Migration and rollback

- Upgrade: first public read of a version 15 database rejects with `GraphStorageRecoveryRequiredError` and reason `SCHEMA_INCOMPATIBLE`; `graph index` recreates storage as version 16 and rotates `storage.epoch`. Rollback: revert the commit and run `graph index`; the version 16 database is rejected by version 15 code through the same public recovery contract and rebuilt.
- No configuration or `specd.yaml` change.

## Testing

Tests mirror `src` under `packages/code-graph/test/`; Vitest, Given/When/Then, unique `os.tmpdir()` directories, cross-platform paths (use `path.join`, normalize separators in assertions). Test titles use sentence case starting with a capital letter (item 4 of the proposal): rename the titles added by the previous change accordingly, and fix the title at `package-resolution.spec.ts:425` so it matches its assertion.

Unit tests (new or extended):

- `infrastructure/tree-sitter/find-manifest-field.spec.ts`: manifest above code root inside the repository; stop at `repoRoot`; manifest above the repository not read; external code root with its own repository boundary; no `repoRoot` inspects only the code root; nameless manifest skipped and reported; every skipped path returned when the bounded walk ends without a match; inspector called once per read manifest; selected `value` reused without parsing `content`; symlinked and trailing-separator code roots; code root outside the supplied boundary collapses to the code root; never reaches the filesystem root. All fixture paths use `mkdtemp`, `path.join`, `path.resolve`, and separator-normalized assertions—never hard-coded `/repo`, `/ext`, or drive-specific roots.
- `typescript-language-adapter.spec.ts` / `package-resolution.spec.ts`: code root below `package.json` keeps identity and entry surface; candidate outside the code root dropped; nameless `package.json` skipped; compact prepared data (assert stored object keys); `.d.ts` maps to source; other build directories not mapped; type-only default import binds no value; prepare reads each manifest once (spy on `fs.readFileSync`), `entrySurface` performs no read; workspace not selected for the run is prepared. Also: side-effect, dynamic and `require` package imports; package re-exports and their dependencies; default import with zero or two default exports; fingerprint test that edits `exports`.
- `go-language-adapter.spec.ts`: `go.mod` above the code root; package directory outside the code root yields no entries; quoted and backquoted module path; module directory located once in prepare; blank and dot imports.
- `python-language-adapter.spec.ts`: dots and case normalize; equal normalized names resolve to `undefined` regardless of registration order; submodule import without `__init__.py`; submodule under two roots stays unresolved; nameless `pyproject.toml` skipped; unknown project not guessed; unimported name keeps the workspace lookup; `import pkg.mod` and `importlib`; `.py` and `.pyi` end to end.
- `php-language-adapter.spec.ts`: named `composer.json` selected with exactly one read and one `JSON.parse` during `prepare`; nameless fallback selected with exactly one read and one `JSON.parse`; no second search; `autoload` and `autoload-dev` share a prefix keep both directories in order; candidates longest prefix first and only the first indexed one is a dependency; own-PSR-4 fallback without `name`; own fallback never returns a test file for a production importer and never an absolute id; `entrySurface`/`matchSpecifier` perform no I/O after deleting `composer.json`.
- `resolve-symbol-reference.spec.ts`: anchor without an adapter (Go package surface) leaves text unresolved; qualified name is not derived (target without stored `qualifiedName` does not match); adapter without `symbolReferenceSyntax` stays unresolved.
- `application/services/session-reference-store.spec.ts`: a logical member with owner/name but no stored `qualifiedName` is absent from qualified lookup; the same fixture persisted through SQLite returns an identical candidate set; a stored value still matches unchanged.
- `adapter-registry.spec.ts`: malformed `languages()`, malformed `extensions()`, invalid `resolutionManifests()` values (glob, separator, empty) → `INVALID_LANGUAGE_ADAPTER`, registry unchanged; capability flags and facets are separate; a facet does not satisfy a capability flag.
- `in-memory-index-session.spec.ts`: hydrated file fills the qualified-name lookup from persisted namespace; production importers never see test symbols; test importers see test symbols (production wins duplicates); `includeTests` merged map invalidation.
- `file-node.spec.ts`: namespace optional and paired; excluded from equality.
- `infrastructure/sqlite/*.spec.ts`: namespace round trip; public open of a version 15 database rejects with `GraphStorageRecoveryRequiredError` and reason `SCHEMA_INCOMPATIBLE` while any `GraphSchemaIncompatibleError` stays internal; `graph index` recreates version 16 and rotates `storage.epoch`; `SQLITE_SCHEMA_VERSION` is 16 and tests that hard-code 15 are updated.
- `infrastructure/vcs/vcs-repository-root-source.spec.ts`: returns `rootDir()`; returns `undefined` when the adapter factory rejects; returns `undefined` when `rootDir()` throws.
- `infrastructure/fs/node-workspace-accessibility-source.spec.ts`: directory returns true; regular file, missing path, unreadable path, and `stat` failure return false.
- `application/use-cases/index-project-graph.spec.ts`: use a complete typed `CodeGraphProvider` fake rather than a partial cast; assert `configuredWorkspaces` is forwarded and every lifecycle method (`open`, `close`, `clear`, `recreate`) plus process/lock hooks remains untouched.

Integration tests (`test/application/use-cases/index-code-graph*.spec.ts`, temp-directory fixtures):

- Package map: every adapter asked (two adapters, one workspace, both identities stored; the indexer never opens manifests itself); collision error names both workspaces and the name resolves to neither; same workspace via two adapters is not a conflict.
- Per-workspace repository roots: stub `RepositoryRootSource` returning the project repository root for workspace A and another root for workspace B; assert `identity` arguments; `undefined` root → code root only; resolver that returns `undefined` for a failure does not fail the run.
- Partial run: workspaces A and B, run indexes only A, A imports B's package → resolved, equal to a full run (`configuredWorkspaces` set); a fake accessibility port reports one configured workspace inaccessible → diagnostic in `errors`, imports external, other workspaces indexed; a rejecting fake produces the identical outcome; architecture assertion verifies `index-code-graph.ts` has no `node:fs` import.
- Failure isolation: adapter whose `identity` throws → error recorded, listed in `adaptersWithoutPackageResolution`, other adapters indexed, relative barrel re-exports of the same adapter still linked; `identity`/`prepare` throwing with a healthy second workspace and adapter; manifest change end to end; workspace added.
- `link` performs no I/O: spy on `fs` while `link` runs; closure does not re-extract unrelated files; `matchSpecifier`/`entrySurface` failing in Pass 2 skips the file without disabling the adapter; bindings without target ignored in the ambiguity check; `package-unknown` counted in `externalPackageImports` and absent from `total`, `byReason`, and `samples`.
- `adaptersWithoutPackageResolution` lists a multi-language adapter once by its first language.
- Incremental equivalence: PHP, Python and Go name-addressed imports (changed file imports unchanged file) equal a clean rebuild (normalized semantic state); added non-code file does not trigger the addition-only re-extraction; added code file does.
- Resolver end to end for the four languages: follows `import:package` steps with the ordered path; positive anchored-file filter; `graph impact` dependents across workspaces.
- Test-symbol rule: test-to-test-helper import resolves and `graph impact` lists the test as a dependent; production importer does not resolve to the test symbol.

Manual / E2E verification:

1. `pnpm -F @specd/code-graph build && pnpm -F @specd/code-graph test` — all green.
2. In a temp repo with `packages/app/package.json` and code root `packages/app/src`, run `node packages/cli/dist/index.js graph index --format toon`; expect the workspace to have both an identity and resolved cross-workspace imports (no `no-entry-surface`).
3. Run `node packages/cli/dist/index.js graph index --workspace <only-one> --format toon`; expect `importDiagnostics.externalPackageImports` identical to a full run for that workspace's imports.
4. With an existing version 15 `graph.db`, run `node packages/cli/dist/index.js graph stats --format toon`; expect the public recovery error with reason `SCHEMA_INCOMPATIBLE`; run `node packages/cli/dist/index.js graph index --format toon`; expect a rebuild, a rotated `storage.epoch`, and schema version 16.
5. Edit one PHP file that imports a class from an unchanged file; run `node packages/cli/dist/index.js graph index --format toon` twice (incremental) and once with `--force`; expect equal dependency relations.

## Open questions

None.
