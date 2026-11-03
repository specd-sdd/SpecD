# Proposal: cross-platform-guide-bundler

## Motivation

GitHub Actions CI workflows on Windows fail during `@specd/guide` tests because TypeDoc treats entrypoint paths as glob patterns and rejects Windows backslashes (`\`), causing TypeDoc to skip API reflection generation entirely. Furthermore, all guide topic identifiers, source paths, and catalog keys must be deterministically normalized to POSIX format across all operating systems to guarantee platform-independent catalog emission.

## Current behaviour

Today, `packages/guide/scripts/sdk-api-generator.ts` resolves entrypoint paths using `path.resolve(appRoot, entryPoint.entryPoint)` and passes the native platform path directly to TypeDoc's `entryPoints` configuration array.

On Windows runners (`windows-latest`):

- `path.resolve` outputs Windows-style backslashes (e.g. `D:\a\SpecD\SpecD\packages\sdk\src\index.ts`).
- TypeDoc's internal glob parser interprets backslashes as escape characters for non-special characters and emits an error:
  `[error] The glob "..." escapes a non-special character. Glob inputs to TypeDoc may not use Windows path separators (\), try replacing with posix path separators (/)`
- TypeDoc warns that no entry points were provided and exits without generating any TypeScript symbol reflections.
- `bundle-guides.ts` completes but writes a `generated/guides-sdk.json` file missing all reflection-backed API topics (0 generated topics).
- In Vitest, 6 integration tests in `packages/guide/test/integration/sdk-catalog.spec.ts` fail due to missing topics (e.g. `Guide topic 'sdk:interfaces/Kernel' not found`), unexpected pagination counts, and missing withheld counts.

### Second, latent Windows defect (not visible in the CI log)

Fixing the glob error alone is not sufficient. Once TypeDoc receives valid entry points, the workspace-membership checks would still be wrong on Windows:

- TypeScript and TypeDoc report `reflection.sources[0].fullFileName` with forward slashes, even on Windows.
- `packageRoot` (derived from `path.resolve` / `path.dirname`) and the workspace package roots are native (`D:\a\...`), and the prefix is built with `path.sep`.
- `isDeclaredInWorkspace` (`sdk-api-generator.ts`) and `buildTopicNameIndex` therefore evaluate `fullFileName.startsWith(`${root}\`)`against a`/`-separated string and return `false` for every symbol. Members are wrongly filtered out and every symbol is treated as re-exported rather than declared, which can still break topic counts, name resolution and pagination assertions.
- `resolveSourcePath` returns the raw `fullFileName` when the declaration lies outside the repository (or on another drive). That value is absolute and may contain backslashes, so `sourcePath` is neither POSIX nor deterministic across operating systems.

## Proposed solution

1. **TypeDoc Entry Point POSIX Normalization**:
   In `packages/guide/scripts/sdk-api-generator.ts`, normalize resolved entrypoint paths to POSIX format (replacing `\` with `/`) before passing them to TypeDoc's `Application.bootstrapWithPlugins`.
2. **Separator-independent workspace membership**:
   Compare declaration paths against package roots after normalizing both sides to POSIX, through a pure, string-based helper (e.g. `isPathInside(root, file)`) used by `isDeclaredInWorkspace` and `buildTopicNameIndex`. Being pure, it can be unit-tested with Windows-style inputs on any host OS.
3. **Deterministic Cross-Platform Topic and Path Normalization**:
   Ensure all topic identifiers (`topic`), source declaration paths (`sourcePath`, including the out-of-repository fallback in `resolveSourcePath`), and collection references across `packages/guide/scripts/` consistently format path segments with forward slashes (`/`), independent of host OS path separators.
4. **Spec Updates in `guide:bundle-guides`**:
   Update `specs/guide/bundle-guides.spec.md` with explicit requirements and scenarios covering cross-platform TypeDoc invocation, separator-independent classification of symbols as declared in the workspace, and deterministic POSIX normalization of generated topic identifiers and source paths.

## Specs affected

### New specs

None.

### Modified specs

- `guide:bundle-guides`: Add cross-platform normalization requirements and scenarios for TypeDoc entrypoints, separator-independent workspace-membership classification, and generated guide topic identifiers and source paths.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- **Code Areas**:
  - `packages/guide/scripts/sdk-api-generator.ts`: Normalize `entryPath` passed to TypeDoc; replace the `path.sep`-based prefix checks in `isDeclaredInWorkspace` and `buildTopicNameIndex` with a POSIX-normalized pure helper; normalize the out-of-repository fallback of `resolveSourcePath`.
  - `packages/guide/scripts/guide-bundler.ts`: Export `toPosixPath` and make `compileGuide` enforce POSIX separators for topic identifiers and source paths. `bundle-guides.ts` was audited and needs no change.
- **Testing**:
  - `packages/guide/test/integration/sdk-catalog.spec.ts`: Existing integration tests are expected to pass on Windows runners as they already do on Ubuntu and macOS; this is confirmed by the `windows-latest` CI job, since Windows behaviour cannot be reproduced locally.
  - Unit tests in `packages/guide/test/unit/scripts/` covering `toPosixPath`, the workspace-membership helper and the `resolveSourcePath` fallback with simulated Windows path inputs (mixed separators, drive letters, out-of-repo paths).
- **Specifications**:
  - `specs/guide/bundle-guides.spec.md`: Delta update declaring cross-platform requirements.

## Technical context

- **Root Cause Verified via CI Logs**: GitHub Actions run `37911028819`, job `113755937415` failed exclusively on `windows-latest`. The job passed on `ubuntu-latest` (ID `113755937235`) and `macos-latest` (ID `113755937305`).
- **TypeDoc Constraint**: TypeDoc's entrypoint resolution mechanism treats string entries as file globs. Backslashes are treated as escape characters, making native Windows paths invalid as glob inputs. Converting paths using `.split(path.sep).join('/')` or `.replace(/\\/g, '/')` satisfies TypeDoc on all platforms.
- **Path Separator Mismatch**: TypeScript normalizes file names to `/` internally on every platform, whereas Node `path` functions yield native separators. Any string comparison between the two must normalize both sides first.
- **Audited and unaffected**: CRLF handling (regexes accept `\r?\n`, `.gitattributes` enforces `eol=lf`, Prettier defaults to `lf`), the `import.meta.url` main guard in `bundle-guides.ts`, and `fs.globSync` with `/` globs on Windows.
- **User Directive**: Any generated topic names and paths must be normalized on all systems, and this must be formally specified in the specs.

## Edge cases to cover

- **Prefix boundary**: `packages/sdk` must not match `packages/sdk-extra/...`. The membership helper appends exactly one `/` to the root (root already ending in `/`, e.g. `C:/`, must not produce `//`) and also accepts the root itself.
- **Drive-letter casing**: Windows is case-insensitive, so `d:/a/...` and `D:/a/...` can both appear (tsconfig-derived vs. `path.resolve`-derived). When both sides start with a drive letter, the comparison is case-insensitive; POSIX paths stay case-sensitive.
- **UNC and extended paths**: `\\server\share\...` becomes `//server/share/...`; the helper must not collapse the leading `//` or treat it as a relative path.
- **Mixed and repeated separators**: `C:/repo\packages//sdk` normalizes to a single canonical form; `toPosixPath` is idempotent and returns `''` for `''`.
- **Backslash in POSIX filenames**: a legal Linux/macOS filename containing `\` would silently become a subdirectory after normalization. `compileGuide` accepts platform-native relative paths and normalizes them; this limitation is documented rather than rejected.
- **`resolveSourcePath` parent check**: `relative.startsWith('..')` also matches a directory literally named `..foo`. The check becomes `relative === '..'` or `relative.startsWith('../')` on the POSIX-normalized value. A different drive on Windows makes `path.relative` return an absolute path, which still takes the (now POSIX-normalized) fallback.
- **Out-of-repository fallback**: the fallback value is machine-specific (absolute) and cannot be fully deterministic across hosts; it is only normalized to `/`, not rewritten. In practice dependencies resolve inside the repository (`node_modules`), so the fallback is rare.
- **Symbols without a declaration** (`sources` undefined): `isDeclaredInWorkspace` keeps returning `true`; behaviour unchanged.
- **Sort stability**: `collectMarkdownFiles` ends with a plain `results.sort()` over native paths, where `\` (0x5C) and `/` (0x2F) order differently against characters such as `0`. The final topic order is still fixed by `compileCollections`' `order` + `localeCompare`, but the intermediate sort is made over POSIX-relative paths so no ordering depends on the host.
- **Glob metacharacters in the repository path** (`[`, `]`, `{`, `}`, `*`, `?`, `!`): TypeDoc treats entry points as globs, so such a checkout path fails on every OS, not only Windows. Pre-existing and out of scope; noted as a known limitation.
- **Not reproducible locally**: Windows-only behaviour (TypeDoc glob handling of `D:/...`, `fs.globSync` results) cannot be exercised on macOS/Linux. Unit tests cover the pure string helpers with Windows-style inputs; end-to-end confirmation is the `windows-latest` CI job.

## Open questions

None.
