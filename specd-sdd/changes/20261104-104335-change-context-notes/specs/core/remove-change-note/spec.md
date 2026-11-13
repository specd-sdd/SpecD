# Remove Change Note

## Purpose

Users must be able to remove any current note without altering the underlying work or its validity. This use case validates selection, removes one note and preserves an explanation in audit.

## Requirements

### Requirement: Input and selection

execute SHALL accept name, id (full UUID or non-empty valid UUID prefix) and optional reason, rejecting unknown fields or blank supplied reason before effects. Under serialized active-change mutation, exact ID SHALL take precedence, otherwise exactly one prefix match SHALL be required. No match or ambiguous matches SHALL produce typed actionable errors and remove nothing.

### Requirement: Removal independent of retention

Any note SHALL be explicitly removable regardless of autoRemove. Remove SHALL atomically delete the selected note and append note-removed with its noteId, operation actor, timestamp, removal: manual, and supplied trimmed reason or a generated explicit-removal explanation. Existing note author SHALL not be changed. Failure SHALL preserve both collection and audit.

### Requirement: Operational independence and API

Removal SHALL not resolve drift, approvals, verification, blockers or source invalidations. It SHALL not consult history or maintain a suppression ledger. Expose typed result/dependencies, createRemoveChangeNote factory and Kernel.changes.removeNote through standard composition.

## Spec Dependencies

- `core:change` — shared domain, application or adapter contract used by this capability.
- `core:change-repository-port` — shared domain, application or adapter contract used by this capability.
- `default:_global/error-handling-conventions` — shared domain, application or adapter contract used by this capability.
