# Bottom Panel Problems

## Purpose

Studio UI for **Bottom Panel Problems**: a read-only view of **warnings and errors** derived from the local Studio output session buffer. Workflow blockers from `getChangeStatus` belong on change **Overview**, not here. In the shell bottom strip it is the **second** tab (after **Output**, before **Logs**).

## Requirements

### Requirement: Problems is the middle bottom tab

The shell MUST render **Problems** immediately after **Output** in the bottom tab strip.

### Requirement: Problems filters local output by severity

The panel MUST list lines from the local output buffer where `level` is `warn` or `error` only. It MUST NOT maintain a separate duplicate buffer.

Validation failures (`✗ …`) and warnings (`⚠ …`) MUST be appended to the output stream with matching levels so they appear here after validate completes.

### Requirement: empty state copy

When no warn/error lines exist, the panel MUST show: _Warnings and errors from studio actions appear here._

### Requirement: view uses local output state only

Components MUST consume Problems data through the same local output session buffer used by **Output**, and MUST NOT import `@specd/core`.

### Requirement: view is independent from remote log fetches

Problems rendering MUST NOT depend on remote `/logs` fetches. Remote log failures MUST NOT prevent warn/error entries already present in the local output buffer from rendering.

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
- [`ui:bottom-panel-output`](../bottom-panel-output/spec.md) — full output stream
