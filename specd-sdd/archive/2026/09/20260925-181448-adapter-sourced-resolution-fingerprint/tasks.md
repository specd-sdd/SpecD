# Tasks: adapter-sourced-resolution-fingerprint

## 1. Adapter contract

- [x] 1.1 Add required `resolutionManifests` to `LanguageAdapter`
      `packages/code-graph/src/domain/value-objects/language-adapter.ts`: `LanguageAdapter` — add `resolutionManifests(): readonly string[]` with JSDoc (`@returns`)
      Approach: required method, exact basenames, no I/O, empty array when the adapter reads no manifest
      (Req: LanguageAdapter interface)

- [x] 1.2 Declare TypeScript `package.json`
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `TypeScriptLanguageAdapter.resolutionManifests` — return `['package.json']`
      Approach: pure method next to `getPackageIdentity`; do not read the file
      (Req: LanguageAdapter interface, Package identity extraction)

- [x] 1.3 Declare Go `go.mod`
      `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`: `GoLanguageAdapter.resolutionManifests` — return `['go.mod']`
      Approach: do not return `go.work`
      (Req: Resolution manifests)

- [x] 1.4 Declare PHP `composer.json`
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: `PhpLanguageAdapter.resolutionManifests` — return `['composer.json']`
      Approach: one basename covers package name and PSR-4
      (Req: Resolution manifests)

- [x] 1.5 Declare Python `pyproject.toml`
      `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`: `PythonLanguageAdapter.resolutionManifests` — return `['pyproject.toml']`
      Approach: do not return `setup.cfg` or `setup.py`
      (Req: Resolution manifests)

## 2. Fingerprint discovery

- [x] 2.1 Extend fingerprint input with adapters and repo root
      `packages/code-graph/src/application/use-cases/_shared/compute-graph-fingerprint.ts`: `GraphFingerprintInput`, `computeWorkspaceFingerprint`, `computeRootFingerprint`, `detectFingerprintMismatch` — add `adapters: readonly LanguageAdapter[]` and `repoRoot: string | null`
      Approach: keep `parseFingerprintMap` and `serializeFingerprintMap` unchanged; do not import `normalizeNewlines` from `@specd/core`
      (Req: Adapter-sourced resolution fingerprint)

- [x] 2.2 Add local newline normalization and manifest hashing
      `packages/code-graph/src/application/use-cases/_shared/compute-graph-fingerprint.ts`: `normalizeManifestNewlines`, `hashManifestText` — CRLF and lone CR become LF; SHA-256 hex of UTF-8 text; return `undefined` when the read throws
      Approach: `text.replaceAll('\r\n', '\n').replaceAll('\r', '\n')`; digest has no `sha256:` prefix
      (Req: Adapter-sourced resolution fingerprint, Graph derivation freshness)

- [x] 2.3 Replace hardcoded manifest discovery
      `packages/code-graph/src/application/use-cases/_shared/compute-graph-fingerprint.ts`: `discoverResolutionInputs` — delete `RESOLUTION_MANIFESTS` and the `tsconfig`/`jsconfig` regex
      Approach: union `resolutionManifests()`, drop empty names and names containing `/`, `\`, or `*`; walk `codeRoot` to `repoRoot ?? projectRoot` inclusive; if `codeRoot` is outside the bound, inspect only `codeRoot`; keep regular files only; sort by project-relative path
      (Req: Adapter-sourced resolution fingerprint, Discovery fingerprint uses effective config)

- [x] 2.4 Thread the same inputs through all three fingerprints
      `packages/code-graph/src/application/use-cases/_shared/compute-graph-fingerprint.ts`: `computeGraphFingerprint`, `computeWorkspaceFingerprint`, `computeRootFingerprint`, `detectFingerprintMismatch` — each workspace uses the helper
      Approach: no second project-root directory listing
      (Req: Incremental indexing, Adapter-sourced resolution fingerprint)

## 3. Call sites

- [x] 3.1 Pass adapters and `vcsRoot` from indexing
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: fingerprint calls — pass `AdapterRegistryPort.getAdapters()` and `IndexOptions.vcsRoot`
      Approach: do not build a local manifest list
      (Req: Incremental indexing)

- [x] 3.2 Pass adapters and `vcsRoot` from health
      `packages/code-graph/src/application/use-cases/get-graph-health.ts`: fingerprint calls — same adapter list and repo root the index run used
      Approach: `repoRoot` null falls back inside the fingerprint helper via `projectRoot`
      (Req: Graph derivation freshness)

- [x] 3.3 Update the expected fingerprint helper
      `packages/code-graph/test/helpers/expected-fingerprint-map.ts`: `buildExpectedFingerprintMap` — add trailing `adapters` and `repoRoot` and forward them
      Approach: indexing tests keep stored-map assertions aligned with the new digest
      (Req: Discovery fingerprint uses effective config)

- [x] 3.4 Fix remaining compile failures
      Test doubles and direct callers of the fingerprint functions, including `compute-graph-fingerprint.spec.ts`, `staleness-detection.verify.spec.ts`, and `get-graph-health.spec.ts` — implement `resolutionManifests` or pass the new arguments
      Approach: doubles that are not under test return `[]`
      (Req: LanguageAdapter interface)

## 4. Tests

- [x] 4.1 Assert TypeScript manifest declaration
      `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`: `resolutionManifests()` deep-equals `['package.json']`
      Approach: given/when/then description
      (Req: LanguageAdapter interface, scenario: TypeScript adapter declares package.json)

- [x] 4.2 Assert Go manifest declaration
      `packages/code-graph/test/infrastructure/tree-sitter/go-language-adapter.spec.ts`: deep-equals `['go.mod']` and does not include `go.work`
      Approach: given/when/then description
      (Req: Resolution manifests, scenario: Go declares only go.mod)

- [x] 4.3 Assert PHP manifest declaration
      `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`: deep-equals `['composer.json']`
      Approach: given/when/then description
      (Req: Resolution manifests, scenario: PHP declares only composer.json)

- [x] 4.4 Assert Python manifest declaration
      `packages/code-graph/test/infrastructure/tree-sitter/python-language-adapter.spec.ts`: deep-equals `['pyproject.toml']` and excludes `setup.cfg` and `setup.py`
      Approach: given/when/then description
      (Req: Resolution manifests, scenario: Python declares only pyproject.toml)

- [x] 4.5 Assert adapter-sourced discovery and hashing
      `packages/code-graph/test/application/use-cases/compute-graph-fingerprint.spec.ts`: stub adapter `['package.json']` hashes that file; LF and CRLF match with bare hex; undeclared `tsconfig.json` does not change the digest; parent `composer.json` inside `repoRoot` is included; a file above `repoRoot` is omitted; `repoRoot: null` stops at `projectRoot`; a non-regular entry is omitted
      Approach: temp dirs from `os.tmpdir()`; do not use `chmod 0o000`
      (Req: Adapter-sourced resolution fingerprint, scenarios: Manifest membership comes from adapters, Walk includes manifests between codeRoot and the repository root, Walk stops at the repository root, CRLF and LF manifests hash the same, Undeclared build files are not fingerprint inputs)

- [x] 4.6 Assert staleness ignores newline-only manifests
      `packages/code-graph/test/application/use-cases/staleness-detection.verify.spec.ts`: CRLF-only change is not a derivation mismatch; a normalized-text edit is
      Approach: version and workspace config stay constant
      (Req: Graph derivation freshness, scenarios: CRLF resolution manifest stays derivation-fresh, Edited resolution manifest is a derivation mismatch, Newline-only manifest change stays incremental)

- [x] 4.7 Run the code-graph unit tests for the touched files
      `packages/code-graph`: vitest on the fingerprint, staleness, health, and four adapter specs
      Approach: fix failures caused by the new required method or fingerprint arguments before stopping
      (Req: Incremental indexing)

## 5. Manual check

- [x] 5.1 Re-index twice and confirm the second run is not a fingerprint rebuild
      Workspace root: `node packages/cli/dist/index.js graph index --format toon`, then run it again
      Approach: the first run may report a derivation rebuild; the second must not, while manifests are unchanged
      (Req: Incremental indexing, scenario: Fingerprint mismatch escalates unchanged files to full rebuild)

## 6. Verification follow-up

- [x] 6.1 Read manifests through a port
      `packages/code-graph/src/application/ports/resolution-manifest-source.ts`: `ResolutionManifestSource` — `directoryExists`, `isRegularFile`, `readText`
      `packages/code-graph/src/infrastructure/fs/node-resolution-manifest-source.ts`: `NodeResolutionManifestSource` — `node:fs` adapter
      `packages/code-graph/src/application/use-cases/_shared/compute-graph-fingerprint.ts`: fingerprint functions take `source` and do not import `node:fs`
      Approach: rename the local helper to `normalizeNewlines` with the same two replacements; composition wires the node adapter into index and health
      (Req: Adapter-sourced resolution fingerprint, scenario: Manifest discovery does not import the filesystem from application code)

- [x] 6.2 Python identity is `[project].name`
      `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`: `getPackageIdentity` — read only the `[project]` table, double- or single-quoted `name`; a file without that field does not stop the walk
      Approach: do not return `[tool.poetry]` name
      (Req: Package identity extraction, Resolution manifests, scenarios: Python identity is the project table name, Python identity accepts a single-quoted project name, Python identity skips a file without a project name, Python identity ignores an earlier table name)

- [x] 6.3 Name resolution manifests in mismatch diagnostics
      Index full-rebuild reason: `Graph derivation fingerprint mismatch — code-graph version, workspace configuration, or resolution manifest content changed`
      Text warning: `⚠ Derivation fingerprint mismatch — code-graph version, workspace configuration, or resolution manifest content changed`
      Approach: one shared sentence; the warning adds the `⚠` prefix and the word `Derivation`
      (Req: Incremental indexing, Staleness in graph stats output)

- [x] 6.4 Lock the follow-up scenarios in tests
      Application fingerprint tests use an in-memory `ResolutionManifestSource` and `given/when/then` titles. Assert inner `contentHash` is 64 hex without `sha256:`. Changing `tsconfig.json`, `jsconfig.json`, `setup.cfg`, `setup.py`, or `go.work` leaves the digest unchanged.
      Infrastructure test uses `os.tmpdir()` for the node adapter.
      Indexer test: newline-only manifest keeps `fullRebuildReason` null.
      Staleness test: edited manifest is a derivation mismatch and VCS freshness stays fresh.
      Stats test: text output contains the new warning.
      `packages/cli/test/commands/graph-stats.spec.ts` only updates call arity for `source`.
      (Req: Adapter-sourced resolution fingerprint, Graph derivation freshness, Staleness in graph stats output)
