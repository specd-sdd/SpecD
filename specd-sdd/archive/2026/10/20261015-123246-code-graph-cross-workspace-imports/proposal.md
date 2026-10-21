# Proposal: code-graph-cross-workspace-imports

## Motivation

Impact, hotspots, and coverage are blind across workspaces in a monorepo: a symbol imported by package specifier (`import { SymbolNode } from '@specd/code-graph'` in `sdk`) is never linked to its declaration. `code-graph:workspace-integration` already forbids inferring cross-workspace targets from a global same-name match, but the TypeScript and Python adapters still do exactly that. It must be fixed now because `code-graph-symbol-contracts` (return and throw typing across packages) depends on package imports resolving correctly.

Fixing it properly exposes a second problem: the `LanguageAdapter` contract has no way to declare language-specific resolution services. Eight optional methods are detected only by `if (adapter.method)`, and the cross-workspace resolution needs yet another one. The project is in alpha with no external adapters, so the contract can be corrected now at no migration cost; deferring it would mean migrating the same methods twice.

## Current behaviour

Measured on a fresh full index at `2d442355` (after `cross-language-symbol-semantics` was archived), and confirmed against the adapter sources:

- **TypeScript and Python** resolve package-specifier imports by a name heuristic. They map the specifier to a workspace through `packageToWorkspace`, then call `session.findSymbolsByName(originalName, workspace + ':')` and accept the result only when exactly one symbol matches. That match ignores the package's public entry surface and visibility, so a unique internal or test symbol can be chosen, and an exported symbol that shares its name with another symbol is dropped.
- **Go** has no name heuristic. A Go import is resolved to the non-test files of the package directory inside the workspace whose `go.mod` module owns the path, and only a file-level dependency is produced. Qualified selectors across packages (`pkg.Name`) are not resolved to symbols.
- **PHP** has no name heuristic. It resolves a `use` import through the global fully qualified name map and a PSR-4 file lookup.
- The correct entry-surface logic exists only for TypeScript re-exports: `packageEntryCandidates` and `resolveReExportSource` read `package.json` `exports`/`main`, map `dist/*.js` to `src/*.ts`, and are used by `linkReExports`. Ordinary imports never use them.
- Relative imports now persist binding targets (`local_bindings.target_id` is set for 1,238 of 2,053 `cli` bindings, 3,984 of 4,999 `core`, and so on), but package-specifier imports stay unresolved. In `sdk`, `GraphSpecNotFoundError`, `CODE_GRAPH_VERSION`, and `SymbolKind` from `@specd/code-graph` have no target.
- Cross-workspace `USES_TYPE` from `sdk` to `code-graph` is 0, and `graph impact --symbol SymbolNode` lists no `sdk` dependent besides `run-index-project-graph.ts`.
- `resolution_steps` holds only `re-export:*`, `extends:0`, and `implements:0` rows, so incremental closure cannot see import dependencies.
- Re-export linking runs after Pass 2, so public bindings reached through barrel chains are not final while imports are resolved.
- `LanguageAdapter` (exported from `public.ts` and registered through `AdapterRegistry`) mixes a required core with optional methods that the indexer detects by presence: `getPackageIdentity`, `resolvePackageFromSpecifier`, `resolveRelativeImportPath`, `buildQualifiedName`, `resolveQualifiedNameToPath`, `parseSymbolReference`, `renderSymbolReference`, and `linkReExports`. Related methods in one capability are scattered, and a method can exist without the adapter meaning to support the capability.

## Proposed solution

The indexer stays language-agnostic: it owns orchestration, public-binding lookup, persistence, and invalidation. Every language-specific fact comes from the language adapters, through facets they declare explicitly.

**Extensibility constraint (binding for specs, design, and tasks):** adding a new language must require only a new adapter, with no change to the indexer, the session, or the stores. The indexer must not branch on language ids, file extensions, or manifest names, and must not assume how a language maps a specifier to files. An adapter that does not provide a facet gets none of the behaviour behind it, with no error and no heuristic fallback; a non-persisted diagnostic records that the facet is not provided. A verify scenario proves this with a stub adapter for a made-up language that resolves package imports end to end without any indexer change.

The change has two phases, reviewed and verified separately.

### Phase 1 — adapter facets (no change in graph output)

Group the optional methods into cohesive facets that an adapter exposes only when it supports them. Presence of a facet is the declaration, and an inconsistent state (a declared facet with a missing method) cannot be represented. The word "facet" is used because `capabilities()` and `AdapterCapabilities` already exist and describe what an adapter can prove, which is a different thing.

- `packageResolution`: package identity, specifier-to-package matching, manifest preparation, and the new package entry surface (Phase 2).
- `relativeImportResolution`: relative module specifier to candidate files.
- `qualifiedNameResolution`: qualified-name construction and qualified-name to file mapping.
- `symbolReferenceSyntax`: parse and render of symbol references.
- `reExportLinking`: linking of re-exports, kept as-is and owned today only by TypeScript.

The required core stays: `languages`, `extensions`, `resolutionManifests`, `analyzeFile`, `resolveImports`, `buildRelations`. `declarationPolicy()` and `capabilities()` already declare behaviour and stay unchanged.

Because the contract is public, `AdapterRegistry` validates the shape of every adapter on registration and fails with a typed, actionable `SpecdError` when it is malformed. The four built-in adapters, the indexer, and `resolve-symbol-reference` migrate to the facets. There is no compatibility shim: the project is alpha with no external adapters. Existing tests must keep passing with unchanged expected graph results.

### Phase 2 — package-specifier resolution

1. **Entry surface in `packageResolution`.** Given `specifier (+ subpath)`, the target workspace, and prepared manifest facts, the facet returns the ordered indexed entries (source file plus public surface id) that the package publishes, or nothing. Per language:
   - TypeScript/JavaScript: `package.json` `exports` (subpaths and the `import`/`default`/`types` conditions) and `main`, with `dist` mapped to `src`. This generalises the existing `packageEntryCandidates`.
   - Python: the project name from `pyproject.toml`, with package directories, `__init__.py`, stubs, and the `src/` layout.
   - Go: the module path from `go.mod` plus the package directory. This moves the existing package-directory resolution behind the facet without changing its result.
   - PHP: Composer PSR-4 mappings for the owning package.
2. **Indexer resolves the name, generically.** For the entries the facet returned, the indexer reads their public bindings (the `public_bindings` model, including re-export chains) and resolves the imported name to the logical target. If no entry publishes the name, no edge is created. The indexer contains no manifest parsing and no language rules.
3. **Package context passed explicitly.** The import resolution context carries the workspace list (name and code root) and the package map, built by the indexer from the `packageResolution` facet, and manifest facts are prepared once per run for all workspaces, including unchanged ones.
4. **Persist the result.** Store the binding target, record an `import:package` resolution step, and emit the file-level `IMPORTS` relation. Downstream `USES_TYPE`, `CALLS`, and `CONSTRUCTS` then resolve through the binding as they already do for relative imports.
5. **Remove the same-name heuristic** from the TypeScript and Python adapters. Unresolvable imports create no edge and produce a non-persisted diagnostic with a reason.
6. **Order the phases.** Re-export linking runs after Pass 1 and before imports are resolved, so entry surfaces have final public bindings.
7. **Invalidate on manifest changes.** The manifests declared by `resolutionManifests()` feed the derivation fingerprint, so changes to `exports`, `go.mod`, `pyproject.toml`, or Composer autoload force re-resolution.

Out of scope: resolving Go qualified selectors (`pkg.Name`) to symbols across packages. That needs selector facts the Go adapter does not emit today and is left as unsupported coverage.

## Specs affected

### New specs

None.

### Modified specs

- `code-graph:language-adapter`: this spec is the contract that every present and future adapter author follows, so it must define the facet model completely and self-sufficiently. For the model as a whole: what a facet is, how an adapter declares one, what the required core is, what the indexer does when a facet is absent, and registration-time validation with its typed error. For each facet (`packageResolution`, `relativeImportResolution`, `qualifiedNameResolution`, `symbolReferenceSyntax`, `reExportLinking`): its purpose, when an adapter must provide it, each member with exact inputs, outputs, purity or I/O allowance, and ordering guarantees, the invariants the adapter must uphold, which indexer behaviour depends on it, and the behaviour when it is not provided. It also includes a step-by-step checklist for adding a new language, and requirement scenarios in `verify` for each facet. The same content, restated for readers without spec access, lives in `docs/code-graph/language-adapters.md`. Per-language specs only describe how each built-in adapter satisfies the contract and do not restate it.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:workspace-integration`: sharpen the cross-workspace import resolution and canonical module identity requirements to name the package entry surface as the only resolution path for package-specifier imports, and add verify scenarios that the current implementation violates.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:typescript-language-adapter`: expose the facets; resolve package imports through `exports`/`main`/subpaths and `dist` to `src` mapping; drop the same-name fallback.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:python-language-adapter`: expose the facets; resolve package imports through the project name and package directories; drop the same-name fallback.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:go-language-adapter`: expose the facets; express the existing package-directory resolution as the package entry surface, with the same file-level result.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:php-language-adapter`: expose the facets; keep the fully qualified name identity lookup and express PSR-4 file resolution as the package entry surface.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:resolve-symbol-reference`: consume `symbolReferenceSyntax` as a facet; package-import bindings resolve to logical targets with recorded `import:package` provenance and an explicit unresolved outcome.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:indexer`: stay language-agnostic (a new language needs no indexer change); decide from facets; prepare package facts once per run, link re-exports before Pass 2, persist import targets and steps, include cross-workspace dependents in the incremental closure, and rely on the declared manifests for the derivation fingerprint.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- **Contract** (`packages/code-graph/src/domain/value-objects/language-adapter.ts`, `symbol-reference.ts`, exported from `public.ts`): new facet types replace the optional flat methods, the import resolution context grows, and a new resolution step kind appears. This is a breaking change to a public type, accepted because the project is alpha with no external adapters.
- **Registry** (`infrastructure/tree-sitter/adapter-registry.ts`): registration-time shape validation.
- **Adapters** (`infrastructure/tree-sitter/`): all four are migrated. `typescript-language-adapter.ts` (`resolveImports` ~1312, `packageEntryCandidates` ~2827), `python-language-adapter.ts` (`resolveImports` ~838), `go-language-adapter.ts` (`resolveImports` ~661, `goPackageFiles`), `php-language-adapter.ts` (`resolveImports` ~854).
- **Indexer and consumers**: `application/use-cases/index-code-graph.ts` (`packageToWorkspace` ~872, Pass 2 `resolveImports` ~1170, `linkReExports` ~1558, `collectAffectedFileClosure`), `application/use-cases/resolve-symbol-reference.ts`, `application/use-cases/_shared/compute-graph-fingerprint.ts`.
- **Size**: about 60 references in `src` and 85 in tests for the optional methods alone. `graph impact` over the five core files reports risk CRITICAL (67 direct, 34 indirect, 57 transitive dependents, 40 source files), almost all through `index-code-graph.ts` and `language-adapter.ts`.
- **Behaviour**: cross-package dependents appear in `graph impact` (for example `SymbolNode` gains `sdk` and `cli` dependents), `crossWorkspaceCallers` in hotspots becomes meaningful, and cross-package spec coverage becomes visible. Graph volume and the incremental closure size grow; the design must measure both.
- **Docs**: the facet contract is authoritative in the `language-adapter` spec and must be fully documented for readers who have no access to the specs. A new page `docs/code-graph/language-adapters.md` is a self-contained guide for adapter authors; `docs/code-graph/index.md` links to it and drops the duplicated parts. Every exported symbol of the contract carries full JSDoc. An ADR records the contract change. The package version and change notes follow the repository's release mechanism.
- **Other active changes**: `code-graph-symbol-contracts` and `code-graph-file-outline` also modify the adapter specs, and `file-outline` consumes `parseSymbolReference`. Both must be re-evaluated against the new contract once this change is archived.

## Technical context

- Barrels inside one workspace already resolve correctly through public bindings, so the failure is limited to package-specifier imports. It is not a regression: a clean `HEAD` index from before the archive behaved the same.
- The existing `workspace-integration` spec already mandates the behaviour ("MUST NOT infer cross-workspace targets from a global same-name match"). The verify scenarios do not catch the violation, so they need new scenarios.
- The indexer must stay language-agnostic and open to new languages without modification (user constraint). Today `index-code-graph.ts` has no language-specific code, and this change must not introduce any.
- Facets are cohesive objects rather than a flag plus a separate method. Alternatives ruled out: detection by method presence (what exists today; cannot tell a deliberate omission from a gap), and a flag in `AdapterCapabilities` next to a loose method (the two can disagree, and the indexer still needs an unchecked call).
- Compatibility: `LanguageAdapter` is public API, but there are no external adapters yet and the project is in alpha, so a clean break is chosen over a compatibility shim.
- Verified against the code: `linkReExports` reads only logical symbols, declarations, public bindings, parser state, and manifest facts, all produced in Pass 1, so it can run before Pass 2.
- A fully qualified name that a language declares as a symbol identity (PHP) is not a same-name heuristic; the exact-name map stays for such languages.
- Local bindings created by imports always live in the value space; the space used to look up the exported name is a separate decision made when resolving the import.
- Decided with the user: the contract cleanup is done here rather than deferred; the global same-name heuristic is removed entirely; unresolvable imports create no edge. Only TypeScript can be validated against this repository live, so the other languages rely on per-language fixtures.
- `@specd/code-graph` exposes `"."` (`dist/public.js`) and `"./internal"` (`dist/index.js`), which is the real case the TypeScript contract must handle.
- Reindexing prints many `UNGROUPED_LOGICAL_COLLISION` warnings (for example in `sqlite-graph-database.ts`). They are leftovers from the previous change and are out of scope here.

## Open questions

None. Decisions taken: no change to `symbol-model`, `graph-store`, or `sqlite-graph-store`; new step kind `import:package`; file-level `IMPORTS` for package imports; test files are never package entries; facet names and member signatures are fixed in the `language-adapter` spec; this change goes before `code-graph-symbol-contracts` and `code-graph-file-outline`, which are re-evaluated afterwards.
