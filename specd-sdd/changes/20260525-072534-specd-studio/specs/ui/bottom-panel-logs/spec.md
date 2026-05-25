# Bottom Panel Logs

## Purpose

Studio UI for **Bottom Panel Logs**: recent specd log lines from in-memory readback (`GET /v1/logs` → `kernel.logs.read`). This channel is separate from studio output and MUST NOT mix validation or action result lines here. In the shell bottom strip it is the **third** tab (rightmost in v1 web layout).

## Requirements

### Requirement: Logs is the trailing bottom tab

The shell MUST render **Logs** as the rightmost of the three web bottom tabs (Output, Problems, Logs).

### Requirement: Logs polls readProjectLogs

The panel MUST call `readProjectLogs({ limit: 500, prettier: true })` on the global poll tick and render `lines` or formatted entries.

### Requirement: Logs does not duplicate Output

Structural validation messages and save confirmations MUST NOT be written only to Logs; they belong on the studio output stream. Debug traces MUST use action ids in the log message; the same user-facing string MUST NOT appear as both an output line and an identical log line.

### Requirement: empty state copy

When no log lines exist, the panel MUST show: _Recent specd log entries appear here._

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors.

## Spec Dependencies

- [`client:port-studio-panel`](../../client/port-studio-panel/spec.md) — log read/write
- [`core:read-log`](../../core/read-log/spec.md) — server readback
- [`api:routes-project-logs`](../../api/routes-project-logs/spec.md) — HTTP contract
