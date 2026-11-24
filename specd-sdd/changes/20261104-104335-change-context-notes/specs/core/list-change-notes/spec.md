# List Change Notes

## Purpose

Dedicated inspection must expose note IDs without cluttering status context. ListChangeNotes reads the current snapshot for note-management clients.

## Requirements

### Requirement: Validated snapshot query

execute SHALL validate name and reject unknown input before access, then read the active change's persisted current notes. Return the collection in creation/insertion order, empty when none. It SHALL not reconstruct from events, create/remove notes, invoke status reconciliation to produce notes, or resolve new actor identities. Unknown/non-active names SHALL fail through the active repository contract.

### Requirement: Read contract and composition

Return defensive read data with persisted IDs, text, timestamp, by and optional autoRemove. Expose typed input/result/dependencies, factory and Kernel.changes.listNotes. CLI SHALL project only its documented list columns; persisted privacy transformations SHALL be preserved.

## Spec Dependencies

- `core:change` — shared domain, application or adapter contract used by this capability.
- `core:change-repository-port` — shared domain, application or adapter contract used by this capability.
