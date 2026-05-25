# Bottom Panel Problems

## Purpose

Studio UI for **Bottom Panel Problems**: a read-only view of **warnings and errors** from the studio output stream. Workflow blockers from `getChangeStatus` belong on change **Overview**, not here. In the shell bottom strip it is the **second** tab (after **Output**, before **Logs**).

## Requirements

### Requirement: Problems is the middle bottom tab

The shell MUST render **Problems** immediately after **Output** in the bottom tab strip.

### Requirement: Problems filters studio output by severity

The panel MUST list lines from the studio output stream where `level` is `warn` or `error` only. It MUST NOT maintain a separate duplicate buffer.

Validation failures (`✗ …`) and warnings (`⚠ …`) MUST be appended to the output stream with matching levels so they appear here after validate completes.

### Requirement: empty state copy

When no warn/error lines exist, the panel MUST show: _Warnings and errors from studio actions appear here._

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks (`listStudioOutput` / polled output) and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors.

## Spec Dependencies

- [`client:port-studio-panel`](../../client/port-studio-panel/spec.md) — output stream
- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
- [`ui:bottom-panel-output`](../bottom-panel-output/spec.md) — full output stream
