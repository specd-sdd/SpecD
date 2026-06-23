# Tasks: fix-get-change-artifact-read-only

## 1. Core use case

- [x] 1.1 Make GetChangeArtifact read-only
      `packages/core/src/application/use-cases/get-change-artifact.ts`: `GetChangeArtifact.execute` — remove `mutate()` wrapper
      Approach: `get(name)` → throw `ChangeNotFoundError` if null; `findTrackedArtifactFile` guard; `artifact(change, filename)`; return `{ content, originalHash }`. Mirror `get-read-only-change-artifact.ts` read sequence without draft/archived branching.
      (Req: GetChangeArtifact returns content and originalHash, GetChangeArtifact is read-only)

## 2. Tests

- [x] 2.1 Add regression test for stable updatedAt
      `packages/core/test/application/use-cases/get-change-artifact.spec.ts` (new) or `save-change-artifact.spec.ts`: `GetChangeArtifact` — assert `updatedAt` unchanged after two reads
      Approach: seed change with tracked artifact and fixed clock; call `execute` twice; read manifest `updatedAt` before/after; expect equality.
      (Req: GetChangeArtifact is read-only, scenario: Repeated reads keep updatedAt stable)

- [x] 2.2 Add tests for tracked-file guard and no-mutate contract
      `packages/core/test/application/use-cases/get-change-artifact.spec.ts`: `GetChangeArtifact` — untracked filename and mutate spy
      Approach: untracked file → `ChangeArtifactFileNotFoundError`, `artifact` spy not called; happy path → `mutate` spy never invoked.
      (Req: GetChangeArtifact enforces tracked-file confinement, scenario: Read does not call mutate)

## 3. Verification

- [x] 3.1 Run core unit tests for affected use cases
      `packages/core` — test suite
      Approach: `pnpm --filter @specd/core test` (or targeted vitest path for get-change-artifact spec).
      (Req: all verify scenarios — automated layer)

- [x] 3.2 Manual API smoke test
      Running API + `test-change` fixture
      Approach: `GET /status` → note `updatedAt`; `GET /artifacts/proposal.md` twice; `GET /status` again — same `updatedAt`. Repeat in Studio artifact tab if convenient.
      (Req: scenario: HTTP GET artifact does not bump revision clock)
