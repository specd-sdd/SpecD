# Change Notes Commands

## Purpose

Users and agents need explicit creation, removal and inspection of notes while status remains concise. These commands delegate semantics to Core and handle text sources and presentation.

## Requirements

### Requirement: Command surface and delegation

Register changes notes add <change>, remove <change> <id-or-prefix>, list <change>, and show <change> <id-or-prefix>. Support standard config and text/json/toon output. Delegate to AddChangeNote, RemoveChangeNote, ListChangeNotes and GetChangeNote through Kernel/SDK; CLI SHALL not read manifests or implement matching/deduplication.

### Requirement: Text input sources

Add SHALL require exactly one of --text or --input <path|->. Read file/stdin as UTF-8 plain text using shared read-input/readStdin helpers; '-' explicitly selects stdin. Remove SHALL accept optional mutually exclusive --reason/--reason-input <path|->; absent source generates Core's manual-removal explanation. Reject conflicts before I/O and do not invoke mutating use cases on read errors. Core SHALL validate resulting text independently.

### Requirement: Core-owned removal syntax

Add SHALL accept repeated --note-remove values using core:note-auto-removal-policy, plus --note-remove-on-enter/--note-remove-on-leave shortcuts. Each contributes an anyOf alternative; support comma-separated states, all, optional direction and operation-success:archive. Parsing and rule validation MUST use Core, never an adapter-local grammar. No policy means manual-only removal.

### Requirement: Inspection and mutation output

List SHALL display note ID, text, and by containing stored name/email; preserve privacy. Show SHALL display the complete note including actor ID/time/policy. Add SHALL expose created/reused and the resulting note ID; remove SHALL identify the removed ID. Missing/ambiguous selection and syntax errors SHALL be actionable and use standard CLI error handling without partial mutation.

### Requirement: Documentation and tests

Update command help and all relevant CLI/guide/API examples for multiline text, file/stdin input, rule grammar, deduplication, prefix selection, privacy and text-only status. Integration coverage SHALL exercise success, error and no-effect paths across output formats.

## Spec Dependencies

- `core:add-change-note` — shared domain, application or adapter contract used by this capability.
- `core:remove-change-note` — shared domain, application or adapter contract used by this capability.
- `core:list-change-notes` — shared domain, application or adapter contract used by this capability.
- `core:get-change-note` — shared domain, application or adapter contract used by this capability.
- `core:note-auto-removal-policy` — shared domain, application or adapter contract used by this capability.
- `cli:entrypoint` — shared domain, application or adapter contract used by this capability.
- `cli:command-resource-naming` — shared domain, application or adapter contract used by this capability.
