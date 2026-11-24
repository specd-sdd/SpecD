# Get Change Note

## Purpose

Clients need complete details for one note selected from the management list. GetChangeNote defines read-only ID selection independently of CLI.

## Requirements

### Requirement: Validated exact or unique-prefix lookup

execute SHALL validate name/id and reject unknown fields before access. Read the active snapshot without reconciliation/history reconstruction. Select exact UUID first, otherwise one valid prefix match; missing or ambiguous selection SHALL throw typed actionable errors, never choose arbitrarily.

### Requirement: Complete immutable result

Return the full current note, including its stored privacy-processed actor and ID, timestamp and optional policy, without mutating collection or audit. Expose typed input/result/dependencies, factory and Kernel.changes.getNote using standard composition.

## Spec Dependencies

- `core:change` — shared domain, application or adapter contract used by this capability.
- `core:change-repository-port` — shared domain, application or adapter contract used by this capability.
- `default:_global/error-handling-conventions` — shared domain, application or adapter contract used by this capability.
