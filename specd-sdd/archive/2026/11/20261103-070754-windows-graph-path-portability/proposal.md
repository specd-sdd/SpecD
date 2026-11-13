# Proposal: windows-graph-path-portability

## Motivation

Windows CI fails `@specd/code-graph` tests that pass on Ubuntu and macOS because filesystem resolves emit `\` (or deep `../` walks for drive letters) while graph identities and `createSymbolNode` keys are forward-slash portable. Fixing path portability unblocks main and prevents silent empty IMPORTS on Windows hosts.

## Current behaviour

- PHP `require`/`include` resolution on absolute FS paths uses `path.resolve`, producing Windows separators that miss portable `getFileId` keys → empty IMPORTS in CI.
- `ExplainGraphPath` on win32 converts an outside drive path such as `C:\other\a.ts` via `relative(projectRoot, …)`, yielding deep `../../../../other/a.ts` when the project shares the same volume (typical temp fixtures), instead of the portable absolute `C:/other/a.ts` already used on POSIX.
- Relative import helpers in TypeScript/Python/PHP split on `/` only, so latent `\` inputs mis-resolve.
- The unreadable-file hashing test relies on `chmod(0o000)`, which is a no-op on Windows (and as root), so that scenario is not exercised there.

## Proposed solution

Introduce shared domain helpers beside the existing `toPortableGraphPath` / `splitWorkspaceIdentity` surface:

- `resolveGraphPath(fromFile, target)` — workspace-aware resolve that always returns `/`-separated paths; uses win32 rules for drive-letter, UNC, and backslash-shaped bases so `//server/...` is not collapsed by posix `resolve`.
- `isUncPath` / `isAbsoluteGraphFilesystemPath` — shared absolute/UNC detection for adapters.

Adopt them at PHP require/include and Cake/CI absolute candidate sites; portableize Composer PSR-4 absolute dirs used as graph-adjacent keys; normalize relative-import inputs in PHP/TS/Python; keep drive-letter outsides as portable absolutes in `ExplainGraphPath` on every host; keep `chmod` unreadability as a Unix-only test (platform noop), matching existing size-limit precedent.

Code for this approach is already implemented in the fast-track session; this change formalizes the contracts and remaining adoption/regression tasks.

## Specs affected

### New specs

- `code-graph:graph-path-identity`: Normative contract for portable graph filesystem paths — `toPortableGraphPath`, `resolveGraphPath`, drive-letter / UNC / absolute detection, and the rule that any FS resolve used as a graph key MUST be portable `/` form.
  - Depends on: `code-graph:symbol-model`

### Modified specs

- `code-graph:php-language-adapter`: Require/include and absolute Cake/CI candidates MUST resolve via portable graph paths so IMPORTS match indexed file identities; Composer-prepared absolute dirs stored for resolution MUST be portable.
  - Depends on (added): `code-graph:graph-path-identity`
  - Depends on (removed): none

- `code-graph:explain-graph-path`: Drive-letter inputs outside the project MUST report portable absolute spelling (`C:/...`) on every host, including Windows same-volume temp projects; non-drive absolute outsides keep the existing `../` form.
  - Depends on (added): `code-graph:graph-path-identity`
  - Depends on (removed): none

- `code-graph:typescript-language-adapter`: Relative import path resolution MUST treat `\` as a separator (portable normalize) before segment walks.
  - Depends on (added): `code-graph:graph-path-identity`
  - Depends on (removed): none

- `code-graph:python-language-adapter`: Relative import path resolution MUST treat `\` as a separator (portable normalize) before segment walks.
  - Depends on (added): `code-graph:graph-path-identity`
  - Depends on (removed): none

## Impact

Minimum touch set (tracked in fast-track implementation links):

- `packages/code-graph/src/domain/services/split-workspace-identity.ts` — `resolveGraphPath`, `isUncPath`, `isAbsoluteGraphFilesystemPath`, existing `toPortableGraphPath`
- `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts` — require/include, Cake/CI candidates, Composer portable abs dirs
- `packages/code-graph/src/application/use-cases/explain-graph-path.ts` — drive-letter outside-project spelling
- `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts` / `python-language-adapter.ts` — relative import normalize
- Tests: domain path matrix; PHP require drive/UNC cases; failed-targets `skipIf(win32||root)` for chmod only

Blast radius: `split-workspace-identity` and PHP adapter are high/CRITICAL coupling hubs (hotspots / many dependents). Changes are separator-normalizing and should be behaviour-preserving on POSIX workspace-prefixed paths; regression focus is Windows CI, UNC, and drive-letter explain diagnostics. No public CLI/SDK API shape change beyond diagnostic path strings for drive outsides on Windows.

## Technical context

- Agreed approach: shared helper + call-site adoption (not test-only skips for path identity; not a monorepo-wide path framework).
- Graph keys and `createSymbolNode` already force `/`; the bug is emitting native FS strings into that key space.
- POSIX `path.resolve` on `//server/share/...` collapses UNC to `/server/...`; win32 resolve preserves the share — hence UNC-aware API selection in `resolveGraphPath`.
- `ExplainGraphPath` contract tension: general absolute-outside → `../` vs drive-letter absolute spelling; resolved by keeping portable absolute for drive-letter outsides on all hosts (aligns with existing POSIX foreign-drive behaviour).
- `chmod(0o000)` skip on Windows is a platform noop only; ESM prevents spying `readFileSync` for an injected hash failure.
- Rejected: masking path bugs with `skipIf(win32)`; building a large shared path abstraction beyond these helpers.

## Open questions

None — dedicated `code-graph:graph-path-identity` is the agreed home for the shared helper contract; adapter/explain specs depend on it rather than duplicating path rules.
