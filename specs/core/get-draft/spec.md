# GetDraft

## Purpose

Callers need to load a single drafted change by name for inspection without receiving a mutable aggregate or searching the active working set. `GetDraft` is the application use case that resolves a name in `drafts/` and returns a `DraftedChangeView`.

## Requirements

### Requirement: Input contract

`GetDraft.execute` SHALL accept a `GetDraftInput` with:

- `name` (string, required) — the drafted change slug to load

### Requirement: Resolution

The use case MUST call `ChangeRepository.getDraft(name)`.

- If a drafted change exists, the use case MUST return `{ view: DraftedChangeView }`.
- If no drafted change exists with that name, the use case MUST throw `ChangeNotFoundError`.

The use case MUST NOT fall back to `ChangeRepository.get(name)` (active storage).

### Requirement: Read-only

`GetDraft` MUST NOT mutate persistence, append history events, or invoke `mutate` / `mutateDraft`.

### Requirement: Dependencies

`GetDraft` depends on `ChangeRepository` injected via constructor.

### Requirement: Config-based factory delegates through resolveGetDraftDeps

The config-based `createGetDraft(config, options?)` form MUST derive `GetDraftDeps` through `resolveGetDraftDeps(resolver)` and then delegate to canonical `createGetDraft(deps)`.

`resolveGetDraftDeps(resolver)` MUST resolve:

- `changes: ChangeRepository`

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Constraints

- This use case is for single-draft inspection. Listing all drafts remains `ListDrafts`.
- Terminology uses **Draft** / **Drafted**, not "shelved".

## Spec Dependencies

- [`core:drafted-change-view`](../drafted-change-view/spec.md)
- [`core:change-repository-port`](../change-repository-port/spec.md)
- [`core:change`](../change/spec.md)
- [`core:composition-resolver`](../composition-resolver/spec.md)
