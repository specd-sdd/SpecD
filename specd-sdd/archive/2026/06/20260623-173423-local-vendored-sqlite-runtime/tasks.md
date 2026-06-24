# Tasks: local-vendored-sqlite-runtime

## 1. Stop tracking generated vendor output

- [x] 1.1 Ignore the vendored sqlite tree in git
      `.gitignore`: repository ignore rules — add
      `packages/code-graph-electron/vendor/` so generated vendor contents are never
      committed
      Approach: use a single directory ignore rule for the whole generated tree
      (Req: Locally generated vendored sqlite tree)

- [x] 1.2 Remove tracked vendor files from git index
      `packages/code-graph-electron/vendor/`: git index cleanup — run
      `git rm -r --cached packages/code-graph-electron/vendor/` so existing committed
      vendor snapshots are dropped without deleting local working copies
      Approach: index-only removal; local rebuild/sync regenerates vendor on demand
      (Req: Locally generated vendored sqlite tree)

## 2. Portable vendored sqlite rebuild cache

- [x] 2.1 Replace absolute-path rebuild cache checks
      `packages/code-graph-electron/scripts/rebuild-vendored-sqlite-electron.mjs`:
      rebuild skip logic — compare `electronVersion`, `platform`, and `arch` plus binary
      existence instead of machine-specific absolute `binaryPath`
      Approach: read/write `.electron-build.json` with portable fields only; keep sync
      before rebuild
      (Req: Platform-aware vendored sqlite rebuild cache)

- [x] 2.2 Preserve sync behaviour across rebuild workflows
      `packages/code-graph-electron/scripts/sync-vendored-sqlite.mjs`: vendored tree
      sync — keep copying canonical `better-sqlite3` and preserving an existing Electron
      `.node` plus cache metadata when still valid
      Approach: no behavioural regression; only adjust metadata handling if needed for the
      new cache shape
      (Req: Locally generated vendored sqlite tree, Platform-aware vendored sqlite rebuild
      cache)

## 3. Package and desktop wiring review

- [x] 3.1 Align package metadata and docs with generated-local vendor model
      `packages/code-graph-electron/package.json`,
      `packages/code-graph-electron/README.md`: package distribution notes — clarify that
      `vendor/` is generated locally and may remain listed in `files` for post-build
      workspace packaging
      Approach: document first-time native rebuild expectations for desktop contributors
      (Req: Locally generated vendored sqlite tree)

- [x] 3.2 Confirm desktop startup still prepares the generated runtime
      `apps/specd-studio-desktop/package.json`: script wiring review — keep
      `rebuild:graph-sqlite-electron` on `prestart` and `build`; adjust only if tests
      show a gap for fresh clones without git-tracked vendor artifacts
      Approach: preserve existing desktop lifecycle hooks unless a concrete failure is
      found
      (Req: desktop startup prepares the Electron SQLite graph runtime)

- [x] 3.3 Update studio onboarding docs
      `docs/studio/packages.md`: desktop documentation — note that vendored sqlite
      artifacts are generated locally and first desktop start may compile the Electron
      addon
      Approach: short contributor-facing note with rebuild command reference
      (Req: desktop startup prepares the Electron SQLite graph runtime, Locally generated
      vendored sqlite tree)

## 4. Tests and verification

- [x] 4.1 Extend vendored runtime tests for gitignore and cache metadata
      `packages/code-graph-electron/test/runtime/vendored-sqlite.spec.ts`: package/runtime
      coverage — assert gitignore contains the vendor path and rebuild metadata uses
      portable fields where testable without requiring a full native compile in CI
      Approach: filesystem/config assertions plus targeted helper tests if logic is
      extracted
      (Req: Locally generated vendored sqlite tree, Platform-aware vendored sqlite rebuild
      cache)

- [x] 4.2 Run package and desktop verification commands
      `packages/code-graph-electron`, `apps/specd-studio-desktop`: verification — run
      `pnpm --filter @specd/code-graph-electron test`,
      `pnpm --filter @specd/code-graph-electron build`, and
      `pnpm --filter @specd/studio-desktop typecheck`; perform manual fresh-vendor
      desktop start check when native toolchain is available
      Approach: confirm sync+rebuild regenerate vendor after gitignore/index cleanup
      (Req: Locally generated vendored sqlite tree, desktop startup prepares the Electron
      SQLite graph runtime)
