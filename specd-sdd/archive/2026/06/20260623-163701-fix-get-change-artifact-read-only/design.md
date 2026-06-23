# Design: fix-get-change-artifact-read-only

## Non-goals

- Refactoring `ChangeRepository.mutate()` to skip `save()` when unchanged
- Fixing read-path manifest sync in `repo.get()` (separate issue; does not bump `updatedAt`)
- Changing API routes, DTOs, or UI hooks
- Expanding scope to `core:change-repository-port` or other use cases (audit confirmed only `GetChangeArtifact` misuses `mutate`)

## Affected areas

- `GetChangeArtifact.execute()` in `packages/core/src/application/use-cases/get-change-artifact.ts`
  - Change: replace `this._changes.mutate(...)` with read-only sequence (`get` → guard → `artifact`)
  - Callers: `kernel.changes.getArtifact` → API `GET /changes/:name/artifacts/:filename`, client adapters
  - Risk: CRITICAL fan-out (kernel, API, Studio) but **behavioural contract unchanged** — only side effect removed
  - Note: `GetReadOnlyChangeArtifact` and `OutlineChangeArtifact` already follow the target pattern

- `packages/core/test/application/use-cases/save-change-artifact.spec.ts` (or new `get-change-artifact.spec.ts`)
  - Change: add regression asserting `updatedAt` stable after repeated `GetChangeArtifact.execute()`
  - Risk: LOW — test-only

- `specs/core/get-change-artifact/spec.md` + `verify.md` (via change deltas)
  - Already authored in this change; archive merges into workspace specs

**Unchanged (consumers benefit automatically):**

- `packages/api/src/delivery/http/handlers/handler-changes-read.ts` — still calls `getArtifact.execute`
- `packages/client/src/adapter-remote-specd-data.ts` — `getChangeArtifact` HTTP client
- `packages/ui` — `useChangeArtifact`, `useChangeArtifacts`

## New constructs

None. Existing `GetChangeArtifact` class keeps the same public input/output types.

## Approach

1. **Implement read-only load in `GetChangeArtifact.execute`:**
   - `const change = await this._changes.get(input.name)` — throw `ChangeNotFoundError` if null
   - `findTrackedArtifactFile(change, input.filename)` — throw `ChangeArtifactFileNotFoundError` if undefined (same as today)
   - `const artifact = await this._changes.artifact(change, input.filename)` — throw if null
   - Return `{ content: artifact.content, originalHash: artifact.originalHash ?? '' }`

2. **Remove** the `mutate` import usage entirely from this file.

3. **Add unit test** with in-memory or fs test repository:
   - Seed change with tracked `proposal.md` and fixed `updatedAt`
   - Call `execute` twice
   - Assert manifest `updatedAt` unchanged (read manifest from disk or entity getter)

4. **Validate** against verify scenarios — especially "Repeated reads keep updatedAt stable" and "Read does not call mutate".

Reference pattern: `get-read-only-change-artifact.ts` lines 72–98 (read path without `mutate`).

## Key decisions

**Decision:** Fix only `GetChangeArtifact`, not `mutate()` semantics.

**Rationale:** Narrow blast radius; audit found no other read misuse.

**Alternatives rejected:**

- UI workaround — wrong layer; any API client still corrupts `updatedAt`
- `mutate()` skip-save optimization — affects all writers

**Decision:** Keep tracked-file guard identical to `SaveChangeArtifact`.

**Rationale:** Spec requirement unchanged; only persistence path changes.

## Trade-offs

- [Read-path `get()` may still rewrite manifest for sync] → Out of scope; does not call `touchUpdatedAt()`. Monitor separately if needed.
- [CRITICAL graph dependents] → Mitigated: no signature or return-type change; consumers see stable `updatedAt` only.

## Spec impact

### `core:get-change-artifact`

- Direct dependents: none listed in spec-lock
- Implementation link: `GetChangeArtifact` symbol only
- No downstream spec requirement changes needed

## Dependency map

```mermaid
graph LR
  UI[ui:useChangeArtifact] --> API[GET /artifacts/:filename]
  API --> GA[GetChangeArtifact.execute]
  GA --> GET[ChangeRepository.get]
  GA --> ART[ChangeRepository.artifact]
  GA -.x.-> MUT[ChangeRepository.mutate]
  MUT -.-> SAVE[save + touchUpdatedAt]
```

```
┌──────────────────┐     ┌─────────────────────────┐
│ Studio / Client  │────▶│ GET .../artifacts/:file │
└──────────────────┘     └───────────┬─────────────┘
                                     │
                                     ▼
                          ┌──────────────────────┐
                          │ GetChangeArtifact    │
                          │  get() → guard →     │
                          │  artifact()          │
                          └──────────┬───────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              ▼                      ▼                      ▼
        ┌──────────┐          ┌────────────┐        ┌──────────┐
        │ get()    │          │ findTracked│        │artifact()│
        └──────────┘          │ Artifact   │        └──────────┘
                              └────────────┘

        mutate() ─ ─ ─ ✕ ─ ─ ─▶ save() ──▶ touchUpdatedAt()  [removed path]
```

## Testing

**Automated (`packages/core/test/application/use-cases/`):**

| Verify scenario                       | Test                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| Tracked file returns content and hash | Existing coverage in save-change-artifact spec or new get-change-artifact spec |
| Untracked filename fails              | Assert `ChangeArtifactFileNotFoundError`, `artifact` not called (spy)          |
| Read does not call mutate             | Mock repo: assert `mutate` never invoked                                       |
| Repeated reads keep updatedAt stable  | **New** — two `execute` calls, same `updatedAt`                                |
| Untracked fails before read           | Covered by untracked test with `artifact` spy                                  |

Prefer dedicated `get-change-artifact.spec.ts` if save-change-artifact spec is already crowded.

**Manual / E2E:**

1. Start API with `test-change` fixture
2. Note `updatedAt` from `GET /v1/changes/test-change/status`
3. Call `GET /v1/changes/test-change/artifacts/proposal.md` twice
4. Re-fetch status — `updatedAt` must be unchanged
5. Open artifact tab in Studio — status poll should not show perpetual "modified"

**Lint/docs:** No `docs/` updates required — internal behaviour fix, no public API change.

## Open questions

None.
