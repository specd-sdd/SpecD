# Proposal: ownership-enforcement

## Motivation

The `ownership` field on workspaces declares whether a project can modify a workspace's specs (`owned`, `shared`, `readOnly`), but nothing in the codebase enforces it. A `readOnly` workspace can be modified exactly like an `owned` one. This undermines the multi-workspace trust model — external or partner-managed specs have no protection.

## Current behaviour

- `ownership` is loaded from `specd.yaml`, stored in the `Repository` base class, and threaded through every use-case factory.
- No code path checks the value before performing writes.
- `change create --spec` and `change edit --add-spec` accept specs from `readOnly` workspaces without error.
- `ArchiveChange` merges deltas into `readOnly` workspace specs without checking ownership.
- `SpecRepository.save()` and `saveMetadata()` write directly to `readOnly` workspaces.

## Proposed solution

Add hard errors at four enforcement points — two in the change lifecycle, one in the archive, and one at the storage port level:

1. **`change create` / `change edit --add-spec`** — reject specs belonging to `readOnly` workspaces before they enter a change's scope.
2. **`ArchiveChange`** — reject archiving when the change contains specs from `readOnly` workspaces (defense in depth).
3. **`SpecRepository.save()` / `saveMetadata()`** — reject writes at the port level as a final safety net.

All violations produce clear error messages stating what was blocked and why, without suggesting remediation (to prevent LLM agents from autonomously modifying config).

## Specs affected

### New specs

(none)

### Modified specs

- `core:core/workspace`: add a requirement specifying that `readOnly` ownership is enforced — not just documented — at change scope, archive, and repository levels.
  - Depends on (added): none

- `core:core/repository-port`: add a requirement for a `ReadOnlyWorkspaceError` that all enforcement points use.
  - Depends on (added): none

- `core:core/spec-repository-port`: add ownership guard to `save()` and `saveMetadata()` — throw `ReadOnlyWorkspaceError` when the workspace is `readOnly`.
  - Depends on (added): none

- `core:core/archive-change`: add a pre-merge guard that rejects archiving when any spec belongs to a `readOnly` workspace.
  - Depends on (added): none

- `cli:cli/change-create`: add ownership validation — reject `--spec` values targeting `readOnly` workspaces.
  - Depends on (added): none

- `cli:cli/change-edit`: add ownership validation — reject `--add-spec` values targeting `readOnly` workspaces.
  - Depends on (added): none

## Impact

- **@specd/core** — new error class (`ReadOnlyWorkspaceError`), guards in `SpecRepository` (abstract + fs implementation), guard in `ArchiveChange` use case.
- **@specd/cli** — ownership lookup before invoking `CreateChange` and `EditChange` use cases in the `change create` and `change edit` commands.
- **Skills** — `specd-new`, `specd-design`, and `specd-implement` already updated with preventive guards (done prior to this change).
- **No breaking API changes** — all new behaviour is additive error paths on previously-unchecked operations.

## Open questions

(none — all decisions were resolved during exploration)
