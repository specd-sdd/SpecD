# Spec-compliance audit: language adapters (resolution manifests)

Change: `adapter-sourced-resolution-fingerprint`
Mode: read-only. Merged spec text from `changes spec-preview`. Code read after `graph search` located `resolutionManifests` / `getPackageIdentity` (index health: `CONTENT_KNOWN_STALE`; line numbers below are from the source files, not the stale index alone).
Scope: resolution-manifest requirements this change adds or touches. Historical requirements that were not re-read scenario-by-scenario are marked `unchanged-not-revalidated`.

Global specs (`default:_global/architecture`, `testing`; `conventions` / `eslint` not re-executed): no contradiction found in the resolution-manifest code. `resolutionManifests()` does not import or call `fs`. Package-identity I/O stays in infrastructure (`findManifestField` in `packages/code-graph/src/infrastructure/tree-sitter/find-manifest-field.ts`). New manifest tests use `given/when/then` names under `test/infrastructure/tree-sitter/`. Domain file `language-adapter.ts` has no `fs` import, which matches architecture’s “domain has zero I/O dependencies.”

---

## Spec: code-graph:language-adapter

### Requirements Summary

Port contract for every built-in adapter. Touched clauses:

- `resolutionManifests(): readonly string[]` is required and synchronous. It returns exact basenames (filenames, not globs or directories). It MUST NOT perform I/O. An adapter that reads no resolution manifest MUST return `[]`.
- The default TypeScript adapter MUST return exactly `['package.json']`.
- Package-identity table: TypeScript `package.json` / `name`, Python `pyproject.toml` / `[project].name`, Go `go.mod` / `module`, PHP `composer.json` / `name`.
- Every basename in that table MUST appear in that adapter’s `resolutionManifests()`. The method MUST NOT name a file the adapter does not read for package identity or import resolution.
- `getPackageIdentity` may do filesystem I/O. `resolutionManifests()` must not.

Other requirements in this spec (full-file analysis, unified migration, language detection, import extraction, calls, scoped facts, multi-language coverage, detectable boundary, hierarchy, import specifier resolution, Tree-sitter privacy, registry, capabilities, specialization, logical owners, hierarchy evidence, source ranges) are `unchanged-not-revalidated`.

### Implementation Status

Interface: `packages/code-graph/src/domain/value-objects/language-adapter.ts` lines 66–73 declare `resolutionManifests(): readonly string[]` with a comment that it does not perform I/O, that readers of nothing return `[]`, and that values are exact filenames.

Built-in returns (each is a fresh array literal, no `fs` call):

| Adapter    | Method                                     | Return               | Identity read                                                              |
| ---------- | ------------------------------------------ | -------------------- | -------------------------------------------------------------------------- |
| TypeScript | `typescript-language-adapter.ts:1868-1870` | `['package.json']`   | `findManifestField(..., 'package.json', name)` at 1880                     |
| Go         | `go-language-adapter.ts:1058-1060`         | `['go.mod']`         | `go.mod` `module` at 1069-1078                                             |
| PHP        | `php-language-adapter.ts:2100-2102`        | `['composer.json']`  | `composer.json` `name` at 2110-2119; PSR-4 from the same file at 2128-2140 |
| Python     | `python-language-adapter.ts:1195-1197`     | `['pyproject.toml']` | `pyproject.toml` at 1206-1215                                              |

Only those four classes `implement LanguageAdapter`. None of Go/PHP/Python reference `go.work`, `setup.cfg`, `setup.py`, or a second manifest basename. TypeScript’s only `findManifestField` filename in that file is `package.json`.

Empty-array branch: no built-in adapter is specified to read zero manifests, so the contract is not violated by these four. There is no production implementor that returns `[]`.

### Discrepancies (spec drift vs implementation bug vs both; evidence)

1. **Implementation bug** (not spec drift). Requirement: Package identity extraction, identity field `[project].name`.
   Python extraction is not scoped to the `[project]` table:

```1210:1213:packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts
      (content) => {
        const match = content.match(/^\s*name\s*=\s*"([^"]+)"/m)
        return match?.[1]
      },
```

The first double-quoted `name = "..."` in the file wins. A `[tool.poetry]` (or any earlier table) `name` is returned instead of `[project].name`. Single-quoted TOML strings never match. `findManifestField` (`find-manifest-field.ts:24-31`) treats a falsy extract as “keep walking,” so a nearest `pyproject.toml` whose name is only single-quoted can be skipped in favor of a parent file.
The verify scenario still passes: it uses `[project]\nname = "acme-auth"`. The scenario is narrower than the table cell.
Go `module` and PHP JSON `name` match their table cells. Basename alignment for all four files matches the “declared manifests are the files package identity reads” scenario.

2. **Comment drift, not counted as a requirement fail.** The interface banner (`language-adapter.ts:47`) says all methods are pure. The same spec says `getPackageIdentity` performs I/O. `resolutionManifests()` itself is pure. Domain layer still does not import `fs`.

No spec-drift on the basename contract: the merged spec and the four return values agree.

### Test Coverage

- TypeScript: `typescript-language-adapter.spec.ts:820-823` expects exactly `['package.json']`.
- `getPackageIdentity` happy path, missing file, walk-up, and repoRoot ceiling: same file `833-861` (the verify scenario “Search bounded by repoRoot” is TypeScript/`package.json` and is implemented).
- Go/PHP/Python manifest tests are recorded under those specs. Together they cover “basename read for identity is the basename declared.”
- Fingerprint stub implements the new required method (`compute-graph-fingerprint.spec.ts:21-31`). `TestAdapter` in each language spec file includes `resolutionManifests()`.

### Missing Tests

- No test asserts `resolutionManifests()` does not read or stat the filesystem (verify scenario “Resolution manifests are declared without reading the filesystem”). Satisfied by inspection only.
- No test that an adapter with no resolution manifest returns `[]`.
- No test that a non-`[project]` `name` earlier in `pyproject.toml` is ignored, or that `[project].name` with single quotes is read. The written Python verify scenario does not include those inputs.

### Spec Dependency Chain

- `code-graph:symbol-model` — `SymbolNode`, `Relation`, `RelationType` (not revalidated here).
- Specific adapters that must not weaken this contract: `code-graph:typescript-language-adapter` (not in this audit slice except the `package.json` clause owned here), `code-graph:go-language-adapter`, `code-graph:php-language-adapter`, `code-graph:python-language-adapter`.

### Summary counts (requirements checked, pass, fail, missing tests)

- Requirements in spec: 19
- Fully revalidated in this slice: 2 (`LanguageAdapter interface` manifest clauses, `Package identity extraction`)
- Pass: 1 (`LanguageAdapter interface` manifest clauses, including TypeScript `['package.json']` and no I/O in the four methods)
- Fail: 1 (`Package identity extraction` — Python field is not `[project].name`)
- Unchanged-not-revalidated: 17
- Missing tests: 3 (no-I/O, empty array, `[project]` section / quote form)

---

## Spec: code-graph:go-language-adapter

### Requirements Summary

Touched requirement: **Resolution manifests.** `resolutionManifests()` SHALL return exactly `['go.mod']`. The adapter MUST NOT declare `go.work` or any other basename. Package identity continues to come from the `module` path in `go.mod`.

Related clauses checked only at the manifest boundary (rest of each requirement `unchanged-not-revalidated`):

- Supported files: package identity from the nearest bounded `go.mod`; no Go toolchain.
- Build-context boundary: `go.work` remains unsupported until explicitly consumed; module identity from `go.mod`.

Other requirements (declaration ranges, exports/imports, logical owners, scoped facts, embedding, interface satisfaction, capability truthfulness) are `unchanged-not-revalidated`.

### Implementation Status

`GoLanguageAdapter.resolutionManifests` returns `['go.mod']` (`go-language-adapter.ts:1058-1060`). The method body is a literal; it does not call `findManifestField` or `fs`.

`getPackageIdentity` (`1069-1078`) calls `findManifestField(codeRoot, 'go.mod', extract, repoRoot)` and reads `/^module\s+(\S+)/m`. No `go.work`, `go.sum`, or other basename appears in this adapter file. `repoRoot` is passed through, and `findManifestField` stops at that directory (`find-manifest-field.ts:34`).

### Discrepancies (spec drift vs implementation bug vs both; evidence)

None for the resolution-manifest requirement. Declared basename, excluded `go.work`, and the file actually read for module identity are the same file.

### Test Coverage

`go-language-adapter.spec.ts:559-563`:

- `toEqual(['go.mod'])`
- `not.toContain('go.work')`

`getPackageIdentity` (`573-589`): module path `github.com/acme/auth`, missing `go.mod` → `undefined`, walk-up from `cmd/server` bounded by the temp root. Matches verify scenario “Go adapter reads go.mod” on the parent spec and “Go declares only go.mod” on this spec.

### Missing Tests

None against this spec’s resolution-manifest scenario. The scenario does not require an `fs` spy or a `go.mod` above `repoRoot`. Parent-spec no-I/O and repoRoot-ceiling cases are not repeated here; repoRoot ceiling is tested on the shared helper via the TypeScript adapter.

### Spec Dependency Chain

- `code-graph:language-adapter` — port, phases, `resolutionManifests` no-I/O rule, identity table cell `go.mod` / `module`
- `code-graph:symbol-model` — not revalidated
- `code-graph:workspace-integration` — not revalidated

### Summary counts (requirements checked, pass, fail, missing tests)

- Requirements in spec: 10
- Fully revalidated: 1
- Pass: 1 (`Resolution manifests`)
- Fail: 0
- Related clauses checked and passing inside other requirements: `go.mod` identity and “do not consume `go.work`” (Supported files, Build-context boundary). Those requirements are not fully revalidated.
- Unchanged-not-revalidated: 9
- Missing tests: 0 for this spec’s resolution-manifest scenario

---

## Spec: code-graph:php-language-adapter

### Requirements Summary

Touched requirement: **Resolution manifests.** `resolutionManifests()` SHALL return exactly `['composer.json']`. That basename covers both the Composer package `name` and the PSR-4 map. The adapter MUST NOT declare any other resolution manifest.

Related clause checked only at the file boundary (rest `unchanged-not-revalidated`): Namespaces / Composer resolution — package identity from the nearest bounded Composer `name`; PSR-4 from precomputed mappings; Pass 2 must not scan the filesystem per candidate. Pass 2 behavior was not re-traced.

Other requirements (supported files, ranges, logical identity, static/framework facts, scoped bindings, hierarchy, public surface) are `unchanged-not-revalidated`.

### Implementation Status

`PhpLanguageAdapter.resolutionManifests` returns `['composer.json']` (`php-language-adapter.ts:2100-2102`). No I/O in that method.

`getPackageIdentity` (`2110-2119`) reads `composer.json` and returns JSON `name`. `buildPsr4Map` (`2128-2140`) reads the same basename for `autoload.psr-4` and `autoload-dev.psr-4`. No other manifest filename is passed to `findManifestField` in this file. No `composer.lock`.

### Discrepancies (spec drift vs implementation bug vs both; evidence)

None for the resolution-manifest requirement. One declared basename, and both identity and PSR-4 read that file. Exact-array return satisfies “MUST NOT declare any other.”

### Test Coverage

`php-language-adapter.spec.ts:609-612`: `toEqual(['composer.json'])` (exact equality excludes any extra basename).

`getPackageIdentity` (`622-638`): `{"name":"acme/auth"}`, missing file → `undefined`, walk-up from `src`. Matches parent verify scenario “PHP adapter reads composer.json.”

### Missing Tests

None against this spec’s resolution-manifest scenario. The scenario does not name a forbidden alternate file; `toEqual` covers that. No separate test that PSR-4 and `name` are not split across two declared basenames (they are not, by inspection). Parent no-I/O scenario is not repeated.

### Spec Dependency Chain

- `code-graph:language-adapter` — port and identity table cell `composer.json` / `name`; PHP may also use that file for PSR-4, which this spec explicitly assigns to the same basename
- `code-graph:symbol-model` — not revalidated
- `code-graph:workspace-integration` — not revalidated

### Summary counts (requirements checked, pass, fail, missing tests)

- Requirements in spec: 9
- Fully revalidated: 1
- Pass: 1 (`Resolution manifests`)
- Fail: 0
- Related clause checked and passing: Composer `name` and PSR-4 both use `composer.json` (Namespaces, use aliases, and Composer resolution). That requirement is not fully revalidated.
- Unchanged-not-revalidated: 8
- Missing tests: 0 for this spec’s resolution-manifest scenario

---

## Spec: code-graph:python-language-adapter

### Requirements Summary

Touched requirement: **Resolution manifests.** `resolutionManifests()` SHALL return exactly `['pyproject.toml']`. The adapter MUST NOT declare `setup.cfg`, `setup.py`, or any other basename. Package identity continues to come from the nearest bounded `pyproject.toml`.

Related clause in **Imports and package resolution**: “Package identities SHALL be read from the nearest bounded `pyproject.toml`.” This spec does not name the `[project]` table. The parent spec does (`[project].name`). The rest of Imports (relative imports, `importlib`, namespace packages) is `unchanged-not-revalidated`.

Other requirements (supported files, ranges, logical identity, scoped facts, hierarchy, public/stub surface, capability truthfulness) are `unchanged-not-revalidated`.

### Implementation Status

`PythonLanguageAdapter.resolutionManifests` returns `['pyproject.toml']` (`python-language-adapter.ts:1195-1197`). No I/O. Source does not mention `setup.cfg` or `setup.py`.

`getPackageIdentity` (`1206-1215`) passes `'pyproject.toml'` to `findManifestField` and passes `repoRoot`. The file declared and the file read match.

### Discrepancies (spec drift vs implementation bug vs both; evidence)

None against this spec’s own resolution-manifest sentences. Basename is exactly `pyproject.toml`; excluded files are not declared or read.

**Cross-spec implementation bug (counted under `code-graph:language-adapter`, not double-counted here).** This adapter’s name regex is not limited to `[project].name`. See language-adapter discrepancy 1. This spec’s wording (“from the nearest bounded `pyproject.toml`”) is satisfied for the file. The parent table is not.

### Test Coverage

`python-language-adapter.spec.ts:546-550`:

- `toEqual(['pyproject.toml'])`
- `not.toContain('setup.cfg')`
- `not.toContain('setup.py')`

`getPackageIdentity` (`561-577`): `[project]\nname = "acme-auth"`, missing file → `undefined`, walk-up from `src`. Matches this spec’s verify scenario and the parent Python verify scenario.

### Missing Tests

None that this spec’s resolution-manifest scenario asks for. Tests that would lock `[project]` vs an earlier `name`, and single-quoted `name`, are missing on the parent contract (listed under language-adapter). They are not required by this spec’s verify scenario, which uses a double-quoted `[project]` name.

### Spec Dependency Chain

- `code-graph:language-adapter` — port, no-I/O rule, and the stricter `[project].name` cell this adapter does not fully implement
- `code-graph:symbol-model` — not revalidated
- `code-graph:workspace-integration` — not revalidated

### Summary counts (requirements checked, pass, fail, missing tests)

- Requirements in spec: 9
- Fully revalidated: 1
- Pass: 1 (`Resolution manifests`)
- Fail: 0 against this spec’s own text
- Related clause checked and passing for the file, failing only the parent field cell: Imports and package resolution (not fully revalidated)
- Unchanged-not-revalidated: 8
- Missing tests: 0 for this spec’s resolution-manifest scenario

---

## Slice totals

| Spec                               | Checked (full) |  Pass |  Fail | Unchanged-not-revalidated | Missing tests |
| ---------------------------------- | -------------: | ----: | ----: | ------------------------: | ------------: |
| code-graph:language-adapter        |              2 |     1 |     1 |                        17 |             3 |
| code-graph:go-language-adapter     |              1 |     1 |     0 |                         9 |             0 |
| code-graph:php-language-adapter    |              1 |     1 |     0 |                         8 |             0 |
| code-graph:python-language-adapter |              1 |     1 |     0 |                         8 |             0 |
| **Total**                          |          **5** | **4** | **1** |                    **42** |         **3** |

Failing item: Python `getPackageIdentity` does not read `[project].name` specifically (`python-language-adapter.ts:1211`), which breaks `code-graph:language-adapter`’s identity table. Declared basenames `package.json`, `go.mod`, `composer.json`, and `pyproject.toml` match the files those adapters read. `go.work`, `setup.cfg`, and `setup.py` are neither declared nor read. `resolutionManifests()` performs no filesystem I/O in all four adapters.
