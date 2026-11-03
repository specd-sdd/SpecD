# Tasks: cross-platform-guide-bundler

## 1. Path helpers

- [x] 1.1 Add and export `toPosixPath`
      `packages/guide/scripts/guide-bundler.ts`: `toPosixPath` — new exported function with full JSDoc
      Approach: `return filePath.replace(/\\/g, '/')`; idempotent, `''` → `''` (design: New constructs)
      (Req: Build-Time Compilation Script — POSIX topics and source paths)
- [x] 1.2 Add and export `isPathInside`
      `packages/guide/scripts/guide-bundler.ts`: `isPathInside(root, file)` — pure, separator-independent containment check with full JSDoc
      Approach: normalize both with `toPosixPath`, collapse repeated `/` keeping a leading `//` (UNC), trim trailing `/`, lowercase both only when both start with a drive letter, guard `r === ''`, match `f === r || f.startsWith(r + '/')` without producing `//` for a drive root
      (Req: Build-Time Compilation Script — workspace membership independent of separator)

## 2. Guide bundler normalization

- [x] 2.1 Normalize `relativePath` in `compileGuide`
      `packages/guide/scripts/guide-bundler.ts`: `compileGuide` — compute `posixRelativePath = toPosixPath(relativePath)` first and derive `topic`, `sourcePath` and the `':'` error message from it
      Approach: signature unchanged; POSIX inputs returned unchanged
      (Req: Build-Time Compilation Script — POSIX topics and source paths)
- [x] 2.2 Make intermediate file ordering host-independent
      `packages/guide/scripts/guide-bundler.ts`: `collectMarkdownFiles` — replace the trailing `results.sort()`
      Approach: sort by `toPosixPath(path.relative(root, file))` using code-unit comparison `(x < y ? -1 : x > y ? 1 : 0)`; still return native absolute paths
      (Req: Build-Time Compilation Script — host-independent ordering)
- [x] 2.3 Use `toPosixPath` in `compileCollections`
      `packages/guide/scripts/guide-bundler.ts`: `compileCollections` — replace `.split(path.sep).join('/')` with `toPosixPath(path.relative(config.root, file))`
      Approach: single normalization rule shared with `compileGuide`
      (Req: Build-Time Compilation Script — POSIX topics and source paths)

## 3. SDK API generator normalization

- [x] 3.1 Import helpers into the generator
      `packages/guide/scripts/sdk-api-generator.ts`: imports — add `toPosixPath` and `isPathInside` to the existing `./guide-bundler.js` import
      Approach: extend the existing `import { extractSections } from './guide-bundler.js'`
      (Req: Build-Time Compilation Script)
- [x] 3.2 Pass POSIX entry points to TypeDoc
      `packages/guide/scripts/sdk-api-generator.ts`: `generateSdkApiTopics` — change `entryPoints: [entryPath]` to `entryPoints: [toPosixPath(entryPath)]`
      Approach: keep `entryPath` and `packageRoot` native (needed by `path.dirname`); normalize only at the TypeDoc call
      (Req: Build-Time Compilation Script — TypeDoc entrypoints normalized to POSIX)
- [x] 3.3 Use `isPathInside` in `isDeclaredInWorkspace`
      `packages/guide/scripts/sdk-api-generator.ts`: `isDeclaredInWorkspace` — replace `startsWith(`${root}${path.sep}`)` with `isPathInside(root, fullFileName)`
      Approach: keep `fullFileName === undefined` → `true`
      (Req: Build-Time Compilation Script — workspace membership independent of separator)
- [x] 3.4 Use `isPathInside` in `buildTopicNameIndex`
      `packages/guide/scripts/sdk-api-generator.ts`: `buildTopicNameIndex` — remove `prefix` and compute `declared: fullFileName !== undefined && isPathInside(packageRoot, fullFileName)`
      Approach: also removes the now-unused `path.sep` usage on this path
      (Req: Build-Time Compilation Script — workspace membership independent of separator)
- [x] 3.5 Export and harden `resolveSourcePath`
      `packages/guide/scripts/sdk-api-generator.ts`: `resolveSourcePath` — add `export`; normalize `relative` with `toPosixPath`; out-of-repo test `relative === '..' || relative.startsWith('../') || path.isAbsolute(relative) || /^[A-Za-z]:\//.test(relative)`; fallback returns `toPosixPath(fullFileName)`
      Approach: as in design.md "Affected areas"; fixes the `..foo` false positive and backslashes in the fallback
      (Req: Build-Time Compilation Script — source path outside the repository normalized)

## 4. Tests

- [x] 4.1 Unit tests for `toPosixPath`
      `packages/guide/test/unit/scripts/path-normalization.spec.ts`: `describe('toPosixPath')` — Windows path, mixed separators, POSIX unchanged, empty string, idempotency
      Approach: Given/When/Then style, no snapshots; `C:\\path\\to\\file.ts` → `C:/path/to/file.ts`
      (Req: Build-Time Compilation Script; scenario: topic identifiers and source paths use POSIX)
- [x] 4.2 Unit tests for `isPathInside`
      `packages/guide/test/unit/scripts/path-normalization.spec.ts`: `describe('isPathInside')` — forward-slash file vs backslash root, backslash file, drive-letter case, sibling prefix (`packages/sdk` vs `packages/sdk-extra`), root equals file, drive root `C:/`, UNC, POSIX case-sensitivity, empty root
      Approach: pure string inputs, runs identically on every host
      (Req: scenarios: membership independent of separator; sibling prefix is not a member)
- [x] 4.3 Unit tests for `resolveSourcePath`
      `packages/guide/test/unit/scripts/path-normalization.spec.ts`: `describe('resolveSourcePath')` — in-repo path → repo-relative POSIX; Windows-style out-of-repo path → no backslashes; directory named `..foo` treated as in-repo
      Approach: pass minimal `FlatReflection`-shaped objects with `sources[0].fullFileName`
      (Req: scenario: source path outside the repository is normalized)
- [x] 4.4 Unit test for `compileGuide` with a backslash path
      `packages/guide/test/unit/scripts/path-normalization.spec.ts`: `describe('compileGuide')` — `relativePath = 'examples\\Implementing-A-Port.md'` gives `topic === 'examples/implementing-a-port'` and `sourcePath === 'examples/Implementing-A-Port.md'`
      Approach: minimal frontmatter fixture with required `title`, `description`, `sidebar_position`
      (Req: scenarios: nested subdirectories traversed recursively; topics and source paths use POSIX)
- [x] 4.5 Assert no backslashes in emitted catalogs
      `packages/guide/test/integration/sdk-catalog.spec.ts`: add a test checking every topic's `topic` and `sourcePath` in both catalogs contain no `\`
      Approach: iterate the loaded catalogs and `expect(value).not.toContain('\\')`
      (Req: scenario: emitted topic identifiers and source paths strictly use POSIX forward slashes)

## 5. Verification

- [x] 5.1 Build the package
      `packages/guide`: run `pnpm --filter @specd/guide build`
      Approach: expect exit 0, populated `generated/guides-sdk.json`, no TypeDoc glob-escape message
      (Req: Build-Time Compilation Script)
- [x] 5.2 Run the package tests
      `packages/guide`: run `pnpm --filter @specd/guide test`
      Approach: all unit and integration tests pass (do not rely on a fixed test count)
      (Req: Build-Time Compilation Script)
- [x] 5.3 Lint and typecheck the package
      `packages/guide`: run `pnpm --filter @specd/guide lint` and `pnpm --filter @specd/guide typecheck`
      Approach: new exports need full JSDoc and explicit return types per `default:_global/eslint`
      (Req: Build-Time Compilation Script)
