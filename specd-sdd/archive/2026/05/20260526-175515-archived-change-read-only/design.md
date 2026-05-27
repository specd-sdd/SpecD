# Design: archived-change-read-only

## Non-goals

- Add new commands for archived-spec preview or context compilation (`archive context`, archived `spec-preview`). This remains a follow-up.
- Provide any mutation path for archived changes. The archive remains append-only.

## Affected areas

- `ArchivedChange` in `packages/core/src/domain/entities/archived-change.ts`
  Change: redefine `ArchivedChange` as the full archived read-only detail model (manifest-backed) and align its surface with `ReadOnlyChangeView`.
  Impact: direct dependents 26 · transitive dependents 186 · Risk: CRITICAL (shared domain type used by archive use cases, repo, and hooks).

- `ArchiveRepository` port in `packages/core/src/application/ports/archive-repository.ts`
  Change: update method return types (`list()` → `ArchivedChangeIndexEntry[]`, `get()` → `ArchivedChange | null`) and update `archivePath(...)` to accept either detail or index entry.
  Impact: high fan-in across core composition and use cases · Risk: CRITICAL.

- `FsArchiveRepository` in `packages/core/src/infrastructure/fs/archive-repository.ts`
  Change:
  - `list()` MUST stay index-backed (no manifest read per entry).
  - `get(name)` MUST load `manifest.json` for the returned `ArchivedChange` detail.
  - Keep index append/recovery behavior unchanged.
    Impact: direct dependents 15 · transitive dependents 171 · Risk: CRITICAL.

- Use cases:
  - `packages/core/src/application/use-cases/list-archived.ts` → returns index entries
  - `packages/core/src/application/use-cases/get-archived-change.ts` → returns full detail

- CLI:
  - `packages/cli/src/commands/archive/list.ts` → consume index entries (no behavior regression)
  - `packages/cli/src/commands/archive/show.ts` → show full archived details and manifest-derived lifecycle state

- Tests:
  - `packages/core/test/infrastructure/fs/archive-repository.spec.ts`
  - `packages/core/test/application/use-cases/list-archived.spec.ts`
  - `packages/core/test/application/use-cases/get-archived-change.spec.ts`
  - `packages/cli/test/...` for archive commands

## New constructs

- `packages/core/src/domain/archived-change-index-entry.ts`

  ```ts
  export interface ArchivedChangeIndexEntry {
    readonly name: string
    readonly archivedName: string
    readonly archivedAt: Date
    readonly archivedBy?: ActorIdentity
    readonly artifacts: readonly string[]
    readonly specIds: readonly string[]
    readonly schemaName: string
    readonly schemaVersion: number
    readonly workspaces: readonly string[]
  }
  ```

  Responsibility: index-backed record for listing and for `archivePath(...)` path resolution without manifest I/O.

- Extend `packages/core/src/domain/read-only-change-view.ts`

  Add a factory that maps a manifest-loaded `Change` to an archived read model:

  ```ts
  export interface ArchivedChange extends ReadOnlyChangeView {
    readonly archivedName: string
    readonly archivedAt: Date
    readonly archivedBy?: ActorIdentity
  }

  export function toArchivedChangeView(
    change: Change,
    meta: { archivedName: string; archivedAt: Date; archivedBy?: ActorIdentity },
  ): ArchivedChange
  ```

  Responsibility: single internal facade pattern (no `Change` escape hatch) reused for archived projections.

## Approach

1.  **Domain split: index vs detail**
    - Introduce `ArchivedChangeIndexEntry` as the list type.
    - Redefine `ArchivedChange` as the full detail read-only type which extends `ReadOnlyChangeView`.

2.  **Port updates**
    - `ArchiveRepository.list(): Promise<ArchivedChangeIndexEntry[]>`
    - `ArchiveRepository.get(name: string): Promise<ArchivedChange | null>`
    - `ArchiveRepository.archivePath(entry: { name: string; archivedName: string }): string`
      (both index and detail satisfy this shape).

3.  **FS adapter behavior**
    - Keep `index.jsonl` as the single listing source.
    - `list()` parses `index.jsonl` into `ArchivedChangeIndexEntry[]` (derive `workspaces` from `specIds`).
    - `get(name)`:
      - find index entry (reverse scan) OR recover via glob scan and append index entry
      - load `manifest.json` from the archived directory
      - build a `Change` aggregate from the manifest and map to `ArchivedChange` via `toArchivedChangeView`

4.  **Use cases**
    - `ListArchived` delegates to `ArchiveRepository.list()` and returns index entries unchanged.
    - `GetArchivedChange` delegates to `ArchiveRepository.get(name)` and returns full detail or throws `ChangeNotFoundError`.

5.  **CLI outputs**
    - `archive list` remains index-based (fast).
    - `archive show` uses `GetArchivedChange` detail:
      - `state` derived from manifest (`change.state`)
      - show `archivedAt`, optional `archivedBy`, and `artifacts` type IDs from the archive detail record
      - JSON/toon schema expands accordingly.

6.  **Documentation**
    - Update CLI reference docs under `docs/` if any existing archive command docs promise minimal output only. If none exist, no doc changes are required.

## Key decisions

- **Decision:** `ArchivedChange` is the full manifest-backed read model; `ArchivedChangeIndexEntry` is list/index.
  - **Rationale:** `list` must stay fast; `get` must return full inspection detail.
  - **Alternatives rejected:** summary `ArchivedChange` + separate `ArchivedChangeView` naming.

- **Decision:** `archivePath(...)` accepts both index and detail.
  - **Rationale:** hooks and listings can resolve paths without forcing manifest I/O.

- **Decision:** `archive show` reports manifest-derived lifecycle state, not hardcoded `archivable`.
  - **Rationale:** avoid lying output; archive metadata is surfaced separately.

## Trade-offs

- **[Risk] CRITICAL fan-in on `ArchiveRepository` and `FsArchiveRepository`** → Mitigation: update types first, then adapt FS, then use cases, then CLI; keep `list()` index-only.
- **[Risk] CLI/spec drift while verify deltas are no-op placeholders** → Mitigation: update verify deltas to match new output during implementation and verification.

## Spec impact

### `core:archive-repository-port`

- Direct dependents: `core:get-archived-change`, `core:list-archived`, `core:archive-change`, hooks (`RunStepHooks`, `GetHookInstructions`)
- Risk: API return type changes propagate widely; requires coordinated updates.

### `core:list-archived`

- Direct dependents: `cli:archive-list`, any UIs consuming archive listings.
- Change: output type switches to index entries.

### `cli:archive-show`

- Direct dependents: CLI UX only.
- Change: output expands and `state` becomes manifest-derived.

## Dependency map

```mermaid
graph LR
  ArchiveIndex[index.jsonl] -->|list()| FsArchiveRepository
  FsArchiveRepository -->|list()| ListArchived
  ListArchived -->|output| CLIArchiveList[cli:archive list]

  FsArchiveRepository -->|get(name)| GetArchivedChange
  GetArchivedChange -->|output| CLIArchiveShow[cli:archive show]
  GetArchivedChange -->|returns| ArchivedChangeDetail[ArchivedChange (ReadOnlyChangeView + archive meta)]
  CLIArchiveShow -->|state from manifest| ArchivedChangeDetail
```

```
┌────────────────────┐   list() index-only   ┌──────────────────┐   output    ┌─────────────────┐
│ FsArchiveRepository │──────────────────────▶│ ListArchived      │───────────▶│ cli:archive list │
└─────────┬──────────┘                       └──────────────────┘            └─────────────────┘
          │
          │ get(name) loads manifest
          ▼
┌──────────────────┐   returns detail   ┌─────────────────┐   output    ┌─────────────────┐
│ GetArchivedChange │──────────────────▶│ ArchivedChange   │───────────▶│ cli:archive show │
└──────────────────┘                   └─────────────────┘            └─────────────────┘
```

## Testing

### Automated tests

- `packages/core/test/infrastructure/fs/archive-repository.spec.ts`
  - `list()` returns index entries without manifest reads (assert by stubbing/manipulating manifests or by ensuring only index is needed for list).
  - `get()` returns full detail loaded from `manifest.json` (assert `description`, `history`, `artifacts` state map present).
  - `archivePath()` accepts both index entry and detail.

- `packages/core/test/application/use-cases/list-archived.spec.ts`
  - Return type is `ArchivedChangeIndexEntry[]` and ordering is preserved.

- `packages/core/test/application/use-cases/get-archived-change.spec.ts`
  - Returns `ArchivedChange` detail; throws `ChangeNotFoundError` on missing.

- `packages/cli/test/commands/archive-show.spec.ts` / `archive-list.spec.ts`
  - `archive show` includes `archivedAt` and manifest-derived `state`.
  - `archive list` output unchanged semantically, still sorted desc.

### Manual / E2E verification

- Archive an existing change, then:

  ```bash
  node packages/cli/dist/index.js archive list
  node packages/cli/dist/index.js archive show <name>
  ```

- Confirm:
  - list is fast and prints expected rows
  - show prints manifest-derived `state`, `archivedAt`, and specs/schema

## Open questions

- _none_ (archive context/spec-preview follow-up intentionally deferred)
