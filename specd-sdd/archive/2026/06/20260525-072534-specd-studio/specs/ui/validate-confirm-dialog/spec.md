# Validate Confirm Dialog

## Purpose

Before structural validation runs, Studio MUST warn that re-validation can **invalidate** the change and cause **approval drift** on already-validated artifacts, which marks downstream DAG steps as needing review.

## Requirements

### Requirement: validate actions require explicit confirmation

**Validate** (inspector, current artifact) and **Validate All** (Artifacts tab toolbar on active changes) MUST open a confirmation modal with **Continue** and **Cancel** before calling `validateChange`. Modal chrome MUST follow [`ui:design-system`](../design-system/spec.md) (`StudioDialog` using shadcn `Button` components for actions).

**Cancel** MUST close the modal without invoking validation. **Continue** MUST run validation, append each result line to the studio **Output** stream (with `error` / `warn` / `info` levels), and select the **Problems** tab when any line is a warning or error.

**Validate All** MUST call `validateChangeAll` once (DAG batch on the server via [`ui:hooks-change-validate`](hooks-change-validate/spec.md)), even when an artifact editor tab is open. **Validate** (inspector) MUST validate only the open change artifact (`validateChange` with `specId` + `artifactId` from filename).

### Requirement: modal copy explains invalidation and drift

The modal body MUST state that validation re-runs schema checks for the targeted scope and that content differing from recorded approval hashes can invalidate the change and affect downstream artifact-DAG steps.

### Requirement: problems panel is not overwritten by status polling

Workflow blockers from `getChangeStatus` MUST remain on **Overview**. The **Problems** panel is a filter of studio output (warn/error only) and MUST NOT be cleared or replaced by status polling.

## Spec Dependencies

- [`ui:design-system`](../design-system/spec.md) — `StudioDialog` (dim scrim, opaque panel)
- [`ui:shell-layout`](../shell-layout/spec.md) — hosts validate actions
- [`ui:bottom-panel-output`](../bottom-panel-output/spec.md) — validation lines destination
- [`ui:bottom-panel-problems`](../bottom-panel-problems/spec.md) — warn/error filter view
- [`client:port-changes-mutate`](../../client/port-changes-mutate/spec.md) — `validateChange`
