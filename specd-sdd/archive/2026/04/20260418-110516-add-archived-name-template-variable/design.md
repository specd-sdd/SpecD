# Design: add-archived-name-template-variable

## Summary

This change formalizes the `change.archivedName` template variable in the spec contract. The variable was already implemented in code but not documented in the specs. This design document confirms the implementation satisfies the spec requirements.

## Problem

The post-archive changeset hook (`scripts/hooks/post-archive-changeset.js`) uses the archived directory name to locate the archived change. Without `change.archivedName` as a documented template variable, the hook cannot reliably access this path for the `{{change.archivedName}}` token substitution.

## Solution

This is a **spec alignment** change — no new implementation required. The code already implements the variable:

1. **`RunStepHooks`** (`packages/core/src/application/use-cases/run-step-hooks.ts:143`) builds `change.archivedName` from `ArchivedChange.archivedName` when using the archive fallback path.

2. **`TemplateExpander`** (`packages/core/src/application/template-expander.ts`) supports `{{change.archivedName}}` in pattern expansion.

3. **`FsArchiveRepository`** (`packages/core/src/infrastructure/fs/archive-repository.ts`) generates the archived name via `changeDirName()`.

This design confirms the spec deltas match the existing implementation.

## Affected Areas

### Code (already implemented)

| File                                                        | Symbol                               | Role                                              |
| ----------------------------------------------------------- | ------------------------------------ | ------------------------------------------------- |
| `packages/core/src/application/use-cases/run-step-hooks.ts` | `RunStepHooks._buildHookVariables()` | Builds `change.archivedName` from archived change |
| `packages/core/src/domain/entities/archived-change.ts`      | `ArchivedChange.archivedName`        | Entity property                                   |
| `packages/core/src/infrastructure/fs/archive-repository.ts` | `changeDirName()`                    | Generates `YYYYMMDD-HHmmss-<name>`                |
| `scripts/hooks/post-archive-changeset.js`                   | hook script                          | Uses `{{change.archivedName}}`                    |

### Specs (deltas applied)

| Spec                           | Change                                                  |
| ------------------------------ | ------------------------------------------------------- |
| `core:core/run-step-hooks`     | Documents `archivedName` in HookVariables construction  |
| `core:core/template-variables` | Documents `archivedName` in change contextual namespace |

## Verification

The existing test suite verifies the implementation:

- `run-step-hooks.spec.ts:703` — verifies archivedName in hook variables for archive fallback
- `archive-repository.spec.ts:154` — verifies `changeDirName` output format

The spec deltas add verification scenarios covering:

- Archived post-phase includes `archivedName` in change namespace
- Active change path may omit `archivedName`

## Open Questions

None — this is a spec alignment change. Implementation is complete and verified by existing tests.

## Dependencies

No new spec dependencies introduced. The relationship between `core:core/run-step-hooks` and `core:core/template-variables` is unchanged.
