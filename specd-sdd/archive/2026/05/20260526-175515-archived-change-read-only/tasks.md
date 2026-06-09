# Tasks: archived-change-read-only

## 1. Domain models

- [x] 1.1 Add `ArchivedChangeIndexEntry` domain type
      `packages/core/src/domain/archived-change-index-entry.ts`: `ArchivedChangeIndexEntry` — introduce index row interface for archive listings
      Approach: mirror fields available from `index.jsonl` entries; derive `workspaces` from `specIds`
      (Req: core:archived-change-index-entry · Requirement: Index entry fields)

- [x] 1.2 Make `ArchivedChange` a full read-only detail model
      `packages/core/src/domain/entities/archived-change.ts`: `ArchivedChange` — redefine to extend `ReadOnlyChangeView` and include archive meta
      Approach: align getter surface with `ReadOnlyChangeView` + `archivedAt`/`archivedBy`/`archivedName`; keep immutable API
      (Req: core:get-archived-change · Requirement: Output on success)

- [x] 1.3 Add archive facade factory
      `packages/core/src/domain/read-only-change-view.ts`: `toArchivedChangeView(...)` — map manifest-loaded `Change` + archive meta into `ArchivedChange`
      Approach: reuse internal facade pattern; no unwrap accessor to mutable `Change`
      (Req: core:get-archived-change · Requirement: No side effects)

## 2. Ports and infrastructure

- [x] 2.1 Update `ArchiveRepository` port signatures
      `packages/core/src/application/ports/archive-repository.ts`: `list`, `get`, `archivePath` — adopt index/detail split
      Approach: `list(): Promise<ArchivedChangeIndexEntry[]>`; `get(): Promise<ArchivedChange|null>`; `archivePath(entry: {name, archivedName})`
      (Req: core:archive-repository-port · Requirement: list returns index entries, Requirement: get returns an archived change or null)

- [x] 2.2 Update `FsArchiveRepository.list()` to be index-only
      `packages/core/src/infrastructure/fs/archive-repository.ts`: `list()` — return `ArchivedChangeIndexEntry[]` without reading all manifests
      Approach: parse `index.jsonl` and map to entries; keep chronological ordering and dedupe semantics
      (Req: core:archive-repository-port · Requirement: list returns index entries)

- [x] 2.3 Update `FsArchiveRepository.get()` to return manifest-backed detail
      `packages/core/src/infrastructure/fs/archive-repository.ts`: `get(name)` — find index entry / recover, then read `manifest.json` and return `ArchivedChange`
      Approach: keep index reverse search + fallback scan; after locating dir, load manifest and project via `toArchivedChangeView`
      (Req: core:archive-repository-port · Requirement: get returns an archived change or null)

- [x] 2.4 Keep `archive()` returning a summary appropriate for index append
      `packages/core/src/infrastructure/fs/archive-repository.ts`: `archive(...)` — ensure index append remains O(1)
      Approach: continue constructing index entry from manifest for index append; do not require building full detail for archive operation
      (Req: core:archive-repository-port · Requirement: archive moves a change to the archive)

## 3. Use cases

- [x] 3.1 Update `ListArchived` to return index entries
      `packages/core/src/application/use-cases/list-archived.ts`: `execute()` — return `ArchivedChangeIndexEntry[]`
      Approach: delegate to `ArchiveRepository.list()` with no transformation
      (Req: core:list-archived · Requirement: Output)

- [x] 3.2 Update `GetArchivedChange` to return full detail
      `packages/core/src/application/use-cases/get-archived-change.ts`: `execute()` — return manifest-backed `ArchivedChange`
      Approach: delegate to `ArchiveRepository.get(name)` and throw `ChangeNotFoundError` on null
      (Req: core:get-archived-change · Requirement: Output on success)

## 4. CLI

- [x] 4.1 Update `archive list` to consume index entries
      `packages/cli/src/commands/archive/list.ts`: output mapping — align to `ArchivedChangeIndexEntry`
      Approach: keep sorting desc in CLI layer; do not load manifests for list output
      (Req: cli:archive-list · Requirement: Output format — text, Requirement: Output format — JSON)

- [x] 4.2 Update `archive show` to display full archived detail
      `packages/cli/src/commands/archive/show.ts`: output mapping — include `archivedAt`, optional `archivedBy`, `artifacts`, and manifest-derived `state`
      Approach: use `kernel.changes.getArchived`; do not hardcode `state: archivable`
      (Req: cli:archive-show · Requirement: Output format — text, Requirement: Output format — JSON)

## 5. Tests

- [x] 5.1 Update FS archive repository tests for list/get split
      `packages/core/test/infrastructure/fs/archive-repository.spec.ts`: listing vs get semantics
      Approach: assert `list()` returns entries; assert `get()` returns detail loaded from manifest; assert `archivePath` accepts entry
      (Req: core:archive-repository-port · Requirement: list returns index entries, Requirement: get returns an archived change or null)

- [x] 5.2 Update use case tests
      `packages/core/test/application/use-cases/list-archived.spec.ts`: return type and ordering
      `packages/core/test/application/use-cases/get-archived-change.spec.ts`: throws on missing, returns detail
      Approach: update mocks to new types; keep behavior assertions intact
      (Req: core:list-archived · Requirement: Output; core:get-archived-change · Requirement: ChangeNotFoundError on missing change)

- [x] 5.3 Update CLI tests for archive commands
      `packages/cli/test/commands/archive-list.spec.ts`, `packages/cli/test/commands/archive-show.spec.ts`: update expectations for new fields/state semantics
      Approach: validate JSON/text output schema changes for show; list remains index-backed
      (Req: cli:archive-show · Requirement: Output format — JSON; cli:archive-list · Requirement: Output format — JSON)

## 6. Manual verification

- [x] 6.1 End-to-end check: list and show archived change
      `node packages/cli/dist/index.js archive list`
      `node packages/cli/dist/index.js archive show <name>`
      Approach: confirm list remains fast; show includes archive metadata and manifest-derived state
