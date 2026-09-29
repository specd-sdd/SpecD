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
