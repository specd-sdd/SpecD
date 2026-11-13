# Proposal: code-graph-package-resolution-hardening

## Motivation

`code-graph-cross-workspace-imports` introduced package-level import resolution (`identity`, `prepare`, `matchSpecifier`, `entrySurface`, `link`) for TypeScript, Python, Go and PHP. Four compliance audits found places where code and specs disagree, a few real defects when the code root sits below the package manifest, and missing tests for behaviour the specs already promise. Fixing them now, while the design is fresh, avoids spec drift hardening into accepted behaviour.

## Current behaviour

- **TS/Go identity vs prepare.** `identity` walks up to the nearest `package.json` / `go.mod` (`findManifestField`), but TS `prepareWorkspaceManifest` reads only `<codeRoot>/package.json`. A workspace whose code root is below its manifest gets an identity and then `no-entry-surface`. Go computes the package directory relative to the code root, which is wrong when `go.mod` sits above it.
- **`findManifestField`** walks to the filesystem root when `codeRoot` is outside `repoRoot` (external workspace, symlink, trailing slash), and silently skips a nearest manifest without a name.
- **`resolve-symbol-reference.ts`.** When the anchor has no adapter (for example a Go package surface), the resolver falls back to a generic dotted parser, although the spec says such text is unresolved. `deriveQualifiedName` goes beyond "stored `qualified_name`".
- **Double reads.** PHP `prepare` reads `composer.json` twice (`buildPsr4Map` and `getPackageIdentity`). TS `prepare` keeps the whole parsed `package.json`.
- **TS specifics.** The `dist` mapping also accepts `.jsx` and `.d.ts` targets and maps non-`dist` paths 1:1; the spec only says `dist`. `import type X from` ignores `typeOnly` for the default import.
- **PHP.** `qualifiedNameEntries` returns one candidate per matching prefix. `buildPsr4Map` merges `autoload` and `autoload-dev` with a spread, so a shared prefix loses production directories. The own-PSR-4 fallback (workspace without a Composer `name`) is implemented but not in the spec, and can return a test file.
- **Python.** `from pkg import X` finds no submodule dependency when `pkg/__init__.py` is missing. `matchSpecifier` normalizes only `_` to `-`.
- **Go.** A quoted `module "x"` line keeps its quotes.
- **Indexer.** Identity is first-adapter-wins (only documented in docs). A `--workspace` subset run hydrates other workspaces but neither maps nor prepares them, so their packages count as external. Identity failure disables the adapter, which also stops relative barrel re-export linking for the run. `hydratePersistedFile` never fills the qualified-name map, so incremental runs can differ from a clean rebuild. `adaptersWithoutPackageResolution` is deduped by language string.
- **Spec wording.** The `package-unknown` reason is described as reported, but the indexer only counts it in `externalPackageImports`.
- **Tests.** Many promised behaviours have no test (see Technical context); some test titles are inconsistently cased and one (`package-resolution.spec.ts:425`) contradicts its assertion.
- **Post-implementation compliance gaps.** The full verification audit found that the application-layer indexer probes workspace paths through `node:fs` instead of a port; a terminal nameless or unreadable manifest loses its required diagnostic; PHP can parse or read the selected Composer manifest more than once; the session-backed qualified-name store still derives an unstored spelling; the SQLite version-15 scenario names the low-level incompatibility error while the public store intentionally exposes the recovery wrapper; and several new tests use POSIX-only paths, partial port casts, or assertions weaker than their scenarios.

## Proposed solution

Make code and spec agree, choosing the best behaviour each time, and close the test gaps.

1. **Three separate roots.** The _project root_ (where `specd.yaml` lives) anchors config, graph storage and project-relative paths. A workspace _code root_ may be inside or outside the project root (multirepo). The _package root_ is the directory of the manifest that gives a workspace its identity. Package resolution never uses the project root as a boundary.
2. **Manifest root.** `identity` returns the package root and `prepare` consumes that same root (single source of truth). The search starts at the canonical code root (`realpath`, no trailing slash) and walks up to the first manifest, stopping at the root of the repository that contains that code root, detected with the existing core `createVcsAdapter(codeRoot)` and `rootDir()` (git, hg, svn and registered external providers). If no VCS is detected (`NullVcsAdapter`, whose `rootDir()` throws), only the code root itself is inspected and the search never walks up. It never reaches the filesystem root. A nearest manifest without a name is reported as a diagnostic and the walk continues up to the repository boundary. Go derives package directories relative to the `go.mod` directory.
3. **Resolver.** Remove the generic dotted-parser fallback for anchors without an adapter and limit `deriveQualifiedName` to the stored `qualified_name`: unresolvable text stays unresolved.
4. **Read once.** Every `prepare` reads each manifest once (TS, Python, Go, PHP) and keeps compact data; `link` performs no I/O.
5. **Workspace subset runs.** The indexer receives the full list of configured workspaces in addition to the selected ones. Map package identities and prepare manifests for **every configured workspace**, while indexing only the requested subset. A workspace whose code root is not accessible (for example an external repo not cloned on this machine) is skipped with a diagnostic and its packages count as external; it never fails the run.
6. **Several manifests.** Ask every adapter for an identity; each adapter keeps its own language identity. Two adapters claiming the same package name is reported as an ambiguity.
7. **Failure isolation.** An `identity` failure disables package resolution for that adapter only; relative barrel re-export linking stays independent.
8. **Qualified-name map.** Test symbols stay excluded for non-test importers only, so test-to-test-helper bindings resolve; the file `namespace` and `namespaceSeparator` are persisted (schema version 16) and `hydratePersistedFile` fills the map from them, so incremental runs equal a clean rebuild; `adaptersWithoutPackageResolution` is deduped by adapter.
9. **Spec the silent rules**: TS `dist` mapping scope, `typeOnly` default import, PHP own-PSR-4 fallback (production files only, no absolute id), `autoload`/`autoload-dev` merge keeping both directory lists, single PHP class-file candidate, Python `matchSpecifier` normalization (`_`, `.`, `-`) and submodule dependency without `__init__.py`, unquoted Go `module` path, `package-unknown` counted in `externalPackageImports`.
10. **Tests and docs.** Add the missing tests, normalize test title casing, and inline checklist steps 6 and 7 in `docs/code-graph/language-adapters.md`.
11. **Architecture and diagnostic follow-up.** Move workspace accessibility probing behind an application port implemented in infrastructure; preserve skipped-manifest diagnostics even when no usable manifest is ultimately found; make PHP preparation read and parse the selected `composer.json` exactly once; and remove derived qualified-name equality from `SessionReferenceStore` so session and SQLite lookups have the same stored-only semantics.
12. **Recovery and test contracts.** Keep the existing public graph-storage recovery boundary: a version-15 SQLite database is surfaced as `GraphStorageRecoveryRequiredError` with reason `SCHEMA_INCOMPATIBLE`, retaining the low-level incompatibility as cause/evidence before destructive rebuild. Update the SQLite spec to name that public contract. Replace hard-coded POSIX roots and partial-port casts, and add outcome-level tests for multi-adapter identities, inaccessible external packages, terminal manifest diagnostics, backend parity, and provider lifecycle non-interference.

## Specs affected

### New specs

None.

### Modified specs

- `code-graph:language-adapter`: define project root / code root / package root and the repository-bounded manifest search, align `package-unknown` wording, state that every adapter is asked for an identity (ambiguity on equal names is reported), require every skipped manifest to be diagnosed even when the search finds no usable manifest, require manifest data to be read once in `prepare`, and require registration to validate `resolutionManifests()` and `languages()`/`extensions()` results.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:typescript-language-adapter`: `prepare`/`identity` share the package root; compact manifest data; `dist` mapping scope; `typeOnly` default import.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:go-language-adapter`: package directory relative to the `go.mod` directory; unquoted `module` path.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:python-language-adapter`: `matchSpecifier` normalization; submodule dependency without `__init__.py`.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:php-language-adapter`: exactly one read and parse of the selected `composer.json` per preparation call; own-PSR-4 fallback; `autoload`/`autoload-dev` merge; single class-file candidate.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:resolve-symbol-reference`: no dotted-parser fallback without an adapter; qualified-name equality uses only the stored value in both persisted and session-backed stores.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:symbol-model`: `FileNode` gains optional `namespace` and `namespaceSeparator` so a file hydrated from the store still contributes its qualified names.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:sqlite-graph-store`: `files` persists nullable `namespace` and `namespace_separator`; schema version 15 becomes 16; ordinary public-store open exposes `GraphStorageRecoveryRequiredError` with reason `SCHEMA_INCOMPATIBLE`, followed by destructive rebuild through the existing recovery path.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:indexer`: every configured workspace is mapped and prepared on `--workspace` runs (inaccessible ones skipped with a diagnostic through an injected application port), identity failure isolation, incremental qualified-name hydration, `adaptersWithoutPackageResolution` dedupe, and `package-unknown` counting.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:index-project-graph`: `IndexProjectGraphInput` and `provider.index()` forwarding gain optional `configuredWorkspaces` so partial indexing runs map and prepare all configured workspaces; verification uses a complete typed provider double and proves lifecycle non-interference.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

All production code is in `@specd/code-graph` (workspace `code-graph`); no consumer-facing API shape change is planned. One internal application-port contract is added for workspace accessibility.

- `packages/code-graph/src/application/use-cases/resolve-symbol-reference.ts`: risk **CRITICAL** (24 dependent files, including `index-code-graph.ts`, `code-graph-provider.ts` and the SDK `run-graph-*` orchestration). Changes only remove fallbacks, so behaviour changes are limited to previously unresolved text.
- `packages/code-graph/src/infrastructure/tree-sitter/find-manifest-field.ts`: risk **HIGH** (all four adapters, `create-code-graph-provider.ts`).
- Adapters: `typescript-language-adapter.ts` (`prepareWorkspaceManifest` at ~636/792, `getPackageIdentity` ~3121), `go-language-adapter.ts`, `php-language-adapter.ts`, `python-language-adapter.ts`.
- `application/use-cases/index-code-graph.ts` (indexer, `hydratePersistedFile`) and `application/services/package-import-resolver.ts`.
- `application/services/session-reference-store.ts`: remove derived qualified-name fallback and preserve backend parity.
- `application/ports/` plus `infrastructure/`: move workspace accessibility/type probing out of the application use case and wire the concrete filesystem implementation in composition.
- `infrastructure/sqlite/sqlite-graph-database.ts`: retain the public recovery wrapper and align the merged spec/scenario with the actual recovery boundary.
- Tests under `packages/code-graph/test/` mirroring the above, and `docs/code-graph/language-adapters.md`.
- The refreshed multi-file impact analysis is **CRITICAL**: 102 affected production files, 783 direct dependent edges, and coverage across 17 specs. Implementation must keep changes narrow and run the full code-graph and SDK regression suites.

## Technical context

Source of the items: the second to fourth compliance audits of `code-graph-cross-workspace-imports` (20261020-230822, 231822, 20261021-081835), recorded in `.specd-exploration.md`.

The full verification audit at `reports/20261022-181036/specs-compliance-change-code-graph-package-resolution-hardening-20261022-181036.md` added eight findings. The user selected **Both**, authorizing spec/design correction first and implementation correction afterward. For the one genuine contract ambiguity, the existing provider recovery boundary wins: SQLite callers observe `GraphStorageRecoveryRequiredError` with `SCHEMA_INCOMPATIBLE`; the low-level `GraphSchemaIncompatibleError` remains internal evidence rather than the public result.

Tests to add:

- `prepare` reads each manifest once (TS, Python, Go, PHP); `link` performs no I/O (fs spy); PHP does not touch the filesystem for `entrySurface`/`matchSpecifier` after `composer.json` is deleted.
- `--workspace` subset run: other stored workspaces are hydrated but not mapped or prepared, so their packages count as external.
- TS side-effect, dynamic and `require` package imports; package re-exports and their dependencies; default import with zero or two default exports.
- Resolver follows `import:package` steps for the four languages with the ordered path; positive anchored-file filter; `graph impact` dependents across workspaces; fingerprint test that edits `exports`.
- Capability flags and facets are separate; a facet does not satisfy a capability flag; closure does not re-extract unrelated files.
- `matchSpecifier`/`entrySurface` failing in Pass 2 skips the file without disabling the adapter; `resolutionManifests()` values not validated at registration; bindings without target ignored in the ambiguity check.
- Python `matchSpecifier` matches `acme-auth` and `acme_auth` in insertion order; "unknown project is not guessed"; "unimported name keeps the workspace lookup"; `import pkg.mod` and `importlib`; `.py` + `.pyi` end to end.
- Go blank and dot imports; test-to-test-helper bindings with test symbols excluded from the global qualified-name map.
- Manifest change end to end; workspace added; identity throws with a healthy second workspace/adapter; incremental PHP/Python/Go name-addressed imports equal a clean rebuild.

Multirepo constraint (agreed): a workspace code root may live outside the project root and belong to another repository. The search boundary is therefore the repository containing the code root, not the project root. Detection reuses the core `createVcsAdapter(codeRoot)` + `rootDir()`, the same per-workspace pattern `get-graph-health.ts` already uses with `workspace.codeRoot`; with no detected VCS the search inspects only the code root. `createVcsAdapter` is async, so the design should resolve the repository root once per workspace in the indexer before `prepare` and hand it to the language adapter as data, keeping `prepare`/`link` free of VCS calls and `link` free of I/O. Additional tests: external code root with the manifest above it, external code root without a repository marker (no walk up), symlinked code root and trailing slash, inaccessible external workspace (diagnostic, no global failure), `go.mod` above the code root.

Decisions recorded with the user: (a) the namespace of each file is persisted in the graph store (schema version 16) rather than re-analysing unchanged files; the code-graph version already participates in the derivation fingerprint, so existing graphs rebuild once; (b) repository roots are resolved by `@specd/code-graph` itself, not by the SDK: the indexer use case receives a resolver function injected by the composition, as `GetGraphHealth` already receives `createVcsAdapter`, and the SDK only adds the full list of configured workspaces; (c) no compatibility layer for external adapters is kept, because none exist yet (alpha): `PackagePreparationContext.repoRoot` is replaced by `projectRoot` plus a per-workspace `repoRoot`.

Out of scope: Go `pkg.Name` selectors and Python re-exports (`go-selectors-python-reexports`), TS namespace member access through published names, the implementation detector (draft `implementation-snapshot`), and the small `scoped-binding-environment` fallbacks marked "practically unreachable".

Overlap: all ten specs are also targeted by other designing changes (`code-graph-file-outline`, `code-graph-symbol-contracts`, `go-selectors-python-reexports`, `fs-decouple-03c-graph-spec-indexing-via-repository`). The user accepted the overlap; archive order will decide which deltas need a rebase.

## Open questions

None. Resolved with the user: `prepare` and `identity` share the package root found by walking up within the code root's own repository (no repository detected: code root only); resolver fixed to match stored-only semantics; `--workspace` runs map and prepare every configured workspace; every adapter is asked for an identity; identity failure does not stop relative barrel linking; the test-symbol exclusion applies to non-test importers only; application filesystem probing moves behind a port; terminal skipped manifests remain diagnosable; PHP performs one selected-manifest read/parse; and SQLite retains its public recovery wrapper contract.
