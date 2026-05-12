# Tasks: remove-archived-change-workspace

## 1. ArchivedChange entity

- [x] 1.1 Remove `workspace` from ArchivedChangeProps interface
      `packages/core/src/domain/entities/archived-change.ts`:
      `ArchivedChangeProps` — remove `readonly workspace: SpecPath` property
      Approach: delete the property from interface, lines 12-13

- [x] 1.2 Remove `_workspace` private field from ArchivedChange class
      `packages/core/src/domain/entities/archived-change.ts`:
      `ArchivedChange` class — remove `private readonly _workspace: SpecPath` field
      Approach: delete the field, line 37

- [x] 1.3 Remove workspace from constructor parameter
      `packages/core/src/domain/entities/archived-change.ts`:
      `constructor(props: ArchivedChangeProps)` — remove workspace from destructuring
      Approach: update constructor to not destructure workspace from props

- [x] 1.4 Remove workspace getter
      `packages/core/src/domain/entities/archived-change.ts`:
      `get workspace()` — remove the getter method
      Approach: delete lines 72-75

- [x] 1.5 Add `workspaces` getter
      `packages/core/src/domain/entities/archived-change.ts`:
      `get workspaces()` — add getter that derives from specIds
      Approach: add getter that parses specIds and returns unique workspace names,
      similar to Change.workspaces getter

## 2. FsArchiveRepository

- [x] 2.1 Update \_buildArchivedChange to not accept workspace
      `packages/core/src/infrastructure/fs/archive-repository.ts`:
      `_buildArchivedChange()` — remove workspace parameter
      Approach: remove workspace from construction call, lines 386-401

- [x] 2.2 Update index reader for backwards compatibility
      `packages/core/src/infrastructure/fs/archive-repository.ts`:
      `list()` method, line 216 — derive workspace when field missing
      Approach: use conditional: entry.workspace ? SpecPath.parse(entry.workspace) :
      SpecPath.parse(entry.specIds?.[0]?.split(':')[0] ?? 'default')

- [x] 2.3 Update \_buildIndexEntry to not include workspace
      `packages/core/src/infrastructure/fs/archive-repository.ts`:
      `_buildIndexEntry()` — remove workspace field from returned object
      Approach: delete line 413 `workspace: deriveFirstWorkspace(manifest),`

- [x] 2.4 Remove deriveFirstWorkspace function
      `packages/core/src/infrastructure/fs/archive-repository.ts`:
      `deriveFirstWorkspace()` — remove unused helper function
      Approach: delete lines 762-772

## 3. Template consumers

- [x] 3.1 Update run-step-hooks.ts
      `packages/core/src/application/use-cases/run-step-hooks.ts`:
      line 139 — derive workspace from specIds instead of archived.workspace
      Approach: change `const workspace = archived.workspace.toString()` to
      `const workspace = archived.specIds[0]?.split(':')[0] ?? 'default'`

- [x] 3.2 Update get-hook-instructions.ts
      `packages/core/src/application/use-cases/get-hook-instructions.ts`:
      line 81 — derive workspace from specIds
      Approach: change `archived.workspace.toString()` to derivation from specIds

## 4. Tests

- [x] 4.1 Update archive-repository tests
      `packages/core/test/infrastructure/fs/archive-repository.spec.ts`:
      Remove `archivedChange.workspace` assertions, add `workspaces` getter tests
      Approach: find and remove expect(archivedChange.workspace...) assertions

- [x] 4.2 Update run-step-hooks tests
      `packages/core/test/application/use-cases/run-step-hooks.spec.ts`:
      Update template variable test for archived changes
      Approach: verify workspace derived from specIds not stored field
