# ADR-0014: Single Changes and Archive Storage Per Project

## Status

Accepted

## Context

specd supports multiple workspaces within a single project. Each workspace has its own spec directory and its own schemas directory, both declared with independent adapters. A natural question arises: should `storage.changes` and `storage.archive` also be declared per workspace?

The argument for per-workspace storage would be that in a coordinator repo managing external workspaces, changes to `auth` specs might logically belong in the `auth` repo's storage rather than the coordinator's.

However, a change in specd is not scoped to a single workspace. A change is a unit of work that can span multiple specs across multiple workspaces — for example, a single change might introduce a new API contract spec in the `billing` workspace and update a shared protocol spec in the `platform` workspace simultaneously. Splitting storage by workspace would either force artificial change boundaries or require a change to be replicated across multiple storage locations.

Additionally, `changes` and `archive` are operational directories — they hold in-progress and completed work artifacts for the person or team running specd. They are a property of the project doing the work (the coordinator), not of the workspaces being referenced. An external workspace being `readOnly` does not mean that work tracking should happen in that external repo.

## Decision

`storage.changes` and `storage.archive` are declared once at the project level. There is exactly one changes directory and one archive directory per `specd.yaml`.

Each workspace declares its own `specs` and `schemas` storage independently, because those are genuinely workspace-scoped resources. But operational storage (changes, archive) belongs to the project running specd, not to the workspaces it references.

## Consequences

- A change can freely reference specs from any number of workspaces without storage fragmentation.
- The operational footprint (where to find in-progress and completed work) is always a single known location.
- In coordinator repo setups, changes and archives live in the coordinator — which is the correct place, since the coordinator is the entity doing the work.
- If a future requirement genuinely needs per-workspace change tracking, that would be a new design decision with a new ADR.

## Spec

- [`specs/_global/config/spec.md`](../../specs/_global/config/spec.md)
