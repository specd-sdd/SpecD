# Tasks: windows-graph-path-portability

## Domain: graph-path-identity helpers

- [x] Add `isUncPath`, `isAbsoluteGraphFilesystemPath`, `resolveGraphPath` in `split-workspace-identity.ts` (win32 for UNC/drive/`\`; posix otherwise; empty target → dirname)
- [x] Expand `split-workspace-identity.spec.ts` path matrix (workspace `\`, drive, UNC, `\foo`, empty target, absolute fromFile)

## PHP adapter portability

- [x] Route require/include resolution through `resolveGraphPath` (replace inlined `resolveFromFilePath`)
- [x] Gate Cake/CI absolute candidates with `isAbsoluteGraphFilesystemPath` + `resolveGraphPath(file, '../'+candidate)`
- [x] Treat UNC/drive absolute FS before workspace split in `splitWorkspacePath`
- [x] Portableize Composer PSR-4 absolute dirs, `canonicalCodeRoot`, and `resolveQualifiedNameCandidates` outputs; portableize `path.relative` before workspace ids
- [x] Add PHP require/include host-absolute + UNC IMPORTS tests (any-host)

## Explain / TS / Python / tests

- [x] Explain: drive-letter outside → `projectRelativePath = toPortableGraphPath(abs)` on all hosts; keep scenario coverage
- [x] TypeScript + Python `resolveRelativeImportPath`: portable-normalize file + specifier before `/` segment walks
- [x] Failed-targets: `skipIf(win32||root)` for chmod unreadability; leave product hash path unchanged

## Remaining / verification

- [x] Audit other `path.resolve` / `path.relative` call sites in code-graph adapters (Go `lastIndexOf` latent, any remaining absolute FS joins) and adopt `resolveGraphPath` / `toPortableGraphPath` where graph keys are built
- [x] Confirm `@specd/code-graph` Windows CI green (prior failure: run 41575757097 IMPORTS / path identity)
- [x] Complete fast-track Consolidation Summary in `exploration.md` after archive readiness review
