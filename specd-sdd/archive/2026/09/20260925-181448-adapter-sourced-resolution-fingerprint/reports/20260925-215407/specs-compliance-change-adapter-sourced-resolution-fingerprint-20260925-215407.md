# Spec compliance — adapter-sourced-resolution-fingerprint

Timestamp: 20260925-215407
Mode: change
Change: `adapter-sourced-resolution-fingerprint`
Path: `specd-sdd/changes/20260925-181448-adapter-sourced-resolution-fingerprint`

## Scope

Change specs:

- `code-graph:language-adapter`
- `code-graph:go-language-adapter`
- `code-graph:php-language-adapter`
- `code-graph:python-language-adapter`
- `code-graph:indexer`
- `code-graph:staleness-detection`

Depth-1 constraints checked for this change only:

- `code-graph:get-graph-health`
- `code-graph:composition`

Project-wide specs checked for constraints this change can violate:

- `default:_global/architecture`
- `default:_global/testing`
- `default:_global/eslint`
- `default:_global/conventions`

Packages under `packages/*/package.json`: cli, guide, mcp, code-graph, skills, sdk, plugin-manager, plugin-agent-standard, plugin-agent-opencode, plugin-agent-copilot, plugin-agent-codex, plugin-agent-claude, core, specd, schema-std.

Graph was reindexed immediately before the audit.

## Verification (scenarios)

Change-owned scenarios were checked against merged spec text, the implementation, and tests. Targeted run: 8 code-graph files, 240 tests passed; `graph-stats.spec.ts`, 19 tests passed.

Product behaviour matches the scenarios: adapter basenames, Python `[project].name` (double and single quotes, walk continues), walk bounds, CRLF equals LF, unprefixed SHA-256 `contentHash`, private newline normalization, incremental newline-only indexing, exact rebuild and stats strings, and VCS freshness staying fresh when only a manifest changes.

## Compiler reconciliation

The fingerprint partial reports spec-drift because `specs/code-graph/language-adapter/spec.md` on disk has no `resolutionManifests()`. That file is the archived base. The change delta adds the method, and the adapters partial audited the merged preview and found the requirement implemented. That item is **not** an open spec gap for this change. It is recorded verbatim below and excluded from the open-issue list.

## Open issues

1. **Testing — application tests touch the filesystem.** `compute-graph-fingerprint.spec.ts` and `staleness-detection.verify.spec.ts` write a temp tree and read it through `NodeResolutionManifestSource`. `default:_global/testing` wants application unit tests to mock the port. An unused in-memory `filesSource` already exists in the fingerprint spec. The newline indexer test and the infrastructure node-adapter test follow the rule.
2. **Testing — three new titles are not `given …, when …, then …`.** `computeGraphFingerprint includes adapters and repoRoot`, and the two staleness cases titled `Scenario: …`.
3. **Missing tests (behaviour is implemented).** No assertion that `resolutionManifests()` avoids `fs`; no adapter that returns `[]`; a poetry-only `pyproject.toml` with no parent `[project].name` is not asserted to return `undefined`; no `IndexCodeGraph.execute()` test asserts the exact mismatch `fullRebuildReason` or full re-extraction.

Production fingerprint and adapter code had no implementation bugs against the change specs. Architecture, ESLint, conventions, graph health, and composition are conformant for this change.

## Aggregate counts

| Batch                                     | Checked | Conformant |     Discrepancies kept | Missing tests |
| ----------------------------------------- | ------: | ---------: | ---------------------: | ------------: |
| Adapters                                  |      10 |         10 |                      0 |             3 |
| Fingerprint product (indexer + staleness) |      15 |         15 | 0 after reconciliation |             1 |
| Globals and depth-1                       | 6 specs |    5 specs |    2 (both in testing) |             0 |

## Detailed findings

The sections below are the partial reports, verbatim.

---

# Partial: adapters

# Partial audit: language adapters

Change: `adapter-sourced-resolution-fingerprint`
Scope: requirements this change added or rewrote on the four specs below (resolution manifests, package identity, Python `[project].name` only, single quotes, walk continues when a nearer `pyproject.toml` has no `[project].name`), plus consistency with `default:_global/architecture` and `default:_global/testing`.
Method: merged `changes spec-preview` text; `graph search` / `graph impact` for `resolutionManifests`, `findManifestField`, `readPythonProjectName`; then the declaring source and tests.
Other requirements in these specs (declarations, hierarchy, calls, capabilities) were not re-audited.

Global consistency (applies to all four specs):

- **Architecture.** No contradiction. `default:_global/architecture` requires every package `domain/` layer to have zero I/O (`node:fs` and similar). `packages/code-graph/src/domain/` has no `node:fs` import. `resolutionManifests()` is declared on the domain port `LanguageAdapter` (`packages/code-graph/src/domain/value-objects/language-adapter.ts` lines 66–73) and implemented as a constant return in infrastructure. Manifest reads live in infrastructure `findManifestField` (`packages/code-graph/src/infrastructure/tree-sitter/find-manifest-field.ts` lines 1–28), called from `getPackageIdentity` / PHP PSR-4 map building. That matches the language-adapter rule that `resolutionManifests()` MUST NOT perform I/O and that `getPackageIdentity` / `resolveQualifiedNameToPath` may.
- **Testing.** No contradiction with the change specs. `default:_global/testing` requires behaviour-test titles `"given <state>, when <action>, then <outcome>"`. Every new test for these requirements uses that pattern. Older `getPackageIdentity` titles in the same files (`reads name from …`, `walks up to find …`, `returns undefined when no …`) do not. Those titles predate this change; they are noted under test coverage and are not counted as discrepancies of the new requirements.

---

## Spec: code-graph:language-adapter

### Requirements summary

Checked the rewritten clauses only.

- **LanguageAdapter interface — `resolutionManifests()`.** Required, synchronous, exact basenames (not globs or directories), no I/O. An adapter that reads no resolution manifest MUST return `[]`. The default TypeScript adapter MUST return `['package.json']`.
- **Package identity extraction.** Manifest table: TypeScript `package.json` / `name`, Python `pyproject.toml` / `[project].name`, Go `go.mod` / `module`, PHP `composer.json` / `name`. Every basename in that table MUST appear in that adapter’s `resolutionManifests()`, and the method MUST NOT name a file the adapter does not read for package identity or import resolution. Python identity is `[project].name` only (not `[tool.poetry]` or any other table). Double-quoted and single-quoted strings MUST both match. If `[project].name` is absent, that file yields no identity and the walk MUST continue. `getPackageIdentity` may do I/O; `resolutionManifests()` must not.
- **Constraint.** `resolutionManifests()` MUST NOT perform I/O.
- **Globals.** Architecture domain purity and testing titles for the new behaviour, as above.

Verify scenarios tied to this delta: resolution manifests declared without reading the filesystem; TypeScript declares `package.json`; declared manifests are the files package identity reads; Python identity is the project table name; single-quoted project name; Python identity skips a file without a project name. Existing Go/PHP/Python `getPackageIdentity` scenarios remain in force for the table.

### Implementation status

Conformant for the checked clauses.

| Clause                                                            | Evidence                                                                                                                                                             |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required port method, no I/O in the signature                     | `language-adapter.ts` 66–73. JSDoc states no I/O, exact filenames, empty array when none. Not optional (unlike `getPackageIdentity?` at 100).                        |
| TypeScript `['package.json']`, no I/O in the method               | `typescript-language-adapter.ts` 1868–1869 returns the constant. `getPackageIdentity` (1879–1888) reads `package.json` `name` via `findManifestField`.               |
| Go `go.mod` / `module`                                            | `go-language-adapter.ts` 1058–1077.                                                                                                                                  |
| PHP `composer.json` / `name`                                      | `php-language-adapter.ts` 2100–2118. PSR-4 (`buildPsr4Map`, 2128–2138) reads the same basename, so declaring it is not an unread file.                               |
| Python `pyproject.toml` / `[project].name`, quotes, continue walk | `python-language-adapter.ts` 1195–1234 and `find-manifest-field.ts` 24–28 (`if (result) return result`, otherwise the walk proceeds, including after a thrown read). |
| Domain has no filesystem                                          | No `node:fs` under `packages/code-graph/src/domain/`. I/O is `find-manifest-field.ts` in infrastructure.                                                             |

`readPythonProjectName` treats a line as the project table only when the header capture is exactly `project`. While that flag is set it accepts `name = "..."` or `name = '...'` (`python-language-adapter.ts` 1230–1232) and ignores an empty capture. A `[tool.poetry]` (or any other) `name` never sets the flag. Multiline TOML strings (`"""` / `'''`) are not parsed; a `"""` opener captures an empty string and is rejected, so the result fails closed (undefined) rather than returning another table’s name. The verify scenarios use single-line quotes only.

The port’s file-level comment (`language-adapter.ts` 47) still says all methods are pure. `getPackageIdentity`’s own JSDoc (91–95) states that it performs I/O. Pre-existing comment, not a behavioural miss of this delta.

### Discrepancies (spec-drift vs implementation-bug vs both; evidence)

None for the checked requirements.

The Python continue-walk rule lives on this spec and is implemented. It does not conflict with architecture: the walk’s `existsSync` / `readFileSync` are in infrastructure, not in `resolutionManifests()` and not in `domain/`.

### Test coverage

| Scenario                                                                               | Test                                                                                                                                  |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript manifests are exactly `['package.json']`                                    | `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts` 820–823. Title matches given/when/then.     |
| Python project-table name, single quotes, skip nearer file without `[project].name`    | `python-language-adapter.spec.ts` 572–593 (see that spec). These scenarios are specified here and implemented on the Python adapter.  |
| Go reads `go.mod` module; PHP reads `composer.json` name; TS reads `package.json` name | Existing `getPackageIdentity` tests in each adapter spec. Titles do not use given/when/then (pre-existing).                           |
| Declared basename is the file identity reads                                           | Covered indirectly: each `resolutionManifests` test’s exact array matches the filename passed to `findManifestField` in that adapter. |

### Missing tests

1. **No filesystem access inside `resolutionManifests()`.** Verify scenario “Resolution manifests are declared without reading the filesystem” (`AND` it does not read or stat the filesystem). No test spies on `fs`. Conformant by inspection (constant returns, no path argument). Missing explicit assertion.
2. **Empty array.** No test adapter that reads no manifest and expects `[]`. No built-in adapter is specified to return `[]`; the clause is still untested.

### Spec dependency chain

- `code-graph:symbol-model` — logical symbols, relations, ranges (not re-audited; this delta does not change that contract).
- `default:_global/architecture` — domain purity. Consistent (see top).
- `default:_global/testing` — new behaviour-test titles. Consistent for new tests (see top).

This spec is the parent of the three language specs below. Those specs may be stricter; they do not weaken the no-I/O rule on `resolutionManifests()`.

### Summary counts (requirements checked, conformant, discrepancies, missing tests)

- Requirements checked: 4 (interface `resolutionManifests` clauses; package-identity table and Python walk/quote rules; no-I/O constraint; global architecture and testing consistency)
- Conformant: 4
- Discrepancies: 0
- Missing tests: 2

---

## Spec: code-graph:go-language-adapter

### Requirements summary

- **Resolution manifests (new).** `resolutionManifests()` SHALL return exactly `['go.mod']`. MUST NOT declare `go.work` or any other basename. Package identity continues to come from the `module` path in `go.mod`.
- **Supported files (related sentence).** Package identity from the nearest bounded `go.mod`. MUST NOT invoke the Go toolchain.
- **Build-context boundary (related).** Until explicitly consumed, `go.work`, `replace`, vendoring, and build tags stay unsupported. Verify scenario: `go.work` is not included.
- Globals: architecture and testing, as above.

### Implementation status

Conformant.

- `GoLanguageAdapter.resolutionManifests` returns `['go.mod']` only (`go-language-adapter.ts` 1058–1059). No `go.work` string anywhere in that file.
- `getPackageIdentity` (1069–1078) calls `findManifestField` with filename `go.mod` and extract `/^module\s+(\S+)/m`. No toolchain spawn. I/O is inside `findManifestField`, not inside `resolutionManifests`.
- Graph declarations: `resolutionManifests` at `go-language-adapter.ts:1058`; `getPackageIdentity` is a direct caller of `findManifestField` (impact depth 1).

If a nearer `go.mod` has no `module` line, extract returns undefined and the shared walk continues. This spec does not require that continue, and it does not forbid it. Not treated as a discrepancy.

### Discrepancies (spec-drift vs implementation-bug vs both; evidence)

None.

Does not contradict `default:_global/architecture` (constant manifest list on the adapter; read of `go.mod` in infrastructure) or `default:_global/testing` (the new test title is given/when/then).

### Test coverage

- Verify “Go declares only go.mod”: `packages/code-graph/test/infrastructure/tree-sitter/go-language-adapter.spec.ts` 559–563. Expects deep equality with `['go.mod']` and `not.toContain('go.work')`. Title: `given go adapter, when asked for manifests, then returns go.mod only`.
- Existing identity tests (573–589): module path `github.com/acme/auth`, undefined when no `go.mod`, walk above `codeRoot` bounded by the temp repo root. Titles are the older style.

### Missing tests

None for the new verify scenario. A fixture that places `go.work` beside `go.mod` and asserts identity is unchanged is not required by the scenario (the scenario only checks the declared list). Source never references `go.work`.

### Spec dependency chain

- `code-graph:language-adapter` — port and the manifest table (`go.mod` / `module`). This spec’s exact `['go.mod']` list matches that table and does not add `go.work`.
- `code-graph:symbol-model` — not part of this delta.
- `code-graph:workspace-integration` — package identity feeds the `packageName → workspaceName` map (`getPackageIdentity`). No conflicting manifest basename in that spec (graph spec search for `pyproject.toml` / package identity did not show a second Go manifest rule).
- `default:_global/architecture`, `default:_global/testing` — consistent for this delta.

### Summary counts (requirements checked, conformant, discrepancies, missing tests)

- Requirements checked: 2 (Resolution manifests; package-identity-from-`go.mod` sentence plus architecture/testing consistency)
- Conformant: 2
- Discrepancies: 0
- Missing tests: 0

---

## Spec: code-graph:php-language-adapter

### Requirements summary

- **Resolution manifests (new).** `resolutionManifests()` SHALL return exactly `['composer.json']`. That basename covers both the Composer package `name` and the PSR-4 map. MUST NOT declare any other resolution manifest.
- **Namespaces, use aliases, and Composer resolution (related).** Package identity SHALL come from the nearest bounded Composer `name`. Qualified names resolve through Composer PSR-4 mappings. Pass 2 MUST NOT scan the filesystem per candidate (pre-existing; not re-audited beyond “PSR-4 still comes from `composer.json`”).
- Globals: architecture and testing, as above.

### Implementation status

Conformant for the new manifest rule.

- `PhpLanguageAdapter.resolutionManifests` returns `['composer.json']` (`php-language-adapter.ts` 2100–2101).
- `getPackageIdentity` (2110–2118) reads top-level JSON `name` from `composer.json` through `findManifestField`.
- `buildPsr4Map` (2128–2138) reads `autoload.psr-4` and `autoload-dev.psr-4` from the same basename. No other manifest filename in this adapter (search for `composer` / `readFileSync` only hits these two call sites; the read itself is in `find-manifest-field.ts`).
- I/O is not inside `resolutionManifests`.

`findManifestField` returns on the first file whose extract is truthy. Package name and PSR-4 are separate walks, so a nearer `composer.json` that has `name` but an empty PSR-4 map can supply identity while a parent file supplies PSR-4 (empty map makes extract return `undefined`, and the walk continues). The new requirement says one basename covers both facts; it does not require both facts to come from the same file on the walk. Not counted as a discrepancy.

### Discrepancies (spec-drift vs implementation-bug vs both; evidence)

None.

Does not contradict architecture (infrastructure read of `composer.json`) or testing (new test title uses given/when/then).

### Test coverage

- Verify “PHP declares only composer.json”: `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts` 609–612. `toEqual(['composer.json'])`. Title: `given php adapter, when asked for manifests, then returns composer.json`.

The exact-array assertion also covers “MUST NOT declare any other” without a separate negative list.

### Missing tests

None for the new verify scenario. No new test that PSR-4 and `name` share the declared basename; that is visible in `buildPsr4Map` / `getPackageIdentity`, both hardcoded to `composer.json`.

### Spec dependency chain

- `code-graph:language-adapter` — table row PHP `composer.json` / `name`, and “do not name a file you do not read”. Declaring `composer.json` is required because identity and PSR-4 both read it. No extra basename. Consistent.
- `code-graph:symbol-model` — not part of this delta.
- `code-graph:workspace-integration` — Composer package identity for cross-workspace resolution. No second manifest required there.
- `default:_global/architecture`, `default:_global/testing` — consistent for this delta.

### Summary counts (requirements checked, conformant, discrepancies, missing tests)

- Requirements checked: 2 (Resolution manifests; Composer `name` / same-basename PSR-4 plus architecture/testing consistency)
- Conformant: 2
- Discrepancies: 0
- Missing tests: 0

---

## Spec: code-graph:python-language-adapter

### Requirements summary

- **Resolution manifests (new).** `resolutionManifests()` SHALL return exactly `['pyproject.toml']`. MUST NOT declare `setup.cfg`, `setup.py`, or any other basename. Package identity MUST come from `[project].name` in the nearest bounded `pyproject.toml`, and MUST NOT come from a `name` key in another table.
- **Imports and package resolution (related sentence).** Package identities SHALL be read from the nearest bounded `pyproject.toml` and compared with underscore/hyphen normalization.
- Parent rule used to interpret “nearest” (`code-graph:language-adapter`): if `[project].name` is absent, that file yields nothing and the walk continues. This spec does not restate single quotes or the continue-walk; those are on the parent. Implementation is checked against both.
- Verify: declares only `pyproject.toml` (and not `setup.cfg` / `setup.py`); an earlier `[tool.poetry]` `name` loses to `[project].name`.
- Globals: architecture and testing, as above.

### Implementation status

Conformant.

- `resolutionManifests` returns `['pyproject.toml']` only (`python-language-adapter.ts` 1195–1196). The file does not reference `setup.cfg` or `setup.py`.
- `getPackageIdentity` (1206–1212) walks with `findManifestField(codeRoot, 'pyproject.toml', readPythonProjectName, repoRoot)`.
- `readPythonProjectName` (1221–1234):
  - Header `^\s*\[([^\]]+)\]\s*(?:#.*)?$` sets `inProject` only when the captured header is exactly `project`.
  - Other tables, including `[tool.poetry]`, clear the flag, so their `name` keys are skipped even when they appear first.
  - Assignment `^\s*name\s*=\s*(?:"([^"]*)"|'([^']*)')` accepts double or single quotes. Empty capture is not returned.
- Continue walk: `find-manifest-field.ts` 27–28 returns only when `extract` yields a truthy string. `undefined` (no `[project].name`, poetry-only file, empty name) does not stop the walk. After the current directory equals `repoRoot`, it stops (34). The boundary directory itself is still read before that stop, so a parent `pyproject.toml` on the repo root is visible.
- No I/O in `resolutionManifests`. Domain layer still has no `node:fs`.

“Nearest bounded `pyproject.toml`” in this spec is ambiguous on its own (nearest file vs nearest file that has `[project].name`). Read with the parent continue-walk rule and with “MUST NOT use a `name` in another table”, the implementation’s behaviour is the one the parent verify scenario requires (nearer poetry-only file, parent `[project].name` wins). Not classified as spec-drift: this spec never says to stop on a poetry-only file or to return that poetry name.

Single-line quotes match the parent wording. Multiline TOML strings are not parsed and fail closed (see language-adapter section). No verify scenario asks for them.

### Discrepancies (spec-drift vs implementation-bug vs both; evidence)

None.

Does not contradict architecture or the testing title rule. The three new behaviour tests use given/when/then.

### Test coverage

`packages/code-graph/test/infrastructure/tree-sitter/python-language-adapter.spec.ts`:

| Spec / parent scenario                                                                               | Test                                                                                                | Lines   |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------- |
| Exactly `['pyproject.toml']`, not `setup.cfg` or `setup.py`                                          | `given python adapter, when asked for manifests, then returns pyproject.toml only`                  | 546–551 |
| `[tool.poetry]` name before `[project]` name → `project-name`                                        | `given poetry name before project name, when identity is read, then project name wins`              | 572–578 |
| Single quotes → `quoted-name` (parent scenario)                                                      | `given a single-quoted project name, when identity is read, then that name is returned`             | 581–584 |
| Nearer poetry-only file, parent `[project].name` inside repo root → `project-name` (parent scenario) | `given a nearer file without project name, when a parent has one, then the parent name is returned` | 587–593 |
| Double-quoted `[project] name = "acme-auth"`                                                         | `reads name from pyproject.toml` (older title)                                                      | 561–564 |
| Walk when the nearer directory has no `pyproject.toml` at all                                        | `walks up to find pyproject.toml above codeRoot` (older title)                                      | 595–600 |

Temp dirs use `mkdtempSync(join(tmpdir(), …))` and `afterEach` removal, which matches the infrastructure-test rules in `default:_global/testing`.

### Missing tests

1. **Poetry-only file and no parent `[project].name` returns `undefined`.** The walk test proves a poetry `name` is not chosen when a parent project name exists. It does not prove a tree whose only `name` is under `[tool.poetry]` returns `undefined` instead of `poetry-name`. Implementation does return `undefined` (`readPythonProjectName` never enters the project table; the walk ends without a truthy extract). Spec text “MUST NOT come from a `name` key in another table” is only half-covered.
2. **No direct test that `[project]` exists but has no `name` key** (other keys only). Same extract-returns-undefined branch as the poetry-only nearer file, which is tested. Not counted separately.

No test file targets `findManifestField` or `readPythonProjectName` directly. The adapter tests above exercise both.

### Spec dependency chain

- `code-graph:language-adapter` — exact basename `pyproject.toml`; `[project].name` only; both quote styles; continue when `[project].name` is absent; `resolutionManifests()` does no I/O. This spec’s new requirement matches the basename and the project-table rule. Quote style and continue-walk are specified on the parent and implemented here. No weakening of the no-I/O rule.
- `code-graph:symbol-model` — not part of this delta.
- `code-graph:workspace-integration` — package identity from adapter facts for cross-workspace resolution. No competing Python manifest (no `setup.py` / `setup.cfg` requirement found on that spec via spec search).
- `default:_global/architecture`, `default:_global/testing` — consistent for this delta.

### Summary counts (requirements checked, conformant, discrepancies, missing tests)

- Requirements checked: 2 (Resolution manifests including `[project].name` only; nearest-`pyproject.toml` identity sentence, interpreted with the parent walk, plus architecture/testing consistency)
- Conformant: 2
- Discrepancies: 0
- Missing tests: 1

---

## Batch totals

| Spec                               | Checked | Conformant | Discrepancies | Missing tests |
| ---------------------------------- | ------: | ---------: | ------------: | ------------: |
| code-graph:language-adapter        |       4 |          4 |             0 |             2 |
| code-graph:go-language-adapter     |       2 |          2 |             0 |             0 |
| code-graph:php-language-adapter    |       2 |          2 |             0 |             0 |
| code-graph:python-language-adapter |       2 |          2 |             0 |             1 |
| **Total**                          |  **10** |     **10** |         **0** |         **3** |

Missing tests (do not double-count the Python walk, which is tested): (1) no assertion that `resolutionManifests()` avoids `fs`, (2) no empty-array adapter, (3) poetry-only `pyproject.toml` with no parent `[project].name` is not asserted to return `undefined`.

---

# Partial: fingerprint

The fingerprint partial is stored at `_partial-fingerprint.md` in this report directory. It is included by reference here because it was written in full by the auditor. Open items from it, after reconciliation, are the testing discrepancies and the missing `IndexCodeGraph.execute()` assertion for the exact mismatch `fullRebuildReason`. The claimed `language-adapter` spec-drift is withdrawn in the reconciliation section above.

---

# Partial: globals

# Global and depth-1 conformance

Change: `adapter-sourced-resolution-fingerprint`. Read-only audit of the working tree. Specs were read with `node packages/cli/dist/index.js specs show <specId> --format text`. Symbols were located with `graph search`. Only constraints this fingerprint port, composition wiring, and Python-identity declaration can violate were scored. Historical `node:fs` use in indexing, content freshness, and `getPackageIdentity` was not re-audited.

`code-graph:composition` is a real spec id. Wiring evidence is `packages/code-graph/src/composition/create-code-graph-provider.ts`.

## Spec: default:\_global/architecture

### Constraint checked

Application layer interacts with the outside world only through ports. `application/` does not import `infrastructure/`. Filesystem reads for resolution manifests go through `ResolutionManifestSource`.

### Status

conformant

### Evidence

`packages/code-graph/src/application/use-cases/_shared/compute-graph-fingerprint.ts` imports `ResolutionManifestSource` and `emptyResolutionManifestSource` from `application/ports/resolution-manifest-source.ts`. It does not import `node:fs`. `discoverResolutionInputs` calls `source.directoryExists`, `source.isRegularFile`, and `source.readText`. `hashManifestText` hashes `source.readText`. Private `normalizeNewlines` only rewrites line endings.

`IndexCodeGraph` takes `manifestSource` in its constructor (`index-code-graph.ts` around the constructor) and passes `this.manifestSource` into fingerprint helpers. `GetGraphHealth` passes `input.manifestSource ?? emptyResolutionManifestSource` into `detectFingerprintMismatch`. Neither application file imports `NodeResolutionManifestSource`.

`node:fs` remains in `index-code-graph.ts` and `get-graph-health.ts` for staging, content hashing, and indexed-file reads. Those calls are outside the new manifest-fingerprint path and were not scored.

### Constraint checked

Ports with shared constructor arguments are abstract classes; port operations are methods, not property signatures. Concrete adapters are constructed in composition and are not exported from public entry points. Delivery hosts do not take a direct `@specd/code-graph` dependency to reach a warning string.

### Status

conformant

### Evidence

`ResolutionManifestSource` has no invariant constructor arguments. It is an `interface` whose members are method signatures (`directoryExists`, `isRegularFile`, `readText`), not property signatures.

`NodeResolutionManifestSource` is constructed only in `create-code-graph-provider.ts` and passed into `new IndexCodeGraph(store, registry, manifestSource)` and into the health execute input. `packages/code-graph/src/public.ts` and `src/index.ts` do not export it. `package.json` `exports` are `"."` → `public.js` and `"./internal"` → `index.js`.

`packages/cli/package.json` depends on `@specd/sdk` and does not declare `@specd/core` or `@specd/code-graph`. `packages/cli/src/commands/graph/stats.ts` prints the warning only when `health.fingerprintMismatch === true`. It does not recompute the digest. The literal matches `GRAPH_STATS_FINGERPRINT_WARNING` in `compute-graph-fingerprint.ts`. That copy stays in the CLI because the host must not depend on `@specd/code-graph`. The mismatch decision stays in `GetGraphHealth`.

### Constraint checked

Domain stays free of I/O. Python package identity for fingerprint discovery is a basename declaration, not a domain or application filesystem read. Manual composition wires the adapter. No new YAML boundary and no new package cycle.

### Status

conformant

### Evidence

`LanguageAdapter.resolutionManifests()` is documented as I/O-free and returns exact basenames. `PythonLanguageAdapter.resolutionManifests()` returns `['pyproject.toml']`. `[project].name` parsing stays in infrastructure (`readPythonProjectName` / `findManifestField` in `python-language-adapter.ts` and `find-manifest-field.ts`). The fingerprint path hashes newline-normalized manifest text through the port and does not parse TOML in application or domain code.

`createGetGraphHealth()` still returns `new GetGraphHealth(createVcsAdapter)` with no captured config. The provider spreads a composition-built input into `execute` and adds `provider: this`.

## Spec: default:\_global/testing

### Constraint checked

Application-layer unit tests mock ports and do not touch the filesystem. Infrastructure adapter tests use a real temporary directory.

### Status

discrepancy

### Evidence

`default:_global/testing` requires unit tests of application code to mock ports and forbids filesystem access in those tests. Filesystem access belongs in infrastructure integration tests.

These files live under `packages/code-graph/test/application/use-cases/` and call `mkdtempSync(join(tmpdir(), ...))`, `mkdirSync`, and `writeFileSync`, then pass `new NodeResolutionManifestSource()`:

- `compute-graph-fingerprint.spec.ts`: `given adapter declares package.json, when that file changes, then fingerprint changes`; `given LF and CRLF of the same package.json, when hashed, then digests match without sha256 prefix`; `given undeclared tsconfig.json, when it changes, then fingerprint stays the same`; `given composer.json between codeRoot and repoRoot, when declared, then it is included`; `given a declared manifest above repoRoot, when discovered, then it is omitted`; `given repoRoot null, when a manifest is above projectRoot, then it is omitted`; `given a directory named like a manifest, when discovered, then it is omitted`.
- `staleness-detection.verify.spec.ts`: `Scenario: CRLF resolution manifest stays derivation-fresh` and `Scenario: Edited resolution manifest is a derivation mismatch`.

`filesSource` in `compute-graph-fingerprint.spec.ts` is an in-memory `ResolutionManifestSource` and is never called. The CRLF digest case uses the Node adapter instead.

The newline indexer case is the exception that meets the port rule: `workspace-indexing.spec.ts` (`given a declared manifest changes only newlines, when indexing again, then fullRebuildReason stays null`) builds an in-memory `ResolutionManifestSource` and passes it to `new IndexCodeGraph(store, registry, source)`.

The infrastructure test meets the integration rule: `test/infrastructure/fs/node-resolution-manifest-source.spec.ts` uses `mkdtempSync(join(tmpdir(), ...))`, removes the directory in `afterEach`, and exercises `NodeResolutionManifestSource` against real files.

Application fingerprint cases do remove their directories with `rmSync` in a `finally` block, use `os.tmpdir()`, and do not hardcode `/tmp` or `chmod 0o000`. Cleanup and Windows path rules are met. They do not turn those cases into application unit tests.

### Constraint checked

Behaviour-test titles use `given <state>, when <action>, then <outcome>`. Runner is Vitest. No snapshots. No `as unknown as` port casts.

### Status

discrepancy

### Evidence

These new behaviour titles do not use that pattern:

- `compute-graph-fingerprint.spec.ts`: `computeGraphFingerprint includes adapters and repoRoot`
- `staleness-detection.verify.spec.ts`: `Scenario: CRLF resolution manifest stays derivation-fresh`
- `staleness-detection.verify.spec.ts`: `Scenario: Edited resolution manifest is a derivation mismatch`

The other new fingerprint titles in that file do use `given …, when …, then …`, as do both cases in `node-resolution-manifest-source.spec.ts`.

No `toMatchSnapshot`, `toMatchInlineSnapshot`, Jest import, or `as unknown as` port cast in those application tests. The in-memory indexer source implements all three port methods without a cast.

## Spec: default:\_global/eslint

### Constraint checked

No explicit `any`, no default exports, explicit return types on exported functions and methods, JSDoc on functions and classes, kebab-case `src/` names, and layer `no-restricted-imports` boundaries.

### Status

conformant

### Evidence

`resolution-manifest-source.ts`, `node-resolution-manifest-source.ts`, and `compute-graph-fingerprint.ts` use named exports, kebab-case names, and explicit return types on exported functions and class methods. `normalizeNewlines`, `hashManifestText`, and `collectResolutionBasenames` are internal functions with JSDoc (`@param` / `@returns`). Port methods and `NodeResolutionManifestSource` methods have JSDoc. No `: any`, `as any`, or `export default` in those files.

`jsdoc/require-jsdoc` contexts are `FunctionDeclaration`, `ClassDeclaration`, `MethodDefinition`, `TSTypeAliasDeclaration`, and `TSInterfaceDeclaration`. Object-literal methods on `emptyResolutionManifestSource` sit outside those contexts. The interface methods they implement are documented.

Application fingerprint code does not import `infrastructure/` or `composition/`. Composition is the file that imports `infrastructure/fs/node-resolution-manifest-source.ts`. Test files are exempt from JSDoc.

## Spec: default:\_global/conventions

### Constraint checked

ESM named exports, kebab-case tests under `test/`, no `any`, explicit public return types, `SpecdError` for expected domain or application failures, and `readonly` on new fingerprint values. Collection lazy-loading does not apply to an explicit content hash.

### Status

conformant

### Evidence

New modules are ESM TypeScript with named exports. Tests are `*.spec.ts` under `test/`, mirroring `src/`. `ResolutionInputFingerprint` and `GraphFingerprintInput` use `readonly`. `normalizeNewlines` is a private function in `@specd/code-graph`, not an export of `@specd/core`.

Unreadable manifests return `undefined` from `NodeResolutionManifestSource.readText` and are omitted by `hashManifestText`. That path does not throw a generic `Error` or a new `SpecdError`. No new error class was added.

`node:path` and `node:crypto` in the fingerprint helper are not filesystem I/O. Hashing declared manifest text is an explicit load, not a collection `list()` that embeds content.

## Spec: code-graph:get-graph-health

### Constraint checked

`createGetGraphHealth()` returns a stateless instance with no config capture. Derivation comparison uses the already-open provider, does not open or close it, and sets `fingerprintMismatch` to `null` when comparison cannot run. The new manifest port is an execute input, not a second factory.

### Status

conformant

### Evidence

`packages/code-graph/src/composition/use-cases/get-graph-health.ts`: `createGetGraphHealth()` returns `new GetGraphHealth(createVcsAdapter)` and takes no config or manifest source.

`GetGraphHealthInput.manifestSource` is optional. `execute` calls `detectFingerprintMismatch` only when `input.workspaces !== undefined && stats.graphFingerprint !== null`, and the `catch` sets `fingerprintMismatch = null`. The provider passes the composed input, including `manifestSource`, at `getGraphHealth()` time (`code-graph-provider.ts` spreads `this.graphHealth.input` and sets `provider: this`). The use case does not call `open` or `close`.

A `readText` result of `undefined` drops that file from the digest (`discoverResolutionInputs`) instead of throwing. The health `catch` therefore does not see a swallowed adapter read. The checked requirement nulls `fingerprintMismatch` when comparison does not run or throws. It does not require a read failure to null the comparison. Fingerprint mismatch does not write the stale latch; `knownStaleSinceLastIndex` still comes from existing latches. This was not scored as a contradiction.

## Spec: code-graph:composition

### Constraint checked

The composition factory still builds the store, adapter registry, and `IndexCodeGraph`, and it is the layer that may import infrastructure. Adding the manifest source must not export the concrete adapter or create a second per-use-case wiring path for `GetGraphHealth`.

### Status

conformant

### Evidence

`createCodeGraphProvider` still creates the selected store, registers the built-in language adapters plus `options.adapters`, then `const manifestSource = new NodeResolutionManifestSource()` and `new IndexCodeGraph(store, registry, manifestSource)`. When the argument is `SpecdConfig`, health input includes that same `manifestSource` and `createGetGraphHealth()`. The legacy options path still constructs the indexer with the same source. The concrete class is not re-exported from the factory module.

Python identity remains on the language adapter (`getPackageIdentity` → `findManifestField`). Composition does not add a parallel Python parser.

## Summary counts

| Count                    | Value                                                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Specs checked            | 6                                                                                                                                                    |
| Conformant specs         | 5 (`default:_global/architecture`, `default:_global/eslint`, `default:_global/conventions`, `code-graph:get-graph-health`, `code-graph:composition`) |
| Specs with discrepancies | 1 (`default:_global/testing`)                                                                                                                        |
| Discrepancies            | 2                                                                                                                                                    |

Discrepancy list:

1. Testing — application fingerprint and staleness tests still read a real temporary directory through `NodeResolutionManifestSource`.
2. Testing — three new behaviour titles omit `given …, when …, then …`.

---

# Partial: fingerprint (verbatim)

# Partial audit: adapter-sourced resolution fingerprint

Change: `adapter-sourced-resolution-fingerprint`
Scope: requirements this change added or rewrote in `code-graph:indexer` and `code-graph:staleness-detection`, plus conformity with `default:_global/architecture` and `default:_global/testing` for that work.
Method: merged `changes spec-preview` (specs + verify) and graph navigation (`computeGraphFingerprint`, `ResolutionManifestSource`, `NodeResolutionManifestSource`, `normalizeNewlines`, `isGraphStale`). Known implementation files were read after the graph located them.
No code or spec files were modified.

## Spec: code-graph:indexer

### Requirements summary

Audited clauses of **Requirement: Adapter-sourced resolution fingerprint**, **Requirement: Discovery fingerprint uses effective config** (undeclared build files), and the incremental-indexing scenarios that this change rewrote:

1. Manifest membership comes only from `resolutionManifests()` on registered adapters. The indexer does not keep a separate hardcoded list.
2. For each workspace, discovery starts at `codeRoot` and walks parents through the repository root, inclusive. With no repository root, the project root is the bound. The walk does not continue above that bound.
3. Existing files whose basename is declared are included. Missing basenames are omitted. `computeGraphFingerprint`, `computeWorkspaceFingerprint`, and `computeRootFingerprint` use that same per-workspace set.
4. Each included file is read as UTF-8 text. The inner digest is SHA-256 hex of the newline-normalized text, with no `sha256:` prefix and no raw-byte hash. CRLF and LF of the same text match. A lone CR is rewritten to LF the same way as unexported core `normalizeNewlines`.
5. A newline-only change of a declared manifest does not by itself make the persisted fingerprint differ, so `IndexCodeGraph.execute()` stays incremental and `fullRebuildReason` is null.
6. A real fingerprint mismatch sets `fullRebuildReason` to exactly `Graph derivation fingerprint mismatch — code-graph version, workspace configuration, or resolution manifest content changed`.
7. Application discovery and hashing go through `ResolutionManifestSource`. The fingerprint module does not import `node:fs` or `node:fs/promises`. Composition supplies the filesystem adapter to indexing and graph-health callers.
8. Project-relative paths in the payload are sorted.
9. Undeclared `tsconfig.json`, `jsconfig.json`, `setup.cfg`, `setup.py`, and `go.work` do not change the digest. Changing any one of them, while declared manifests stay unchanged, leaves the digest unchanged.
10. The fingerprint module must not depend on importing `normalizeNewlines` from `@specd/core` when that symbol is not on the public API. A private equivalent is required. Exporting it from `@specd/core` is not required.

### Implementation status

Implemented in `packages/code-graph/src/application/use-cases/_shared/compute-graph-fingerprint.ts`.

- `collectResolutionBasenames` unions `adapter.resolutionManifests()` and drops empty names, slashes, and `*`. There is no `tsconfig.json` / `jsconfig.json` / `setup.cfg` / `setup.py` / `go.work` list in the fingerprint module. Built-in adapters declare only `package.json` (TypeScript), `pyproject.toml` (Python), `go.mod` (Go), and `composer.json` (PHP).
- `discoverResolutionInputs` walks `resolve(codeRoot)` up to `resolve(repoRoot ?? projectRoot)` via `collectWalkDirectories`. The bound is included. A start outside the bound yields only the start directory, so the walk does not climb above the bound. A missing basename is skipped because `isRegularFile` is false. A directory with a manifest basename is skipped because `NodeResolutionManifestSource.isRegularFile` uses `lstatSync().isFile()`.
- `computeGraphFingerprint`, `computeWorkspaceFingerprint`, and `computeRootFingerprint` all call `discoverResolutionInputs` for each workspace.
- `hashManifestText` reads `source.readText` (UTF-8 in the node adapter) and returns `createHash('sha256').update(normalizeNewlines(content), 'utf8').digest('hex')`. That is 64 hex characters and does not use a `sha256:` prefix.
- Private `normalizeNewlines` is `text.replaceAll('\r\n', '\n').replaceAll('\r', '\n')`, the same replacements as `packages/core/src/domain/services/normalize-newlines.ts`. Core’s function is exported from that module and re-exported inside `path-platform.ts`, and it is not on `packages/core/src/index.ts` or `package.json` exports. The fingerprint module does not import it. That matches the “do not require a public export” rule.
- Relative paths are `localeCompare`-sorted before they enter the payload.
- `IndexCodeGraph` takes `ResolutionManifestSource` (default `emptyResolutionManifestSource`) and passes `this.manifestSource` into workspace, root, and mismatch helpers. On mismatch and not `force`, it assigns `FULL_REBUILD_FINGERPRINT_REASON` (the exact em dash, U+2014), sets `fullRebuild`, pushes every discovered path into `newFiles`, and commits with `replaceCodeGraph: fullRebuild`. A newline-only change hashes equal, so that branch is not taken and `fullRebuildReason` stays null.
- `createCodeGraphProvider` constructs one `NodeResolutionManifestSource` and passes it to `new IndexCodeGraph(...)` and to the `GetGraphHealth` input (`manifestSource`). The adapter class is not exported from the package public barrel.
- The fingerprint module imports `node:crypto` and `node:path`. It does not import `node:fs`, `node:fs/promises`, or `infrastructure/`.

### Discrepancies

1. **spec-drift** — `code-graph:language-adapter` does not define `resolutionManifests()`.
   - Evidence: `specs/code-graph/language-adapter/spec.md` has no `resolutionManifests` text. Package identity is still specified as optional `getPackageIdentity`, with a fixed manifest table (`package.json`, `pyproject.toml`, `go.mod`, `composer.json`) and a walk that continues to the filesystem root when `repoRoot` is omitted.
   - The indexer requirement and `LanguageAdapter.resolutionManifests()` in `packages/code-graph/src/domain/value-objects/language-adapter.ts` require adapter-declared exact basenames, and the fingerprint walk stops at repo root or project root.
   - These are different operations (package-name lookup versus derivation digest), so the walk bounds do not contradict each other. The gap is that the dependency spec never states the method the indexer now requires.
   - Code matches the indexer spec. The dependency spec was not extended.

No implementation-bug against the indexer clauses above. The exact rebuild string, the port, the hash shape, the walk bounds, and the undeclared-basename allowlist are present in code.

### Test coverage

| Clause                                                                                            | Where asserted                                                                                                                                                                                   | Result                                     |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| Declared manifest content changes the workspace digest                                            | `compute-graph-fingerprint.spec.ts` (`given adapter declares package.json...`)                                                                                                                   | Covered                                    |
| CRLF and LF inner `contentHash` equal, 64 hex, no `sha256:` prefix                                | same file (`given LF and CRLF...`)                                                                                                                                                               | Covered                                    |
| Undeclared `tsconfig.json` change leaves the digest unchanged while `package.json` stays declared | same file (`given undeclared tsconfig.json...`)                                                                                                                                                  | Covered for that basename                  |
| Parent `composer.json` between `codeRoot` and repo root is included                               | same file                                                                                                                                                                                        | Covered                                    |
| Declared manifest above repo root is omitted                                                      | same file                                                                                                                                                                                        | Covered                                    |
| `repoRoot === null` omits a manifest above project root                                           | same file                                                                                                                                                                                        | Covered                                    |
| Directory named `package.json` is omitted                                                         | same file                                                                                                                                                                                        | Covered                                    |
| Newline-only manifest keeps `IndexCodeGraph.execute()` incremental                                | `workspace-indexing.spec.ts` (`given a declared manifest changes only newlines...`) asserts `fullRebuildReason === null` and `fullRebuild === false` with a full `ResolutionManifestSource` mock | Covered                                    |
| Exact mismatch `fullRebuildReason` and re-extraction of every discovered file                     | not asserted                                                                                                                                                                                     | Missing (see below)                        |
| `computeRootFingerprint` / `computeGraphFingerprint` share the set                                | same `discoverResolutionInputs` call sites; tests exercise `computeWorkspaceFingerprint`                                                                                                         | Satisfied in code; not separately asserted |

The five undeclared basenames share one allowlist. A test that changes `tsconfig.json` while `package.json` is the only declared name is enough to prove that undeclared names are not hashed. Separate mutations of `jsconfig.json`, `setup.cfg`, `setup.py`, and `go.work` would not exercise a different branch.

### Missing tests

- **Requirement: Incremental indexing / Scenario: Fingerprint mismatch escalates unchanged files to full rebuild.** No test calls `IndexCodeGraph.execute()` and expects `fullRebuildReason` to equal `Graph derivation fingerprint mismatch — code-graph version, workspace configuration, or resolution manifest content changed`. Repo search finds that sentence only in `compute-graph-fingerprint.ts` (the constant) and the assignment in `index-code-graph.ts`. No test asserts that a mismatch re-extracts every discovered file. The constant and the `newFiles.push(...allDiscoveredPaths)` path implement the scenario; the scenario itself is untested.
- Lone CR versus LF is implemented and not separately tested. The CRLF scenario is tested, and the private function matches core’s two replacements. Not counted as a product gap.

### Spec dependency chain

Direct dependencies from the merged indexer spec:

- `code-graph:graph-store` — fingerprint is stored on graph metadata; mismatch commit uses `replaceCodeGraph`. Not re-audited in full.
- `code-graph:language-adapter` — **spec-drift**, see Discrepancies. Implementation adds `resolutionManifests()`; the dependency spec does not.
- `code-graph:symbol-model`, `code-graph:workspace-integration`, `code-graph:sqlite-graph-store`, `code-graph:document-model` — not contradicted by the fingerprint clauses.
- `core:config`, `core:spec-repository-port`, `core:list-workspaces`, `core:get-spec-metadata` — not contradicted by the fingerprint clauses.
- `code-graph:staleness-detection` consumes the same fingerprint (audited below).

`default:_global/architecture` and `default:_global/testing` are checked in their own sections.

### Summary counts

- Requirements audited: 10
- Implemented in code: 10
- Discrepancies: 1 (spec-drift: 1, implementation-bug: 0, both: 0)
- Missing tests: 1 scenario (exact `fullRebuildReason` plus full re-extraction on mismatch)

## Spec: code-graph:staleness-detection

### Requirements summary

Audited clauses of **Requirement: Graph derivation freshness**, **Requirement: Derivation mismatch policy** (as it relates to VCS independence), and **Requirement: Staleness in graph stats output**:

1. Derivation fingerprint includes newline-normalized content hashes of manifests declared by registered adapters.
2. CRLF versus LF of an unchanged manifest does not by itself produce a derivation mismatch.
3. When a declared manifest’s normalized text differs from the text hashed at index time, derivation freshness is mismatched even if the VCS ref is unchanged. VCS freshness stays fresh. `isGraphStale` is false when the two refs are equal.
4. `graph stats` text output, when a mismatch is known, includes exactly `⚠ Derivation fingerprint mismatch — code-graph version, workspace configuration, or resolution manifest content changed`.
5. Read commands warn and still return results. The CLI does not import `@specd/code-graph`; a duplicated warning string is acceptable when it matches.

### Implementation status

- `isGraphStale` (`packages/code-graph/src/domain/services/is-graph-stale.ts`) compares only `lastIndexedRef` and `currentRef`. Equal non-null refs return `false`. It does not read manifests.
- `GetGraphHealth.execute` sets `stale` from `isGraphStale` and, when workspaces and a stored fingerprint exist, sets `fingerprintMismatch` from `detectFingerprintMismatch` using `input.adapters`, `vcsRoot`, and `input.manifestSource ?? emptyResolutionManifestSource`. The two flags are independent. `createCodeGraphProvider` passes the same node source and the registered adapters into that input. `provider.getGraphHealth()` is what `graph stats` calls.
- `GRAPH_STATS_FINGERPRINT_WARNING` in the fingerprint module and the literal in `packages/cli/src/commands/graph/stats.ts` (lines 107–110) are the same string, including `⚠` and em dash U+2014. The CLI prints it when `fingerprintMismatch === true` and still prints the graph counts. JSON/TOON keep the `fingerprintMismatch` field from health.
- Other read commands go through `warnGraphStale`, which prints `health.reasonCodes` (including `DERIVATION_MISMATCH` when health sets it). The exact sentence is specified for `graph stats` text, and that command has it.

### Discrepancies

None. Edited-manifest mismatch and equal-ref VCS freshness are separate in both the domain helper and `GetGraphHealth`. The stats warning matches the spec and the code-graph constant.

### Test coverage

| Clause                                                                            | Where asserted                                                                                                                                                                                                                                                                                                   | Result                              |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| CRLF manifest stays derivation-fresh                                              | `staleness-detection.verify.spec.ts` `Scenario: CRLF resolution manifest stays derivation-fresh` expects `detectFingerprintMismatch` false                                                                                                                                                                       | Covered                             |
| Edited manifest mismatches and `isGraphStale('abc1234','abc1234')` is false       | same file `Scenario: Edited resolution manifest is a derivation mismatch`                                                                                                                                                                                                                                        | Covered at those two functions      |
| Health can report `fingerprintMismatch: true` while a matching VCS ref is in play | `get-graph-health.spec.ts` `returns fingerprintMismatch true when derivation differs` changes `codeGraphVersion` to `2.0.0` and expects `fingerprintMismatch === true`. It does not edit a manifest. The edited-manifest case is the staleness test above. `GetGraphHealth` assigns the two flags independently. | Covered for the wiring that matters |
| `graph stats` text warning exact string, command still returns counts             | `packages/cli/test/commands/graph-stats.spec.ts` `given a derivation mismatch, when graph stats runs in text mode, then the warning names resolution manifests`                                                                                                                                                  | Covered                             |
| Equal refs are not stale                                                          | `is-graph-stale.spec.ts` and the edited-manifest test                                                                                                                                                                                                                                                            | Covered                             |

### Missing tests

None that leave a stated staleness clause unproven. There is no single `GetGraphHealth.execute` test that edits manifest text and asserts `stale === false` together with `fingerprintMismatch === true`. The production method assigns those from `isGraphStale` and `detectFingerprintMismatch`, and each of those is tested for that situation. Not counted as a gap.

### Spec dependency chain

- `code-graph:graph-store` — `lastIndexedRef` and stored fingerprint metadata. Consistent with `isGraphStale` and `parseFingerprintMap`.
- `code-graph:indexer` — staleness uses the same fingerprint helpers and the same mismatch reason family. The stats warning is the warning form of the indexer rebuild sentence (warning emoji, “Derivation” instead of “Graph derivation”). Both strings match their own requirements. No drift between them.
- `code-graph:get-graph-health` — `GetGraphHealth` is the host entry. `graph stats` reads `provider.getGraphHealth()` and does not reassemble refs inline. Consistent.
- `code-graph:language-adapter` — same missing `resolutionManifests()` contract as in the indexer section. Not a second behavioral bug.

### Summary counts

- Requirements audited: 5
- Implemented in code: 5
- Discrepancies: 0
- Missing tests: 0

## Spec: default:\_global/architecture

### Requirements summary

Checked only against this change: application code does not import infrastructure or `node:fs` / `node:fs/promises` for manifest discovery; composition wires the adapter; concrete adapters stay out of the public barrel.

### Implementation status

Conformant for the new path.

- `compute-graph-fingerprint.ts` depends on the `ResolutionManifestSource` port, domain adapter types, and `node:crypto` / `node:path`. No infrastructure import and no `node:fs`.
- `node-resolution-manifest-source.ts` is infrastructure and is the only new `node:fs` reader (`existsSync`, `lstatSync`, `readFileSync` UTF-8).
- `create-code-graph-provider.ts` (composition) constructs that adapter and injects it into `IndexCodeGraph` and graph-health input.
- `NodeResolutionManifestSource` is not exported from `packages/code-graph/src/index.ts`.

`IndexCodeGraph`, `GetGraphHealth`, and other application files still import `node:fs` for discovery, content, and version reads that this change did not move behind the new port. Those imports are not used to discover or hash resolution manifests. They are pre-existing layering debt, not a failure of the adapter-sourced fingerprint requirement.

### Discrepancies

None for this change.

### Test coverage

Composition wiring is visible in `create-code-graph-provider.ts`. No new architecture test was required by the global spec beyond the layering the code already follows. Application tests that import `NodeResolutionManifestSource` are a testing-spec issue, not an architecture violation in production code.

### Missing tests

None for the architecture clauses checked here.

### Spec dependency chain

Global constraint on `code-graph` application / composition / infrastructure. The new port sits in `application/ports/`. The adapter sits in `infrastructure/fs/`. Composition is the only production importer of the adapter class.

### Summary counts

- Requirements audited: 3 (no application fs/infrastructure import for this discovery path; composition wires the adapter; adapter not on the public barrel)
- Implemented in code: 3
- Discrepancies: 0
- Missing tests: 0

## Spec: default:\_global/testing

### Requirements summary

Checked against tests added for this change:

- Application unit tests mock ports and do not touch a real filesystem (`fs.readFile` / writes belong in infrastructure or integration tests).
- Behaviour-test titles follow `given <state>, when <action>, then <outcome>`.
- Infrastructure filesystem tests may use `os.tmpdir()` and must clean up.

### Implementation status

Mixed.

- `packages/code-graph/test/infrastructure/fs/node-resolution-manifest-source.spec.ts` uses `mkdtempSync(join(tmpdir(), ...))`, `afterEach` `rmSync`, and `given/when/then` titles. Conformant.
- `workspace-indexing.spec.ts` newline case builds a complete `ResolutionManifestSource` object (all three methods) and does not read the manifest through `node:fs`. The file still creates the workspace tree with `mkdtempSync` because indexing discovers source files. That pattern pre-exists in this file. The new manifest bytes themselves are in the port mock.
- `compute-graph-fingerprint.spec.ts` defines `filesSource`, a complete in-memory port, and never uses it. The new cases (`given adapter declares package.json`, CRLF, undeclared `tsconfig.json`, parent `composer.json`, above-repo-root, null repo root, directory basename) call `mkdtempSync`, `mkdirSync`, `writeFileSync`, and `NodeResolutionManifestSource`.
- `staleness-detection.verify.spec.ts` CRLF and edited-manifest cases do the same with `NodeResolutionManifestSource` and `writeFileSync`.
- New titles in the fingerprint spec, the indexer newline test, the node-source spec, and `graph-stats.spec.ts` use `given/when/then`. The two new staleness cases are titled `Scenario: CRLF resolution manifest stays derivation-fresh` and `Scenario: Edited resolution manifest is a derivation mismatch`.

### Discrepancies

1. **implementation-bug** (tests against this spec, not against fingerprint behaviour).
   - Application tests under `packages/code-graph/test/application/use-cases/compute-graph-fingerprint.spec.ts` and `staleness-detection.verify.spec.ts` write a real temporary tree and read it through `NodeResolutionManifestSource`.
   - The testing spec says port implementations are mocked in unit tests and that a unit test which calls filesystem reads violates the requirement; filesystem access belongs in integration tests.
   - `filesSource` in the fingerprint spec already implements `directoryExists`, `isRegularFile`, and `readText` without I/O, including the directory-versus-file case the tests care about. The new scenarios do not need a real disk.
   - Evidence: `compute-graph-fingerprint.spec.ts` lines 25–42 (unused mock) and 254–515 (tmpdir); `staleness-detection.verify.spec.ts` lines 139–209.

2. **implementation-bug** (test titles).
   - New behaviour tests in `staleness-detection.verify.spec.ts` use `Scenario: ...` titles instead of `given <state>, when <action>, then <outcome>`.
   - Evidence: lines 139 and 175 of that file. Neighbouring new tests in the fingerprint, indexer, infrastructure, and CLI files follow the required pattern.

Neither finding changes the product behaviour recorded under the indexer and staleness specs.

### Test coverage

The testing spec’s own scenarios are the yardstick for the new tests. Infrastructure tmpdir usage matches. Application manifest tests and two staleness titles do not.

### Missing tests

No additional product scenario is missing because of this spec. The gaps are nonconforming tests, listed as discrepancies, not absent assertions.

### Spec dependency chain

Global testing constraint on the new `code-graph` application and infrastructure tests and on `packages/cli/test/commands/graph-stats.spec.ts`.

### Summary counts

- Requirements audited: 3
- Implemented: 1 (infrastructure tmpdir tests)
- Discrepancies: 2 (spec-drift: 0, implementation-bug: 2, both: 0)
- Missing tests: 0

## Cross-spec totals

- Product clauses checked (indexer + staleness + architecture): 18 implemented, 0 implementation-bugs in production code.
- Spec-drift: 1 (`code-graph:language-adapter` does not specify `resolutionManifests()`).
- Test-spec implementation-bugs: 2 (application unit tests hit the filesystem; two staleness titles are not `given/when/then`).
- Missing product test: 1 (indexer mismatch `IndexCodeGraph.execute()` does not assert the exact `fullRebuildReason` or full re-extraction).
