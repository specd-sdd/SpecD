# Proposal: adapter-sourced-resolution-fingerprint

## Motivation

Graph derivation fingerprints hash resolution manifests from a hardcoded list that is not owned by the language adapters that parse those files. A CRLF checkout of an unchanged manifest changes the digest and reports the graph stale, because those hashes use raw bytes instead of the newline-normalized text the adapters read.

## Current behaviour

`discoverResolutionInputs` in `packages/code-graph/src/application/use-cases/_shared/compute-graph-fingerprint.ts` lists files directly under the project root and each workspace `codeRoot`. It keeps names in `RESOLUTION_MANIFESTS` (`package.json`, `pyproject.toml`, `setup.cfg`, `setup.py`, `go.mod`, `go.work`, `composer.json`) plus `tsconfig*.json` and `jsconfig*.json`, then hashes each file with `readFileSync` and SHA-256 of the raw bytes.

`computeGraphFingerprint`, `computeWorkspaceFingerprint`, and `computeRootFingerprint` all include those hashes. Source-file incremental hashes already go through `NodeContentHasher` (`packages/core/src/infrastructure/node/content-hasher.ts`), which normalizes newlines. Manifest hashes do not.

Adapters read manifests as UTF-8 text through `findManifestField` (`packages/code-graph/src/infrastructure/tree-sitter/find-manifest-field.ts`), walking upward from `codeRoot` and stopping at the repository root:

- TypeScript: `package.json` (`name`)
- PHP: `composer.json` (package name and PSR-4 map) via `PhpLanguageAdapter.getPackageIdentity`
- Go: `go.mod` (module path)
- Python: `pyproject.toml` (project name)

`tsconfig*.json`, `jsconfig*.json`, `setup.cfg`, `setup.py`, and `go.work` are fingerprinted and no adapter reads them. Adding a language requires a second list in the fingerprint module, so the two can drift. This repository's `.gitattributes` does not apply to projects SpecD indexes.

`code-graph:staleness-detection` and `code-graph:indexer` describe the derivation fingerprint as the code-graph version plus resolved workspace and discovery configuration. Resolution-manifest hashing is implemented but not specified as adapter-owned, newline-normalized input.

## Proposed solution

`LanguageAdapter` gains a required, I/O-free method:

```ts
resolutionManifests(): readonly string[]
```

It returns exact basenames, not globs. Built-in adapters return:

| Adapter    | Return value         |
| ---------- | -------------------- |
| TypeScript | `['package.json']`   |
| Go         | `['go.mod']`         |
| PHP        | `['composer.json']`  |
| Python     | `['pyproject.toml']` |

`discoverResolutionInputs` drops `RESOLUTION_MANIFESTS` and the `tsconfig*` / `jsconfig*` pattern. It asks the registered adapters for basenames, then locates files with the same walk as `findManifestField`: start at the workspace `codeRoot`, walk parents, stop at the repository root, and keep every existing file whose basename was declared. It does not list a second hardcoded directory set.

Each kept file is read as UTF-8. The digest is SHA-256 hex of `normalizeNewlines(content)` (`packages/core/src/domain/services/normalize-newlines.ts`), the same normalization `NodeContentHasher` applies. The fingerprint field stays bare hex, without the `sha256:` prefix `NodeContentHasher.hash` adds. CRLF and LF of the same manifest produce the same digest.

`tsconfig*.json`, `jsconfig*.json`, `setup.cfg`, `setup.py`, and `go.work` are not declared, so they leave the fingerprint.

Existing graphs mismatch and rebuild on the next index through the current derivation-mismatch path.

Verification of that behaviour found gaps the specs and the implementation must close together:

- Python package identity reads the `name` field of the `[project]` table in `pyproject.toml`, including single-quoted strings. A `name` in an earlier table, such as `[tool.poetry]`, is not the package identity.
- Derivation-mismatch diagnostics (full-rebuild reason and graph-stats warning) name resolution-manifest content alongside code-graph version and workspace configuration. The visible sentence and the verification scenario use the same wording.
- Newline normalization is the shared `normalizeNewlines` function from `@specd/core`. Specs describe that behaviour. They do not require a private helper name inside the fingerprint module.
- The application fingerprint helper does not import `node:fs`. It reads manifest existence and text through an application port. An infrastructure adapter implements that port with the filesystem. Application unit tests mock the port. Filesystem cases live in infrastructure tests, and behaviour titles use `given …, when …, then …`. Newline normalization stays a private function with the same replacements as `@specd/core`'s unexported `normalizeNewlines`.
- Tests assert the inner manifest digest (SHA-256 hex of newline-normalized UTF-8 text, no `sha256:` prefix), ignore every undeclared basename (`tsconfig.json`, `jsconfig.json`, `setup.cfg`, `setup.py`, `go.work`), keep a newline-only change on the incremental index path, and keep VCS freshness fresh when only a declared manifest's text changes.

## Specs affected

### New specs

None.

### Modified specs

- `code-graph:language-adapter`: `LanguageAdapter.resolutionManifests()` is required and returns exact basenames. The default TypeScript adapter returns `package.json`. Python package identity is the `[project].name` field only. There is no separate TypeScript adapter spec.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:go-language-adapter`: the Go adapter declares `go.mod` as its resolution manifest.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:php-language-adapter`: the PHP adapter declares `composer.json` as its resolution manifest.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:python-language-adapter`: the Python adapter declares `pyproject.toml` as its resolution manifest.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:indexer`: indexing fingerprints resolution inputs from registered adapters and hashes them as newline-normalized text, using the same files the adapters read. Manifest bytes are read through an application port. A newline-only change stays incremental. The full-rebuild reason names resolution-manifest content.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:staleness-detection`: derivation freshness includes those adapter-sourced resolution-manifest hashes, distinct from VCS freshness. The stats warning names resolution-manifest content. An edited manifest is a derivation mismatch while VCS freshness stays fresh.
  - Depends on (added): `code-graph:language-adapter`
  - Depends on (removed): none

## Impact

`specd graph impact` on `code-graph:src/application/use-cases/_shared/compute-graph-fingerprint.ts` (dependents) is **CRITICAL** (27 direct dependents, 329 transitive). Callers include indexing (`index-code-graph.ts`), graph health, composition, and fingerprint test helpers. The fingerprint value changes for projects that have the dropped manifests or CRLF manifests; consumers already treat a mismatch as a full rebuild. The visible mismatch sentence gains resolution-manifest content. That is a diagnostic string change, not a new public field.

Touch:

- `packages/code-graph/src/domain/value-objects/language-adapter.ts` — required `resolutionManifests(): readonly string[]` (no filesystem I/O in the domain)
- `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`
- `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`
- `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`
- `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`
- `packages/code-graph/src/application/use-cases/_shared/compute-graph-fingerprint.ts` — remove `RESOLUTION_MANIFESTS` and raw-byte hashing; walk `codeRoot` to the repository root using adapter basenames; hash with `normalizeNewlines` from `@specd/core`; accept a manifest-source port instead of importing `node:fs`
- `packages/code-graph/src/application/ports/` — port for manifest existence and UTF-8 reads
- `packages/code-graph/src/infrastructure/` — filesystem adapter for that port
- `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts` — `[project].name` only
- Tests: application tests mock the port; infrastructure tests cover the filesystem walk; staleness and indexer tests cover inner digests, undeclared basenames, newline-only incremental indexing, and VCS freshness
- `packages/cli/test/commands/graph-stats.spec.ts` — call-site arity only, outside these specs

`findManifestField` stays the shared text reader. Do not add a parallel manifest list in the fingerprint module.

## Technical context

Issue https://github.com/specd-sdd/SpecD/issues/64 is the source of the behaviour. Confirmed direction:

- Manifest membership comes from `resolutionManifests()`, not from a list in the fingerprint module.
- Hash newline-normalized text with the same CRLF and lone-CR replacements as `normalizeNewlines` in `@specd/core`. Do not import that symbol: it is not on the public barrel. Do not use raw bytes, the `sha256:` prefix, or `.gitattributes` on the indexed project.
- Drop manifests no adapter returns: `tsconfig*`, `jsconfig*`, `setup.cfg`, `setup.py`, `go.work`.
- Discovery walks from `codeRoot` to the repository root, inclusive, and keeps every existing declared basename on that walk. A parent manifest that can replace a nearer one stays in the digest. Files off that walk do not.
- Overlapping designing changes `code-graph-symbol-semantic-context` and `language-agnostic-member-symbol-references` also target `code-graph:indexer` and `code-graph:language-adapter`. Deltas here stay limited to resolution-manifest fingerprinting, Python `[project].name`, mismatch diagnostics, and the manifest-source port.
- Compliance review (2026-09-25) is the source of the follow-up: Python identity, diagnostic copy, port boundary, and test evidence. The user asked to fix all of those findings.

## Open questions

None.
