# Proposal: implementation-snapshot

## Motivation

When AI agents modify code as part of a specd change, there is no safety net to restore the working tree if the agent corrupts or destroys files. Additionally, the current implementation tracking auto-detects all files modified since the VCS baseline — including files that were already dirty before the change entered `implementing` — producing false positives that require manual cleanup.

## Current behaviour

- `RefreshImplementationTracking` detects any file modified since the VCS baseline (timestamp when change entered `implementing`) and marks it as `open`. Files that were already dirty before the transition, unrelated to the change, are falsely detected.
- There is no persisted record of the working tree state at the moment a change enters `implementing`. If an AI agent corrupts files, the only recovery option is `git checkout` (which loses uncommitted work) or manual reconstruction.
- The `VcsAdapter` port can list modified files and retrieve file content at a revision, but has no capability to generate diffs or persist snapshots.
- The `Change` entity has no field to store a baseline snapshot of implementation file metadata.

## Proposed solution

Add two complementary features to implementation tracking:

### Part A: mtime+hash baseline filtering

On the first transition to `implementing`, capture `{mtime, hash}` for every modified and untracked file. The baseline is set once and never refreshed. During subsequent refresh runs:

1. `stat()` each candidate — if mtime matches baseline, skip
2. If mtime differs, compute `git hash-object` — if hash matches, update mtime in baseline (self-healing on `touch`/`checkout`) and skip
3. If hash differs, auto-track as a new implementation file

### Part B: working tree snapshot

On the first transition to `implementing`, capture the full working tree state to `history/implementation/<implementingSince>`. Text files are stored as unified diff in `snapshot.diff`. Binary files are copied as-is to `binaries/` with an index. A `ImplementationSnapshot` class provides `listFiles()`, `diffFor(file)`, `getFile(file)`, and `apply()` without loading the entire content into heap.

## Specs affected

### New specs

- `core:implementation-snapshot`: Infrastructure service (`ImplementationSnapshot` class) that owns the full snapshot lifecycle. Receives `VcsAdapter` in the constructor. `projectRoot` is passed as parameter to `write()` and `apply()` only — read methods (`listFiles`, `diffFor`, `getFile`) don't need it. Provides:
  - `write(path, baseRef?)` — captures working tree (diff via `VcsAdapter.diff()`, binary copies, file listing), writes `snapshot.json`, `snapshot.diff`, `binaries/`
  - `listFiles()` — reads `snapshot.json`
  - `diffFor(file)` — parses `snapshot.diff` for a specific file
  - `getFile(file)` — reconstructs content for text (base+diff) or reads raw binary
  - `apply()` — restores working tree (text diffs via `VcsAdapter`, binaries via file copy)
  - Depends on: `core:vcs-adapter`

- `core:get-implementation-snapshots`: Read-only use case. Follows the standard composition pattern:
  - `createGetImplementationSnapshots(deps: GetImplementationSnapshotsDeps)` — canonical
  - `createGetImplementationSnapshots(config: SpecdConfig, options?)` — config-based bootstrap
  - `resolveGetImplementationSnapshotsDeps(resolver)` — resolves `{ changes: ChangeRepository }`
  - Depends on: `core:change`, `core:composition-resolver`

- `core:take-implementation-snapshot`: Mutation use case. Standard composition pattern:
  - `createTakeImplementationSnapshot(deps: TakeImplementationSnapshotDeps)` — canonical
  - `createTakeImplementationSnapshot(config: SpecdConfig, options?)` — config-based bootstrap
  - `resolveTakeImplementationSnapshotDeps(resolver)` — resolves `{ changes: ChangeRepository, implSnapshotFactory: (vcs) => ImplementationSnapshot }`
  - Depends on: `core:change`, `core:implementation-snapshot`, `core:composition-resolver`

- `core:show-implementation-snapshot`: Read-only use case. Metadata-only (timestamp, baselineRef, fileCount). With `files` option returns file listing with line stats. No file content or diff. Standard composition pattern:
  - Depends on: `core:change`, `core:implementation-snapshot`, `core:composition-resolver`
  - Resolver resolves: `{ changes: ChangeRepository, implSnapshotFactory: (vcs) => ImplementationSnapshot }`

- `core:get-implementation-snapshot-file`: Read-only use case. Returns the full reconstructed file content (text or binary) or unified diff for a single file from a snapshot. Standard composition pattern:
  - `createGetImplementationSnapshotFile(deps: GetImplementationSnapshotFileDeps)` — canonical
  - `createGetImplementationSnapshotFile(config: SpecdConfig, options?)` — config-based bootstrap
  - `resolveGetImplementationSnapshotFileDeps(resolver)` — resolves `{ changes: ChangeRepository, implSnapshotFactory: (vcs) => ImplementationSnapshot }`
  - Depends on: `core:change`, `core:implementation-snapshot`, `core:composition-resolver`

- `core:restore-implementation-snapshot`: Mutation use case. Standard composition pattern:
  - `createRestoreImplementationSnapshot(deps: RestoreImplementationSnapshotDeps)` — canonical
  - `createRestoreImplementationSnapshot(config: SpecdConfig, options?)` — config-based bootstrap
  - `resolveRestoreImplementationSnapshotDeps(resolver)` — resolves `{ changes: ChangeRepository, implSnapshotFactory: (vcs) => ImplementationSnapshot }`
  - Depends on: `core:change`, `core:implementation-snapshot`, `core:composition-resolver`

### Modified specs

- `core:change`: Add `_implementingSince` (Date) and `_implementationBaseline` (mtime+hash map) fields to the Change entity, with serialization in manifest.json. `_implementingSince` replaces the history-scan in `getHistoricalImplementationAt()`, which is refactored to return `_implementingSince` directly. The field is set on the first transition to `implementing` and never changed. The baseline snapshot directory is derived from `_implementingSince`. `baselineRef` (VCS revision at capture time) is stored as a metadata file inside the snapshot directory.
  - Depends on (added): none
  - Depends on (removed): none

- `core:vcs-adapter`: Add `diff(file, baseRef?)` method to the `VcsAdapter` port interface. Used by `ImplementationSnapshot` to generate per-file diffs.
  - Depends on (added): none
  - Depends on (removed): none

- `core:implementation-detector-port`: Add baseline detection options to the `ImplementationDetector` port.
  - Depends on (added): none
  - Depends on (removed): none

- `core:vcs-implementation-detector`: Integrate baseline capture for mtime+hash filtering.
  - Depends on (added): none
  - Depends on (removed): none

- `core:refresh-implementation-tracking`: Integrate mtime+hash baseline filtering into the refresh algorithm.
  - Depends on (added): none
  - Depends on (removed): none

- `core:update-implementation-tracking`: Add snapshot mutation support (take, list, restore).
  - Depends on (added): none
  - Depends on (removed): none

- `core:composition`: Wire the five new use cases (`GetImplementationSnapshots`, `TakeImplementationSnapshot`, `ShowImplementationSnapshot`, `GetImplementationSnapshotFile`, `RestoreImplementationSnapshot`) into the composition layer with factories and kernel mounting under `kernel.changes.*`.
  - Depends on (added): none
  - Depends on (removed): none

- `cli:change-implementation`: Add CLI commands for working with implementation snapshots.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- **@specd/core**: Change entity (~25 new lines: `_implementingSince`, `_implementationBaseline`), VcsAdapter port (1 new method: `diff`), VcsImplementationDetector (new baseline logic), RefreshImplementationTracking (new merge filter), UpdateImplementationTracking (new snapshot actions), new `ImplementationSnapshot` service (~250 lines).
- **@specd/cli**: New subcommand group under `specd changes implementation snapshot`.
- **Sidecar directory**: `changes/<name>/history/implementation/<timestamp>/` with `snapshot.json` (metadata + file listing), `snapshot.diff` (text diffs), and `binaries/` (binary file copies). The initial snapshot uses `_implementingSince` as its timestamp.
- **No external dependencies**: The `diff` npm package is available in CLI but not needed; the ImplementationSnapshot class uses raw streaming.
- **No breaking changes**: Existing fields (`trackedImplementationFiles`, `implementationLinks`) remain unchanged. Baseline is purely additive.

## Composition and Kernel

The new use cases follow the established pattern:

- Each use case has a **factory** in `@specd/core/src/composition/use-cases/` with `createX(config, options?)` and `resolveXDeps(resolver)` helpers.
- Each factory wires its deps through `CompositionResolver` and exposes canonical dependency-based construction plus config-based bootstrap.
- Factories are imported and wired in `@specd/core/src/composition/kernel.ts` under `kernel.changes`:
  - `kernel.changes.getImplementationSnapshots`
  - `kernel.changes.takeImplementationSnapshot`
  - `kernel.changes.showImplementationSnapshot`
  - `kernel.changes.getImplementationSnapshotFile`
  - `kernel.changes.restoreImplementationSnapshot`
- All use cases are **named exports only**, extend `SpecdError` for failures, and follow the immutable projection pattern for reads.
- Each use case has a dedicated spec file in `specs/core/<use-case-name>/`.

## Technical context

- The `VcsAdapter` port is injected via DI into `VcsImplementationDetector` — it does not know the concrete VCS backend (git, hg, svn, null).
- `diff()` returns per-file unified diff strings. `ImplementationSnapshot.write()` uses `diff()` to generate snapshot.diff and handles binary copies + snapshot.json internally.
- Baseline lives in the Change entity (`_implementationBaseline: Map<string, {mtime: number, hash: string}>`), serialized in manifest.json following the same pattern as `trackedImplementationFiles`.
- The snapshot is stored at `history/implementation/<timestamp>/`, managed by `FsChangeRepository`. The initial (automatic) snapshot uses `_implementingSince` as its timestamp; manual snapshots use their creation timestamp.
- Each snapshot directory contains a `snapshot.json` (metadata + file listing, written at creation time), `snapshot.diff` (unified diff for text files), and `binaries/` (binary file copies).
- `ImplementationSnapshot` reads `snapshot.json` for `listFiles()` — no diff parsing needed. `diffFor(file)` and `getFile(file)` still parse the diff or read binary files as needed.
- `snapshot.json` structure:
  ```json
  {
    "baselineRef": "abc1234",
    "isBaseline": true,
    "files": [
      { "path": "src/foo.ts", "type": "text", "addedLines": 12, "removedLines": 3 },
      { "path": "images/logo.png", "type": "binary", "stored": "logo-a1b2c3d4.png", "size": 24576 }
    ]
  }
  ```
- `ImplementationSnapshot.listFiles()` reads `snapshot.json` (written at creation time, no diff scanning). `diffFor(file)` parses `snapshot.diff` for the specific file. `getFile(file)` reconstructs content from base+diff for text, reads raw file for binary.
- Binary files are copied as `<name>-<sha256>.<ext>` to avoid collisions. Metadata is stored in `snapshot.json`.
- mtime+hash was chosen over pure mtime (false positives from `git checkout`, `touch`) and pure hash (stat fast-path is cheaper).
- The `diff` npm library is not used — raw streaming is simpler and more memory-efficient for this use case.

## Configuration

One new nested config block under the `history` umbrella:

```yaml
history:
  implementation:
    enabled: true # baseline + manual snapshots. false skips auto baseline but allows manual snapshots. mtime+hash always active. (default: true)
    cleanOnArchive: true # removes snapshot sidecar on archive (default: true)
```

This lives under `history.implementation.*` to leave room for future artifact history tracking.

## Open questions

None resolved. The following decisions were made during the proposal discussion:

1. **Baseline creation**: Automatic on first transition to `implementing`. Captures mtime+hash for tracking. The working tree snapshot (diff+binaries) is a separate operation controlled by `history.implementation.enabled`.
2. **Manual snapshots**: Via `specd changes implementation snapshots take <name>` (alias singular: `snapshot`). Each snapshot is stored in `history/implementation/<timestamp>/`.
3. **New core specs** (use cases):

   **`core:get-implementation-snapshots`** — Read-only use case.
   - Input: `changeName: string`
   - Output:
     ```ts
     {
       baseline: {
         baselineRef: string                // VCS revision when baseline was captured
          implementingSince: string         // ISO-8601 timestamp
          fileCount: number
        } | null
        snapshots: Array<{
          timestamp: string                   // ISO-8601, directory name under history/implementation/
          fileCount: number
        }>
      }
     ```

   **`core:take-implementation-snapshot`** — Mutation use case.
   - Input: `changeName: string`
   - Output: `{ timestamp: string, fileCount: number }`
   - Delegates to `ImplementationSnapshot.write()` to persist the snapshot to `history/implementation/<timestamp>/`. Does NOT update baseline.

   **`core:show-implementation-snapshot`** — Read-only use case. Metadata only; no file content or diff.
   - Input: `changeName: string, timestamp: string, options?: { files?: boolean }`
   - Output (default):
     ```ts
     {
       timestamp: string
       baselineRef: string
       fileCount: number
     }
     ```
   - When `options.files === true`, adds:
     ```ts
     files: Array<
       | { path: string; type: 'text'; addedLines: number; removedLines: number }
       | { path: string; type: 'binary'; stored: string; size: number }
     >
     ```
   - Delegates to `ImplementationSnapshot.listFiles()` (reads `snapshot.json`).

   **`core:get-implementation-snapshot-file`** — Read-only use case. Returns file content or diff from a snapshot.
   - Input: `changeName: string, timestamp: string, path: string, diff?: boolean`
   - When `diff` is `false` or omitted, returns the full reconstructed file content:
     ```ts
     { path: string, type: "text", content: string }
     | { path: string, type: "binary", content: Buffer, stored: string, size: number }
     ```
   - When `diff` is `true`, returns the unified diff (text) or binary metadata:
     ```ts
     { path: string, type: "text", diff: string }
     | { path: string, type: "binary", stored: string, size: number }
     ```
   - Delegates to `ImplementationSnapshot.getFile()` and `ImplementationSnapshot.diffFor()`. CLI/API layer serializes (e.g. base64 for binary in JSON).

   **`core:restore-implementation-snapshot`** — Mutation use case. Standard composition pattern:
   - `createRestoreImplementationSnapshot(deps: RestoreImplementationSnapshotDeps)` — canonical
   - `createRestoreImplementationSnapshot(config: SpecdConfig, options?)` — config-based bootstrap
   - `resolveRestoreImplementationSnapshotDeps(resolver)` — resolves `{ changes: ChangeRepository, implSnapshotFactory: (vcs) => ImplementationSnapshot }`
   - Input: `changeName: string, timestamp: string`
   - Output: `{ restoredFileCount: number }`
   - Delegates to `ImplementationSnapshot.apply()` to restore the working tree.

4. **CLI commands** (singular alias: `snapshot`). Each command defines its output format following the `cli:entrypoint` JSON/TOON schema requirement:

   **`snapshots <name>`** — Delegates to: `GetImplementationSnapshots`

   JSON/TOON output:

   ```ts
   {
      baseline: { baselineRef: string, implementingSince: string, fileCount: number } | null
      snapshots: Array<{ timestamp: string, fileCount: number }>
   }
   ```

   Text output:

   ```
   baseline:
     ref:            abc1234
     since:          2026-07-07T12:00:00Z
     files:          42

   manual snapshots: 2
     2026-07-07T14:00:00Z    12 files
     2026-07-07T15:30:00Z     8 files
   ```

   When baseline is `null`: `baseline: (none)`
   When empty (no baseline, no snapshots): `baseline: (none)` / `manual snapshots: (none)`

   **`snapshots restore <name> <timestamp>`** — Delegates to: `RestoreImplementationSnapshot`

   JSON/TOON output: `{ restoredFileCount: number }`

   Text output:

   ```
    snapshot restored: 2026-07-07T14:00:00Z
     files restored: 42
   ```

   **`snapshots show <name> <timestamp>`** — Delegates to: `ShowImplementationSnapshot`

   Flags `--files`, `--file`, and `--file-diff` are **mutually exclusive**. Specifying more than one is an error.

   JSON/TOON output:

   ```ts
   { timestamp: string, baselineRef: string, fileCount: number }
   ```

   Text output:

   ```
   snapshot:
     timestamp:      2026-07-07T14:00:00Z
     baselineRef:    abc1234
     files:          42
   ```

   With `--files`:
   - JSON/TOON adds: `files: Array<{ path: string, type: "text", addedLines: number, removedLines: number } | { path: string, type: "binary", stored: string, size: number }>`
   - Text adds per-file listing below the metadata:

   ```
   snapshot:
     timestamp:      2026-07-07T14:00:00Z
     baselineRef:    abc1234
     files:          42

   files:
     src/foo.ts        text     +12  -3
     src/bar.ts        text      +0  -0
     images/logo.png   binary   24KB
     src/baz.ts        text      +5  -1
   ```

   **`snapshots show <name> <timestamp> --file <path>`** — Delegates to: `GetImplementationSnapshotFile` (with `diff: false`)
   - For **text files**: Full reconstructed file content written directly to stdout (no framing).
     JSON/TOON: `{ file: string, type: "text", content: string }`
   - For **binary files**: Raw bytes to stdout (pipeable: `... --file logo.png > logo.png`).
     JSON/TOON: `{ file: string, type: "binary", content: string, encoding: "base64", stored: string, size: number }`
   - Text output for text files prints the full file content directly.
     Text output for binary files streams raw bytes to stdout (no framing).

   **`snapshots show <name> <timestamp> --file-diff <path>`** — Delegates to: `GetImplementationSnapshotFile` (with `diff: true`)
   - For **text files**: Raw unified diff written directly to stdout (no framing).
     JSON/TOON: `{ file: string, type: "text", diff: string }`
   - For **binary files**: Metadata-only to stdout (no content).
     JSON/TOON: `{ file: string, type: "binary", stored: string, size: number }`
   - Text output for binary files:
     ```
     (binary) images/logo.png
       stored: binaries/logo-a1b2c3d4.png
       size:   24576 bytes
     ```

   **`snapshots take <name>`** — Delegates to: `TakeImplementationSnapshot`

   JSON/TOON output: `{ timestamp: string, fileCount: number }`

   Text output:

   ```
   snapshot taken: 2026-07-07T16:00:00Z
     files: 42
   ```

5. **Clean on archive**: Configurable via `history.cleanOnArchive` (default `true`).
6. **Apply = restore**: The `restore` command recovers the working tree to the snapshot state.
