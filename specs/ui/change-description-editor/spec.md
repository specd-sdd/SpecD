# Change Description Editor

## Purpose

Safe inline editor for change **description** on Overview (`PATCH` with `{ description }` only — does not invalidate approvals).

## Requirements

### Requirement: multiline description with save when dirty

MUST render textarea and **Save** (`studio-change-description-save`) disabled when draft equals saved value or while PATCH is in flight.

### Requirement: save calls patchChange description only

MUST invoke `patchChange(name, { description })` via `usePatchChange` without opening scope or validate dialogs.

### Requirement: view uses SpecdDataPort hooks only

MUST NOT import `@specd/core`.

## Spec Dependencies

- [`ui:hooks-changes-mutate`](../hooks-changes-mutate/spec.md) — `usePatchChange`
- [`api:routes-changes-mutate`](../../api/routes-changes-mutate/spec.md) — `PATCH /changes/{name}`
- [`ui:change-metadata-editor`](../change-metadata-editor/spec.md) — composed on Overview
