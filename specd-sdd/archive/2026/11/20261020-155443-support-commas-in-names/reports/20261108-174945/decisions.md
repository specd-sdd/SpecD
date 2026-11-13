# Verification review decisions

Change: `support-commas-in-names`
Report: `specs-compliance-change-support-commas-in-names-20261108-174945.md`
Review date: 2026-11-08

This journal records decisions explicitly agreed with the user for this change. It does not replace design/tasks artifacts or indicate that a fix has been implemented. Deferred findings are collected in the root [exploration file](../../../../../EXPLORATION_VERIFY_FOLLOWUPS.md).

## CM1 — Case aliases within a new file batch

Status: Agreed; implementation pending.

- Keep the existing specification contract.
- On macOS/Windows, case-only aliases within the same new batch denote one file and must produce one tracked entry/link.
- Preserve the previously recorded spelling; when none exists, preserve the first spelling supplied in the batch.
- Reuse the existing platform-aware comparison when comparing entries already accepted within the batch.
- On Linux, case-different names remain distinct.
- Add regression tests for new-batch aliases on macOS/Windows and distinct names on Linux.

## CM2 — Validate defaultWorkspace

Status: Agreed; implementation pending.

- Keep the existing specification contract.
- Validate the resolved workspace whether it comes from an explicit ID qualifier or from `defaultWorkspace`.
- Reuse the existing `isValidWorkspaceName` helper in `packages/core/src/domain/services/spec-id-rules.ts`; do not duplicate validation rules or regular expressions.
- Invalid resolved workspace names raise `InvalidSpecIdError`.
- Add negative coverage for empty, one-character, uppercase/space-containing and Windows-device-name overrides, with and without configured workspace membership.

## CM3 — Preserve one-shot workspace iterables

Status: Agreed; implementation pending.

- Keep the existing public iterable input contract and specification.
- Materialize the workspace iterable into an array once in the constructor, rather than consuming it separately on each execution.
- Add a regression test constructing the operation with `Map.keys()` and executing it twice successfully.

## Additional findings included in this change

### CLI-I2 — Structured help schemas

Status: Agreed; implementation and focused verification pending.

- Include the help-schema omissions identified in this audit in `support-commas-in-names`, even where they predate the comma behavior, because they are confined to help metadata for affected commands.
- Complete the JSON/TOON help schemas for the identified change implementation, spec dependency, and project-init command leaves; include the missing `changePath` field for change creation where required by the report.
- Check the structured help output against the visible command options and add focused coverage as needed.

### CLI-S1 — Fully qualified change dependency output

Status: Agreed; specification and test corrections pending.

- Keep the CLI output of canonical fully qualified dependency IDs returned by Core, including `default:` for the default workspace.
- Correct the two `cli:change-deps` verification scenarios that expect bare `auth/shared` and `auth/session`, and complete the missing expected output in the add scenario.
- Update mocked dependency results to use canonical IDs. Add one Core-to-CLI output assertion so mocks cannot conceal this contract drift.

### CM6 — Quote invalid persisted dependency values

Status: Agreed; implementation and test pending.

- Keep the `core:spec-id-format` diagnostic contract: invalid persisted IDs must identify both the field path and the rejected value.
- Include the offending value in `InvalidSpecLockError` diagnostics for invalid `spec-lock.json` dependency entries while retaining the spec owner, file location, typed error and validation rule.
- Add a regression test with an invalid value such as `Bad Id`; do not add repair advice to the domain error.

### CM5 — Changes have no primary workspace

Status: Agreed; correct now through the change's design workflow.

- A change has no singular or primary workspace. Workspace ownership belongs to each spec; `change.workspaces` is the computed plural set of the change's spec workspaces.
- Remove the stale `core:workspace` primary-workspace requirement and its two scenarios that derive a workspace from the first spec or resolve `{{change.workspace}}` for archive paths. Align the related archived-index scenario with this rule.
- Reconcile the obsolete `saveMetadata()` wording for readOnly workspaces with the current cache-write contract.
- `core:workspace` is already in this change's scope. Return the change to designing and update its spec/verify deltas through `specd-design`; do not edit canonical `specs/` directly.

Deferred findings and archive-cache notes are in the root [exploration file](../../../../../EXPLORATION_VERIFY_FOLLOWUPS.md).
