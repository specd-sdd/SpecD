# Graph Path Identity

## Purpose

Graph identities and relation targets are forward-slash portable, but language adapters and explain paths often resolve against real filesystem paths that use Windows separators, drive letters, or UNC shares. Without a shared resolve contract, `path.resolve` strings miss portable keys and Windows CI diverges from POSIX hosts. This spec defines the portable path helpers that every code-graph consumer MUST use when a filesystem resolve becomes a graph key or identity.

## Requirements

### Requirement: Portable separator normalization

`toPortableGraphPath(value)` SHALL replace every `\` with `/` without collapsing `.` or `..` segments. Callers that store or compare graph file identities, relation targets, or explain `projectRelativePath` fragments derived from filesystem strings MUST apply this normalization (directly or via `resolveGraphPath`) before those comparisons.

### Requirement: Absolute and UNC detection

The helpers SHALL expose:

- `isDriveLetterPath(value)` — true for `C:`, `C:/...`, and `C:\...` forms
- `isUncPath(value)` — true for `\\server\share...` and portable `//server/share...`
- `isAbsoluteGraphFilesystemPath(value)` — true for UNC, drive-letter, drive-root `\foo`, POSIX `/...`, and backslash-shaped win32 absolute paths

Workspace identities such as `core:src/a.ts` MUST NOT be treated as absolute filesystem paths. Drive-letter paths MUST NOT be parsed as `workspace:path`.

### Requirement: resolveGraphPath

`resolveGraphPath(fromFile, target)` SHALL resolve `target` relative to `fromFile` and return a portable `/`-separated path suitable as a graph file identity or absolute filesystem key:

- When `fromFile` is a `workspace:relative` identity, the workspace prefix SHALL be preserved on the result.
- Absolute filesystem bases (POSIX `/...`, Windows drive letters, UNC) SHALL be resolved with win32 path rules for drive-letter, UNC, and backslash-shaped bases, and with posix rules otherwise, then normalized to `/`. POSIX `resolve` MUST NOT be used alone on UNC bases, because it collapses `//server/...`.
- Absolute targets (POSIX, drive-letter, UNC, or `\foo`) SHALL be returned as portable absolutes without joining against `fromFile`.
- An empty `target` SHALL resolve to the directory of `fromFile` (portable).
- Relative workspace-prefixed resolution SHALL use posix segment joins after portable-normalizing both sides so `\` in either argument is treated as a separator.

Any filesystem `path.resolve` (or equivalent) whose result is used as a graph key, relation target, or indexed-file lookup key MUST go through `resolveGraphPath` or an equivalent that guarantees the same portable output.

## Constraints

- These helpers are pure string/path computation in the code-graph domain; they MUST NOT perform I/O.
- Native OS path strings MAY remain for real filesystem I/O; only values that enter the graph identity space MUST be portable.

## Spec Dependencies

- [`code-graph:symbol-model`](../symbol-model/spec.md) — forward-slash-normalized file and symbol path identities that these helpers uphold
