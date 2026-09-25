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
