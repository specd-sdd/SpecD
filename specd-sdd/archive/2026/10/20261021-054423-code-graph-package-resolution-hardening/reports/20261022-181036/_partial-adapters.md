# Compliance Audit Partial — Language Adapters

## Scope and Evidence

Change: `code-graph-package-resolution-hardening`

Merged change specs audited:

- `code-graph:language-adapter`
- `code-graph:typescript-language-adapter`
- `code-graph:go-language-adapter`
- `code-graph:php-language-adapter`
- `code-graph:python-language-adapter`

The audit used `changes spec-preview` for every spec and verification artifact, graph-first symbol discovery, direct inspection of implementation and tests, and the direct dependency/global-spec chain. The code graph was current (`stale: false`, complete coverage, schema compatible).

Independent execution evidence:

- Focused Vitest batch: **8 files passed, 542 tests passed**. The batch covered the four adapter suites plus `find-manifest-field`, adapter conformance, package-resolution, and package-import indexer suites.
- `@specd/code-graph` TypeScript check: **passed** with `tsc --noEmit`.

## Requirements Summary

| Spec                                     | Requirements | Verification scenarios | Implementation status                                                                                  |
| ---------------------------------------- | -----------: | ---------------------: | ------------------------------------------------------------------------------------------------------ |
| `code-graph:language-adapter`            |           34 |                    169 | 33 conformant; 1 partial (`Package resolution facet`)                                                  |
| `code-graph:typescript-language-adapter` |           12 |                     57 | 11 conformant; 1 partial (`Package and build-context boundary`, inherited terminal-diagnostic gap)     |
| `code-graph:go-language-adapter`         |           12 |                     31 | 11 conformant; 1 partial (`Package identity, exports, and imports`, inherited terminal-diagnostic gap) |
| `code-graph:php-language-adapter`        |           11 |                     35 | 10 conformant; 1 partial (`Namespaces, use aliases, and Composer resolution`)                          |
| `code-graph:python-language-adapter`     |           11 |                     34 | 10 conformant; 1 partial (`Imports and package resolution`, inherited terminal-diagnostic gap)         |
| **Total**                                |       **80** |                **326** | **75 conformant; 5 partial, caused by 2 distinct findings**                                            |

## Implementation Status

### `code-graph:language-adapter`

The required core and optional facet model are implemented in `language-adapter.ts` and `language-adapter-facets.ts`. The four built-in adapters expose the declared facets rather than loose resolution methods, session state is run-scoped, and package preparation is orchestrated before Pass 2. `index-code-graph.ts` resolves a repository root per accessible workspace, passes it as workspace data, invokes every applicable adapter identity facet, records callback diagnostics, and prepares all accessible workspaces. Package failures are isolated without disabling unrelated relative re-export behavior.

The shared `findPackageManifest` helper correctly canonicalizes paths, refuses to walk outside the supplied repository root, inspects only the code root when no repository root exists, and returns the package root/content needed for identity and preparation to agree. One terminal-diagnostic behavior is incomplete; see ADP-001.

The remaining common requirements—single full-file analysis, parser-authoritative facts, stored-fact Pass 2, deterministic relations, registry/facet validation, logical ownership, ranges, hierarchy provenance, reference syntax, and cross-language conformance—have implementation and automated coverage in the adapter/conformance/indexer suites. No conflicting language-specific fallback was found in generic resolver code.

### `code-graph:typescript-language-adapter`

The adapter implements the four declared languages/extensions, compact one-pass analysis, parser-derived declarations/imports/calls/hierarchy, logical owners and overload groups, public/re-export bindings, type-space-aware import resolution, and deterministic relation construction.

Package resolution now uses the same bounded manifest search for identity and preparation. Prepared state retains only `name`, `main`, `exports`, and `codeRootOffset`; entry lookup performs no filesystem access. Published paths are constrained to the code root, `dist` and declaration targets map to supported indexed sources, other build directories are not guessed, runtime alternatives precede `types`, and ambiguity is preserved. Tests cover a code root below `package.json`, outside-root rejection, compact state, `.d.*` mapping, unsupported build directories, repeated entry lookup after manifest deletion, and workspace preparation. The only partial status is the shared terminal skipped-manifest diagnostic in ADP-001.

### `code-graph:go-language-adapter`

The adapter retains parser-authoritative Go declarations, receiver ownership, calls/types, imports, embedding/proven interface evidence, and explicit unsupported build-context boundaries. Package matching uses the longest module prefix and imports remain package/file dependencies rather than name guesses.

`readGoModulePath` supports unquoted, double-quoted, and backtick module paths. Preparation finds the module directory with the shared bounded search, stores only the module-to-code-root offset, and uses the indexed-file directory map in Pass 2. Package directories above or outside the code root are handled as specified, and `_test.go` files are excluded. Tests cover quoted modules, module root above code root, outside-root rejection, manifest deletion after preparation, and manifest declaration. The only partial status is the shared terminal skipped-manifest diagnostic in ADP-001.

### `code-graph:php-language-adapter`

The adapter implements parser-authoritative declarations/loaders/calls/hierarchy, namespace-qualified ownership, scoped aliases, exact qualified-name lookup, package and qualified-name facets, and run-scoped Composer/PSR-4 state. Prepared maps merge `autoload` before `autoload-dev`, sort by longest prefix, constrain candidates to indexed workspace-relative files, prohibit production imports from test/dev targets, support an own-workspace PSR-4 fallback without a Composer package name, and avoid Pass 2 filesystem access. No short-name cross-workspace search or public-binding invention was found.

The resulting metadata and resolution behavior are correct in the exercised cases, including named-manifest preference, but the preparation implementation parses a named Composer manifest twice and can read a nameless fallback twice. This directly conflicts with the merged PHP requirement; see ADP-002. ADP-001 also affects the identity diagnostic path.

### `code-graph:python-language-adapter`

The adapter implements parser-authoritative Python declarations/imports/calls/hierarchy, class/member ownership, source/stub preference, module surfaces, unresolved/ambiguous behavior, and explicit unsupported MRO/public-surface rules. Distribution matching applies PEP 503-style lowercasing and separator normalization and refuses equal normalized identities. Package entry lookup is session/index based and performs no filesystem I/O; unambiguous submodules work without `__init__.py`, while duplicate roots remain ambiguous. Tests cover these hardening cases and `[project].name` selection. The only partial status is the shared terminal skipped-manifest diagnostic in ADP-001.

## Discrepancies

### ADP-001 — MEDIUM — A terminal invalid or unreadable manifest is not reported

**Affected requirements:**

- `code-graph:language-adapter` — Package resolution facet
- TypeScript/Go/PHP/Python package identity requirements through the shared facet contract

**Spec expectation:** Every manifest encountered without the language identity field is skipped with a non-fatal diagnostic through `report`; the bounded walk then continues. The diagnostic is part of `IndexResult.errors` even though the run succeeds.

**Implementation evidence:**

- `findPackageManifest` accumulates invalid/unreadable candidates in `skipped` (`find-manifest-field.ts:79,98`).
- When the walk reaches its boundary without a later valid manifest, it returns `undefined` (`find-manifest-field.ts:102`) and discards the accumulated paths.
- Each adapter reports `match.skipped` only after a successful match. Go/PHP/Python return immediately when the match is `undefined` (`go-language-adapter.ts:1600`, `php-language-adapter.ts:2259`, `python-language-adapter.ts:2037`); TypeScript likewise reports only from a successful match (`typescript-language-adapter.ts:3189-3193`).
- The indexer supplies a callback that would correctly append the diagnostic to `IndexResult.errors` (`index-code-graph.ts:965-971`), but it is never called in this terminal case.

**Observed impact:** Package identity remains unresolved, which is safe, but the required actionable diagnostic is silently lost. This affects a workspace whose only bounded manifest is nameless/malformed/unreadable, not the already-tested case where a later valid manifest is found.

**Spec-versus-code possibilities:**

- **Implementation bug:** Preserve/return skipped diagnostics even when no usable manifest is found, or let the helper report each skipped candidate while walking.
- **Spec drift:** If diagnostics are intentionally required only when a later valid identity is found, narrow the common requirement and the callback contract. That interpretation is not supported by the current wording, which requires a diagnostic for the skipped manifest itself.
- **Both partial:** Keep terminal identity absence silent but distinguish unreadable/invalid/missing-identity outcomes explicitly in a revised result type; currently the helper conflates them.

### ADP-002 — MEDIUM — PHP preparation does not use a single parse and can read the chosen nameless manifest twice

**Affected requirement:** `code-graph:php-language-adapter` — Namespaces, use aliases, and Composer resolution (`prepare` must read the chosen `composer.json` at most once per call from a single parse).

**Spec expectation:** Composer package name and PSR-4 data are derived from one filesystem read and one JSON parse of the chosen manifest during preparation. Identity may separately read the same manifest.

**Implementation evidence:**

- `hasComposerName` parses the candidate with `JSON.parse` (`php-language-adapter.ts:475-479`).
- `readComposerManifest` first calls `findPackageManifest(..., hasComposerName, ...)` (`php-language-adapter.ts:2158`), then parses `match.content` again to extract name/autoload data (`php-language-adapter.ts:2179`). Thus a normal named chosen manifest is parsed twice.
- If no named manifest exists, the `?? findPackageManifest(..., () => true, ...)` fallback (`php-language-adapter.ts:2159`) walks and reads the nameless chosen manifest again. That path can perform two filesystem reads and an additional parse of the same chosen file.
- The scenario test named `Prepare parses composer.json once and autoload and autoload-dev share a prefix` deletes the file after preparation and checks prepared state/order, but it does not spy on filesystem reads or JSON parsing. It therefore does not verify the stated “once” condition.

**Observed impact:** Resolution results are correct in current tests, but preparation performs duplicate parsing and can duplicate I/O on the nameless-own-PSR-4 path. This breaks an explicit lifecycle/performance contract and makes the verification scenario a false assurance for read/parse count.

**Spec-versus-code possibilities:**

- **Implementation bug:** Read once, parse once into a small validated intermediate, then decide whether it is the named selection or nameless fallback without re-reading/re-parsing the chosen file.
- **Spec drift:** If “single parse” only meant one retained compact result rather than one actual JSON parse/read, relax the requirement and verification scenario. The current text explicitly says “read ... at most once ... from a single parse,” so this would materially weaken the contract.
- **Both partial:** A shared manifest-search API could return parsed selection metadata and terminal diagnostics, avoiding both duplicate PHP work and ADP-001’s lost diagnostic.

## Test Coverage

| Area                         | Primary evidence                                                                                                                                | Coverage assessment                                                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Common facet/search contract | `language-adapter-conformance.spec.ts`, `find-manifest-field.spec.ts`, `package-resolution.spec.ts`, `index-code-graph.package-imports.spec.ts` | Strong positive/boundary coverage; missing terminal-invalid diagnostic case                                                                       |
| TypeScript adapter           | `typescript-language-adapter.spec.ts`, package-resolution and package-import integration suites                                                 | Strong coverage of package-root offset, compact state, exports/main/subpaths, condition ambiguity, no-I/O entry lookup, ownership/parser behavior |
| Go adapter                   | `go-language-adapter.spec.ts`, `package-resolution.spec.ts`                                                                                     | Strong coverage of module-path forms, offset calculation, package entries, test exclusion, parser/owner/hierarchy behavior                        |
| PHP adapter                  | `php-language-adapter.spec.ts`, `package-resolution.spec.ts`                                                                                    | Strong resolution/output coverage; read/parse-count assertion is insufficient                                                                     |
| Python adapter               | `python-language-adapter.spec.ts`, `package-resolution.spec.ts`                                                                                 | Strong normalization, source/stub, submodule/ambiguity, identity-table, parser/owner/hierarchy coverage                                           |

The focused green run demonstrates no regressions in exercised behavior, but passing tests do not erase ADP-001 or ADP-002 because their missing assertions do not execute the nonconformant conditions.

## Missing Tests

1. **Terminal skipped-manifest diagnostic:** For each manifest family (or once against the shared helper plus adapter callback integration), place a nameless/malformed/unreadable manifest at the bounded repository root with no valid manifest above it. Assert identity remains `undefined` **and** the callback/`IndexResult.errors` receives the skipped-manifest diagnostic.
2. **PHP single-read/single-parse contract:** Spy on manifest reads and use a parse seam or parsed-helper abstraction. Assert one read and one parse for a normal named manifest during one `prepare` call.
3. **PHP nameless fallback read count:** Prepare a workspace with only a nameless `composer.json` containing PSR-4 metadata. Assert own-PSR-4 state is created with exactly one read/parse, then delete the file and prove `entrySurface`/own fallback remains I/O-free.

## Spec Dependency Chain

```text
default:_global/{architecture,conventions,testing,docs,eslint,error-handling-conventions}
                              |
code-graph:symbol-model ------+------ code-graph:workspace-integration
              \              |              /
               code-graph:language-adapter
                  |       |       |       |
                  v       v       v       v
          typescript     go      php    python language adapters
```

- **`code-graph:symbol-model`:** Adapter ownership, broad kinds, logical identities, ranges, relations, and hierarchy provenance use the shared vocabulary. No contradiction was found; the implementations map syntax ownership before member logical facts and keep unresolved evidence from becoming guessed relations.
- **`code-graph:workspace-integration`:** Workspace-prefixed file ids, configured/accessibly hydrated workspaces, per-workspace code roots, and repository/package-root boundaries are preserved. The code root is not confused with the project root in the adapter API. No dependency-spec contradiction was found.
- **Global architecture:** Filesystem access is confined to infrastructure adapters/helper and orchestrated through application/session contracts; domain files define types only. No inward infrastructure dependency or domain I/O was found.
- **Global conventions/eslint/docs:** Named exports, strict typed contracts, ESM imports, explicit returns, kebab-case files, and public JSDoc are present in the inspected surface. No `any`, default export, or raw-console regression was found.
- **Global testing:** The inspected tests use Vitest, unique `os.tmpdir()` directories, and cleanup. Cross-platform path canonicalization and Windows separators are handled in implementation and boundary tests. No snapshot testing was introduced.

## Summary Counts

- Specs audited: **5**
- Requirements audited: **80**
- Verification scenarios reviewed: **326**
- Conformant requirement statuses: **75**
- Partial requirement statuses: **5** (from **2 distinct implementation findings**)
- Findings: **0 critical, 0 high, 2 medium, 0 low**
- Focused automated tests: **542 passed, 0 failed**
- Typecheck: **passed**
- Missing/insufficient tests: **3**
- Direct dependency/global-spec contradictions: **0**
