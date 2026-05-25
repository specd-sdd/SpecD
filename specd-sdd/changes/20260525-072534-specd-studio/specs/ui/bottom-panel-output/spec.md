# Bottom Panel Output

## Purpose

Studio UI for **Bottom Panel Output**: the full stream of user-visible action results (saves, validation summary lines, scope edits, etc.), backed by `POST/GET /v1/studio/output`. In [`ui:shell-layout`](../shell-layout/spec.md) this is the **first** bottom tab and the **default** on Studio mount.

## Requirements

### Requirement: Output is the leading bottom tab

The shell MUST render **Output** as the leftmost bottom tab and MUST select it when the shell first mounts unless the user previously chose another tab in the same session (v1: in-memory React state only).

### Requirement: Output lists all studio output entries

The panel MUST show every studio output line (all levels), newest first, via `listStudioOutput` polling.

### Requirement: shell appends on successful actions

When the shell handles successful description save, invalidation policy save, scope dialog save, artifact save, validate, restore/discard, or open navigation, it MUST `appendStudioOutput` with an appropriate `level` and `action`. It MAY `appendProjectLog` at `debug` with the **action id** as the log message and the user-facing text in `context` only (MUST NOT duplicate the full output line as the log message). Validation with findings MAY select the **Problems** tab; other actions SHOULD select **Output**.

### Requirement: empty state copy

When the stream is empty, the panel MUST show: _Results of saves, validation, and other studio actions appear here._

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors.

## Spec Dependencies

- [`client:port-studio-panel`](../../client/port-studio-panel/spec.md) — append/list
- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
- [`ui:shell-layout`](../shell-layout/spec.md) — orchestration
