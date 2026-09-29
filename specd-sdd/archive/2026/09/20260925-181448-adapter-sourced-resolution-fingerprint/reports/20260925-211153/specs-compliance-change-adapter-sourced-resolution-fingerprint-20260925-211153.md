# Spec compliance: adapter-sourced-resolution-fingerprint

- Mode: change
- Timestamp: 20260925-211153
- Change: adapter-sourced-resolution-fingerprint
- State at audit: verifying

## Scope

Change specs:

- code-graph:language-adapter
- code-graph:go-language-adapter
- code-graph:php-language-adapter
- code-graph:python-language-adapter
- code-graph:indexer
- code-graph:staleness-detection

Depth-1 dependencies (not fully revalidated): code-graph:graph-store, code-graph:get-graph-health, code-graph:symbol-model, code-graph:workspace-integration, core:config, core:spec-repository-port, core:list-workspaces, code-graph:document-model, core:get-spec-metadata, code-graph:sqlite-graph-store.

Global specs checked: default:\_global/architecture, default:\_global/conventions, default:\_global/testing, default:\_global/eslint, default:\_global/error-handling-conventions.

## Aggregate

| Slice       |                   Focused checks |                        Pass |                                                            Fail / findings |
| ----------- | -------------------------------: | --------------------------: | -------------------------------------------------------------------------: |
| Adapters    | 5 requirements fully revalidated |                           4 |                             1 implementation bug (Python `[project].name`) |
| Fingerprint |              8 focused scenarios | 8 matched by implementation |            0 implementation bugs; 3 spec-wording drifts; missing-test gaps |
| Globals     |                          5 specs |                3 conformant | 2 specs, 3 discrepancies (architecture ports, testing I/O, testing titles) |

Scenario verification for this change (separate from the audit): 217 tests passed in the fingerprint and adapter suites. Verifying post-hooks had no commands.

## Detailed findings

### Partial: adapters

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

### Partial: fingerprint

# Spec compliance audit — adapter-sourced resolution fingerprint

Read-only audit of merged previews for `adapter-sourced-resolution-fingerprint`. Preview command: `node packages/cli/dist/index.js changes spec-preview adapter-sourced-resolution-fingerprint <specId> --format text`. Navigation: `graph search` on fingerprint symbols, then the fingerprint module and its tests. Persisted `specs metadata` is behind this change (it still omits adapter-sourced rules); the merged preview is the contract used here.

Scope is the requirements this change added or rewrote. Neither the spec text nor the code is treated as automatically correct.

Primary implementation: `packages/code-graph/src/application/use-cases/_shared/compute-graph-fingerprint.ts` (`discoverResolutionInputs`, `normalizeManifestNewlines`, `hashManifestText`, `collectResolutionBasenames`, `collectWalkDirectories`). Call sites pass `AdapterRegistry.getAdapters()` / `input.adapters` and `IndexOptions.vcsRoot` or `VcsAdapter.rootDir()`: `index-code-graph.ts` (~794–830), `get-graph-health.ts` (~177–185), `composition/create-code-graph-provider.ts` (~74, adapters on the health input). Built-in adapters declare only `package.json`, `go.mod`, `composer.json`, and `pyproject.toml`.

## Spec: code-graph:indexer

### Requirements Summary

Focused on the merged delta, not the rest of the indexer.

**Incremental indexing.** The run fingerprint is the code-graph version, a canonical hash of resolved workspaces, the effective discovery configuration, and adapter-declared resolution manifests. A newline-only CRLF change of a persisted LF `package.json` must keep the manifest digest equal and must not by itself escalate a full rebuild.

**Discovery fingerprint uses effective config.** Effective inputs include project `includePaths`, global `excludePaths`, each workspace `allowedPaths`, `excludePaths`, and `respectGitignore`, synthetic spec-root exclusions, and newline-normalized resolution-manifest hashes. `tsconfig.json`, `jsconfig.json`, `setup.cfg`, `setup.py`, and `go.work` must not change the digest when no adapter declares them.

**Adapter-sourced resolution fingerprint.** Membership comes from `resolutionManifests()` on registered adapters. The fingerprint module must not keep its own manifest allow-list. For each workspace the walk starts at `codeRoot` and continues through parents until the repository root, inclusive. With no repository root, the bound is the project root. The walk must not continue above that bound. Missing basenames are omitted. `computeGraphFingerprint`, `computeWorkspaceFingerprint`, and `computeRootFingerprint` share that per-workspace set. Each file is UTF-8 text; the digest is SHA-256 hex of newline-normalized text (`normalizeNewlines` in the spec), with no `sha256:` prefix and no raw-byte hash. CRLF and LF of the same manifest match. Project-relative paths are sorted.

### Implementation Status

Implemented for the focused behavior.

- `collectResolutionBasenames` unions `adapter.resolutionManifests()` and drops empty names and names containing `/`, `\`, or `*`. There is no `RESOLUTION_MANIFESTS` constant and no `tsconfig` / `jsconfig` / `setup.cfg` / `setup.py` / `go.work` special case in this module.
- `collectWalkDirectories` walks from `codeRoot` up to `resolve(repoRoot ?? projectRoot)`, inclusive. A start outside that bound is inspected alone and is not walked upward.
- `hashManifestText` reads UTF-8, rewrites CRLF and lone CR to LF, and returns `createHash('sha256').update(..., 'utf8').digest('hex')`.
- All three fingerprint functions call `discoverResolutionInputs`. The indexer persists workspace fingerprints plus a `root` fingerprint and treats `detectFingerprintMismatch` as the full-rebuild switch (`index-code-graph.ts` ~849–868). A false mismatch leaves the incremental path.
- Workspace payloads include version, workspace name, relative `codeRoot`, allowed/exclude paths, `respectGitignore`, and `{ path, contentHash }[]`. The root payload includes version, `includePaths`, `rootExcludePaths` (global excludes plus synthetic spec excludes), and the same resolution inputs. `computeGraphFingerprint` also stores global excludes and synthetic excludes as separate fields. Paths are sorted with `localeCompare`.

### Discrepancies

1. **Spec drift (requirement vs its own scenario; code follows the scenario).** Incremental indexing says the visible full-rebuild explanation must mention code-graph version, resolved workspace configuration, **or adapter-declared resolution manifest content**. The verify scenario “Fingerprint mismatch escalates unchanged files to full rebuild” only requires an explanation of version or workspace configuration. `index-code-graph.ts` sets `fullRebuildReason` to `Graph derivation fingerprint mismatch — code-graph version or workspace configuration changed since last index`. A manifest edit still forces a rebuild, because the digest changes. The reason string does not say that manifest content changed. The requirement sentence and the scenario disagree; the code matches the scenario.

2. **Spec naming vs local helper (behavior matches CRLF/LF).** The spec names `` `normalizeNewlines` ``. The module defines private `normalizeManifestNewlines` and does not call a shared symbol of that name. It also maps lone `\r` to `\n`, which the spec does not mention. CRLF and LF of the same text still hash the same, and the digest is bare SHA-256 hex. This is a name in the spec that the code does not use, not a wrong CRLF/LF result.

No implementation bug found for adapter membership, the walk bound, undeclared build files, or equal CRLF/LF digests. `lstatSync().isFile()` drops directories and symlinks; the spec says “existing file” and the change task says regular files only. Path-like adapter names are dropped even though the spec only says “basename”. Both are stricter than the requirement sentence and are not covered by the focused scenarios.

### Test Coverage

`packages/code-graph/test/application/use-cases/compute-graph-fingerprint.spec.ts`:

- Adapter-declared `package.json` content change changes `computeWorkspaceFingerprint`.
- LF vs CRLF `package.json` yields equal outer digests, length 64, and the outer digest does not match `/^sha256:/`.
- Changing undeclared `tsconfig.json` leaves the outer digest unchanged (adapter declares only `package.json`).
- A declared `composer.json` on the repository root (parent of `codeRoot`) changes the digest; a declared `package.json` above `repoRoot` does not; `repoRoot: null` ignores a manifest above `projectRoot`.
- A directory named `package.json` does not change the digest versus an empty adapter list.

**Flag:** the LF/CRLF test, and the other new fingerprint tests, assert only the outer workspace digest. They never read `ResolutionInputFingerprint.contentHash`. The outer digest is SHA-256 of a JSON payload. Equality of two outer digests shows the normalized inputs matched. It does not show that the inner field is SHA-256 hex of the newline-normalized UTF-8 text, and it does not show that the inner field lacks a `sha256:` prefix. An inner digest that was prefixed, truncated, or hashed differently in a CRLF-stable way would still produce a 64-hex outer string that fails `/^sha256:/`.

`staleness-detection.verify.spec.ts` covers the newline-only comparison via `detectFingerprintMismatch` (see the other spec). No indexer test calls `IndexCodeGraph.execute()` for a CRLF-only manifest and asserts that the run stays incremental.

### Missing Tests

- Direct assertion of `contentHash` (64 hex, no `sha256:` prefix, equal for CRLF and LF, different after a text edit).
- The undeclared-file scenario names five files. Only `tsconfig.json` is mutated. `jsconfig.json`, `setup.cfg`, `setup.py`, and `go.work` are untested (the mechanism would ignore them, but the scenario is not executed as written).
- One case where registered adapters declare `package.json`, `go.mod`, `composer.json`, and `pyproject.toml` together, and a non-member basename does not enter the set.
- `IndexCodeGraph.execute()` for “Newline-only manifest change stays incremental” (digest match and no full rebuild). The helper test does not drive the indexer.
- Sort order when two manifests are present.
- Intermediate directory strictly between `codeRoot` and the repository root (the current parent case uses the repository root itself).

### Spec Dependency Chain

Merged preview `## Spec Dependencies` is unchanged by this delta:

- `code-graph:graph-store` — store contract
- `code-graph:language-adapter` — adapter extraction; this change uses `resolutionManifests()` from that spec
- `code-graph:symbol-model`
- `code-graph:workspace-integration`
- `code-graph:sqlite-graph-store`
- `core:config`
- `core:spec-repository-port`
- `core:list-workspaces`
- `code-graph:document-model`
- `core:get-spec-metadata`

Downstream of the new fingerprint inputs: `code-graph:staleness-detection` compares the same map, and `code-graph:get-graph-health` calls `detectFingerprintMismatch`. Those specs are not listed on the indexer dependency list.

### Summary counts

| Item                                | Count                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Focused requirements                | 3                                                                                                                        |
| Focused scenarios                   | 6                                                                                                                        |
| Scenarios matched by implementation | 6                                                                                                                        |
| Spec-drift findings                 | 2 (rebuild-reason wording vs scenario; `normalizeNewlines` name)                                                         |
| Implementation bugs                 | 0                                                                                                                        |
| Tests that lock the new behavior    | 6 cases in `compute-graph-fingerprint.spec.ts`, plus the staleness helper cases                                          |
| Missing-test gaps                   | 6 (inner `contentHash`, four undeclared names, combined adapter set, indexer execute for CRLF, sort, mid-walk directory) |

## Spec: code-graph:staleness-detection

### Requirements Summary

**Graph derivation freshness** (rewritten by this change). Derivation mismatch is a persisted fingerprint that differs from the fingerprint of the current run. Inputs are the code-graph version loaded by the CLI, a canonical hash of workspace objects from `specd.yaml`, the effective discovery configuration, and newline-normalized content hashes of resolution manifests declared by registered language adapters. That state is distinct from VCS staleness and must be surfaced. CRLF versus LF of an unchanged manifest must not by itself be a mismatch.

Scenarios added:

- **CRLF resolution manifest stays derivation-fresh.** Persisted fingerprint from LF manifests; current files differ only by CRLF; version, layout, and discovery config unchanged; derivation is not mismatched.
- **Edited resolution manifest is a derivation mismatch.** VCS ref unchanged; a declared manifest’s normalized text differs; VCS stays fresh and derivation is mismatched.

The human warning string in “Staleness in graph stats output” is still “different code-graph version or workspace configuration”. This change did not require that string to name manifests.

### Implementation Status

Implemented at the comparison primitive the health path uses.

`detectFingerprintMismatch` returns true when any workspace fingerprint or the `root` fingerprint differs. Those functions include version, workspace layout, discovery fields (workspace allow/exclude/`respectGitignore` on the workspace entry; `includePaths` and combined root excludes on the root entry), and `resolutionInputs` hashes. `GetGraphHealth` calls it with `input.adapters ?? []` and the VCS `rootDir()` (`get-graph-health.ts`). The provider supplies the registered adapters (`create-code-graph-provider.ts`). The mismatch helper does not read the VCS ref, so a manifest change cannot flip VCS freshness by itself. CRLF normalization makes an LF-vs-CRLF manifest compare equal, so mismatch stays false when version, layout, and discovery config are unchanged.

### Discrepancies

No implementation bug against the two new scenarios’ derivation outcomes.

**Coverage hole, not a code defect:** “Edited resolution manifest is a derivation mismatch” also requires VCS freshness to stay fresh. The test only asserts `detectFingerprintMismatch(...) === true`. VCS freshness is a different function (`isGraphStale`). The implementation keeps them separate; the test does not show that.

**Spec wording vs diagnostics copy:** the requirement says a mismatch can be caused by resolution-manifest content. The stats warning text in the same spec still describes only version or workspace configuration. Code that prints that sentence is consistent with the warning requirement and incomplete relative to the new mismatch definition. Same pattern as the indexer rebuild reason. Classified as spec drift inside this spec, not as a failed CRLF or edit scenario.

`input.adapters ?? []` means a health caller that omits adapters hashes no manifests. The composition root passes adapters. A caller that does not would disagree with an index that did. That default is outside the two scenarios.

### Test Coverage

`packages/code-graph/test/application/use-cases/staleness-detection.verify.spec.ts`:

- “CRLF resolution manifest stays derivation-fresh”: LF `package.json` stored via `buildExpectedFingerprintMap`, file rewritten as CRLF, `detectFingerprintMismatch` is false.
- “Edited resolution manifest is a derivation mismatch”: `{"name":"before"}` vs `{"name":"after"}`, mismatch is true.

Existing cases still check version participation and a matching stored map, with `adapters: []` and `repoRoot: null`.

**Flag:** these cases also use the outer fingerprint map only. They do not assert `contentHash`. CRLF freshness is “the whole workspace/root digest did not change”, which is the right mismatch signal, and it still does not pin the inner hash format.

### Missing Tests

- VCS freshness remains fresh in the edited-manifest scenario (same ref, mismatch true).
- Derivation check through `GetGraphHealth` (or `graph stats`) for CRLF-fresh and edited-manifest mismatch, including `fingerprintMismatch` and that the command still returns results.
- A case that passes the same adapter list and `repoRoot` the indexer stored, so health cannot drift by omitting adapters.
- Inner `contentHash` for the CRLF scenario (same flag as the indexer tests).

### Spec Dependency Chain

Merged preview `## Spec Dependencies`:

- `code-graph:graph-store` — `lastIndexedRef` metadata
- `code-graph:indexer` — persists the VCS ref and computes the derivation fingerprint (the manifests hashed here)
- `code-graph:get-graph-health` — host orchestration
- `code-graph:language-adapter` — **added by this change**; adapters declare the manifests included in the fingerprint

`language-adapter` does not depend back on staleness. Indexer already depended on `language-adapter`. The new edge is staleness → language-adapter, and the existing staleness → indexer edge is what pulls the fingerprint algorithm.

### Summary counts

| Item                                | Count                                                         |
| ----------------------------------- | ------------------------------------------------------------- |
| Focused requirements                | 1 (Graph derivation freshness)                                |
| Focused scenarios                   | 2                                                             |
| Scenarios matched by implementation | 2 for derivation; VCS clause of the edit scenario is untested |
| Spec-drift findings                 | 1 (warning copy vs the new mismatch causes)                   |
| Implementation bugs                 | 0                                                             |
| Direct tests                        | 2                                                             |
| Missing-test gaps                   | 4                                                             |

## Cross-cutting flags

**Outer digest vs inner `contentHash`.** Both `compute-graph-fingerprint.spec.ts` (“given LF and CRLF…”) and `staleness-detection.verify.spec.ts` (“CRLF resolution manifest stays derivation-fresh”) judge a 64-hex outer digest. Neither reads `contentHash`. The spec’s “SHA-256 hex of newline-normalized UTF-8 text, no `sha256:` prefix” applies to that inner digest. The outer `/^sha256:/` check does not prove it.

**CLI test edits are outside these two specs.** `packages/cli/test/commands/graph-stats.spec.ts` now calls `detectFingerprintMismatch` with `input.adapters ?? []` and `null` as the repository root. That is an API-arity update so the mocked health path matches the widened helper. It does not assert adapter membership, walk bounds, CRLF hashing, undeclared build files, or derivation scenarios. It is not evidence for `code-graph:indexer` or `code-graph:staleness-detection`.

## Audit result

The focused behavior is in the fingerprint helper and is wired through index, health, and provider composition. Adapter-sourced membership, the repo/project walk bound, CRLF/LF stability, and ignoring undeclared build files match the merged scenarios. Gaps are evidence and wording: inner `contentHash` is untested, the undeclared-file list is only partly tested, the indexer is not executed for the newline-only incremental scenario, and the full-rebuild / stats sentences still talk about version and workspace configuration where the requirement body now also includes manifest content.

### Partial: globals

## Global conformance

Checked the working tree for change `adapter-sourced-resolution-fingerprint` against five global specs. Specs were read with `specs show --format text`. Code evidence is the uncommitted diff under `packages/code-graph` and `packages/cli/test/commands/graph-stats.spec.ts`. Pre-existing behaviour is noted only where this diff keeps or extends it. No finding is inferred from absence of a test or from a requirement this diff does not touch.

### Per global spec: conformant / finding

| Spec                                         | Status     |
| -------------------------------------------- | ---------- |
| `default:_global/architecture`               | finding    |
| `default:_global/conventions`                | conformant |
| `default:_global/testing`                    | finding    |
| `default:_global/eslint`                     | conformant |
| `default:_global/error-handling-conventions` | conformant |

### Discrepancies with evidence

#### `default:_global/architecture` — finding

**Domain layer is pure: conformant.** No file under `packages/code-graph/src/domain` imports `node:fs` or `fs`, and none calls `readFileSync` or `existsSync`. The new `LanguageAdapter.resolutionManifests()` method is a basename declaration. Its JSDoc states that it does not perform I/O. The four infrastructure implementations return constant arrays (`package.json`, `pyproject.toml`, `go.mod`, `composer.json`) and do not read those files inside `resolutionManifests()`.

**Application layer uses ports only: discrepancy.** `default:_global/architecture` requires every package's `application/` layer to interact with the outside world exclusively through port interfaces in `application/ports/`, and not to import infrastructure adapters directly.

`packages/code-graph/src/application/use-cases/_shared/compute-graph-fingerprint.ts` imports `existsSync`, `lstatSync`, and `readFileSync` from `node:fs`. `hashManifestText` reads manifest bytes with `readFileSync`. `discoverResolutionInputs` checks directories with `existsSync` and files with `lstatSync`. Those calls sit in an application use-case helper, not behind a port and not in `infrastructure/`.

This is not a domain-layer I/O breach. Direct `node:fs` in that application helper is not allowed by the ports-only requirement.

Scope: the same file already imported `node:fs` before this change (`existsSync`, `readFileSync`, `readdirSync`). This diff keeps that boundary and extends it: content hashing moved into `hashManifestText`, directory listing was replaced by `lstatSync`, and the walk now climbs from `codeRoot` toward `repoRoot`. Callers (`index-code-graph.ts`, `get-graph-health.ts`, `create-code-graph-provider.ts`) pass `LanguageAdapter[]` into the helper; they do not move the reads onto a port.

**Other architecture requirements checked, no discrepancy in this diff:**

- Application files in the diff do not import `infrastructure/` or `composition/`. The import constraint is met. The ports-only I/O requirement is the one that fails.
- `resolutionManifests()` is a method on the existing `LanguageAdapter` interface. That interface is not a port with shared constructor arguments, so the abstract-class port rule does not apply to this addition.
- No new YAML parse path. Manifests are hashed as text. The infrastructure YAML-validation requirement is not exercised.
- No new package dependency, public concrete-adapter export, or second `createX(config)` wiring path. `create-code-graph-provider.ts` only passes `registry.getAdapters()` into the existing health input.
- CLI test changes only thread `[]` and `null` into fingerprint calls. No business logic was added under `packages/cli`.

#### `default:_global/conventions` — conformant

Checked the changed source against strict-mode artifacts already present (no new `tsconfig` override), ESM imports, named exports, kebab-case paths, `any`, explicit return types, error types, and immutability of the new fingerprint types.

- New and updated exports use named exports. No `export default` in the changed source.
- New source symbols have explicit return types (`resolutionManifests(): readonly string[]`, `hashManifestText(...): string | undefined`, and the existing fingerprint functions keep `: string` / `: boolean`).
- No new `: any` or `as any`. The fingerprint unit file replaces `specRepo: {} as any` with `as never`.
- New interfaces (`GraphFingerprintInput` fields, `ResolutionInputFingerprint`) use `readonly`.
- No new source file. Existing paths stay `kebab-case.ts`. Tests stay under `test/` with the `.spec.ts` suffix.
- Changed production code does not throw a new generic `Error` for an expected failure. Unreadable manifest paths are omitted (`hashManifestText` returns `undefined`; `lstatSync` failures are skipped). That is silent omission, not a new thrown error type. See error-handling below.

#### `default:_global/testing` — finding

**1. Application-layer tests perform real filesystem I/O.**

`default:_global/testing` says domain and application layers are covered by unit tests with mocked ports, and that unit tests must not touch the filesystem. Filesystem access belongs in infrastructure integration tests.

These tests live under `packages/code-graph/test/application/use-cases/` and call `mkdtempSync`, `mkdirSync`, `writeFileSync`, and (via the helper under test) `readFileSync`:

- `compute-graph-fingerprint.spec.ts`: the rewritten package.json case and the new cases for CRLF, undeclared `tsconfig.json`, parent `composer.json`, repo-root bound, null `repoRoot`, and a directory named `package.json`.
- `staleness-detection.verify.spec.ts`: `Scenario: CRLF resolution manifest stays derivation-fresh` and `Scenario: Edited resolution manifest is a derivation mismatch`.

The fingerprint file already used `mkdtempSync` for manifest invalidation before this change. This diff keeps that style and adds more filesystem cases. The behaviour under test is filesystem discovery inside an application helper, so the tests match the implementation and contradict the unit-test rule.

**Temp-directory fixture rules: met, not a separate finding.**

New filesystem cases use `mkdtempSync(join(tmpdir(), ...))` from `node:os`. They do not hardcode `/tmp` or `file:///tmp/`, and they do not use `chmod 0o000`. Each case removes its directory with `rmSync` in a `finally` block. The verify scenario names `afterEach` as the cleanup hook; these cases clean up inside the test instead. The directories are still removed after each test. That is not recorded as a discrepancy.

`/tmp/...` strings in `packages/cli/test/commands/graph-stats.spec.ts` are outside this diff. The diff only adds `[]` and `null` arguments.

**2. Three new behaviour titles do not use `given …, when …, then …`.**

`default:_global/testing` requires behaviour-test descriptions in that form.

Titles that do follow it:

- `compute-graph-fingerprint.spec.ts`: seven new or rewritten cases, from `given adapter declares package.json, when that file changes, then fingerprint changes` through `given a directory named like a manifest, when discovered, then it is omitted`.
- Adapter specs: `given go adapter, when asked for manifests, then returns go.mod only`; the python, php, and typescript equivalents.

Titles that do not:

- `compute-graph-fingerprint.spec.ts`: `computeGraphFingerprint includes adapters and repoRoot`.
- `staleness-detection.verify.spec.ts`: `Scenario: CRLF resolution manifest stays derivation-fresh` and `Scenario: Edited resolution manifest is a derivation mismatch`.

Those two staleness titles match the existing `Scenario:` style of that file. They still do not match the global behaviour-test pattern.

**Other testing requirements checked, no discrepancy in this diff:**

- Runner imports are `vitest`. No Jest. No `toMatchSnapshot` or `toMatchInlineSnapshot`.
- `stubAdapter` builds a `LanguageAdapter` object with the required methods. It is not `as unknown as` a port. `LanguageAdapter` is a domain interface, not a port, so the full-port-mock rule was not applied as a failure. `analyzeFile` throws `new Error('unused')`; `resolveImports` and `buildRelations` return empty values.
- New `resolutionManifests` assertions on the four language-adapter specs do not create temp directories. Existing `getPackageIdentity` blocks already use `tmpdir()` and `afterEach` cleanup; this diff does not change that setup.

#### `default:_global/eslint` — conformant

Changed source matches the lint-facing rules that eslint is specified to enforce:

- No new explicit `any` or `as any` in source.
- No new default export.
- New exported methods and functions have return types. New internal helpers (`normalizeManifestNewlines`, `hashManifestText`, `collectResolutionBasenames`, `discoverResolutionInputs`, `collectWalkDirectories`) also annotate returns and have JSDoc.
- New JSDoc blocks include a description, `@param` for each parameter, and `@returns`. `resolutionManifests()` has no parameters. `hashManifestText` catches read failures and returns `undefined`, so it does not declare `@throws`.
- No new `src/` filename. Existing names are kebab-case.
- No new layer-import violation: domain does not import application, infrastructure, or composition; the application helper does not import infrastructure or composition. `node:fs` inside application is the architecture finding above, not an `no-restricted-imports` layer import of `infrastructure/`.
- Test files are exempt from JSDoc. The new tests were not judged against the JSDoc rule.

#### `default:_global/error-handling-conventions` — conformant

This diff adds no error class, no `code`, and no user-facing message.

- `hashManifestText` and the `lstatSync` loop swallow read failures and omit the path. Callers do not receive a generic `Error` or a `SpecdError` for an unreadable manifest.
- `GetGraphHealth` still wraps fingerprint detection in `try/catch` and sets `fingerprintMismatch = null`. That catch is pre-existing; the diff only passes `input.adapters ?? []` and `vcsRoot` into `detectFingerprintMismatch`.
- `stubAdapter` throws `new Error('unused')` from a test double. That is test code. The testing spec itself uses `new Error('not implemented')` for unused mock methods.
- No new `UPPER_SNAKE_CASE` code, metadata field, or error-class JSDoc was required because no error type was added.

### Summary counts

| Count                | Value                                                     |
| -------------------- | --------------------------------------------------------- |
| Global specs checked | 5                                                         |
| Conformant           | 3 (`conventions`, `eslint`, `error-handling-conventions`) |
| With findings        | 2 (`architecture`, `testing`)                             |
| Discrepancies        | 3                                                         |

Discrepancy list:

1. Architecture — application fingerprint helper reads the filesystem with `node:fs` instead of a port. Domain layer does not.
2. Testing — application-layer fingerprint and staleness tests use a real temporary filesystem.
3. Testing — three new behaviour titles omit `given …, when …, then …`.
