# Spec-compliance audit, batch A (language adapters)

Change: `code-graph-package-resolution-hardening`
Specs: `code-graph:language-adapter`, `code-graph:typescript-language-adapter`, `code-graph:go-language-adapter`, `code-graph:python-language-adapter`, `code-graph:php-language-adapter`
Method: merged spec-preview (spec + verify) compared with `packages/code-graph/src` and `packages/code-graph/test`. Read-only. All 1433 tests pass.

Scope and depth: the facet, registry, manifest-search, package-resolution, entry-surface and re-export parts of every spec were read line by line against the code. The older requirements were not re-derived: declaration extraction, ranges, owners and `parentId`, caller containment, hierarchy provenance, parser-authority, loaders and framework rules. For those I only checked that tests and the cross-language conformance suite (`language-adapter-conformance.spec.ts`) exist for them. They are marked "covered by tests, not deep-audited".

Test titles do not match verify scenario names (they use given/when/then wording), so coverage was judged by reading the test files.

Severity scale: HIGH (behaviour contradicts a MUST), MEDIUM (spec-visible deviation or a likely wrong result), LOW (edge case, doc, or weak test).

---

## 1. `code-graph:language-adapter`

### Requirement status

| Requirement                                                                                                                                                           | Status                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LanguageAdapter interface (core + facets, `resolutionManifests`)                                                                                                      | OK. `language-adapter.ts` and `language-adapter-facets.ts` match. Type-level test on the former loose methods exists (`package-resolution.spec.ts` "facet shape").                                                    |
| Adapter facet model                                                                                                                                                   | OK with caveats D-LA-1 and D-LA-2 (the indexer, outside the adapters, implements the failure isolation).                                                                                                              |
| Package resolution facet                                                                                                                                              | PARTIAL: D-LA-3 (skipped-manifest diagnostic not reported when no usable manifest is found). Search, bounds, canonicalisation, `prepare` and `entrySurface` are OK.                                                   |
| Relative import resolution facet                                                                                                                                      | OK in shape. The TypeScript candidate set is narrow, see D-TS-1.                                                                                                                                                      |
| Qualified-name resolution facet                                                                                                                                       | OK (PHP only; TS, Go and Python correctly omit it).                                                                                                                                                                   |
| Symbol reference syntax facet                                                                                                                                         | OK (tests exist; not deep-audited).                                                                                                                                                                                   |
| Re-export linking facet                                                                                                                                               | OK in shape. TypeScript behaviour has deviations, see D-TS-2 and D-TS-3.                                                                                                                                              |
| Package import resolution context                                                                                                                                     | OK (helpers in `index-code-graph.ts` and `PackageImportResolver`; the reasons, `steps`, and diagnostics-not-persisted behaviour are tested).                                                                          |
| Full-file analysis / parser-authoritative / unified migration                                                                                                         | Covered by tests and conformance, not deep-audited.                                                                                                                                                                   |
| Language detection, import extraction, call resolution, scoped bindings, caller containment, dynamic dependency, hierarchy                                            | Covered by tests, not deep-audited.                                                                                                                                                                                   |
| Package identity extraction                                                                                                                                           | OK. Multi-adapter identities, collision error naming both workspaces, inaccessible workspace skipped, and purge on adapter failure are all implemented (`index-code-graph.ts` ~L900-1010) and tested. D-LA-3 applies. |
| Import specifier resolution                                                                                                                                           | OK. Pass 2 uses only session data; PHP uses session lookups.                                                                                                                                                          |
| Tree-sitter query patterns internal                                                                                                                                   | OK.                                                                                                                                                                                                                   |
| Adapter registry                                                                                                                                                      | OK with LOW items D-LA-4 and D-LA-5.                                                                                                                                                                                  |
| Resolver capability declaration / built-in specialization / owner facts / member semantics / human reference / hierarchy consistency / ranges / classification policy | Covered by tests and conformance, not deep-audited.                                                                                                                                                                   |
| Cross-language conformance suite                                                                                                                                      | OK. Every bullet of the spec list maps to an `it` in the conformance spec (L714-L1106); fixtures are required per language.                                                                                           |
| Adding a language adapter                                                                                                                                             | OK. Docs page `docs/code-graph/language-adapters.md` states the same 7 steps, see D-LA-6.                                                                                                                             |

### Discrepancies

**D-LA-1 [LOW, spec internal tension]** "Adapter facet model" says that when `identity`, `prepare` or `link` fails the adapter is "treated as if it did not provide `packageResolution`". It also says "Facets are isolated ... one facet being treated as absent MUST NOT make another absent". Code follows the first rule literally. In `index-code-graph.ts` L1337, a throwing `reExportLinking.link` on an adapter that also has `packageResolution` calls `purgeDisabledAdapterClaims`, which disables package resolution. A throwing `link` of an adapter with no `packageResolution` does not list it as lacking package resolution (test `package-imports.spec.ts` L694). These two rules are in tension.

- Spec-wrong possibility: a `link` failure should disable only re-export linking.
- Code-wrong possibility: none, the code follows the literal text.
- Recommendation: clarify the spec.

**D-LA-2 [LOW, spec]** "Absent facet" lists the adapter in `adaptersWithoutPackageResolution` "by its first declared language identifier, sorted". The code does this. For a replaced or multi-adapter registry, two adapter instances with the same first language collapse to one entry. This is acceptable, but unspecified.

**D-LA-3 [MEDIUM, code]** Skipped-manifest diagnostics are lost when no usable manifest exists. The spec says a manifest that lacks the identity field is "skipped with a non-fatal diagnostic reported through `report`". `findPackageManifest` returns `undefined` with no `skipped` list when nothing matches. All four `identity` implementations (`typescript-language-adapter.ts` `getPackageIdentity`, `go-language-adapter.ts`, `python-language-adapter.ts`, `php-language-adapter.ts`) do `if (!match) return undefined` before reporting `skipped`. The diagnostic therefore only appears when a named manifest is found higher up. A repo whose only `package.json` is nameless (common root monorepo manifest) gets no diagnostic.

- Code-wrong if the spec text is meant literally.
- Spec-wrong possibility: reporting only when a later manifest wins would be noise reduction; if intended, say so.
- The message "Package manifest skipped (no identity)" is also used for manifests that were unreadable (`skipped` mixes unreadable and nameless files).
- Test gap: only the "found higher up" case is tested (`find-manifest-field.spec.ts`, `typescript-language-adapter.spec.ts` L2608, the Python and PHP equivalents).

**D-LA-4 [LOW, code]** Registry validation is weaker than the spec wording in three places.

- Keys of `extensions()` are not validated as extensions (`'ts'`, `''` and `'*'` are accepted; only values are checked).
- A required core member that is present but not a function is rejected (`typeof !== 'function'`), but no test covers the "present but not a function" case for core members or facet members, only "missing".
- Replacement leaves stale extension mapping. If adapter B replaces language `x` but does not declare an extension that adapter A had mapped to `x`, `extMap` still routes that extension to B, so B receives files it never declared. The spec only requires that B's declared mappings overwrite earlier ones.

**D-LA-5 [LOW, convention]** `register()` throws a plain `Error` (not `INVALID_LANGUAGE_ADAPTER`) for the `declarationPolicy` checks. The spec only lists four `INVALID_LANGUAGE_ADAPTER` triggers, so this is spec-compatible, but the global error contract (`_global/error-handling-conventions`) asks for Specd errors with a code. `InvalidLanguageAdapterError` messages state the rule but give no fix guidance (actionable-messaging rule).

**D-LA-6 [LOW, docs/test]** The docs test (`test/docs/language-adapters-docs.spec.ts`) only checks that member names, facet headings, the reason codes and the string `INVALID_LANGUAGE_ADAPTER` appear. It cannot show that "the spec and the page state the same rules". The page also does not state two spec rules: "a failure of `packageResolution` MUST NOT disable relative barrel re-export linking" and the facet-isolation rule. Doc/spec drift risk, severity LOW.

**D-LA-7 [MEDIUM, spec-wrong]** Constraint "No dependency on @specd/core" (`language-adapter` Constraints) is false. `workspace-integration` says `@specd/code-graph` depends on `@specd/core` as a runtime dependency, and AGENTS.md lists `code-graph -> core`. The code does this: `SpecdCodeGraphError extends SpecdError` from `@specd/core`. The same spec requires registration to fail "with a `SpecdError`" and `_global/error-handling-conventions` requires it. The constraint should be removed or reworded (for example "no domain logic depends on core runtime services").

### Test gaps and weak tests (language-adapter)

- **Weak**: "Prepare reads each manifest once" (spec) is not asserted by counting reads anywhere. The TS test (`typescript-language-adapter.spec.ts` L2742) and the Go test (`go-language-adapter.spec.ts` L1380, titled "located once in prepare") only delete the manifest after `prepare` and show that `entrySurface` still works. The Python test titled "Package manifest located once in prepare" tests `identity` skipping only (Python `prepare` is a no-op). The PHP test "Prepare parses composer.json once" only inspects the stored map. No test spies on `readFileSync`. Because the PHP code can read a nameless `composer.json` twice (see D-PHP-3), this is a real gap.
- **Missing**: no test that a present-but-throwing `link` leaves `packageResolution` of the same adapter usable (D-LA-1).
- **Missing**: no test for diagnostics when no manifest at all has an identity (D-LA-3).
- **Missing**: registry tests for facet or core members that are present but not functions; extension-key validity; stale extension mapping (D-LA-4).
- Test naming (`_global/testing` "Test naming"): many new tests use "Scenario: ..." or capitalised "Given ..." titles instead of "given <state>, when <action>, then <outcome>". `package-resolution.spec.ts` and `resolution-manifests.spec.ts` do not mirror a source file name. Severity LOW.

### Summary counts (language-adapter)

34 requirements: 26 OK or covered, 6 partial or with LOW items (facet model, package resolution facet, registry, re-export linking, docs, identity), 0 failing outright. Discrepancies: 1 MEDIUM code (D-LA-3), 1 MEDIUM spec-wrong (D-LA-7), 5 LOW. Test gaps: 1 weak cluster, 3 missing groups.

---

## 2. `code-graph:typescript-language-adapter`

### Requirement status

| Requirement                                                                                                           | Status                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Supported languages and deterministic analysis                                                                        | Covered by tests, not deep-audited.                                                                                                                          |
| Declaration extraction and ranges; object properties in array records; logical identity and owners; overload identity | Covered by tests, not deep-audited.                                                                                                                          |
| Imports, exports, and public bindings                                                                                 | PARTIAL: D-TS-1, D-TS-2, D-TS-3, D-TS-5 (see below). Package-import rules, type-only handling, and re-export file dependencies are implemented as specified. |
| Scoped bindings, calls, types, construction                                                                           | Covered by tests, not deep-audited.                                                                                                                          |
| Caller and local-binding semantics                                                                                    | Covered by tests, not deep-audited.                                                                                                                          |
| Hierarchy and provenance                                                                                              | Covered by tests, not deep-audited.                                                                                                                          |
| Package and build-context boundary                                                                                    | OK with LOW items D-TS-4 and D-TS-6.                                                                                                                         |
| Capability truthfulness                                                                                               | Covered by tests.                                                                                                                                            |
| Parser-authoritative extraction                                                                                       | Covered by tests; `extractTypeReferenceNames` is a regex over an already isolated type node, which the spec allows.                                          |

Verified against the package part of the spec (all OK): `identity` and `prepare` share `findPackageManifest` with `hasPackageName`; `prepare` stores only `name`, `main`, `exports`, `codeRootOffset`; `main` is ignored when `exports` is defined; `exports["."]` and `exports["./sub"]` are selected; condition objects use `import`, then `default`, with `types` only as a fallback; different runtime targets are all returned; `dist/` maps to `src/`; `.js/.jsx/.mjs/.cjs/.d.ts/.d.mts/.d.cts` map to TS first then JS; directories map to `index`; candidates outside the code root are dropped; default and namespace imports do not call `resolvePackageExport`; type-only imports use only the type space; side-effect, dynamic and `require` package imports depend on the entry files; re-exports are file dependencies (relative only when exactly one indexed file); no symbol-name search for package imports.

### Discrepancies

**D-TS-1 [MEDIUM, code, with a spec-vague component]** Relative-import candidates ignore JS, JSX, TSX and index variants. `resolveRelativeImportPath` maps `.js` to `.ts`, `.jsx` to `.tsx`, and an extensionless path to `[x.ts, x/index.ts]` only. Specifiers such as `./Button` (a `.tsx` file), `./util` (a `.js` file), `./a.js` (a real `.js` file), `./dir` with `index.tsx` or `index.js`, and `.mjs/.cjs` are never resolved. The spec says relative imports "consider TypeScript/JavaScript extension and index-file candidates" and the facet scenario says it "returns the extension and index-file candidates". Package entry mapping (`sourceCandidates`) does handle tsx and js, so a JS-source or TSX workspace can be reached by package import but its internal relative barrel chain cannot be linked. The tests (`typescript-language-adapter.spec.ts` L1064-1082) pin the `.ts` only behaviour.

- Spec-wrong possibility: the spec does not enumerate candidates, so a TS-only set may be the intent. If so, the verify scenario "JavaScript-source package resolves" overpromises.
- Code-wrong possibility: the facet should return the same JS/TSX candidates as the entry mapping.

**D-TS-2 [MEDIUM, code]** `export * as ns from './x'` is treated as a flat star re-export. The extractor (`typescript-language-adapter.ts` ~L1119) uses `child.text().trimStart().startsWith('export *')` with no `export_clause`, so it records `{importedName:'*', exportedName:'*'}`. `linkReExports` then emits every non-default binding of `./x` under its own name. A namespace re-export should publish a single `ns` binding (or none). This publishes names the barrel does not export, so a consumer can resolve `import { Foo } from 'pkg'` through a barrel that only exports `ns`. The spec lists "named re-exports; and star re-exports" and does not mention namespace re-exports (spec gap). No test covers it.

**D-TS-3 [LOW-MEDIUM, code vs spec text]** `linkReExports` has a name-based fallback. When the source file has no public binding for `importedName` (`routes.length === 0`), it looks at `session.findSymbolsByFile(sourcePath)` and, if exactly one symbol has that name, emits a binding to it. The spec ("Re-export public bindings") says the binding uses "the logical id already published by the entry file" and "Missing exported name emits no binding". This fallback binds a declared but unexported symbol. It stays inside one resolved file (so it does not break the "anywhere in the target workspace" rule), but it is a symbol-by-name choice. The test "emits no binding for ... a missing name" (L1377) uses an absent name, not a declared-but-unexported one.

**D-TS-4 [LOW, code]** `sourceCandidates` does not normalise published paths. A published path such as `./lib/../src/index.js` or `./src/./index.js` is not collapsed, so a candidate that is inside the code root is dropped or mismatched (with a non-empty `codeRootOffset`, the prefix test fails). A path with `..` and `codeRootOffset === ''` yields `ws:../x.ts`, which is filtered later only because it is not indexed. The "outside the code root is dropped" rule is therefore implemented by prefix matching, not by path containment.

**D-TS-5 [LOW, code/spec]** Non-relative TS imports first consult the shared `qualifiedNames` map (`resolveImports`, `qualifiedNames.get(imp.specifier)`) before the package helpers. TS has no qualified-name facet, so this bypasses the "resolve through the shared package helpers" rule. Today only PHP populates `qualifiedNames` (namespace comes only from the PHP draft), so it is latent: a PHP qualified name equal to a TS specifier would bind it. The same pattern exists in the Go and Python adapters (D-GO-2, D-PY-3). Fix: only consult `qualifiedNames` for adapters with `qualifiedNameResolution`, or drop it.

**D-TS-6 [LOW, spec]** `matchSpecifier` for subpath-pattern exports (`"./features/*"`) is unsupported: only exact `exports["./sub"]` keys are read. The spec says "matching `exports["./<subpath>"]` entry", so this is consistent. Mention only so the limit is explicit (with `exports` defined, a pattern export yields no candidates, hence `no-entry-surface`).

### Test gaps and weak tests (TypeScript)

- Weak: "Prepare reads package.json once per workspace" is not measured (see language-adapter gaps).
- Missing: positive half of "Type-only default import" (the default export is in the type space, so `X` binds). Only the negative half is tested (`typescript-language-adapter.spec.ts` L2408).
- Missing: relative re-export chains in JS or TSX workspaces (D-TS-1); `export * as ns` (D-TS-2); a declared-but-unexported name in a re-export (D-TS-3); non-normalised published paths (D-TS-4).
- Present and adequate: entry surface (`package-resolution.spec.ts` L64-246, `typescript-language-adapter.spec.ts` L2565-2740), type-only syntax marking, re-export dependency and incremental barrel relink (`index-code-graph.package-imports.spec.ts`).

### Summary counts (TypeScript)

9 requirements: 5 covered or OK, 4 partial or with items. Discrepancies: 2 MEDIUM code, 1 LOW-MEDIUM code, 3 LOW. Test gaps: 1 weak, 4 missing.

---

## 3. `code-graph:go-language-adapter`

### Requirement status

| Requirement                                                                                                                    | Status                                                  |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Supported files and deterministic analysis                                                                                     | Covered by tests.                                       |
| Parser-authoritative extraction                                                                                                | Covered by tests (`go-language-adapter.spec.ts` L1025). |
| Declaration extraction and ranges                                                                                              | Covered by tests.                                       |
| Package identity, exports, and imports                                                                                         | OK. Details below.                                      |
| Resolution manifests (`['go.mod']`)                                                                                            | OK. Tested (L583).                                      |
| Logical identity and owners; scoped bindings; caller containment; embedding; interface satisfaction; build-context; capability | Covered by tests, not deep-audited.                     |

Checked in detail and OK: `identity` reads the `module` path from the nearest `go.mod` using the shared search, unquoting double-quoted and backtick-quoted paths (`readGoModulePath`); `matchSpecifier` longest known module prefix; `prepare` builds the per-run directory index of indexed non-test `.go` files and records each workspace's code-root offset relative to the module directory (a `go.mod` above the code root is supported); `entrySurface` computes `import path - module prefix`, applies the offset, returns `[]` outside the code root, treats the module path itself as the module-root package, and returns the files of the directory with the directory as `surface`; `resolveImports` adds all entry files as dependencies and returns the helper's reason as a diagnostic; there is no `relativeImportResolution` and no `qualifiedNameResolution`.

### Discrepancies

**D-GO-1 [LOW, code]** `readGoModulePath` uses `/^module\s+(...)/m`. `\s+` also matches newlines, so a `go.mod` with a bare `module` line followed by another directive yields that next token as the module path (for example `module\nrequire x v1`). It also does not handle the (rare, valid) block form `module ( "x" )`. The identity is wrong only for malformed or exotic files. No test covers either.

**D-GO-2 [LOW, code]** `GoLanguageAdapter.resolveImports` consults `qualifiedNames.get(imp.specifier)` for non-file-only imports before `packageEntryFiles`. Go has no qualified-name facet. Same latent pattern as D-TS-5. The spec says "A Go import resolves to a package, not to a symbol", so binding a symbol from this map would contradict it.

**D-GO-3 [LOW, spec ambiguity]** A workspace has only one module (the nearest `go.mod` above its code root). Nested modules below the code root, or multiple modules in one workspace, resolve via the single nearest module, and their import paths stay unresolved. The spec says "locate the module directory of every configured workspace" and is silent about nested modules. State the limit in the spec.

**D-GO-4 [LOW]** The skipped-manifest diagnostic limitation D-LA-3 applies (Go `identity`).

### Test gaps and weak tests (Go)

- Weak: "Module directory is located once in prepare" (`go-language-adapter.spec.ts` L1380) does not count reads (see language-adapter gaps).
- Missing: a test for a malformed or bare `module` line and the block form (D-GO-1).
- Present: unquoted/quoted identity, `go.mod` above the code root, package directory outside the code root, longest prefix, test files excluded, module-root import, unknown module counted as external (`index-code-graph.package-imports.languages.spec.ts` L331), "qualified selector stays unresolved" (L138).

### Summary counts (Go)

10 requirements: 8 OK or covered, 2 with LOW items. Discrepancies: 4 LOW. Test gaps: 1 weak, 1 missing.

---

## 4. `code-graph:python-language-adapter`

### Requirement status

| Requirement                                                                                            | Status                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supported files and deterministic analysis                                                             | Covered by tests.                                                                                                                                                                |
| Parser-authoritative extraction                                                                        | Covered by tests.                                                                                                                                                                |
| Declaration extraction and ranges; identity and owners; scoped bindings; caller containment; hierarchy | Covered by tests, not deep-audited.                                                                                                                                              |
| Imports and package resolution                                                                         | PARTIAL: D-PY-1, D-PY-2, D-PY-3; the package parts are OK otherwise.                                                                                                             |
| Resolution manifests (`['pyproject.toml']`)                                                            | OK, tested (L644).                                                                                                                                                               |
| Public surface and stub behaviour                                                                      | OK as far as checked: module surface is the path without extension or `__init__`; re-imported alias stays unresolved (`index-code-graph.package-imports.languages.spec.ts` L76). |
| Capability truthfulness                                                                                | Covered by tests.                                                                                                                                                                |

Checked in detail and OK: `matchSpecifier` normalises both sides (lowercase, runs of `-`, `_`, `.` to `-`) and returns `undefined` for several distinct matches, never choosing by order; `entrySurface` does no I/O and searches `<ws>:src/<top>` then `<ws>:<top>` for `.py`, `.pyi`, `/__init__.py`, `/__init__.pyi`, dropping a stub whose source is indexed; `prepare` is a no-op (allowed); `from pkg import X` falls back to a submodule dependency only for `not-exported` or `no-entry-surface`, and returns `ambiguous` when several submodule files are indexed; no symbol-by-name search for absolute imports; `import:package` steps returned; `[project].name` only, single and double quotes, skip and continue otherwise (`readPythonProjectName`).

### Discrepancies

**D-PY-1 [LOW, code]** `readPythonProjectName` is a line scanner with limits. (a) A table header written with inner whitespace (`[ project ]`, valid TOML) is not recognised (`header[1] === 'project'` is an exact match). (b) `project.name = "x"` dotted keys at the document root and `project = { name = "x" }` inline tables are not recognised. (c) A multi-line string value in `[project]` that contains `[...]` at line start can switch the section. Spec allows textual parsing, but such valid files yield "no identity" and the walk continues, producing a wrong or missing package. Tests cover only `[project]` / `[tool.poetry]` / single-quote.

**D-PY-2 [LOW-MEDIUM, code]** Relative import resolution keys on symbol presence rather than indexed file presence. `resolveFileImport` returns the first candidate with `session.findSymbolsByFile(c).length > 0`. An indexed relative module that declares no symbols (for example an empty `__init__.py`, a module with only imports) does not become a file dependency. The spec says candidates are chosen "when known indexed paths prove them". Absolute package imports use `getFileId` (correct). For relative named imports, the first candidate that declares the name wins (`.py` before `/__init__.py`), although the spec says "namespace-package selection or other ambiguous layouts SHALL remain unresolved unless indexed context selects one route"; `foo.py` plus `foo/__init__.py` both declaring the name is resolved silently to `foo.py`.

**D-PY-3 [LOW]** Latent `qualifiedNames.get(imp.specifier)` consult (same as D-TS-5). The submodule-ambiguity case counts `entries.length > 1` including candidates in the same root (for example both `X.py` and `X/__init__.py` under one root), which the spec words as "under different roots"; this is stricter than the spec and probably intended.

**D-PY-4 [LOW, spec design note]** An ambiguous normalised name (`acme-auth` vs `acme_auth`) makes `matchSpecifier` return `undefined`, which the indexer counts as `package-unknown` and therefore in `externalPackageImports`. The spec states this deliberately, but it makes an ambiguity look like an external package in the run summary. Possible spec improvement: a dedicated reason, or a separate error entry for the ambiguous identity.

**D-PY-5 [LOW]** D-LA-3 applies (Python `identity`).

### Test gaps and weak tests (Python)

- Weak: test titled "Package manifest located once in prepare and pyproject.toml without project name is skipped" (`python-language-adapter.spec.ts` L1506) never calls `prepare` (a no-op) and counts nothing.
- Present and adequate: PEP 503 normalisation and equal-normalised-name ambiguity (L1371-1391), submodule resolution, ambiguity under two roots (L1392-1505), entry surface variants (`package-resolution.spec.ts` L249-318), identity ignoring `[tool.poetry]`, single-quoted names.
- Missing: tests for D-PY-1 (header spacing, dotted or inline forms) and D-PY-2 (empty relative module, `foo.py` plus `foo/__init__.py`).
- Missing: an integration test that `Entry surface performs no filesystem read` for several Python workspaces after `pyproject.toml` deletion (the existing test at `package-resolution.spec.ts` L506 covers one workspace).

### Summary counts (Python)

10 requirements: 8 OK or covered, 2 partial. Discrepancies: 1 LOW-MEDIUM, 4 LOW. Test gaps: 1 weak, 3 missing.

---

## 5. `code-graph:php-language-adapter`

### Requirement status

| Requirement                                                                                                           | Status                                                                                   |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Supported files and deterministic analysis                                                                            | Covered by tests.                                                                        |
| Parser-authoritative extraction                                                                                       | Covered by tests (framework rule tests at L1614-1700, L2266-2380).                       |
| Declaration extraction; owners; static and framework dependency facts; scoped bindings; caller containment; hierarchy | Covered by tests, not deep-audited.                                                      |
| Namespaces, use aliases, and Composer resolution                                                                      | PARTIAL: D-PHP-1, D-PHP-2, D-PHP-3, D-PHP-4. Core behaviour is implemented as specified. |
| Resolution manifests (`['composer.json']`)                                                                            | OK, tested (L654).                                                                       |
| Public surface and capability truthfulness                                                                            | Covered by tests.                                                                        |

Checked in detail and OK: facets `packageResolution` and `qualifiedNameResolution` are present (and `relativeImportResolution`, `symbolReferenceSyntax`); `identity` uses the nearest named `composer.json` (`hasComposerName`); `readComposerManifest` prefers a named manifest and falls back to the nearest nameless one; the PSR-4 map merges `autoload` then `autoload-dev` with duplicates removed and every directory kept, sorted longest prefix first with a stable order for the directories of one prefix; `matchSpecifier` picks the longest prefix among the prepared maps of workspaces whose package name is known; `entrySurface` uses prepared canonical paths and `path.relative` only (no `realpathSync`, no fs) and drops candidates outside the code root; `resolveImports` tries the exact qualified-name map first, then `packageEntryFiles` (first indexed candidate only, not for non-test importers when the target is a test), then the own-PSR-4 fallback (`resolveQualifiedNameFromSession`, indexed files only, never an absolute path, test or `autoload-dev` targets only for test importers); no `resolvePackageExport` call and no `import:package` step; the unresolved reason is `not-exported` when candidates were excluded for a non-test importer.

### Discrepancies

**D-PHP-1 [LOW-MEDIUM, code vs spec ambiguity]** The "autoload-dev or test target only for test importers" rule is applied inconsistently. In the package path (`resolveImports` -> `packageEntryFiles`) only the file category `test` is checked (`isTargetTest`); `autoloadDevDirs` is not consulted. A file under another workspace's `autoload-dev` directory that is not classified as test is accepted for a production importer. In the own-PSR-4 path both checks apply. The spec states the rule in the paragraph about the own fallback but its scope is unclear.

- Spec-wrong possibility: clarify that the rule covers every PSR-4 resolution.
- Code-wrong possibility: apply `autoloadDevDirs` in the package path as well.
- Related: the shared helper discards test-category entries before the adapter sees them, so for a test importer the "first returned candidate that is an indexed file" (Composer semantics) can skip a test-category first candidate and pick a later fallback directory. For a test importer, a cross-workspace test target is only reachable via the own-PSR-4 fallback (same workspace).

**D-PHP-2 [MEDIUM, spec gap + code]** Equal-length PSR-4 prefix ties across workspaces are resolved by workspace order. `matchQualifiedNameToPackage` uses `prefix.length > best.length`, so with two known packages both mapping `App\` (or equal-length prefixes) the first owner wins silently. The spec says "longest prefix" only. Python has an explicit no-registration-order rule, and PHP has none. Silent ownership choice is the kind of guess the change is meant to remove.

- Spec-wrong: the tie case is unspecified.
- Code-wrong: it picks by registration order. Preferred behaviour: return `undefined` (ambiguous) like Python, and test it.
- Also, prefixes are compared with `startsWith` and are not normalised to end with `\`, so a manifest prefix without a trailing backslash (`"App"`) matches `AppFoo\X`. Composer requires the trailing backslash, so this is LOW.

**D-PHP-3 [LOW, code]** "Read the chosen `composer.json` at most once per call from a single parse" is not exactly true. `readComposerManifest` calls `findPackageManifest(..., hasComposerName)`, which reads and `JSON.parse`s each manifest on the walk, then `JSON.parse(match.content)` again for the chosen one. This is two parses of the same text. When no named manifest exists it walks again with `() => true`, so a nameless manifest is read twice. `identity` reads the same manifest separately, which the spec allows. Also `readComposerManifest` and `prepareResolutionMetadata` copy the session maps on every `analyzeFile` call (small O(workspaces) cost per file). No functional effect.

**D-PHP-4 [LOW, design]** State is keyed by `codeRoot`, not by workspace name, in `workspaceByCodeRoot` and `psr4ByCodeRoot`. When two configured workspaces share one code root, the last registered name wins, so the own-PSR-4 fallback builds ids with the wrong workspace prefix (`B:src/X.php` instead of `A:src/X.php`) and stays unresolved for the other. The spec signature `resolveToPath(qualifiedName, codeRoot, session)` takes only the code root, so this limit is a consequence of the spec. The `entrySurface` test "Candidates follow the longest prefix first" itself registers two workspaces with one `codeRoot`.

**D-PHP-5 [LOW]** D-LA-3 applies (PHP `identity`). The loop for `resolveFileImport` and `resolveRelativeImportPath` uses `findSymbolsByFile(...).length > 0` (same limit as D-PY-2). There is dead code (`this.resolveRelativeImportPath ? ... : undefined`).

### Test gaps and weak tests (PHP)

- **Weak**: "Candidates follow the longest prefix first" (`php-language-adapter.spec.ts` L2427). The fixture maps `App\` to `src/` and `App\Http\` to `src/Http/`, then registers only `pkg:src/Http/Kernel.php`. The candidate for `App\` is `src/Http/Kernel.php` too, so both candidates are the same file and "depends only on the first indexed candidate" cannot fail. The test cannot distinguish "first only" from "all". It needs two different indexed files (for example `src/Http/Kernel.php` and `src/Http/Http/Kernel.php`).
- **Weak**: "Prepare parses composer.json once" counts nothing (the test only deletes the manifest and checks the stored map). "entrySurface performs no filesystem access" only spies on `realpathSync`; it does not spy on `readFileSync`, `existsSync` or `statSync`, and does not exercise `resolveToPath` (the Pass 2 integration scenario at L1766-1860 covers the deletion case instead).
- **Missing**: equal-length prefix tie (D-PHP-2); `autoload-dev` file not classified as test used by a production importer through the package path (D-PHP-1); two workspaces sharing a code root (D-PHP-4); a nameless manifest read twice (D-PHP-3); `autoload` and `autoload-dev` prefix ordering when the same prefix is declared in both and directories interleave with other prefixes.
- Present and adequate: exact qualified name wins, unindexed qualified name becomes a PSR-4 dependency, same short name in another workspace is not used, no matching prefix is external (`index-code-graph.package-imports.languages.spec.ts` L166-L330), named manifest preferred over nearest nameless (L2699), own PSR-4 fallback with and without test files (L2510, L2576), `resolveToPath` indexed-only (L732), session isolation (L1766-1860).

### Summary counts (PHP)

10 requirements: 7 OK or covered, 3 partial. Discrepancies: 1 MEDIUM, 2 LOW-MEDIUM or LOW-MEDIUM-ish (D-PHP-1), 4 LOW. Test gaps: 2 weak (one decisive), 5 missing.

---

## 6. Contradictions with global specs and dependencies

- `default:_global/error-handling-conventions` and `_global/architecture`: `SpecdCodeGraphError` extends `SpecdError` from `@specd/core`, in agreement with the global spec but in contradiction with `language-adapter` Constraints "No dependency on @specd/core" and consistent with `workspace-integration`. See D-LA-7. Action: fix the language-adapter constraint.
- `_global/testing` "Test naming": new tests use `Scenario:` or capitalised "Given ..." titles and some spec files (`package-resolution.spec.ts`, `resolution-manifests.spec.ts`, `language-adapter-conformance.spec.ts`) do not mirror a source file. Convention deviation only (LOW).
- `_global/testing` "Tests are POSIX- and Windows-compatible": the symlink test (`find-manifest-field.spec.ts` L186) tolerates failure to create the link and silently skips its assertion, which is acceptable. No `chmod 0o000` use was found in the audited files. No violation.
- `_global/error-handling-conventions` "Actionable Messaging": `InvalidLanguageAdapterError` states the broken rule but not how to fix it (LOW, D-LA-5).
- `_global/docs`: `docs/code-graph/language-adapters.md` is a package-reference page; the global spec requires callouts that hosts import from `@specd/sdk` in `docs/code-graph/index.md` (modified in this change). Not checked in detail (outside the audited specs).
- Spec dependencies: `typescript/go/python/php-language-adapter` list `code-graph:workspace-integration`; its text ("`exports` or `main` ... SHALL change the derivation fingerprint ... manifests that adapters declare through `resolutionManifests()`") is consistent with the adapters' declared manifests. One consequence worth checking in batch B: the manifest walk for the fingerprint must be the same bounded walk as `identity` (the manifest may sit above the code root). `compute-graph-fingerprint.ts` accepts a `repoRoot`, so this appears handled, but it was not audited here.
- No contradiction found between the five specs and `symbol-model` in the parts read.

## 7. Overall counts for batch A

| Spec                        | Requirements | OK or covered | Partial or with items | Discrepancies (M / L) | Weak tests | Missing tests |
| --------------------------- | ------------ | ------------- | --------------------- | --------------------- | ---------- | ------------- |
| language-adapter            | 34           | 26            | 6                     | 2 M / 5 L             | 1 cluster  | 3 groups      |
| typescript-language-adapter | 9            | 5             | 4                     | 2 M + 1 L-M / 3 L     | 1          | 4             |
| go-language-adapter         | 10           | 8             | 2                     | 0 M / 4 L             | 1          | 1             |
| python-language-adapter     | 10           | 8             | 2                     | 0 M + 1 L-M / 4 L     | 1          | 3             |
| php-language-adapter        | 10           | 7             | 3                     | 1 M + 1 L-M / 4 L     | 2          | 5             |

Most important items to act on:

1. D-PHP-2 (equal-length PSR-4 prefix tie resolves by workspace order) and its missing test.
2. D-TS-1 and D-TS-2 (TypeScript relative candidates miss tsx/js/index variants; `export * as ns` flattened) which produce unresolved or wrong re-export bindings.
3. D-LA-3 (skipped-manifest diagnostic lost when no manifest yields an identity), in all four adapters.
4. D-LA-7 (spec constraint "No dependency on @specd/core" is false and contradicts other specs and the global error contract).
5. Weak tests: "reads once" scenarios assert nothing about read counts; the PHP "longest prefix first / first indexed candidate only" test cannot fail.
