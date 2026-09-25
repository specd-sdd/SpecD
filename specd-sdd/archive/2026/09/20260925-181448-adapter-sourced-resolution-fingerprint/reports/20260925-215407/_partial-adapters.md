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
- Existing identity tests (622–638): `name` `acme/auth`, missing file, walk above `codeRoot`. Older titles.

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
