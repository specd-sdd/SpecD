# Change Tab Artifacts

## Purpose

Studio UI for **Change Tab Artifacts**: user-visible layout and actions driven exclusively through `SpecdDataPort` hooks. Studio UI component: **Change Tab Artifacts**.

## Requirements

### Requirement: change tab refetches status (artifact DAG) when updatedAt advances

While the Artifacts tab is visible for an **active** change, the view MUST load the artifact list via `listChangeArtifacts(name)` (not only `getChangeStatus` short-circuit). For a **drafted** change it MUST use `listDraftArtifacts(name)`; for **discarded** it MUST use `listDiscardedArtifacts(name)`. The UI MUST use the shadcn **`Accordion`** component (with `type="multiple"`) to group artifacts into two top-level **scope** sections, in order: **Change**, then **Spec**.

**Change scope:** files whose paths are not under `specs/` or `deltas/` (e.g. `proposal.md`, `design.md`, `tasks.md`). Within Change, group by artifact type (`proposal`, `design`, `tasks`, …). Each artifact type appears **once**, ordered by the schema artifact DAG topological order (`proposal` → `specs` → `verify` → `design` → `tasks`, change-scoped types only). Files within a type sort ascending by full path.

**Spec scope:** files under `specs/` or `deltas/` (any artifact type). Group by `specId` (`workspace:capability-path`) using [`ui:design-system`](../design-system/spec.md) ascending order. Within each spec, list all artifact files for that spec together (specs, verify, deltas, etc.): if a `spec.md` exists among those paths it MUST be first; remaining files sort ascending by full path. Artifact rows MUST be implemented using shadcn **`Button`** components for consistent interaction.

Tab-scoped poll MUST adopt global ticks only while the tab is visible. For **archived** changes, the tab MUST render the archived snapshot `artifacts[]` metadata from `getArchivedChange` without calling `listChangeArtifacts`, preserving the same grouped **Change** / **Spec** layout as active changes wherever the archived snapshot contains those files.

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

### Requirement: artifacts tab exposes validate all for active changes

For **active** (non-archived) changes, the Artifacts tab MUST render a **Validate All** control (`data-testid="studio-validate-all"`) in a tab toolbar above the artifact accordion. Clicking it MUST delegate to shell validate flow ([`ui:validate-confirm-dialog`](../validate-confirm-dialog/spec.md)). Archived changes MUST NOT show this control.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors (including HTTP 409 on save conflicts where applicable).

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
- [`ui:design-system`](../design-system/spec.md) — flat spec id sort order
