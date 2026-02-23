---
status: accepted
date: 2026-02-22
decision-makers: specd maintainer
consulted: '-'
informed: '-'
---

# ADR-0014: Single Changes and Archive Storage Per Project

## Context and Problem Statement

specd supports multiple workspaces within a single project. Each workspace has its own spec directory and its own schemas directory, both declared with independent adapters. A natural question arises: should `storage.changes` and `storage.archive` also be declared per workspace?

## Decision Drivers

- A change in specd is not scoped to a single workspace — a change is a unit of work that can span multiple specs across multiple workspaces simultaneously.
- `changes` and `archive` are operational directories: they hold in-progress and completed work artifacts for the person or team running specd. They are a property of the project doing the work (the coordinator), not of the workspaces being referenced.
- An external workspace being `readOnly` does not mean that work tracking should happen in that external repo.

## Considered Options

- **Per-workspace storage** — `storage.changes` and `storage.archive` declared independently for each workspace.
- **Single project-level storage** — one changes directory and one archive directory per `specd.yaml`, regardless of how many workspaces are declared.

## Decision Outcome

Chosen option: "Single project-level storage", because a change can span multiple workspaces and operational storage belongs to the coordinator running specd, not to the individual workspaces it references.

`storage.changes` and `storage.archive` are declared once at the project level. There is exactly one changes directory and one archive directory per `specd.yaml`.

Each workspace declares its own `specs` and `schemas` storage independently, because those are genuinely workspace-scoped resources. But operational storage (changes, archive) belongs to the project running specd, not to the workspaces it references.

Per-workspace storage would either force artificial change boundaries (splitting a single unit of work across multiple storage locations) or require a change to be replicated across multiple storage locations — both of which undermine the coherence of a change as a cross-cutting unit of work.

### Consequences

- Good, because a change can freely reference specs from any number of workspaces without storage fragmentation.
- Good, because the operational footprint (where to find in-progress and completed work) is always a single known location.
- Good, because in coordinator repo setups, changes and archives live in the coordinator — which is the correct place, since the coordinator is the entity doing the work.
- Bad, because if a future requirement genuinely needs per-workspace change tracking, that would be a new design decision with a new ADR.

### Confirmation

`specd.yaml` schema validation enforces `storage` as a top-level section, not nested under workspaces. Any `specd.yaml` with per-workspace `changes` or `archive` fields fails validation on load.

## More Information

### Spec

- [`specs/_global/config/spec.md`](../../specs/_global/config/spec.md)
