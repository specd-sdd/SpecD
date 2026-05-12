# Proposal: change-edit-description

## Motivation

The `--description` option in the `specd change edit` command is documented in spec `cli:cli/change-edit` but was never implemented. When a user attempts to change a change's description, the command accepts the flag but does nothing, generating confusion and loss of trust in the CLI.

## Current behaviour

Today, running:

```bash
specd change edit <name> --description "New description"
```

The CLI accepts the flag, passes it to the `EditChange` use case, but:

1. The `EditChangeInput` interface has no `description` field
2. The `execute()` method returns early if there are no spec changes (lines 76-78 in `edit-change.ts`)
3. The description is never persisted

Result: the user sees "updated change" but the description does not change.

## Proposed solution

Implement the `--description` option in the `EditChange` use case:

1. Add optional `description` field to the `EditChangeInput` interface
2. Add `updateDescription()` method to the `Change` entity
3. Modify `EditChange.execute()` to:
   - Detect if only description is changing (no spec changes)
   - Persist the description without invalidating the change
4. Update the CLI to pass the description correctly (already does this at line 91)

## Specs affected

### New specs

None.

### Modified specs

- `cli:cli/change-edit`: The spec already documents `--description` but without implementation details. Update to clarify that it only changes metadata and does not invalidate the change.
  - Depends on (added): none

## Impact

- **CLI**: `packages/cli/src/commands/change/edit.ts` — already passes description to execute (line 91), no changes needed
- **Core use case**: `packages/core/src/application/use-cases/edit-change.ts` — add `description` to `EditChangeInput` and persistence logic
- **Domain entity**: `packages/core/src/domain/entities/change.ts` — add `updateDescription()` method
- **Change repository**: `packages/core/src/infrastructure/adapters/fs-change-repository.ts` — ensure it persists the description field

## Technical context

During the investigation, the following was identified:

- **Zombie option**: The `--description` option exists in the CLI but is completely ignored by the use case
- **Relevant code**:
  - `edit.ts:91`: `...(opts.description !== undefined ? { description: opts.description } : {})`
  - `edit-change.ts:11-18`: `EditChangeInput` only has `name`, `addSpecIds`, `removeSpecIds`
  - `edit-change.ts:76-78`: Returns early if there are no spec changes

- **Design decision**: Changing `--description` should NOT invalidate the change (only updates metadata). The original spec already states: "Updating `--description` alone does not trigger invalidation."

## Open questions

None. The implementation is clear:

1. Add field to the interface
2. Add method to the entity
3. Update execute to handle the case
